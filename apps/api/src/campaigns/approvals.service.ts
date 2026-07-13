import { Injectable, Logger } from "@nestjs/common";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { CryptoService } from "../core/crypto.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { MetaService } from "../meta/meta.service";
import { MetaCallLogger } from "../meta/meta-call-logger.service";
import { CampaignsService } from "./campaigns.service";
import { buildPublishPlan, type CampaignBundle } from "./payload-builder";

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
    private readonly meta: MetaService,
    private readonly callLogger: MetaCallLogger,
  ) {}

  /** Assembles the publish bundle for a campaign from local draft data. */
  async buildBundle(organizationId: string, campaignId: string): Promise<CampaignBundle> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      include: { adSets: { include: { ads: { include: { creative: { include: { asset: true } } } } } } },
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
          imageUrl: ad.creative?.asset?.url ?? null,
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
    // enrich with entity name + owning client (Approval has no clientId column, so
    // we resolve it via the entity to enforce CLIENT_VIEWER scope below).
    const campaignIds = approvals
      .filter((a) => a.entityType === "CAMPAIGN" || a.entityType === "BUDGET_CHANGE")
      .map((a) => a.entityId);
    const campaigns = await this.prisma.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, name: true, clientId: true },
    });
    const abTestIds = approvals.filter((a) => a.entityType === "AB_TEST").map((a) => a.entityId);
    const abTests = abTestIds.length
      ? await this.prisma.abTest.findMany({ where: { id: { in: abTestIds } }, select: { id: true, name: true, clientId: true } })
      : [];
    const nameById = new Map<string, string>([
      ...campaigns.map((c) => [c.id, c.name] as [string, string]),
      ...abTests.map((t) => [t.id, `מבחן A/B: ${t.name}`] as [string, string]),
    ]);
    const clientByEntity = new Map<string, string>([
      ...campaigns.map((c) => [c.id, c.clientId] as [string, string]),
      ...abTests.map((t) => [t.id, t.clientId] as [string, string]),
    ]);

    // Client-scoping: a scoped CLIENT_VIEWER only sees approvals for its clients.
    // Rows that don't resolve to an in-scope client (or to no client at all, e.g.
    // CONNECTION) are hidden — fail closed.
    const scoped =
      user.role === "CLIENT_VIEWER" && user.clientScope.length > 0
        ? approvals.filter((a) => {
            const clientId = clientByEntity.get(a.entityId);
            return clientId ? user.clientScope.includes(clientId) : false;
          })
        : approvals;

    const requesterIds = [...new Set(scoped.map((a) => a.requestedById))];
    const users = await this.prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true } });
    const userName = new Map(users.map((u) => [u.id, u.name]));
    return scoped.map((a) => ({
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
    // maker-checker: the requester may not approve their own request when ANOTHER
    // member with approval rights (ADMIN/AGENCY_OWNER) exists. If they are the sole
    // eligible approver, allow it to avoid a deadlock.
    if (approve && approval.requestedById === user.userId) {
      const otherApprovers = await this.prisma.organizationMember.count({
        where: {
          organizationId: user.organizationId,
          role: { in: ["ADMIN", "AGENCY_OWNER"] },
          userId: { not: user.userId },
        },
      });
      if (otherApprovers > 0) {
        throw AppException.forbidden(
          "מי שביקש את האישור אינו יכול לאשר אותו בעצמו (הפרדת תפקידים). נדרש מאשר אחר.",
          "MAKER_CHECKER",
        );
      }
    }

    // Budget-change approvals execute immediately on approval (and are consumed),
    // instead of moving a campaign into the publish workflow.
    if (approval.entityType === "BUDGET_CHANGE") {
      return this.decideBudgetChange(user, approval, approve, reason);
    }

    // A/B launch approvals create a Meta Experiment on approval (and are consumed).
    if (approval.entityType === "AB_TEST") {
      return this.decideAbTestLaunch(user, approval, approve, reason);
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

  /** Launches an approved split test as a Meta Experiment, then consumes the approval. */
  private async decideAbTestLaunch(
    user: AuthContext,
    approval: { id: string; entityId: string; payloadPreview: unknown; payloadHash: string },
    approve: boolean,
    reason?: string,
  ) {
    if (!approve) {
      const [updated] = await this.prisma.$transaction([
        this.prisma.approval.update({
          where: { id: approval.id },
          data: { status: "REJECTED", decidedById: user.userId, decidedAt: new Date(), reason },
        }),
        this.prisma.abTest.updateMany({
          where: { id: approval.entityId, organizationId: user.organizationId, status: "PENDING_APPROVAL" },
          data: { status: "DRAFT" },
        }),
      ]);
      return updated;
    }

    // payloadPreview is the immutable, approved spec (jsonb round-trips lose key
    // order, so we execute it directly rather than re-hashing — as decideBudgetChange does).
    const spec = approval.payloadPreview as {
      abTestId: string;
      adAccountId: string;
      connectionId: string;
      name: string;
      metric: string;
      cells: { name: string; metaEntityId: string }[];
    };
    const test = await this.prisma.abTest.findFirst({
      where: { id: spec.abTestId, organizationId: user.organizationId },
    });
    if (!test) throw AppException.notFound("המבחן לא נמצא");
    // Drift guard: the test must still be awaiting this launch (not cancelled/relaunched).
    if (test.status !== "PENDING_APPROVAL") {
      throw AppException.conflict("מצב המבחן השתנה מאז הבקשה. יש לבקש שוב.", "AB_TEST_STALE");
    }

    const ctx = await this.meta.context(user.organizationId, spec.connectionId);
    const created = await this.callLogger.wrap(
      {
        organizationId: user.organizationId,
        connectionId: spec.connectionId,
        operation: "createSplitTest",
        isWrite: true,
        approvalId: approval.id,
        requestInfo: { name: spec.name, cells: spec.cells.length },
      },
      () =>
        this.meta.connector().createSplitTest(ctx, spec.adAccountId, {
          name: spec.name,
          metric: spec.metric,
          cells: spec.cells,
        }),
    );

    // The Meta experiment is now LIVE and spending. If persisting that fact fails,
    // we must not leave an orphaned, unstoppable, re-approvable experiment — so we
    // compensate by stopping it on Meta (best-effort) before surfacing the error.
    let updated;
    try {
      [updated] = await this.prisma.$transaction([
        this.prisma.approval.update({
          where: { id: approval.id },
          data: { status: "CONSUMED", decidedById: user.userId, decidedAt: new Date(), consumedAt: new Date(), reason },
        }),
        this.prisma.abTest.update({
          where: { id: test.id },
          data: {
            status: "RUNNING",
            metaTestId: created.id,
            startAt: new Date(),
            launchedById: user.userId,
            // Snapshot the launched entity ids so results attribute to the right cell.
            cellAMetaId: spec.cells[0]?.metaEntityId ?? null,
            cellBMetaId: spec.cells[1]?.metaEntityId ?? null,
          },
        }),
      ]);
    } catch (dbErr) {
      this.logger.error(
        `AB launch ${test.id}: Meta study ${created.id} created but DB commit failed — compensating with stopSplitTest`,
      );
      await this.meta
        .connector()
        .stopSplitTest(ctx, spec.adAccountId, created.id)
        .catch((stopErr) =>
          this.logger.error(
            `AB launch ${test.id}: COMPENSATION FAILED — orphaned live study ${created.id} may still be spending: ${(stopErr as Error).message}`,
          ),
        );
      throw AppException.badRequest(
        "השקת המבחן נכשלה בשמירה ובוטלה ב-Meta. נסה שוב.",
        "AB_LAUNCH_ROLLED_BACK",
      );
    }
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "abtest.launch",
      entityType: "ab_test",
      entityId: test.id,
      metadata: { approvalId: approval.id, metaTestId: created.id },
    });
    return updated;
  }

  /** Executes an approved budget change against Meta, then consumes the approval. */
  private async decideBudgetChange(
    user: AuthContext,
    approval: { id: string; entityId: string; payloadPreview: unknown; payloadHash: string },
    approve: boolean,
    reason?: string,
  ) {
    if (!approve) {
      return this.prisma.approval.update({
        where: { id: approval.id },
        data: { status: "REJECTED", decidedById: user.userId, decidedAt: new Date(), reason },
      });
    }

    const preview = approval.payloadPreview as {
      metaCampaignId: string;
      newBudget: number;
      budgetType: string;
      currentBudget: number;
    };
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: approval.entityId, organizationId: user.organizationId },
    });
    if (!campaign || !campaign.metaCampaignId) {
      throw AppException.conflict("הקמפיין אינו מפורסם עוד ב-Meta", "NOT_PUBLISHED");
    }
    // Guard against drift: the campaign budget must still be what we approved against.
    if (campaign.budgetAmount !== preview.currentBudget) {
      throw AppException.conflict("תקציב הקמפיין השתנה מאז הבקשה. יש לבקש שוב.", "BUDGET_STALE");
    }

    const account = await this.prisma.metaAdAccount.findFirst({
      where: { organizationId: user.organizationId, clientId: campaign.clientId, isSelected: true },
    });
    if (!account) throw AppException.badRequest("לא נבחר חשבון מודעות", "NO_AD_ACCOUNT");

    const ctx = await this.meta.context(user.organizationId, account.connectionId);
    const fields =
      preview.budgetType === "LIFETIME" ? { lifetimeBudget: preview.newBudget } : { dailyBudget: preview.newBudget };
    await this.callLogger.wrap(
      {
        organizationId: user.organizationId,
        connectionId: account.connectionId,
        operation: "updateEntity",
        isWrite: true,
        approvalId: approval.id,
        requestInfo: fields,
      },
      () => this.meta.connector().updateEntity(ctx, account.accountId, "campaign", campaign.metaCampaignId!, fields),
    );

    const [updated] = await this.prisma.$transaction([
      this.prisma.approval.update({
        where: { id: approval.id },
        data: { status: "CONSUMED", decidedById: user.userId, decidedAt: new Date(), consumedAt: new Date(), reason },
      }),
      this.prisma.campaign.update({
        where: { id: campaign.id },
        data: { budgetAmount: preview.newBudget },
      }),
    ]);
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "campaign.budget.change",
      entityType: "campaign",
      entityId: campaign.id,
      before: { budget: preview.currentBudget },
      after: { budget: preview.newBudget },
      metadata: { approvalId: approval.id },
    });
    return updated;
  }
}
