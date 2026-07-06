import { Injectable } from "@nestjs/common";
import { CryptoService } from "./crypto.service";
import { PrismaService } from "./prisma.service";

export interface AuditEntry {
  organizationId: string;
  actorId?: string;
  actorType?: "USER" | "SYSTEM" | "AGENT";
  /** dot-notation action, e.g. "campaign.publish" */
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Immutable audit trail. Every sensitive mutation MUST call log().
 * Rows are never updated or deleted by application code.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId,
        actorId: entry.actorId,
        actorType: entry.actorType ?? "USER",
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeHash: entry.before !== undefined ? this.crypto.hashJson(entry.before) : null,
        afterHash: entry.after !== undefined ? this.crypto.hashJson(entry.after) : null,
        metadata: (entry.metadata ?? {}) as object,
        ip: entry.ip,
        userAgent: entry.userAgent,
      },
    });
  }
}
