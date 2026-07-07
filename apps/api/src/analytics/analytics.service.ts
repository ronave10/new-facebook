import { Injectable } from "@nestjs/common";
import type { DashboardOverview } from "@campaignos/shared";
import { auditAccount, type AuditInput, type EntityMetrics } from "@campaignos/marketing-core";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { AppException } from "../core/api-error";

function daysForPreset(preset?: string): number {
  switch (preset) {
    case "last_7d":
      return 7;
    case "last_14d":
      return 14;
    case "last_90d":
      return 90;
    default:
      return 30;
  }
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertScope(user: AuthContext, clientId: string) {
    if (user.role === "CLIENT_VIEWER" && user.clientScope.length > 0 && !user.clientScope.includes(clientId)) {
      throw AppException.notFound("הלקוח לא נמצא");
    }
  }

  async clientOverview(user: AuthContext, clientId: string, datePreset?: string): Promise<DashboardOverview> {
    this.assertScope(user, clientId);
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
    });
    if (!client) throw AppException.notFound("הלקוח לא נמצא");

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - daysForPreset(datePreset));

    const snapshots = await this.prisma.performanceSnapshot.findMany({
      where: { organizationId: user.organizationId, clientId, level: "CAMPAIGN", date: { gte: since } },
    });

    let spend = 0,
      leads = 0,
      clicks = 0,
      impressions = 0;
    const byCampaign = new Map<string, { spend: number; leads: number; clicks: number; impressions: number }>();
    for (const s of snapshots) {
      const sp = Number(s.spend);
      spend += sp;
      leads += s.leads;
      clicks += s.clicks;
      impressions += s.impressions;
      const agg = byCampaign.get(s.entityId) ?? { spend: 0, leads: 0, clicks: 0, impressions: 0 };
      agg.spend += sp;
      agg.leads += s.leads;
      agg.clicks += s.clicks;
      agg.impressions += s.impressions;
      byCampaign.set(s.entityId, agg);
    }

    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId: user.organizationId, clientId },
      select: { id: true, name: true, status: true },
    });
    const nameById = new Map(campaigns.map((c) => [c.id, c.name]));

    const ranked = [...byCampaign.entries()]
      .map(([id, agg]) => ({
        id,
        name: nameById.get(id) ?? id,
        cpl: agg.leads > 0 ? agg.spend / agg.leads : Number.POSITIVE_INFINITY,
        spend: agg.spend,
      }))
      .filter((c) => c.spend > 0);
    const byCplAsc = [...ranked].sort((a, b) => a.cpl - b.cpl);
    const best = byCplAsc.slice(0, 3).filter((c) => Number.isFinite(c.cpl));
    const worst = [...byCplAsc].reverse().slice(0, 3);

    const [pendingApprovals, activeCampaigns, recs] = await Promise.all([
      this.prisma.approval.count({ where: { organizationId: user.organizationId, status: "PENDING" } }),
      this.prisma.campaign.count({ where: { organizationId: user.organizationId, clientId, status: "PUBLISHED" } }),
      this.prisma.optimizationRecommendation.findMany({
        where: { organizationId: user.organizationId, clientId, status: "NEW" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return {
      totalSpend: Math.round(spend),
      totalLeads: leads,
      totalClicks: clicks,
      totalImpressions: impressions,
      avgCtr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : null,
      avgCpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : null,
      avgCpl: leads > 0 ? Number((spend / leads).toFixed(2)) : null,
      currency: client.currency,
      activeCampaigns,
      pendingApprovals,
      bestCampaigns: best.map((c) => ({ id: c.id, name: c.name, metric: "CPL", value: Number(c.cpl.toFixed(2)) })),
      worstCampaigns: worst.map((c) => ({ id: c.id, name: c.name, metric: "CPL", value: Number(c.cpl.toFixed(2)) })),
      alerts: recs
        .filter((r) => r.severity === "CRITICAL" || r.severity === "WARNING")
        .map((r) => ({ severity: r.severity, title: r.title, entityId: r.entityId ?? undefined })),
      actionList: recs.map((r) => ({ title: r.title, recommendationId: r.id })),
    };
  }

  /** Runs the deterministic Account Health Audit over the client's synced data. */
  async accountAudit(user: AuthContext, clientId: string) {
    this.assertScope(user, clientId);
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      include: { brandProfile: true },
    });
    if (!client) throw AppException.notFound("הלקוח לא נמצא");

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 14);

    const [campaigns, snapshots, creatives, audiences, pixelCount] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { organizationId: user.organizationId, clientId },
        include: { _count: { select: { adSets: true, ads: true } } },
      }),
      this.prisma.performanceSnapshot.findMany({
        where: { organizationId: user.organizationId, clientId, level: "CAMPAIGN", date: { gte: since } },
      }),
      this.prisma.adCreative.findMany({ where: { organizationId: user.organizationId, clientId }, select: { id: true } }),
      this.prisma.metaCustomAudience.findMany({
        where: { organizationId: user.organizationId, clientId },
        select: { subtype: true },
      }),
      this.prisma.metaPixel.count({ where: { organizationId: user.organizationId } }),
    ]);

    // distinct variant styles used across the client's ads
    const styleRows = await this.prisma.ad.findMany({
      where: { organizationId: user.organizationId, campaign: { clientId } },
      select: { variantStyle: true },
    });
    const distinctVariantStyles = new Set(styleRows.map((r) => r.variantStyle).filter(Boolean)).size;

    // aggregate snapshots → EntityMetrics per campaign
    const agg = new Map<string, { spend: number; leads: number; conversions: number; clicks: number; impressions: number; reach: number; days: Set<string> }>();
    for (const s of snapshots) {
      const a = agg.get(s.entityId) ?? { spend: 0, leads: 0, conversions: 0, clicks: 0, impressions: 0, reach: 0, days: new Set<string>() };
      a.spend += Number(s.spend);
      a.leads += s.leads;
      a.conversions += s.conversions;
      a.clicks += s.clicks;
      a.impressions += s.impressions;
      a.reach += s.reach;
      a.days.add(s.date.toISOString().slice(0, 10));
      agg.set(s.entityId, a);
    }
    const nameById = new Map(campaigns.map((c) => [c.id, c.name]));
    const metrics: EntityMetrics[] = [...agg.entries()].map(([id, a]) => ({
      entityId: id,
      entityName: nameById.get(id) ?? id,
      level: "CAMPAIGN",
      spend: a.spend,
      impressions: a.impressions,
      clicks: a.clicks,
      leads: a.leads,
      conversions: a.conversions,
      daysLive: a.days.size,
      frequency: a.reach > 0 ? a.impressions / a.reach : undefined,
      ctrPct: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : undefined,
    }));

    const input: AuditInput = {
      vertical: client.industry,
      pixelConnected: pixelCount > 0,
      distinctCreatives: creatives.length,
      distinctVariantStyles,
      hasRemarketingAudience: audiences.some((a) => a.subtype === "WEBSITE" || a.subtype === "ENGAGEMENT"),
      hasLookalikeAudience: audiences.some((a) => a.subtype === "LOOKALIKE"),
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        adSetCount: c._count.adSets,
        adCount: c._count.ads,
      })),
      metrics,
    };
    return auditAccount(input);
  }

  async campaignTimeseries(user: AuthContext, campaignId: string, granularity = "DAY") {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId: user.organizationId },
    });
    if (!campaign) throw AppException.notFound("הקמפיין לא נמצא");
    this.assertScope(user, campaign.clientId);
    const rows = await this.prisma.performanceSnapshot.findMany({
      where: { organizationId: user.organizationId, entityId: campaignId, granularity: granularity as never },
      orderBy: { date: "asc" },
    });
    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      spend: Number(r.spend),
      leads: r.leads,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr ? Number(r.ctr) : null,
      cpl: r.cpl ? Number(r.cpl) : null,
    }));
  }
}
