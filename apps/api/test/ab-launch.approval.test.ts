import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/z";
  process.env.JWT_ACCESS_SECRET = "test-access-secret-000000";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-00000";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
});

const checker = { userId: "checker", organizationId: "org1", role: "AGENCY_OWNER", email: "", name: "", clientScope: [] } as const;

const SPEC = {
  abTestId: "t1",
  adAccountId: "act1",
  connectionId: "conn1",
  name: "hook test",
  metric: "CONVERSIONS",
  cells: [
    { name: "A", metaEntityId: "m_A" },
    { name: "B", metaEntityId: "m_B" },
  ],
};

function deps(txImpl: any) {
  const prisma: any = {
    approval: {
      findFirst: vi.fn().mockResolvedValue({
        id: "apr1", organizationId: "org1", entityType: "AB_TEST", entityId: "t1", action: "PUBLISH",
        status: "PENDING", requestedById: "maker", payloadPreview: SPEC, payloadHash: "hash",
      }),
      update: vi.fn().mockResolvedValue({ id: "apr1", status: "CONSUMED" }),
    },
    abTest: {
      findFirst: vi.fn().mockResolvedValue({ id: "t1", organizationId: "org1", status: "PENDING_APPROVAL" }),
      update: vi.fn().mockResolvedValue({ id: "t1", status: "RUNNING" }),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    organizationMember: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(txImpl),
  };
  const crypto: any = { hashJson: () => "hash" };
  const audit: any = { log: vi.fn() };
  const campaigns: any = {};
  const connector: any = {
    createSplitTest: vi.fn().mockResolvedValue({ id: "study1", status: "RUNNING" }),
    stopSplitTest: vi.fn().mockResolvedValue(undefined),
  };
  const meta: any = { context: vi.fn().mockResolvedValue({}), connector: () => connector };
  const wrapCalls: any[] = [];
  const callLogger: any = {
    wrap: (m: any, fn: () => unknown) => {
      wrapCalls.push(m);
      return fn();
    },
  };
  return { prisma, crypto, audit, campaigns, meta, callLogger, connector, wrapCalls };
}

async function makeService(d: ReturnType<typeof deps>) {
  const { ApprovalsService } = await import("../src/campaigns/approvals.service");
  return new ApprovalsService(d.prisma, d.crypto, d.audit, d.campaigns, d.meta, d.callLogger);
}

describe("ApprovalsService.decideAbTestLaunch", () => {
  it("launches on Meta and snapshots the launched entity ids for attribution (#7)", async () => {
    const d = deps(async (cb: any) => (typeof cb === "function" ? cb(d.prisma) : Promise.all(cb)));
    const svc = await makeService(d);
    await svc.decide(checker as any, "apr1", true);
    expect(d.connector.createSplitTest).toHaveBeenCalledOnce();
    const abData = d.prisma.abTest.update.mock.calls[0][0].data;
    expect(abData.status).toBe("RUNNING");
    expect(abData.metaTestId).toBe("study1");
    // the entity ids sent to Meta are persisted so refreshResults can attribute correctly
    expect(abData.cellAMetaId).toBe("m_A");
    expect(abData.cellBMetaId).toBe("m_B");
  });

  it("compensates (audited) and blocks re-launch if the DB commit fails (#2 + review follow-ups)", async () => {
    // main launch tx throws; the best-effort cleanup tx then succeeds
    const tx = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("deadlock");
      })
      .mockImplementation(async (arr: any) => Promise.all(arr));
    const d = deps(tx);
    const svc = await makeService(d);
    await expect(svc.decide(checker as any, "apr1", true)).rejects.toThrow(/AB_LAUNCH_ROLLED_BACK|בוטלה/);
    // the just-created live study must be stopped so it doesn't spend orphaned...
    expect(d.connector.createSplitTest).toHaveBeenCalledOnce();
    expect(d.connector.stopSplitTest).toHaveBeenCalledWith(expect.anything(), "act1", "study1");
    // ...and the compensating stop is AUDITED as a write (not a silent bypass)
    expect(d.wrapCalls.some((c) => c.operation === "stopSplitTest" && c.isWrite)).toBe(true);
    // ...and the approval is EXPIRED so a checker can't re-approve → double-launch
    const apprUpdates = d.prisma.approval.update.mock.calls.map((c: any) => c[0].data.status);
    expect(apprUpdates).toContain("EXPIRED");
  });
});
