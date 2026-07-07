import { Injectable } from "@nestjs/common";
import type { CreateCustomAudienceSpec, CustomAudienceSubtype } from "@campaignos/meta";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { MetaConnectorFactory } from "./connector.factory";
import { MetaCallLogger } from "./meta-call-logger.service";
import { MetaService } from "./meta.service";

interface CreateAudienceInput {
  name: string;
  subtype: CustomAudienceSubtype;
  description?: string;
  retentionDays?: number;
  originAudienceId?: string;
  ratio?: number;
}

@Injectable()
export class AudiencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly factory: MetaConnectorFactory,
    private readonly meta: MetaService,
    private readonly callLogger: MetaCallLogger,
  ) {}

  private async resolveAccount(user: AuthContext, clientId: string) {
    if (user.role === "CLIENT_VIEWER" && user.clientScope.length > 0 && !user.clientScope.includes(clientId)) {
      throw AppException.notFound("הלקוח לא נמצא");
    }
    const account = await this.prisma.metaAdAccount.findFirst({
      where: { organizationId: user.organizationId, clientId, isSelected: true },
    });
    if (!account) throw AppException.badRequest("יש לחבר ולבחור חשבון מודעות ללקוח", "NO_AD_ACCOUNT");
    return account;
  }

  async list(user: AuthContext, clientId: string) {
    if (user.role === "CLIENT_VIEWER" && user.clientScope.length > 0 && !user.clientScope.includes(clientId)) {
      throw AppException.notFound("הלקוח לא נמצא");
    }
    return this.prisma.metaCustomAudience.findMany({
      where: { organizationId: user.organizationId, clientId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Pulls audiences from Meta into local storage. */
  async sync(user: AuthContext, clientId: string) {
    const account = await this.resolveAccount(user, clientId);
    const ctx = await this.meta.context(user.organizationId, account.connectionId);
    const connector = this.factory.get();
    const audiences = await this.callLogger.wrap(
      { organizationId: user.organizationId, connectionId: account.connectionId, operation: "listCustomAudiences" },
      () => connector.listCustomAudiences(ctx, account.accountId),
    );
    for (const a of audiences) {
      await this.prisma.metaCustomAudience.upsert({
        where: { connectionId_metaAudienceId: { connectionId: account.connectionId, metaAudienceId: a.audienceId } },
        create: {
          organizationId: user.organizationId,
          clientId,
          connectionId: account.connectionId,
          metaAudienceId: a.audienceId,
          name: a.name,
          subtype: a.subtype,
          description: a.description,
          approximateCount: a.approximateCount,
          originAudienceId: a.originAudienceId,
          ratio: a.ratio,
        },
        update: { name: a.name, approximateCount: a.approximateCount },
      });
    }
    return this.list(user, clientId);
  }

  /**
   * Creates an audience on Meta. This is a Meta write (audited + logged) but not a
   * spending action, so it does not require the publish-approval gate.
   */
  async create(user: AuthContext, clientId: string, input: CreateAudienceInput) {
    const account = await this.resolveAccount(user, clientId);
    const ctx = await this.meta.context(user.organizationId, account.connectionId);
    const connector = this.factory.get();

    // Resolve pixel/page for rule-based subtypes from the connection.
    const connection = await this.prisma.metaConnection.findUnique({
      where: { id: account.connectionId },
      include: { pixels: true, pages: true },
    });

    const spec: CreateCustomAudienceSpec = {
      name: input.name,
      subtype: input.subtype,
      description: input.description,
      retentionDays: input.retentionDays,
    };
    if (input.subtype === "WEBSITE") {
      const pixel = connection?.pixels[0];
      if (!pixel) throw AppException.badRequest("אין פיקסל מחובר ליצירת קהל אתר", "NO_PIXEL");
      spec.pixelId = pixel.pixelId;
    } else if (input.subtype === "ENGAGEMENT") {
      const page = connection?.pages[0];
      if (!page) throw AppException.badRequest("אין עמוד מחובר ליצירת קהל מעורבות", "NO_PAGE");
      spec.pageId = page.pageId;
    } else if (input.subtype === "LOOKALIKE") {
      if (!input.originAudienceId) throw AppException.badRequest("יש לבחור קהל מקור ל-Lookalike", "NO_ORIGIN");
      const origin = await this.prisma.metaCustomAudience.findFirst({
        where: { id: input.originAudienceId, organizationId: user.organizationId },
      });
      if (!origin) throw AppException.notFound("קהל המקור לא נמצא");
      spec.originAudienceId = origin.metaAudienceId;
      spec.ratio = input.ratio ?? 0.01;
      spec.country = account.raw && (account.raw as any).business ? "IL" : "IL";
    }

    const created = await this.callLogger.wrap(
      {
        organizationId: user.organizationId,
        connectionId: account.connectionId,
        operation: "createCustomAudience",
        isWrite: true,
        requestInfo: spec,
      },
      () => connector.createCustomAudience(ctx, account.accountId, spec),
    );

    const row = await this.prisma.metaCustomAudience.create({
      data: {
        organizationId: user.organizationId,
        clientId,
        connectionId: account.connectionId,
        metaAudienceId: created.id,
        name: input.name,
        subtype: input.subtype,
        description: input.description,
        originAudienceId: spec.originAudienceId,
        ratio: spec.ratio,
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "audience.create",
      entityType: "meta_custom_audience",
      entityId: row.id,
      metadata: { subtype: input.subtype, metaAudienceId: created.id },
    });
    return row;
  }

  async remove(user: AuthContext, audienceId: string) {
    const audience = await this.prisma.metaCustomAudience.findFirst({
      where: { id: audienceId, organizationId: user.organizationId },
    });
    if (!audience) throw AppException.notFound("הקהל לא נמצא");
    const ctx = await this.meta.context(user.organizationId, audience.connectionId);
    await this.callLogger
      .wrap(
        {
          organizationId: user.organizationId,
          connectionId: audience.connectionId,
          operation: "deleteCustomAudience",
          isWrite: true,
        },
        () => this.factory.get().deleteCustomAudience(ctx, audience.metaAudienceId),
      )
      .catch(() => undefined);
    await this.prisma.metaCustomAudience.delete({ where: { id: audienceId } });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "audience.delete",
      entityType: "meta_custom_audience",
      entityId: audienceId,
    });
    return { ok: true };
  }
}
