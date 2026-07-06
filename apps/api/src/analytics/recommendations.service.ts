import { Injectable } from "@nestjs/common";
import { optimizationSchema } from "@campaignos/shared";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { AgentEngine } from "../agents/agent-engine.service";
import { AGENT_SYSTEM, buildOptimizationPrompt } from "../agents/prompts";

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly engine: AgentEngine,
  ) {}

  private assertScope(user: AuthContext, clientId: string) {
    if (user.role === "CLIENT_VIEWER" && user.clientScope.length > 0 && !user.clientScope.includes(clientId)) {
      throw AppException.notFound("הלקוח לא נמצא");
    }
  }

  async generate(user: AuthContext, clientId: string) {
    this.assertScope(user, clientId);
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId: user.organizationId },
      include: { brandProfile: true },
    });
    if (!client) throw AppException.notFound("הלקוח לא נמצא");

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 14);
    const snapshots = await this.prisma.performanceSnapshot.findMany({
      where: { organizationId: user.organizationId, clientId, date: { gte: since } },
    });

    // aggregate per campaign for the prompt
    const byCampaign = new Map<string, { spend: number; leads: number; clicks: number; impressions: number }>();
    for (const s of snapshots) {
      const agg = byCampaign.get(s.entityId) ?? { spend: 0, leads: 0, clicks: 0, impressions: 0 };
      agg.spend += Number(s.spend);
      agg.leads += s.leads;
      agg.clicks += s.clicks;
      agg.impressions += s.impressions;
      byCampaign.set(s.entityId, agg);
    }
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId: user.organizationId, clientId },
      select: { id: true, name: true },
    });
    const nameById = new Map(campaigns.map((c) => [c.id, c.name]));
    const kpiSummary =
      [...byCampaign.entries()]
        .map(([id, a]) => {
          const cpl = a.leads > 0 ? (a.spend / a.leads).toFixed(0) : "∞";
          const ctr = a.impressions > 0 ? ((a.clicks / a.impressions) * 100).toFixed(2) : "0";
          return `קמפיין "${nameById.get(id) ?? id}": הוצאה ₪${a.spend.toFixed(0)}, לידים ${a.leads}, CPL ₪${cpl}, CTR ${ctr}%`;
        })
        .join("\n") || "אין נתוני ביצועים זמינים ל-14 הימים האחרונים.";

    const rules = [
      "כבה מודעה עם 0 לידים אחרי הוצאה של פי 3 מיעד ה-CPL.",
      "הגדל תקציב ב-20% כשה-CPL ≤ 0.8× מהיעד על פני ≥5 לידים.",
      "רענן קריאייטיב כשתדירות > 3 והביצועים יורדים.",
    ];

    const ctx = {
      clientName: client.name,
      industry: client.industry,
      restrictions: (client.brandProfile?.restrictions ?? {}) as Record<string, string[] | string>,
    };

    const { data, runId } = await this.engine.run({
      agentType: "OPTIMIZATION",
      taskKey: "optimization.recommend",
      organizationId: user.organizationId,
      clientId,
      triggeredById: user.userId,
      system: AGENT_SYSTEM,
      prompt: buildOptimizationPrompt(ctx, kpiSummary, rules),
      input: { kpiSummary },
      schema: optimizationSchema,
    });

    const created = await this.prisma.$transaction(
      data.recommendations.map((r) =>
        this.prisma.optimizationRecommendation.create({
          data: {
            organizationId: user.organizationId,
            clientId,
            type: r.type,
            severity: r.severity,
            title: r.title,
            body: r.body,
            evidence: (r.evidence ?? {}) as object,
            status: "NEW",
            agentRunId: runId,
          },
        }),
      ),
    );
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "recommendation.generate",
      entityType: "client",
      entityId: clientId,
      metadata: { count: created.length, runId },
    });
    return created;
  }

  async list(user: AuthContext, clientId?: string, status?: string) {
    if (clientId) this.assertScope(user, clientId);
    return this.prisma.optimizationRecommendation.findMany({
      where: {
        organizationId: user.organizationId,
        ...(clientId ? { clientId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 100,
    });
  }

  async decide(user: AuthContext, id: string, decision: "ACKNOWLEDGED" | "APPLIED" | "DISMISSED") {
    const rec = await this.prisma.optimizationRecommendation.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!rec) throw AppException.notFound("ההמלצה לא נמצאה");
    const updated = await this.prisma.optimizationRecommendation.update({
      where: { id },
      data: { status: decision, decidedById: user.userId, decidedAt: new Date() },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "recommendation.decide",
      entityType: "recommendation",
      entityId: id,
      metadata: { decision },
    });
    return updated;
  }
}
