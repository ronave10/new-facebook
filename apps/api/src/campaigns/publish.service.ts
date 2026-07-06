import { Injectable, Logger } from "@nestjs/common";
import type { MetaConnectorContext, MetaEntityType } from "@campaignos/meta";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { CryptoService } from "../core/crypto.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { MetaService } from "../meta/meta.service";
import { MetaCallLogger } from "../meta/meta-call-logger.service";
import { ApprovalsService } from "./approvals.service";
import { buildPublishPlan } from "./payload-builder";

/**
 * The ONLY path from local draft to live Meta entities. Requires an APPROVED,
 * unconsumed, unexpired Approval whose payloadHash matches a freshly rebuilt plan
 * (rejects on drift). Creates everything PAUSED, then activates top-down. On any
 * failure the campaign is marked ERROR and nothing is left half-activated.
 */
@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly meta: MetaService,
    private readonly callLogger: MetaCallLogger,
    private readonly approvals: ApprovalsService,
  ) {}

  async publish(user: AuthContext, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: user.organizationId },
    });
    if (!campaign) throw AppException.notFound("הקמפיין לא נמצא");
    if (campaign.status === "PUBLISHED") {
      throw AppException.conflict("הקמפיין כבר פורסם", "ALREADY_PUBLISHED");
    }

    // 1. Find a valid approval
    const approval = await this.prisma.approval.findFirst({
      where: {
        organizationId: user.organizationId,
        entityType: "CAMPAIGN",
        entityId: campaignId,
        action: "PUBLISH",
        status: "APPROVED",
      },
      orderBy: { decidedAt: "desc" },
    });
    if (!approval) {
      throw AppException.conflict("לא קיים אישור תקף לפרסום הקמפיין", "NO_APPROVAL");
    }
    if (approval.expiresAt && approval.expiresAt < new Date()) {
      throw AppException.conflict("האישור פג תוקף. יש לבקש אישור מחדש.", "APPROVAL_EXPIRED");
    }

    // 2. Rebuild plan and verify the hash hasn't drifted since approval
    const bundle = await this.approvals.buildBundle(user.organizationId, campaignId);
    const plan = buildPublishPlan(bundle);
    const freshHash = this.crypto.hashJson(plan);
    if (freshHash !== approval.payloadHash) {
      throw AppException.conflict(
        "הקמפיין השתנה מאז האישור. יש לבקש אישור מחדש כדי לפרסם.",
        "APPROVAL_STALE",
      );
    }

    // resolve connection + selected ad account
    const account = await this.prisma.metaAdAccount.findFirst({
      where: { organizationId: user.organizationId, clientId: campaign.clientId, isSelected: true },
    });
    if (!account) throw AppException.badRequest("לא נבחר חשבון מודעות", "NO_AD_ACCOUNT");

    // 3. Consume the approval + mark publishing
    await this.prisma.$transaction([
      this.prisma.approval.update({
        where: { id: approval.id },
        data: { status: "CONSUMED", consumedAt: new Date() },
      }),
      this.prisma.campaign.update({ where: { id: campaignId }, data: { status: "PUBLISHING", lastError: null } }),
    ]);

    const ctx: MetaConnectorContext = await this.meta.context(user.organizationId, account.connectionId);
    const connector = this.meta.connector();
    const idMap = new Map<string, string>(); // localId → metaId

    try {
      for (const step of plan) {
        if (step.action === "create_campaign") {
          const res = await this.callLogger.wrap(
            { organizationId: user.organizationId, connectionId: account.connectionId, operation: "createCampaign", isWrite: true, approvalId: approval.id, requestInfo: step.spec },
            () => connector.createCampaign(ctx, account.accountId, step.spec as never),
          );
          idMap.set(step.ref.localId, res.id);
          await this.prisma.campaign.update({ where: { id: campaignId }, data: { metaCampaignId: res.id, adAccountId: account.id } });
        } else if (step.action === "create_ad_set") {
          const res = await this.callLogger.wrap(
            { organizationId: user.organizationId, connectionId: account.connectionId, operation: "createAdSet", isWrite: true, approvalId: approval.id, requestInfo: step.spec },
            () => connector.createAdSet(ctx, account.accountId, { ...(step.spec as object), campaignId: idMap.get(bundle.campaign.id)! } as never),
          );
          idMap.set(step.ref.localId, res.id);
          await this.prisma.adSet.update({ where: { id: step.ref.localId }, data: { metaAdSetId: res.id, status: "PUBLISHED" } });
        } else if (step.action === "create_creative") {
          const res = await this.callLogger.wrap(
            { organizationId: user.organizationId, connectionId: account.connectionId, operation: "createCreative", isWrite: true, approvalId: approval.id, requestInfo: step.spec },
            () => connector.createCreative(ctx, account.accountId, step.spec as never),
          );
          idMap.set(`creative:${step.ref.localId}`, res.id);
          await this.prisma.adCreative.updateMany({ where: { id: step.ref.localId }, data: { metaCreativeId: res.id } });
        } else if (step.action === "create_ad") {
          // find the creative created for this ad
          const adRecord = await this.prisma.ad.findUnique({ where: { id: step.ref.localId } });
          const adSetMetaId = adRecord?.adSetId ? idMap.get(adRecord.adSetId) : undefined;
          const creativeMetaId = adRecord?.creativeId ? idMap.get(`creative:${adRecord.creativeId}`) : undefined;
          const res = await this.callLogger.wrap(
            { organizationId: user.organizationId, connectionId: account.connectionId, operation: "createAd", isWrite: true, approvalId: approval.id, requestInfo: step.spec },
            () => connector.createAd(ctx, account.accountId, {
              name: (step.spec as { name: string }).name,
              adSetId: adSetMetaId ?? "",
              creativeId: creativeMetaId ?? "",
            }),
          );
          idMap.set(step.ref.localId, res.id);
          await this.prisma.ad.update({ where: { id: step.ref.localId }, data: { metaAdId: res.id, status: "PUBLISHED" } });
        } else if (step.action === "activate") {
          const metaId = idMap.get(step.ref.localId);
          if (metaId) {
            await this.callLogger.wrap(
              { organizationId: user.organizationId, connectionId: account.connectionId, operation: "activateEntity", isWrite: true, approvalId: approval.id, requestInfo: { entityId: metaId } },
              () => connector.activateEntity(ctx, account.accountId, step.ref.type as MetaEntityType, metaId),
            );
          }
        }
      }

      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
      await this.audit.log({
        organizationId: user.organizationId,
        actorId: user.userId,
        action: "campaign.publish",
        entityType: "campaign",
        entityId: campaignId,
        metadata: { approvalId: approval.id, metaCampaignId: idMap.get(bundle.campaign.id) },
      });
      return this.prisma.campaign.findUnique({ where: { id: campaignId } });
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Publish failed for campaign ${campaignId}: ${message}`);
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "ERROR", lastError: message },
      });
      await this.audit.log({
        organizationId: user.organizationId,
        actorId: user.userId,
        action: "campaign.publish.failed",
        entityType: "campaign",
        entityId: campaignId,
        metadata: { error: message },
      });
      throw err;
    }
  }

  async pause(user: AuthContext, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: user.organizationId },
    });
    if (!campaign) throw AppException.notFound("הקמפיין לא נמצא");
    if (!campaign.metaCampaignId) {
      throw AppException.badRequest("הקמפיין אינו מפורסם ב-Meta", "NOT_PUBLISHED");
    }
    const account = await this.prisma.metaAdAccount.findFirst({
      where: { organizationId: user.organizationId, clientId: campaign.clientId, isSelected: true },
    });
    if (!account) throw AppException.badRequest("לא נבחר חשבון מודעות", "NO_AD_ACCOUNT");
    const ctx = await this.meta.context(user.organizationId, account.connectionId);
    await this.callLogger.wrap(
      { organizationId: user.organizationId, connectionId: account.connectionId, operation: "pauseEntity", isWrite: true },
      () => this.meta.connector().pauseEntity(ctx, account.accountId, "campaign", campaign.metaCampaignId!),
    );
    await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "campaign.pause",
      entityType: "campaign",
      entityId: campaignId,
    });
    return { ok: true };
  }
}
