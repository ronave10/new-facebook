import { Injectable } from "@nestjs/common";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { CryptoService } from "../core/crypto.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { CampaignsService } from "./campaigns.service";
import { buildPublishPlan, type CampaignBundle } from "./payload-builder";

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
  ) {}

  /** Assembles the publish bundle for a campaign from local draft data. */
  async buildBundle(organizationId: string, campaignId: string): Promise<CampaignBundle> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      include: { adSets: { include: { ads: { include: { creative: true } } } } },
    });
    if (!campaign) throw AppException.notFound("הקמפיין לא נמצא");

    // resolve selected ad account / page / pixel for the client
    const account = await this.prisma.metaAdAccount.findFirst({
      where: { organizationId, clientId: campaign.clientId, isSelected: true },
      include: { connection: { include: { pages: true, pixels: true } } },
    });
    const page = account?.connection.pages[0];
    const pixel = account?.connection.pixels[0];

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        goal: campaign.goal,
        budgetType: campaign.budgetType,
        budgetAmount: campaign.budgetAmount,
        currency: campaign.currency,
        specialAdCategories: campaign.specialAdCategories,
        startAt: campaign.startAt,
        endAt: campaign.endAt,
        targetingDraft: campaign.targetingDraft,
      },
      adAccountId: account?.accountId ?? "PENDING_SELECTION",
      pageId: page?.pageId,
      pixelId: pixel?.pixelId,
      adSets: campaign.adSets.map((as) => ({
        id: as.id,
        name: as.name,
        optimizationGoal: as.optimizationGoal,
        billingEvent: as.billingEvent,
        budgetAmount: as.budgetAmount,
        targeting: as.targeting,
        ads: as.ads.map((ad) => ({
          id: ad.id,
          name: ad.name,
          creativeId: ad.creativeId,
          creativeName: ad.creative?.name ?? ad.name,
          primaryText: ad.primaryText,
          headline: ad.headline,
          description: ad.description,
          cta: ad.cta,
          destinationUrl: ad.destinationUrl,
        })),
      })),
    };
  }

  async requestApproval(user: AuthContext, campaignId: string) {
    const campaign = await this.campaigns.loadScoped(user, campaignId);
    if (campaign.status === "PUBLISHED") {
      throw AppException.conflict("הקמפיין כבר פורסם", "ALREADY_PUBLISHED");
    }
    const bundle = await this.buildBundle(user.organizationId, campaignId);
    if (!bundle.adSets.length) {
      throw AppException.badRequest("אין מודעות בקמפיין. יש לייצר מודעות לפני שליחה לאישור.", "NO_ADS");
    }
    if (bundle.adAccountId === "PENDING_SELECTION") {
      throw AppException.badRequest("יש לבחור חשבון מודעות ולחבר עמוד לפני שליחה לאישור.", "NO_AD_ACCOUNT");
    }
    const plan = buildPublishPlan(bundle);
    const payloadHash = this.crypto.hashJson(plan);

    const approval = await this.prisma.$transaction(async (tx) => {
      // supersede any previous pending approvals for this campaign
      await tx.approval.updateMany({
        where: { organizationId: user.organizationId, entityType: "CAMPAIGN", entityId: campaignId, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      const created = await tx.approval.create({
        data: {
          organizationId: user.organizationId,
          entityType: "CAMPAIGN",
          entityId: campaignId,
          action: "PUBLISH",
          payloadPreview: plan as unknown as object,
          payloadHash,
          status: "PENDING",
          requestedById: user.userId,
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        },
      });
      await tx.campaign.update({ where: { id: campaignId }, data: { status: "PENDING_APPROVAL" } });
      return created;
    });

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "campaign.request_approval",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { approvalId: approval.id, steps: plan.length },
    });
    return approval;
  }

  async list(user: AuthContext, status?: string) {
    const approvals = await this.prisma.approval.findMany({
      where: { organizationId: user.organizationId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    // enrich with entity name
    const campaignIds = approvals.filter((a) => a.entityType === "CAMPAIGN").map((a) => a.entityId);
    const campaigns = await this.prisma.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(campaigns.map((c) => [c.id, c.name]));
    const requesterIds = [...new Set(approvals.map((a) => a.requestedById))];
    const users = await this.prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true } });
    const userName = new Map(users.map((u) => [u.id, u.name]));
    return approvals.map((a) => ({
      id: a.id,
      entityType: a.entityType,
      entityId: a.entityId,
      entityName: nameById.get(a.entityId),
      action: a.action,
      status: a.status,
      payloadPreview: a.payloadPreview,
      requestedByName: userName.get(a.requestedById),
      createdAt: a.createdAt.toISOString(),
    }));
  }

  async decide(user: AuthContext, approvalId: string, approve: boolean, reason?: string) {
    const approval = await this.prisma.approval.findFirst({
      where: { id: approvalId, organizationId: user.organizationId },
    });
    if (!approval) throw AppException.notFound("בקשת האישור לא נמצאה");
    if (approval.status !== "PENDING") {
      throw AppException.conflict("בקשת האישור כבר טופלה", "NOT_PENDING");
    }
    // maker-checker: requester cannot approve their own request unless sole member
    if (approve && approval.requestedById === user.userId) {
      const members = await this.prisma.organizationMember.count({
        where: { organizationId: user.organizationId },
      });
      if (members > 1) {
        throw AppException.forbidden(
          "מי שביקש את האישור אינו יכול לאשר אותו בעצמו (הפרדת תפקידים)",
          "MAKER_CHECKER",
        );
      }
    }

    const updated = await this.prisma.approval.update({
      where: { id: approvalId },
      data: {
        status: approve ? "APPROVED" : "REJECTED",
        decidedById: user.userId,
        decidedAt: new Date(),
        reason,
      },
    });
    if (approve) {
      await this.prisma.campaign.updateMany({
        where: { id: approval.entityId, organizationId: user.organizationId },
        data: { status: "APPROVED" },
      });
    } else {
      await this.prisma.campaign.updateMany({
        where: { id: approval.entityId, organizationId: user.organizationId, status: "PENDING_APPROVAL" },
        data: { status: "DRAFT" },
      });
    }
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: approve ? "campaign.approve" : "campaign.reject",
      entityType: "campaign",
      entityId: approval.entityId,
      metadata: { approvalId, reason },
    });
    return updated;
  }
}
