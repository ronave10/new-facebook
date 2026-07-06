import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/z";
  process.env.JWT_ACCESS_SECRET = "test-access-secret-000000";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-00000";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
  process.env.API_URL = "http://localhost:4000";
});

describe("StorageService (local driver)", () => {
  it("stores and retrieves an object, addressed by content hash", async () => {
    const { StorageService } = await import("../src/storage/storage.service");
    const storage = new StorageService();
    const data = Buffer.from("fake-image-bytes-1234");
    const stored = await storage.put("org1", "client1", "logo.png", data, "image/png");
    expect(stored.storageKey).toContain("org1/client1/");
    expect(stored.url).toContain("/api/v1/assets/");
    expect(stored.sizeBytes).toBe(data.length);
    const back = await storage.get(stored.storageKey);
    expect(back?.equals(data)).toBe(true);
  });

  it("returns null for path traversal attempts", async () => {
    const { StorageService } = await import("../src/storage/storage.service");
    const storage = new StorageService();
    expect(await storage.get("../../etc/passwd")).toBeNull();
    expect(await storage.get("org1/does-not-exist.png")).toBeNull();
  });

  it("same content yields the same hash prefix (dedupe-friendly)", async () => {
    const { StorageService } = await import("../src/storage/storage.service");
    const storage = new StorageService();
    const data = Buffer.from("identical");
    const a = await storage.put("org1", "c1", "a.png", data, "image/png");
    const b = await storage.put("org1", "c1", "b.png", data, "image/png");
    expect(a.contentHash).toBe(b.contentHash);
  });
});
