import { Injectable, Logger } from "@nestjs/common";
import { CryptoService } from "./crypto.service";
import { PrismaService } from "./prisma.service";

export interface RotationResult {
  currentVersion: number;
  credentials: number;
  leads: number;
}

/**
 * Re-encrypts all data-at-rest (Meta credentials + lead PII) to the current key
 * version. Run after installing a new CREDENTIALS_ENCRYPTION_KEY (with the old key
 * kept in CREDENTIALS_PREVIOUS_KEYS): each blob is decrypted with its stored
 * version's key and re-encrypted under the current one. Idempotent — rows already
 * on the current version are skipped.
 */
@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async reEncryptAll(): Promise<RotationResult> {
    const currentVersion = this.crypto.currentVersion();
    let credentials = 0;
    let leads = 0;

    const creds = await this.prisma.encryptedCredential.findMany({
      where: { keyVersion: { not: currentVersion } },
    });
    for (const c of creds) {
      const plaintext = this.crypto.decrypt({ ciphertext: c.ciphertext, iv: c.iv, authTag: c.authTag, keyVersion: c.keyVersion });
      const blob = this.crypto.encrypt(plaintext);
      await this.prisma.encryptedCredential.update({
        where: { id: c.id },
        data: { ciphertext: blob.ciphertext, iv: blob.iv, authTag: blob.authTag, keyVersion: blob.keyVersion, rotatedAt: new Date() },
      });
      credentials++;
    }

    const leadRows = await this.prisma.lead.findMany({
      where: { piiKeyVersion: { not: currentVersion }, piiCiphertext: { not: null } },
    });
    for (const l of leadRows) {
      if (!l.piiCiphertext || !l.piiIv || !l.piiAuthTag || l.piiKeyVersion == null) continue;
      const plaintext = this.crypto.decrypt({ ciphertext: l.piiCiphertext, iv: l.piiIv, authTag: l.piiAuthTag, keyVersion: l.piiKeyVersion });
      const blob = this.crypto.encrypt(plaintext);
      await this.prisma.lead.update({
        where: { id: l.id },
        data: { piiCiphertext: blob.ciphertext, piiIv: blob.iv, piiAuthTag: blob.authTag, piiKeyVersion: blob.keyVersion },
      });
      leads++;
    }

    this.logger.log(`Key rotation → v${currentVersion}: re-encrypted ${credentials} credential(s), ${leads} lead(s)`);
    return { currentVersion, credentials, leads };
  }
}
