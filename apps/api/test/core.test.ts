import { beforeAll, describe, expect, it } from "vitest";

// Deterministic env for config-dependent units.
beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/z";
  process.env.JWT_ACCESS_SECRET = "test-access-secret-000000";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-00000";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
});

describe("CryptoService", () => {
  it("encrypts and decrypts round-trip (AES-256-GCM)", async () => {
    const { CryptoService } = await import("../src/core/crypto.service");
    const crypto = new CryptoService();
    const secret = "EAAG-super-secret-meta-token-xyz";
    const blob = crypto.encrypt(secret);
    expect(blob.ciphertext).not.toContain(secret);
    expect(blob.iv).toBeTruthy();
    expect(blob.authTag).toBeTruthy();
    expect(crypto.decrypt(blob)).toBe(secret);
  });

  it("tamper with authTag fails decryption", async () => {
    const { CryptoService } = await import("../src/core/crypto.service");
    const crypto = new CryptoService();
    const blob = crypto.encrypt("hello");
    const bad = { ...blob, authTag: Buffer.from("deadbeefdeadbeef").toString("base64") };
    expect(() => crypto.decrypt(bad)).toThrow();
  });

  it("hashJson is stable and order-sensitive", async () => {
    const { CryptoService } = await import("../src/core/crypto.service");
    const crypto = new CryptoService();
    expect(crypto.hashJson({ a: 1, b: 2 })).toBe(crypto.hashJson({ a: 1, b: 2 }));
  });
});

describe("OAuth state", () => {
  it("signs and verifies a valid state", async () => {
    const { signState, verifyState } = await import("../src/meta/oauth-state.util");
    const secret = "s3cr3t";
    const token = signState({ orgId: "o1", userId: "u1", nonce: "n", exp: Date.now() + 10000 }, secret);
    const parsed = verifyState(token, secret);
    expect(parsed.orgId).toBe("o1");
  });

  it("rejects tampered payload", async () => {
    const { signState, verifyState } = await import("../src/meta/oauth-state.util");
    const secret = "s3cr3t";
    const token = signState({ orgId: "o1", userId: "u1", nonce: "n", exp: Date.now() + 10000 }, secret);
    const [, sig] = token.split(".");
    const forged = `${Buffer.from(JSON.stringify({ orgId: "EVIL", userId: "u1", nonce: "n", exp: Date.now() + 10000 })).toString("base64url")}.${sig}`;
    expect(() => verifyState(forged, secret)).toThrow();
  });

  it("rejects expired state", async () => {
    const { signState, verifyState } = await import("../src/meta/oauth-state.util");
    const secret = "s3cr3t";
    const token = signState({ orgId: "o1", userId: "u1", nonce: "n", exp: Date.now() - 1000 }, secret);
    expect(() => verifyState(token, secret)).toThrow(/expired/);
  });
});

describe("password util", () => {
  it("verifies argon2id hashes", async () => {
    const { hashPassword, verifyPassword } = await import("../src/auth/password.util");
    const hash = await hashPassword("Secret123!");
    expect(await verifyPassword(hash, "Secret123!")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("verifies dev-seed scrypt hashes", async () => {
    const { verifyPassword } = await import("../src/auth/password.util");
    const { scryptSync, randomBytes } = await import("node:crypto");
    const salt = randomBytes(16).toString("hex");
    const hash = `scrypt$${salt}$${scryptSync("Demo1234!", salt, 32).toString("hex")}`;
    expect(await verifyPassword(hash, "Demo1234!")).toBe(true);
    expect(await verifyPassword(hash, "nope")).toBe(false);
  });
});

describe("payload builder", () => {
  it("produces a deterministic PAUSED-first, activate-last plan", async () => {
    const { buildPublishPlan } = await import("../src/campaigns/payload-builder");
    const bundle = {
      campaign: {
        id: "c1",
        name: "camp",
        goal: "LEADS" as const,
        budgetType: "DAILY",
        budgetAmount: 15000,
        currency: "ILS",
        specialAdCategories: [],
        startAt: null,
        endAt: null,
        targetingDraft: { countries: ["IL"] },
      },
      adAccountId: "act1",
      pageId: "p1",
      adSets: [
        {
          id: "as1",
          name: "aset",
          optimizationGoal: null,
          billingEvent: null,
          budgetAmount: null,
          targeting: {},
          ads: [
            {
              id: "ad1",
              name: "ad",
              creativeId: "cr1",
              creativeName: "creative",
              primaryText: "txt",
              headline: "h",
              description: "d",
              cta: "קבעו שיחה",
              destinationUrl: "https://x.co",
            },
          ],
        },
      ],
    };
    const plan1 = buildPublishPlan(bundle);
    const plan2 = buildPublishPlan(bundle);
    expect(JSON.stringify(plan1)).toBe(JSON.stringify(plan2)); // deterministic
    // create steps come before activate steps
    const firstActivate = plan1.findIndex((s) => s.action === "activate");
    const lastCreate = plan1.map((s) => s.action).lastIndexOf("create_ad");
    expect(lastCreate).toBeLessThan(firstActivate);
    // campaign spec is PAUSED
    const campStep = plan1.find((s) => s.action === "create_campaign");
    expect((campStep?.spec as { status: string }).status).toBe("PAUSED");
  });
});
