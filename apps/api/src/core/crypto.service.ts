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
 * AES-256-GCM envelope encryption for credentials at rest.
 * Key comes from CREDENTIALS_ENCRYPTION_KEY (32 bytes hex). Key rotation:
 * bump CREDENTIALS_KEY_VERSION and add the old key to the ring if needed.
 */
@Injectable()
export class CryptoService {
  private key(): Buffer {
    return Buffer.from(loadConfig().CREDENTIALS_ENCRYPTION_KEY, "hex");
  }

  encrypt(plaintext: string): EncryptedBlob {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: loadConfig().CREDENTIALS_KEY_VERSION,
    };
  }

  decrypt(blob: EncryptedBlob): string {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
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
