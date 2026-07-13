import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { loadConfig } from "./config";

export interface EncryptedBlob {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  keyVersion: number;
}

/**
 * AES-256-GCM envelope encryption for credentials + lead PII at rest.
 *
 * Key rotation (KeyRotationService.reEncryptAll drives it):
 *  1. Generate a new key, set it as CREDENTIALS_ENCRYPTION_KEY and bump
 *     CREDENTIALS_KEY_VERSION; move the OLD key into CREDENTIALS_PREVIOUS_KEYS
 *     ("oldVersion:oldHexKey").
 *  2. New writes use the new key; existing blobs still decrypt via the ring.
 *  3. Run the rotation job to re-encrypt everything to the new version, then
 *     drop the retired key from CREDENTIALS_PREVIOUS_KEYS.
 */
@Injectable()
export class CryptoService {
  /** Parsed ring of retired keys, version → key buffer. */
  private previousKeys(): Map<number, Buffer> {
    const ring = new Map<number, Buffer>();
    const raw = loadConfig().CREDENTIALS_PREVIOUS_KEYS?.trim();
    if (!raw) return ring;
    for (const pair of raw.split(",")) {
      const [v, hex] = pair.split(":").map((s) => s.trim());
      if (!v || !/^[0-9a-fA-F]{64}$/.test(hex ?? "")) continue;
      ring.set(Number(v), Buffer.from(hex, "hex"));
    }
    return ring;
  }

  currentVersion(): number {
    return loadConfig().CREDENTIALS_KEY_VERSION;
  }

  /** Resolves the key for a given blob version — current key, else the ring. */
  private keyForVersion(version: number): Buffer {
    const cfg = loadConfig();
    if (version === cfg.CREDENTIALS_KEY_VERSION) return Buffer.from(cfg.CREDENTIALS_ENCRYPTION_KEY, "hex");
    const old = this.previousKeys().get(version);
    if (!old) {
      throw new Error(`No decryption key for key version ${version} (set CREDENTIALS_PREVIOUS_KEYS)`);
    }
    return old;
  }

  encrypt(plaintext: string): EncryptedBlob {
    const cfg = loadConfig();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(cfg.CREDENTIALS_ENCRYPTION_KEY, "hex"), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: cfg.CREDENTIALS_KEY_VERSION,
    };
  }

  decrypt(blob: EncryptedBlob): string {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.keyForVersion(blob.keyVersion),
      Buffer.from(blob.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(blob.ciphertext, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }

  sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  hashJson(value: unknown): string {
    return this.sha256(JSON.stringify(value ?? null));
  }
}
