import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY_V1 = "1111111111111111111111111111111111111111111111111111111111111111";
const KEY_V2 = "2222222222222222222222222222222222222222222222222222222222222222";

function baseEnv() {
  process.env.JWT_ACCESS_SECRET = "test-access-secret-000000";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-00000";
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/z";
}

async function crypto() {
  const { CryptoService } = await import("../src/core/crypto.service");
  return new CryptoService();
}
async function resetCfg() {
  const { resetConfigCache } = await import("../src/core/config");
  resetConfigCache();
}

describe("CryptoService key ring (rotation)", () => {
  beforeEach(baseEnv);
  afterEach(async () => resetCfg());

  it("decrypts an old-version blob via CREDENTIALS_PREVIOUS_KEYS after rotation", async () => {
    // encrypt under v1
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_V1;
    process.env.CREDENTIALS_KEY_VERSION = "1";
    process.env.CREDENTIALS_PREVIOUS_KEYS = "";
    await resetCfg();
    const c = await crypto();
    const blob = c.encrypt("meta-token-abc");
    expect(blob.keyVersion).toBe(1);

    // rotate: v2 is current, v1 retired into the ring
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_V2;
    process.env.CREDENTIALS_KEY_VERSION = "2";
    process.env.CREDENTIALS_PREVIOUS_KEYS = `1:${KEY_V1}`;
    await resetCfg();
    const c2 = await crypto();
    // old blob still decrypts (via the ring)...
    expect(c2.decrypt(blob)).toBe("meta-token-abc");
    // ...and new writes are stamped v2
    expect(c2.encrypt("x").keyVersion).toBe(2);
  });

  it("throws when a blob's key version has no key available", async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_V2;
    process.env.CREDENTIALS_KEY_VERSION = "2";
    process.env.CREDENTIALS_PREVIOUS_KEYS = ""; // v1 key NOT provided
    await resetCfg();
    const c = await crypto();
    const orphan = { ciphertext: "x", iv: "y", authTag: "z", keyVersion: 1 };
    expect(() => c.decrypt(orphan)).toThrow(/key version 1/);
  });
});

describe("KeyRotationService.reEncryptAll", () => {
  beforeEach(async () => {
    baseEnv();
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_V2;
    process.env.CREDENTIALS_KEY_VERSION = "2";
    process.env.CREDENTIALS_PREVIOUS_KEYS = `1:${KEY_V1}`;
    await resetCfg();
  });
  afterEach(async () => resetCfg());

  it("re-encrypts old-version credentials and leads to the current version", async () => {
    const { KeyRotationService } = await import("../src/core/key-rotation.service");
    const { CryptoService } = await import("../src/core/crypto.service");
    const c = new CryptoService();

    // seed one credential + one lead encrypted under v1
    const oldBlob = (() => {
      // encrypt under v1 by temporarily making v1 current
      process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_V1;
      process.env.CREDENTIALS_KEY_VERSION = "1";
      return c;
    })();
    const { resetConfigCache } = await import("../src/core/config");
    resetConfigCache();
    const credBlob = oldBlob.encrypt("token-1");
    const leadBlob = oldBlob.encrypt(JSON.stringify({ email: "a@b.co" }));
    // restore v2 as current
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_V2;
    process.env.CREDENTIALS_KEY_VERSION = "2";
    resetConfigCache();

    const prisma: any = {
      encryptedCredential: {
        findMany: vi.fn().mockResolvedValue([{ id: "cr1", ciphertext: credBlob.ciphertext, iv: credBlob.iv, authTag: credBlob.authTag, keyVersion: 1 }]),
        update: vi.fn().mockResolvedValue({}),
      },
      lead: {
        findMany: vi.fn().mockResolvedValue([{ id: "l1", piiCiphertext: leadBlob.ciphertext, piiIv: leadBlob.iv, piiAuthTag: leadBlob.authTag, piiKeyVersion: 1 }]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const svc = new KeyRotationService(prisma, new CryptoService());
    const res = await svc.reEncryptAll();

    expect(res).toMatchObject({ currentVersion: 2, credentials: 1, leads: 1 });
    // the rewritten blobs are stamped v2 and decrypt to the original plaintext under the current key
    const credUpd = prisma.encryptedCredential.update.mock.calls[0][0].data;
    expect(credUpd.keyVersion).toBe(2);
    expect(new CryptoService().decrypt({ ciphertext: credUpd.ciphertext, iv: credUpd.iv, authTag: credUpd.authTag, keyVersion: 2 })).toBe("token-1");
    const leadUpd = prisma.lead.update.mock.calls[0][0].data;
    expect(leadUpd.piiKeyVersion).toBe(2);
    expect(JSON.parse(new CryptoService().decrypt({ ciphertext: leadUpd.piiCiphertext, iv: leadUpd.piiIv, authTag: leadUpd.piiAuthTag, keyVersion: 2 })).email).toBe("a@b.co");
  });
});
