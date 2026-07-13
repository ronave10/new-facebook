/**
 * One-off key-rotation job. Re-encrypts all Meta credentials + lead PII to the
 * current CREDENTIALS_KEY_VERSION. Run AFTER setting the new key:
 *
 *   1. openssl rand -hex 32                       # generate new key
 *   2. CREDENTIALS_PREVIOUS_KEYS="1:<oldHexKey>"  # keep old key to decrypt
 *      CREDENTIALS_ENCRYPTION_KEY=<newHexKey>
 *      CREDENTIALS_KEY_VERSION=2
 *   3. pnpm --filter @campaignos/api rotate-keys  # re-encrypt everything
 *   4. drop CREDENTIALS_PREVIOUS_KEYS once done.
 */
import { CryptoService } from "../core/crypto.service";
import { KeyRotationService } from "../core/key-rotation.service";
import { PrismaService } from "../core/prisma.service";

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const svc = new KeyRotationService(prisma, new CryptoService());
    const res = await svc.reEncryptAll();
    // eslint-disable-next-line no-console
    console.log(
      `Key rotation complete → v${res.currentVersion}: re-encrypted ${res.credentials} credential(s), ${res.leads} lead(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Key rotation failed:", err);
  process.exit(1);
});
