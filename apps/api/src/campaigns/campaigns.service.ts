import { Injectable } from "@nestjs/common";
import type { CreateCampaignInput } from "@campaignos/shared";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { GOAL_TO_META_OBJECTIVE } from "@campaignos/shared";

const EDITABLE_STATUSES = ["DRAFT", "PENDING_APPROVAL"];

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertClientInScope(user: AuthContext, clientId: string) {
    if (user.role === "CLIENT_VIEWER" && user.clientScope.length > 0 && !user.clientScope.includes(clientId)) {
      throw AppException.notFound("הלקוח לא נמצא");
    }
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
    });
    if (!client) throw AppException.notFound("הלקוח לא נמצא");
    return client;
  }

  async createDraft(user: AuthContext, input: CreateCampaignInput) {
    await this.assertClientInScope(user, input.clientId);
    const campaign = await this.prisma.campaign.create({
      data: {
        organizationId: user.organizationId,
        clientId: input.clientId,
        name: input.name,
        goal: input.goal,
        metaObjective: GOAL_TO_META_OBJECTIVE[input.goal],
        status: "DRAFT",
        budgetType: input.budgetType,
        budgetAmount: input.budgetAmount,
        currency: input.currency,
        startAt: input.startAt ? new Date(input.startAt) : null,
        endAt: input.endAt ? new Date(input.endAt) : null,
        targetingDraft: (input.targetingDraft ?? {}) as object,
        createdById: user.userId,
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "campaign.draft.create",
      entityType: "campaign",
      entityId: campaign.id,
    });
    return this.detail(user, campaign.id);
  }

  async list(user: AuthContext, clientId?: string, status?: string, page = 1) {
    const pageSize = 20;
    const where = {
      organizationId: user.organizationId,
      ...(clientId ? { clientId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(user.role === "CLIENT_VIEWER" && user.clientScope.length > 0
        ? { clientId: { in: user.clientScope } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { name: true } },
          _count: { select: { adSets: true, ads: true } },
        },
      }),
      this.prisma.campaign.count({ where }),
    ]);
    return {
      items: rows.map((c) => ({
        id: c.id,
        name: c.name,
        goal: c.goal,
        status: c.status,
        budgetType: c.budgetType,
        budgetAmount: c.budgetAmount,
        currency: c.currency,
        metaCampaignId: c.metaCampaignId,
        clientId: c.clientId,
        clientName: c.client.name,
        adSetCount: c._count.adSets,
        adCount: c._count.ads,
        createdAt: c.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  async loadScoped(user: AuthContext, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: user.organizationId },
    });
    if (!campaign) throw AppException.notFound("הקמפיין לא נמצא");
    if (user.role === "CLIENT_VIEWER" && user.clientScope.length > 0 && !user.clientScope.includes(campaign.clientId)) {
      throw AppException.notFound("הקמפיין לא נמצא");
    }
    return campaign;
  }

  async detail(user: AuthContext, campaignId: string) {
    await this.loadScoped(user, campaignId);
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        client: { select: { id: true, name: true } },
        strategy: true,
        adSets: { include: { ads: { include: { creative: true, persona: { select: { name: true } } } } } },
      },
    });
    if (!campaign) throw AppException.notFound("הקמפיין לא נמצא");
    const approvals = await this.prisma.approval.findMany({
      where: { organizationId: user.organizationId, entityType: "CAMPAIGN", entityId: campaignId },
      orderBy: { createdAt: "desc" },
    });
    return { ...campaign, approvals };
  }

  async update(user: AuthContext, campaignId: string, data: Partial<CreateCampaignInput>) {
    const campaign = await this.loadScoped(user, campaignId);
    if (!EDITABLE_STATUSES.includes(campaign.status)) {
      throw AppException.conflict("ניתן לערוך רק קמפיין בטיוטה או ממתין לאישור", "NOT_EDITABLE");
    }
    const updated = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.goal ? { goal: data.goal, metaObjective: GOAL_TO_META_OBJECTIVE[data.goal] } : {}),
        ...(data.budgetType ? { budgetType: data.budgetType } : {}),
        ...(data.budgetAmount !== undefined ? { budgetAmount: data.budgetAmount } : {}),
        ...(data.startAt ? { startAt: new Date(data.startAt) } : {}),
        ...(data.endAt ? { endAt: new Date(data.endAt) } : {}),
        ...(data.targetingDraft ? { targetingDraft: data.targetingDraft as object } : {}),
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "campaign.update",
      entityType: "campaign",
      entityId: campaignId,
    });
    return this.detail(user, updated.id);
  }

  async remove(user: AuthContext, campaignId: string) {
    const campaign = await this.loadScoped(user, campaignId);
    if (campaign.status !== "DRAFT") {
      throw AppException.conflict("ניתן למחוק רק קמפיין בטיוטה", "NOT_DELETABLE");
    }
    await this.prisma.campaign.delete({ where: { id: campaignId } });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "campaign.delete",
      entityType: "campaign",
      entityId: campaignId,
    });
    return { ok: true };
  }
}
