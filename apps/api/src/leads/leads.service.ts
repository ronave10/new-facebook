import { randomBytes } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { Lead, LeadStatus } from "@campaignos/db";
import type { MetaLeadInfo } from "@campaignos/meta";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { CryptoService } from "../core/crypto.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { MetaService } from "../meta/meta.service";
import { MetaCallLogger } from "../meta/meta-call-logger.service";

interface LeadPii {
  fullName?: string;
  email?: string;
  phone?: string;
  fieldData: { name: string; values: string[] }[];
}

/** Extracts common contact fields (+ FB user id, if present) from a lead's field_data. */
function extractFields(fieldData: { name: string; values: string[] }[]) {
  const get = (keys: string[]) => {
    const f = fieldData.find((x) => keys.some((k) => x.name.toLowerCase().includes(k)));
    return f?.values?.[0];
  };
  return {
    fullName: get(["full_name", "name", "שם"]),
    email: get(["email", "אימייל", "מייל"]),
    phone: get(["phone", "טלפון", "נייד"]),
    fbUserId: get(["fb_user_id", "user_id", "fb_lead_user"]),
  };
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly meta: MetaService,
    private readonly callLogger: MetaCallLogger,
  ) {}

  /** Decrypts a lead row into its API shape. Lead PII lives encrypted at rest. */
  private toDto(lead: Lead) {
    let pii: LeadPii = { fieldData: [] };
    if (lead.piiCiphertext && lead.piiIv && lead.piiAuthTag && lead.piiKeyVersion != null) {
      try {
        pii = JSON.parse(
          this.crypto.decrypt({
            ciphertext: lead.piiCiphertext,
            iv: lead.piiIv,
            authTag: lead.piiAuthTag,
            keyVersion: lead.piiKeyVersion,
          }),
        );
      } catch (err) {
        this.logger.error(`Lead ${lead.id}: PII decrypt failed: ${(err as Error).message}`);
      }
    }
    return {
      id: lead.id,
      clientId: lead.clientId,
      campaignId: lead.campaignId,
      adId: lead.adId,
      formId: lead.formId,
      metaLeadId: lead.metaLeadId,
      status: lead.status,
      notes: lead.notes,
      metaCreatedAt: lead.metaCreatedAt?.toISOString() ?? null,
      receivedAt: lead.receivedAt.toISOString(),
      fullName: pii.fullName ?? null,
      email: pii.email ?? null,
      phone: pii.phone ?? null,
      fieldData: pii.fieldData ?? [],
    };
  }

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
    return this.toDto(lead);
  }

  private async persist(organizationId: string, clientId: string, info: MetaLeadInfo) {
    const fields = extractFields(info.fieldData);
    const pii: LeadPii = {
      fullName: fields.fullName,
      email: fields.email,
      phone: fields.phone,
      fieldData: info.fieldData,
    };
    const blob = this.crypto.encrypt(JSON.stringify(pii));
    return this.prisma.lead.upsert({
      where: { metaLeadId: info.leadId },
      create: {
        organizationId,
        clientId,
        formId: info.formId,
        adId: info.adId,
        campaignId: info.campaignId,
        metaLeadId: info.leadId,
        piiCiphertext: blob.ciphertext,
        piiIv: blob.iv,
        piiAuthTag: blob.authTag,
        piiKeyVersion: blob.keyVersion,
        fbUserId: fields.fbUserId,
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
    const leads = await this.prisma.lead.findMany({
      where: {
        organizationId: user.organizationId,
        clientId,
        ...(status ? { status: status as LeadStatus } : {}),
      },
      orderBy: { receivedAt: "desc" },
      take: 200,
    });
    return leads.map((l) => this.toDto(l));
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
    return this.toDto(updated);
  }

  /**
   * Erases every lead belonging to a Facebook user (Data Deletion Callback).
   * Returns how many were deleted. Best-effort: lead-ads only expose the FB user
   * id when the form includes it, so unmatched requests still get a valid receipt.
   */
  async deleteByFbUser(metaUserId: string): Promise<number> {
    if (!metaUserId) return 0;
    const res = await this.prisma.lead.deleteMany({ where: { fbUserId: metaUserId } });
    if (res.count > 0) {
      this.logger.log(`Data deletion: erased ${res.count} lead(s) for Meta user ${metaUserId}`);
    }
    return res.count;
  }

  /**
   * Records a Meta Data Deletion (or Deauthorize) request, erases the user's leads,
   * and returns the confirmation code Meta requires in the callback response.
   */
  async handleDataDeletion(metaUserId: string | undefined, source = "data_deletion") {
    const code = randomBytes(12).toString("hex");
    const req = await this.prisma.dataDeletionRequest.create({
      data: { confirmationCode: code, metaUserId: metaUserId ?? null, source },
    });
    const deleted = metaUserId ? await this.deleteByFbUser(metaUserId) : 0;
    await this.prisma.dataDeletionRequest.update({
      where: { id: req.id },
      data: { status: "COMPLETED", leadsDeleted: deleted, completedAt: new Date() },
    });
    return { code, deleted };
  }

  async getDeletionStatus(code: string) {
    const req = await this.prisma.dataDeletionRequest.findUnique({ where: { confirmationCode: code } });
    if (!req) throw AppException.notFound("בקשת מחיקה לא נמצאה");
    return {
      confirmation_code: req.confirmationCode,
      status: req.status,
      leads_deleted: req.leadsDeleted,
      created_at: req.createdAt.toISOString(),
      completed_at: req.completedAt?.toISOString() ?? null,
    };
  }
}
