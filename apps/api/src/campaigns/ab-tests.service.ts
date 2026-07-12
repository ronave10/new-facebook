import { Injectable, Logger } from "@nestjs/common";
import { evaluateAbTest, type AbVariantInput } from "@campaignos/marketing-core";
import type { CreateAbTestInput } from "@campaignos/shared";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { CryptoService } from "../core/crypto.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { MetaService } from "../meta/meta.service";
import { MetaCallLogger } from "../meta/meta-call-logger.service";
import { CampaignsService } from "./campaigns.service";

/**
 * Registers and runs split tests ("experiments") on a campaign. Launching a test
 * spends money (live ads compete), so it goes through the same Approval gate as
 * publishing: requestLaunch creates an AB_TEST approval; ApprovalsService executes
 * createSplitTest on Meta only when a checker approves.
 */
@Injectable()
export class AbTestsService {
  private readonly logger = new Logger(AbTestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
    private readonly meta: MetaService,
    private readonly callLogger: MetaCallLogger,
  ) {}

  /** Resolves an entity's display label + Meta id at the chosen level. */
  private async resolveCell(organizationId: string, campaignId: string, level: "AD" | "AD_SET", id: string) {
    if (level === "AD") {
      const ad = await this.prisma.ad.findFirst({
        where: { id, campaignId, organizationId },
        select: { id: true, name: true, hook: true, metaAdId: true },
      });
      if (!ad) throw AppException.badRequest("וריאציה לא נמצאה בקמפיין", "CELL_NOT_FOUND");
      return { id: ad.id, label: ad.hook || ad.name, metaId: ad.metaAdId };
    }
    const adset = await this.prisma.adSet.findFirst({
      where: { id, campaignId, organizationId },
      select: { id: true, name: true, metaAdSetId: true },
    });
    if (!adset) throw AppException.badRequest("קבוצת מודעות לא נמצאה בקמפיין", "CELL_NOT_FOUND");
    return { id: adset.id, label: adset.name, metaId: adset.metaAdSetId };
  }

  async create(user: AuthContext, campaignId: string, input: CreateAbTestInput) {
    await this.campaigns.loadScoped(user, campaignId);
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: user.organizationId },
      select: { clientId: true },
    });
    if (!campaign) throw AppException.notFound("הקמפיין לא נמצא");

    const [a, b] = await Promise.all([
      this.resolveCell(user.organizationId, campaignId, input.level, input.cellAId),
      this.resolveCell(user.organizationId, campaignId, input.level, input.cellBId),
    ]);

    const test = await this.prisma.abTest.create({
      data: {
        organizationId: user.organizationId,
        clientId: campaign.clientId,
        campaignId,
        name: input.name,
        hypothesis: input.hypothesis,
        metric: input.metric,
        level: input.level,
        cellAId: a.id,
        cellALabel: a.label,
        cellBId: b.id,
        cellBLabel: b.label,
        status: "DRAFT",
        createdById: user.userId,
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "abtest.create",
      entityType: "ab_test",
      entityId: test.id,
      metadata: { campaignId, metric: input.metric },
    });
    return test;
  }

  async list(user: AuthContext, campaignId?: string) {
    return this.prisma.abTest.findMany({
      where: {
        organizationId: user.organizationId,
        ...(campaignId ? { campaignId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async get(user: AuthContext, id: string) {
    const test = await this.prisma.abTest.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!test) throw AppException.notFound("המבחן לא נמצא");
    return test;
  }

  /**
   * Requests launch: builds the split-test payload and creates an AB_TEST approval.
   * Nothing is sent to Meta here — ApprovalsService.decide executes it on approval.
   */
  async requestLaunch(user: AuthContext, id: string) {
    const test = await this.get(user, id);
    if (test.status !== "DRAFT") {
      throw AppException.conflict("ניתן להשיק רק מבחן בטיוטה", "NOT_DRAFT");
    }
    const account = await this.prisma.metaAdAccount.findFirst({
      where: { organizationId: user.organizationId, clientId: test.clientId, isSelected: true },
    });
    if (!account) throw AppException.badRequest("יש לבחור חשבון מודעות לפני השקת מבחן", "NO_AD_ACCOUNT");

    const level = test.level === "AD_SET" ? "AD_SET" : "AD";
    const [a, b] = await Promise.all([
      this.resolveCell(user.organizationId, test.campaignId, level, test.cellAId),
      this.resolveCell(user.organizationId, test.campaignId, level, test.cellBId),
    ]);

    const spec = {
      abTestId: test.id,
      adAccountId: account.accountId,
      connectionId: account.connectionId,
      name: test.name,
      metric: test.metric === "CTR" ? "LINK_CLICKS" : "CONVERSIONS",
      cells: [
        { name: a.label, metaEntityId: a.metaId ?? a.id },
        { name: b.label, metaEntityId: b.metaId ?? b.id },
      ],
    };
    const payloadHash = this.crypto.hashJson(spec);

    const approval = await this.prisma.$transaction(async (tx) => {
      await tx.approval.updateMany({
        where: { organizationId: user.organizationId, entityType: "AB_TEST", entityId: test.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      const created = await tx.approval.create({
        data: {
          organizationId: user.organizationId,
          entityType: "AB_TEST",
          entityId: test.id,
          action: "PUBLISH",
          payloadPreview: spec as unknown as object,
          payloadHash,
          status: "PENDING",
          requestedById: user.userId,
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        },
      });
      await tx.abTest.update({ where: { id: test.id }, data: { status: "PENDING_APPROVAL" } });
      return created;
    });

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "abtest.request_launch",
      entityType: "ab_test",
      entityId: test.id,
      metadata: { approvalId: approval.id },
    });
    return approval;
  }

  async cancel(user: AuthContext, id: string) {
    const test = await this.get(user, id);
    await this.prisma.$transaction([
      this.prisma.abTest.update({ where: { id: test.id }, data: { status: "CANCELLED" } }),
      this.prisma.approval.updateMany({
        where: { organizationId: user.organizationId, entityType: "AB_TEST", entityId: test.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      }),
    ]);
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "abtest.cancel",
      entityType: "ab_test",
      entityId: test.id,
    });
    return { ok: true };
  }

  /**
   * Pulls live cell metrics from Meta and recomputes significance via marketing-core.
   * Persists the latest AbTestResult + winner on the test row.
   */
  async refreshResults(user: AuthContext, id: string) {
    const test = await this.get(user, id);
    if (!test.metaTestId) {
      throw AppException.conflict("המבחן טרם הושק ל-Meta", "NOT_LAUNCHED");
    }
    const account = await this.prisma.metaAdAccount.findFirst({
      where: { organizationId: user.organizationId, clientId: test.clientId, isSelected: true },
    });
    if (!account) throw AppException.badRequest("לא נבחר חשבון מודעות", "NO_AD_ACCOUNT");

    const ctx = await this.meta.context(user.organizationId, account.connectionId);
    const info = await this.callLogger.wrap(
      { organizationId: user.organizationId, connectionId: account.connectionId, operation: "getSplitTest" },
      () => this.meta.connector().getSplitTest(ctx, test.metaTestId!),
    );
    if (info.cells.length < 2) {
      throw AppException.conflict("אין עדיין מספיק דאטה במבחן", "NO_CELL_DATA");
    }

    const useCvr = test.metric !== "CTR";
    const toVariant = (cell: (typeof info.cells)[number], id: string, label: string): AbVariantInput => ({
      id,
      label,
      trials: useCvr ? cell.clicks : cell.impressions,
      successes: useCvr ? cell.conversions : cell.clicks,
    });
    const result = evaluateAbTest(
      toVariant(info.cells[0], test.cellAId, test.cellALabel),
      toVariant(info.cells[1], test.cellBId, test.cellBLabel),
      useCvr ? "יחס המרה (לידים/קליקים)" : "CTR (קליקים/חשיפות)",
    );

    const concluded = info.status === "CONCLUDED";
    const updated = await this.prisma.abTest.update({
      where: { id: test.id },
      data: {
        result: result as unknown as object,
        winnerCellId: result.winnerId,
        ...(concluded ? { status: "CONCLUDED", endAt: new Date() } : {}),
      },
    });
    return { ...updated, liveCells: info.cells };
  }
}
