import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/z";
  process.env.JWT_ACCESS_SECRET = "test-access-secret-000000";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-00000";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
});

const user = { userId: "u1", organizationId: "org1", role: "AGENCY_OWNER", email: "", name: "", clientScope: [] } as const;

const LEAD_INFO = {
  leadId: "lead_1",
  formId: "f1",
  adId: "a1",
  campaignId: "c1",
  createdTime: "2026-01-01T00:00:00Z",
  fieldData: [
    { name: "full_name", values: ["דנה ישראלי"] },
    { name: "email", values: ["dana@example.co.il"] },
    { name: "phone_number", values: ["0501234567"] },
    { name: "fb_user_id", values: ["fbuser_42"] },
  ],
};

async function makeService() {
  const { LeadsService } = await import("../src/leads/leads.service");
  const { CryptoService } = await import("../src/core/crypto.service");
  const prisma: any = {
    client: { findFirst: vi.fn().mockResolvedValue({ id: "cl1" }) },
    metaConnection: { findFirst: vi.fn().mockResolvedValue({ id: "conn1" }) },
    lead: {
      upsert: vi.fn().mockImplementation(({ create }: any) => Promise.resolve({ id: "lead1", receivedAt: new Date(), metaCreatedAt: null, ...create })),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    dataDeletionRequest: {
      create: vi.fn().mockResolvedValue({ id: "ddr1" }),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(),
    },
  };
  const audit: any = { log: vi.fn() };
  const connector: any = { getLead: vi.fn().mockResolvedValue(LEAD_INFO) };
  const meta: any = { context: vi.fn().mockResolvedValue({}), connector: () => connector };
  const callLogger: any = { wrap: (_m: unknown, fn: () => unknown) => fn() };
  const svc = new LeadsService(prisma, new CryptoService(), audit, meta, callLogger);
  return { svc, prisma };
}

describe("LeadsService PII at rest", () => {
  it("encrypts PII on write and never persists plaintext contact fields", async () => {
    const { svc, prisma } = await makeService();
    await svc.simulate(user as any, "cl1");
    const stored = prisma.lead.upsert.mock.calls[0][0].create;
    // encrypted blob present...
    expect(stored.piiCiphertext).toBeTruthy();
    expect(stored.piiIv).toBeTruthy();
    expect(stored.piiAuthTag).toBeTruthy();
    expect(stored.fbUserId).toBe("fbuser_42");
    // ...and NO plaintext PII columns exist on the row
    expect(stored.fullName).toBeUndefined();
    expect(stored.email).toBeUndefined();
    expect(stored.phone).toBeUndefined();
    // the ciphertext must not leak the email
    expect(JSON.stringify(stored)).not.toContain("dana@example.co.il");
  });

  it("decrypts PII back to the API shape on read", async () => {
    const { svc } = await makeService();
    const dto = await svc.simulate(user as any, "cl1"); // simulate returns toDto
    expect(dto.fullName).toBe("דנה ישראלי");
    expect(dto.email).toBe("dana@example.co.il");
    expect(dto.phone).toBe("0501234567");
    expect(dto.fieldData.length).toBe(4);
  });

  it("erases a user's leads and records a completed deletion request (Data Deletion Callback)", async () => {
    const { svc, prisma } = await makeService();
    const { code, deleted } = await svc.handleDataDeletion("fbuser_42");
    expect(deleted).toBe(2);
    expect(code).toMatch(/^[0-9a-f]{24}$/);
    expect(prisma.lead.deleteMany).toHaveBeenCalledWith({ where: { fbUserId: "fbuser_42" } });
    // request is recorded then marked COMPLETED with the deleted count
    expect(prisma.dataDeletionRequest.create).toHaveBeenCalled();
    const upd = prisma.dataDeletionRequest.update.mock.calls[0][0].data;
    expect(upd.status).toBe("COMPLETED");
    expect(upd.leadsDeleted).toBe(2);
  });
});
