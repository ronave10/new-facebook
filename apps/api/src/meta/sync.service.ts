import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { MetaConnectorContext } from "@campaignos/meta";
import { PrismaService } from "../core/prisma.service";
import { QueueService } from "../core/queue.service";
import { MetaConnectorFactory } from "./connector.factory";
import { MetaCallLogger } from "./meta-call-logger.service";
import { MetaService } from "./meta.service";

interface SyncJob {
  organizationId: string;
  clientId: string;
}

/**
 * Pulls campaigns + insights from Meta into performance_snapshots.
 * Registered on the "meta-sync" queue; runs inline via the in-process driver in dev.
 */
@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly factory: MetaConnectorFactory,
    private readonly meta: MetaService,
    private readonly callLogger: MetaCallLogger,
  ) {}

  onModuleInit(): void {
    this.queue.registerHandler("meta-sync", "sync-client", (payload) =>
      this.runSync(payload as SyncJob),
    );
  }

  async enqueueSync(organizationId: string, clientId: string): Promise<void> {
    await this.queue.enqueue("meta-sync", "sync-client", { organizationId, clientId });
  }

  async runSync(job: SyncJob): Promise<void> {
    const { organizationId, clientId } = job;
    const connection = await this.prisma.metaConnection.findFirst({
      where: { organizationId, clientId, status: "CONNECTED" },
      include: { adAccounts: { where: { isSelected: true } } },
    });
    if (!connection) {
      this.logger.warn(`No connected Meta connection for client ${clientId}`);
      return;
    }
    const adAccount = connection.adAccounts[0];
    if (!adAccount) {
      this.logger.warn(`No selected ad account for client ${clientId}`);
      return;
    }

    const ctx: MetaConnectorContext = await this.meta.context(organizationId, connection.id);
    const connector = this.factory.get();

    const rows = await this.callLogger.wrap(
      { organizationId, connectionId: connection.id, operation: "getInsights" },
      () =>
        connector.getInsights(ctx, adAccount.accountId, {
          level: "campaign",
          datePreset: "last_30d",
          timeIncrement: 1,
        }),
    );

    // map meta campaign ids to internal campaigns where we know them
    const internal = await this.prisma.campaign.findMany({
      where: { organizationId, clientId, metaCampaignId: { not: null } },
      select: { id: true, metaCampaignId: true },
    });
    const byMeta = new Map(internal.map((c) => [c.metaCampaignId!, c.id]));

    for (const row of rows) {
      const internalId = byMeta.get(row.entityId) ?? row.entityId;
      const date = new Date(`${row.dateStart}T00:00:00.000Z`);
      await this.prisma.performanceSnapshot.upsert({
        where: {
          level_entityId_date_granularity: {
            level: "CAMPAIGN",
            entityId: internalId,
            date,
            granularity: "DAY",
          },
        },
        create: {
          organizationId,
          clientId,
          level: "CAMPAIGN",
          entityId: internalId,
          metaEntityId: row.entityId,
          date,
          granularity: "DAY",
          spend: row.spend,
          impressions: row.impressions,
          reach: row.reach,
          clicks: row.clicks,
          ctr: row.ctr,
          cpc: row.cpc,
          cpm: row.cpm,
          leads: row.leads ?? 0,
          conversions: row.conversions ?? 0,
          cpl: row.costPerLead,
          cpa: row.costPerConversion,
          purchaseValue: row.purchaseValue,
          roas: row.roas,
          raw: (row.raw ?? {}) as object,
        },
        update: {
          spend: row.spend,
          impressions: row.impressions,
          reach: row.reach,
          clicks: row.clicks,
          ctr: row.ctr,
          cpc: row.cpc,
          cpm: row.cpm,
          leads: row.leads ?? 0,
          conversions: row.conversions ?? 0,
          cpl: row.costPerLead,
          cpa: row.costPerConversion,
        },
      });
    }
    this.logger.log(`Synced ${rows.length} snapshot rows for client ${clientId}`);
  }
}
