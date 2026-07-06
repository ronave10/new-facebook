import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadConfig } from "../core/config";

export interface StoredObject {
  storageKey: string;
  url: string;
  sizeBytes: number;
  contentHash: string;
}

/**
 * Storage abstraction for creative media. Default driver is the local filesystem
 * (zero-infra dev), writing under ./.storage and serving via GET /api/v1/assets/*.
 * When S3_* env is configured the same interface can be backed by an S3-compatible
 * bucket (MinIO) — the local driver keeps the product working out of the box.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root = resolve(process.cwd(), ".storage");
  private readonly useS3: boolean;

  constructor() {
    const cfg = loadConfig();
    this.useS3 = Boolean(cfg.S3_ENDPOINT && cfg.S3_ACCESS_KEY && cfg.S3_SECRET_KEY && process.env.S3_ENABLED === "true");
    if (!this.useS3) this.logger.log("StorageService: local filesystem driver (.storage)");
  }

  async put(organizationId: string, clientId: string, fileName: string, data: Buffer, _contentType: string): Promise<StoredObject> {
    const contentHash = createHash("sha256").update(data).digest("hex").slice(0, 16);
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const storageKey = `${organizationId}/${clientId}/${contentHash}-${safeName}`;

    // Local FS driver (the S3 driver would PUT to the bucket here).
    const filePath = join(this.root, storageKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);

    const apiUrl = loadConfig().API_URL.replace(/\/$/, "");
    return {
      storageKey,
      url: `${apiUrl}/api/v1/assets/${storageKey}`,
      sizeBytes: data.length,
      contentHash,
    };
  }

  async get(storageKey: string): Promise<Buffer | null> {
    const filePath = join(this.root, storageKey);
    // guard against path traversal
    if (!resolve(filePath).startsWith(this.root)) return null;
    if (!existsSync(filePath)) return null;
    return readFile(filePath);
  }
}
