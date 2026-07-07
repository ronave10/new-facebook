import { Injectable } from "@nestjs/common";
import { researchSchema } from "@campaignos/shared";
import type { AdLibraryAd } from "@campaignos/meta";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { AgentEngine } from "../agents/agent-engine.service";
import { AGENT_SYSTEM, buildResearchPrompt } from "../agents/prompts";
import { MetaService } from "../meta/meta.service";
import { MetaConnectorFactory } from "../meta/connector.factory";
import { MetaCallLogger } from "../meta/meta-call-logger.service";
import { ClientsService } from "./clients.service";

@Injectable()
export class ResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clients: ClientsService,
    private readonly engine: AgentEngine,
    private readonly meta: MetaService,
    private readonly factory: MetaConnectorFactory,
    private readonly callLogger: MetaCallLogger,
  ) {}

  /**
   * Competitor ad intelligence: searches the Meta Ad Library for the client's
   * industry, then runs the RESEARCH agent to synthesize insights + opportunities.
   */
  async runCompetitorResearch(user: AuthContext, clientId: string) {
    const client = await this.clients.loadScoped(user, clientId);
    const brand = await this.prisma.clientBrandProfile.findUnique({ where: { clientId } });
    const competitors = await this.prisma.competitor.findMany({
      where: { clientId, organizationId: user.organizationId },
      select: { name: true },
    });

    const searchTerms = client.industry ?? client.name;
    let ads: AdLibraryAd[] = [];
    // Ad Library search needs a connected account for auth; fall back gracefully.
    const connection = await this.prisma.metaConnection.findFirst({
      where: { organizationId: user.organizationId, clientId, status: "CONNECTED" },
    });
    if (connection) {
      const ctx = await this.meta.context(user.organizationId, connection.id);
      ads = await this.callLogger
        .wrap(
          { organizationId: user.organizationId, connectionId: connection.id, operation: "searchAdLibrary" },
          () => this.factory.get().searchAdLibrary(ctx, { searchTerms, countries: [client.country], limit: 20 }),
        )
        .catch(() => []);
    } else {
      // No connection: use the connector directly (mock returns demo competitor ads).
      ads = await this.factory
        .get()
        .searchAdLibrary({ accessToken: "", organizationId: user.organizationId }, { searchTerms, countries: [client.country] })
        .catch(() => []);
    }

    const ctxBrand = {
      clientName: client.name,
      industry: client.industry,
      mainProduct: brand?.mainProduct ?? null,
      differentiation: brand?.differentiation ?? null,
      keyBenefits: (brand?.keyBenefits as string[]) ?? [],
      restrictions: (brand?.restrictions ?? {}) as Record<string, string[] | string>,
    };
    const prompt = buildResearchPrompt(
      ctxBrand,
      ads.map((a) => ({ pageName: a.pageName, bodies: a.adCreativeBodies, titles: a.adCreativeTitles })),
    );

    const { data, runId } = await this.engine.run({
      agentType: "RESEARCH",
      taskKey: "research.analyze",
      organizationId: user.organizationId,
      clientId,
      triggeredById: user.userId,
      system: AGENT_SYSTEM,
      prompt,
      input: { searchTerms, competitorCount: competitors.length, adsFound: ads.length },
      schema: researchSchema,
    });

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "research.competitors",
      entityType: "client",
      entityId: clientId,
      metadata: { runId, adsFound: ads.length },
    });

    return {
      ...data,
      competitorAds: ads.map((a) => ({
        pageName: a.pageName,
        body: a.adCreativeBodies[0] ?? "",
        title: a.adCreativeTitles[0] ?? "",
        snapshotUrl: a.adSnapshotUrl,
      })),
      runId,
    };
  }
}
