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

  /** Enforces CLIENT_VIEWER client-scoping (mirrors AnalyticsService.assertScope). */
  private assertScope(user: AuthContext, clientId: string) {
    if (user.role === "CLIENT_VIEWER" && user.clientScope.length > 0 && !user.clientScope.includes(clientId)) {
      throw AppException.notFound("המבחן לא נמצא");
    }
  }

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
    this.assertScope(user, campaign.clientId);

    const [a, b] = await Promise.all([
      this.resolveCell(user.organizationId, campaignId, input.level, input.cellAId),
      this.resolveCell(user.organizationId, campaignId, input.level, input.cellBId),
    ]);

    // No duplicate active test on the same (unordered) pair.
    const dup = await this.prisma.abTest.findFirst({
      where: {
        organizationId: user.organizationId,
        campaignId,
        status: { in: ["DRAFT", "PENDING_APPROVAL", "RUNNING"] },
        OR: [
          { cellAId: a.id, cellBId: b.id },
          { cellAId: b.id, cellBId: a.id },
        ],
      },
    });
    if (dup) throw AppException.conflict("כבר קיים מבחן פעיל על אותו זוג וריאציות", "DUPLICATE_TEST");

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
    const scopeFilter =
      user.role === "CLIENT_VIEWER" && user.clientScope.length > 0
        ? { clientId: { in: user.clientScope } }
        : {};
    return this.prisma.abTest.findMany({
      where: {
        organizationId: user.organizationId,
        ...(campaignId ? { campaignId } : {}),
        ...scopeFilter,
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
    this.assertScope(user, test.clientId);
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

    // A split test runs on LIVE Meta entities — both cells must be published.
    if (!a.metaId || !b.metaId) {
      throw AppException.badRequest(
        "יש לפרסם את הקמפיין/המודעות ל-Meta לפני הרצת מבחן A/B (שתי הווריאציות חייבות להיות חיות).",
        "AD_NOT_PUBLISHED",
      );
    }
    // A conversions test is meaningless without a pixel/conversion source.
    if (test.metric === "CVR") {
      const pixelCount = await this.prisma.metaPixel.count({
        where: { organizationId: user.organizationId, connectionId: account.connectionId },
      });
      if (pixelCount === 0) {
        throw AppException.badRequest("מבחן המרות (CVR) דורש פיקסל מחובר. חבר פיקסל או בחר מדד CTR.", "NO_PIXEL");
      }
    }

    const spec = {
      abTestId: test.id,
      adAccountId: account.accountId,
      connectionId: account.connectionId,
      name: test.name,
      metric: test.metric === "CTR" ? "LINK_CLICKS" : "CONVERSIONS",
      cells: [
        { name: a.label, metaEntityId: a.metaId },
        { name: b.label, metaEntityId: b.metaId },
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
    if (test.status === "CANCELLED" || test.status === "CONCLUDED") {
      throw AppException.conflict("המבחן כבר הסתיים ולא ניתן לביטול", "AB_TEST_TERMINAL");
    }

    // A RUNNING test is live on Meta and spending — stop it there before we mark it
    // cancelled locally, or budget would keep burning behind a "cancelled" label.
    if (test.status === "RUNNING" && test.metaTestId) {
      const account = await this.prisma.metaAdAccount.findFirst({
        where: { organizationId: user.organizationId, clientId: test.clientId, isSelected: true },
      });
      if (!account) throw AppException.badRequest("לא נבחר חשבון מודעות", "NO_AD_ACCOUNT");
      const ctx = await this.meta.context(user.organizationId, account.connectionId);
      const connector = this.meta.connector();
      await this.callLogger.wrap(
        { organizationId: user.organizationId, connectionId: account.connectionId, operation: "stopSplitTest", isWrite: true },
        () => connector.stopSplitTest(ctx, account.accountId, test.metaTestId!),
      );
      // Ending the study alone may not halt delivery — pause the participating
      // entities so spend actually stops.
      const entityType = test.level === "AD_SET" ? "ad_set" : "ad";
      for (const metaId of [test.cellAMetaId, test.cellBMetaId]) {
        if (!metaId) continue;
        await this.callLogger
          .wrap(
            { organizationId: user.organizationId, connectionId: account.connectionId, operation: "pauseEntity", isWrite: true },
            () => connector.pauseEntity(ctx, account.accountId, entityType, metaId),
          )
          .catch((e) => this.logger.warn(`AB test ${test.id}: failed to pause ${metaId}: ${(e as Error).message}`));
      }
    }

    await this.prisma.$transaction([
      this.prisma.abTest.update({ where: { id: test.id }, data: { status: "CANCELLED", endAt: new Date() } }),
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
      metadata: { stoppedOnMeta: test.status === "RUNNING" },
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

    // Attribute live cells to OUR cells by the entity id we launched — never by
    // array position (Meta returns cells in arbitrary order; positional matching
    // would glue the wrong ad's metrics to a variant and mis-declare the winner).
    // If we can't match BOTH cells by entity id, we FAIL CLOSED (throw) rather than
    // guess — a wrong winner would move budget to the losing ad.
    const findByEntity = (metaId: string | null) =>
      metaId ? info.cells.find((c) => c.metaEntityId && c.metaEntityId === metaId) : undefined;
    const aCell = findByEntity(test.cellAMetaId);
    const bCell = findByEntity(test.cellBMetaId);
    if (!aCell || !bCell || aCell === bCell) {
      this.logger.warn(
        `AB test ${test.id}: cannot attribute live cells by entity id (cellAMetaId=${test.cellAMetaId}, cellBMetaId=${test.cellBMetaId}, live=${info.cells
          .map((c) => c.metaEntityId)
          .join(",")}) — refusing to report a possibly-wrong winner`,
      );
      throw AppException.conflict(
        "לא ניתן לשייך את תוצאות המבחן לוריאציות (מזהי Meta חסרים או לא תואמים). נסה שוב מאוחר יותר.",
        "AB_ATTRIBUTION_FAILED",
      );
    }

    const result = evaluateAbTest(
      toVariant(aCell, test.cellAId, test.cellALabel),
      toVariant(bCell, test.cellBId, test.cellBLabel),
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
