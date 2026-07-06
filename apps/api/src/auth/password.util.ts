import * as argon2 from "argon2";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing. Production hashes use argon2id. The verify path ALSO accepts
 * dev-seed hashes in the format "scrypt$<saltHex>$<hashHex>" so the dependency-free
 * seed script can create working demo accounts.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (hash.startsWith("scrypt$")) {
    const [, salt, expected] = hash.split("$");
    if (!salt || !expected) return false;
    const derived = scryptSync(password, salt, 32);
    const expectedBuf = Buffer.from(expected, "hex");
    return expectedBuf.length === derived.length && timingSafeEqual(expectedBuf, derived);
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** Constant-ish work to blunt user-enumeration timing on unknown emails. */
export async function dummyVerify(): Promise<void> {
  const salt = randomBytes(16).toString("hex");
  scryptSync("dummy-password", salt, 32);
}
