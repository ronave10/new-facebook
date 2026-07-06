import { Injectable } from "@nestjs/common";
import type { AssetKind } from "@campaignos/db";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { StorageService } from "./storage.service";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async assertClient(user: AuthContext, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
    });
    if (!client) throw AppException.notFound("הלקוח לא נמצא");
  }

  async upload(
    user: AuthContext,
    clientId: string,
    input: { fileName: string; mimeType: string; kind: AssetKind; dataBase64: string },
  ) {
    await this.assertClient(user, clientId);
    const data = Buffer.from(input.dataBase64, "base64");
    if (data.length === 0) throw AppException.badRequest("קובץ ריק", "EMPTY_FILE");
    if (data.length > MAX_BYTES) throw AppException.badRequest("הקובץ גדול מדי (מקסימום 8MB)", "FILE_TOO_LARGE");

    const stored = await this.storage.put(user.organizationId, clientId, input.fileName, data, input.mimeType);
    const asset = await this.prisma.creativeAsset.create({
      data: {
        organizationId: user.organizationId,
        clientId,
        kind: input.kind,
        fileName: input.fileName,
        storageKey: stored.storageKey,
        url: stored.url,
        mimeType: input.mimeType,
        sizeBytes: stored.sizeBytes,
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "asset.upload",
      entityType: "creative_asset",
      entityId: asset.id,
      metadata: { fileName: input.fileName, sizeBytes: stored.sizeBytes },
    });
    return asset;
  }

  async list(user: AuthContext, clientId: string) {
    await this.assertClient(user, clientId);
    return this.prisma.creativeAsset.findMany({
      where: { organizationId: user.organizationId, clientId },
      orderBy: { createdAt: "desc" },
    });
  }

  async serve(storageKey: string): Promise<Buffer | null> {
    // Files are content-hash addressed; org isolation is enforced by the key prefix
    // being unguessable. (A hardened deployment would sign URLs.)
    return this.storage.get(storageKey);
  }

  /** Attaches an uploaded asset to an ad's creative so publish sends its URL to Meta. */
  async attachToCreative(user: AuthContext, creativeId: string, assetId: string) {
    const [creative, asset] = await Promise.all([
      this.prisma.adCreative.findFirst({ where: { id: creativeId, organizationId: user.organizationId } }),
      this.prisma.creativeAsset.findFirst({ where: { id: assetId, organizationId: user.organizationId } }),
    ]);
    if (!creative) throw AppException.notFound("הקריאייטיב לא נמצא");
    if (!asset) throw AppException.notFound("נכס המדיה לא נמצא");
    const updated = await this.prisma.adCreative.update({
      where: { id: creativeId },
      data: { assetId, type: asset.kind === "VIDEO" ? "VIDEO" : "IMAGE" },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "asset.attach",
      entityType: "ad_creative",
      entityId: creativeId,
      metadata: { assetId },
    });
    return updated;
  }
}
