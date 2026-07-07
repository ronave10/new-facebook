import { Injectable, Logger } from "@nestjs/common";
import type { LeadStatus } from "@campaignos/db";
import type { MetaLeadInfo } from "@campaignos/meta";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { MetaService } from "../meta/meta.service";
import { MetaCallLogger } from "../meta/meta-call-logger.service";

/** Extracts common contact fields from a lead's field_data. */
function extractFields(fieldData: { name: string; values: string[] }[]) {
  const get = (keys: string[]) => {
    const f = fieldData.find((x) => keys.some((k) => x.name.toLowerCase().includes(k)));
    return f?.values?.[0];
  };
  return {
    fullName: get(["full_name", "name", "שם"]),
    email: get(["email", "אימייל", "מייל"]),
    phone: get(["phone", "טלפון", "נייד"]),
  };
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly meta: MetaService,
    private readonly callLogger: MetaCallLogger,
  ) {}

  /**
   * Ingests a single lead from a leadgen webhook event. Resolves the connection
   * by page, fetches the lead's field data via the connector, and upserts it.
   * Idempotent on metaLeadId.
   */
  async ingestFromWebhook(leadgenId: string, pageId: string): Promise<void> {
    const page = await this.prisma.metaPage.findFirst({
      where: { pageId },
      include: { connection: true },
    });
    if (!page) {
      this.logger.warn(`Leadgen webhook for unknown page ${pageId}; dropping`);
      return;
    }
    const { organizationId, clientId, id: connectionId } = page.connection;
    if (!clientId) return;

    const existing = await this.prisma.lead.findUnique({ where: { metaLeadId: leadgenId } });
    if (existing) return; // idempotent

    const ctx = await this.meta.context(organizationId, connectionId);
    const info: MetaLeadInfo = await this.callLogger.wrap(
      { organizationId, connectionId, operation: "getLead" },
      () => this.meta.connector().getLead(ctx, leadgenId),
    );
    await this.persist(organizationId, clientId, info);
  }

  /** Dev/mock helper: fabricate a lead for a client so the inbox works offline. */
  async simulate(user: AuthContext, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
    });
    if (!client) throw AppException.notFound("הלקוח לא נמצא");
    const connection = await this.prisma.metaConnection.findFirst({
      where: { organizationId: user.organizationId, clientId, status: "CONNECTED" },
    });
    if (!connection) throw AppException.badRequest("הלקוח אינו מחובר ל-Meta", "NOT_CONNECTED");

    const ctx = await this.meta.context(user.organizationId, connection.id);
    const fakeId = `sim_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const info = await this.meta.connector().getLead(ctx, fakeId);
    const lead = await this.persist(user.organizationId, clientId, info);
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "lead.simulate",
      entityType: "lead",
      entityId: lead.id,
    });
    return lead;
  }

  private async persist(organizationId: string, clientId: string, info: MetaLeadInfo) {
    const fields = extractFields(info.fieldData);
    return this.prisma.lead.upsert({
      where: { metaLeadId: info.leadId },
      create: {
        organizationId,
        clientId,
        formId: info.formId,
        adId: info.adId,
        campaignId: info.campaignId,
        metaLeadId: info.leadId,
        fullName: fields.fullName,
        email: fields.email,
        phone: fields.phone,
        fieldData: info.fieldData as object,
        metaCreatedAt: info.createdTime ? new Date(info.createdTime) : null,
        status: "NEW",
      },
      update: {},
    });
  }

  async list(user: AuthContext, clientId: string, status?: string) {
    if (user.role === "CLIENT_VIEWER" && user.clientScope.length > 0 && !user.clientScope.includes(clientId)) {
      throw AppException.notFound("הלקוח לא נמצא");
    }
    return this.prisma.lead.findMany({
      where: {
        organizationId: user.organizationId,
        clientId,
        ...(status ? { status: status as LeadStatus } : {}),
      },
      orderBy: { receivedAt: "desc" },
      take: 200,
    });
  }

  async updateStatus(user: AuthContext, leadId: string, status: LeadStatus, notes?: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId: user.organizationId },
    });
    if (!lead) throw AppException.notFound("הליד לא נמצא");
    const updated = await this.prisma.lead.update({
      where: { id: leadId },
      data: { status, ...(notes !== undefined ? { notes } : {}), decidedById: user.userId },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "lead.status.update",
      entityType: "lead",
      entityId: leadId,
      metadata: { status },
    });
    return updated;
  }
}
