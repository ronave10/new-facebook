import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/z";
  process.env.JWT_ACCESS_SECRET = "test-access-secret-000000";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-00000";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
});

const owner = { userId: "u1", organizationId: "org1", role: "AGENCY_OWNER", email: "", name: "", clientScope: [] } as const;

async function load() {
  const { AbTestsService } = await import("../src/campaigns/ab-tests.service");
  return AbTestsService;
}

function baseDeps() {
  const prisma: any = {
    ad: { findFirst: vi.fn() },
    adSet: { findFirst: vi.fn() },
    campaign: { findFirst: vi.fn().mockResolvedValue({ clientId: "cl1" }) },
    abTest: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    metaAdAccount: { findFirst: vi.fn().mockResolvedValue({ accountId: "act1", connectionId: "conn1" }) },
    metaPixel: { count: vi.fn().mockResolvedValue(1) },
    approval: { create: vi.fn().mockResolvedValue({ id: "apr1" }), updateMany: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (cb: any) => (typeof cb === "function" ? cb(prisma) : Promise.all(cb))),
  };
  const crypto: any = { hashJson: () => "hash" };
  const audit: any = { log: vi.fn() };
  const campaigns: any = { loadScoped: vi.fn().mockResolvedValue({ id: "c1" }) };
  const connector: any = { getSplitTest: vi.fn(), stopSplitTest: vi.fn().mockResolvedValue(undefined) };
  const meta: any = { context: vi.fn().mockResolvedValue({}), connector: () => connector };
  const callLogger: any = { wrap: (_m: unknown, fn: () => unknown) => fn() };
  return { prisma, crypto, audit, campaigns, meta, callLogger, connector };
}

async function makeService(d: ReturnType<typeof baseDeps>) {
  const AbTestsService = await load();
  return new AbTestsService(d.prisma, d.crypto, d.audit, d.campaigns, d.meta, d.callLogger);
}

describe("AbTestsService safety", () => {
  it("blocks launch when the ads are not published to Meta (#3)", async () => {
    const d = baseDeps();
    d.prisma.abTest.findFirst.mockResolvedValue({
      id: "t1", organizationId: "org1", clientId: "cl1", campaignId: "c1", status: "DRAFT",
      level: "AD", metric: "CTR", cellAId: "adA", cellBId: "adB",
    });
    // resolveCell → ad without metaAdId (unpublished)
    d.prisma.ad.findFirst
      .mockResolvedValueOnce({ id: "adA", name: "A", hook: "A", metaAdId: null })
      .mockResolvedValueOnce({ id: "adB", name: "B", hook: "B", metaAdId: null });
    const svc = await makeService(d);
    await expect(svc.requestLaunch(owner as any, "t1")).rejects.toThrow(/לפרסם|AD_NOT_PUBLISHED|פרסם/);
    expect(d.prisma.approval.create).not.toHaveBeenCalled();
  });

  it("requires a pixel for a CVR test (#5)", async () => {
    const d = baseDeps();
    d.prisma.metaPixel.count.mockResolvedValue(0);
    d.prisma.abTest.findFirst.mockResolvedValue({
      id: "t1", organizationId: "org1", clientId: "cl1", campaignId: "c1", status: "DRAFT",
      level: "AD", metric: "CVR", cellAId: "adA", cellBId: "adB",
    });
    d.prisma.ad.findFirst
      .mockResolvedValueOnce({ id: "adA", name: "A", hook: "A", metaAdId: "m_A" })
      .mockResolvedValueOnce({ id: "adB", name: "B", hook: "B", metaAdId: "m_B" });
    const svc = await makeService(d);
    await expect(svc.requestLaunch(owner as any, "t1")).rejects.toThrow(/פיקסל|NO_PIXEL/);
  });

  it("creates an AB_TEST approval when ads are published (happy path)", async () => {
    const d = baseDeps();
    d.prisma.abTest.findFirst.mockResolvedValue({
      id: "t1", organizationId: "org1", clientId: "cl1", campaignId: "c1", status: "DRAFT",
      level: "AD", metric: "CTR", cellAId: "adA", cellBId: "adB",
    });
    d.prisma.ad.findFirst
      .mockResolvedValueOnce({ id: "adA", name: "A", hook: "hookA", metaAdId: "m_A" })
      .mockResolvedValueOnce({ id: "adB", name: "B", hook: "hookB", metaAdId: "m_B" });
    const svc = await makeService(d);
    await svc.requestLaunch(owner as any, "t1");
    const call = d.prisma.approval.create.mock.calls[0][0].data;
    expect(call.entityType).toBe("AB_TEST");
    expect(call.status).toBe("PENDING");
    // the exact entity ids sent to Meta are the published ids, never the internal cuids
    expect((call.payloadPreview as any).cells.map((c: any) => c.metaEntityId)).toEqual(["m_A", "m_B"]);
  });

  it("attributes live cells by entity id, not array position (#1)", async () => {
    const d = baseDeps();
    d.prisma.abTest.findFirst.mockResolvedValue({
      id: "t1", organizationId: "org1", clientId: "cl1", campaignId: "c1", status: "RUNNING",
      metaTestId: "mt1", metric: "CVR", cellAId: "adA", cellALabel: "A", cellBId: "adB", cellBLabel: "B",
      cellAMetaId: "meta_A", cellBMetaId: "meta_B",
    });
    // Meta returns cells in REVERSE order; positional matching would crown the loser.
    d.connector.getSplitTest.mockResolvedValue({
      id: "mt1", name: "t", status: "RUNNING",
      cells: [
        { id: "c0", metaEntityId: "meta_B", impressions: 10000, clicks: 100, conversions: 5 }, // cellB: 5%
        { id: "c1", metaEntityId: "meta_A", impressions: 10000, clicks: 100, conversions: 50 }, // cellA: 50%
      ],
    });
    const svc = await makeService(d);
    await svc.refreshResults(owner as any, "t1");
    const data = d.prisma.abTest.update.mock.calls[0][0].data;
    // cellA (meta_A, 50%) must be the winner — NOT cellB, which sat at cells[0]
    expect(data.winnerCellId).toBe("adA");
    expect(data.result.variant.id).toBe("adA");
    expect(data.result.control.id).toBe("adB");
  });

  it("stops the live Meta experiment when cancelling a RUNNING test (#2)", async () => {
    const d = baseDeps();
    d.prisma.abTest.findFirst.mockResolvedValue({
      id: "t1", organizationId: "org1", clientId: "cl1", status: "RUNNING", metaTestId: "mt1",
    });
    const svc = await makeService(d);
    await svc.cancel(owner as any, "t1");
    expect(d.connector.stopSplitTest).toHaveBeenCalledWith(expect.anything(), "act1", "mt1");
  });

  it("refuses to cancel a concluded test (#2 guard)", async () => {
    const d = baseDeps();
    d.prisma.abTest.findFirst.mockResolvedValue({ id: "t1", organizationId: "org1", clientId: "cl1", status: "CONCLUDED" });
    const svc = await makeService(d);
    await expect(svc.cancel(owner as any, "t1")).rejects.toThrow(/AB_TEST_TERMINAL|הסתיים/);
    expect(d.connector.stopSplitTest).not.toHaveBeenCalled();
  });

  it("hides tests outside a CLIENT_VIEWER's client scope (#4)", async () => {
    const d = baseDeps();
    d.prisma.abTest.findFirst.mockResolvedValue({ id: "t1", organizationId: "org1", clientId: "cl1", status: "RUNNING" });
    const viewer = { ...owner, role: "CLIENT_VIEWER", clientScope: ["OTHER"] };
    const svc = await makeService(d);
    await expect(svc.get(viewer as any, "t1")).rejects.toThrow(/לא נמצא/);
  });

  it("rejects a duplicate active test on the same pair (#6)", async () => {
    const d = baseDeps();
    d.prisma.ad.findFirst
      .mockResolvedValueOnce({ id: "adA", name: "A", hook: "A", metaAdId: "m_A" })
      .mockResolvedValueOnce({ id: "adB", name: "B", hook: "B", metaAdId: "m_B" });
    d.prisma.abTest.findFirst.mockResolvedValue({ id: "existing", status: "RUNNING" }); // dup exists
    const svc = await makeService(d);
    await expect(
      svc.create(owner as any, "c1", { name: "dup", metric: "CTR", level: "AD", cellAId: "adA", cellBId: "adB" } as any),
    ).rejects.toThrow(/DUPLICATE_TEST|כבר קיים/);
    expect(d.prisma.abTest.create).not.toHaveBeenCalled();
  });
});
