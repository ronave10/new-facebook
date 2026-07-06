import { Injectable } from "@nestjs/common";
import {
  adGenerationSchema,
  complianceSchema,
  strategySchema,
  type AdGenerationSchema,
  type VariantStyle,
} from "@campaignos/shared";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { AgentEngine } from "../agents/agent-engine.service";
import {
  AGENT_SYSTEM,
  buildAdsPrompt,
  buildCompliancePrompt,
  buildStrategyPrompt,
} from "../agents/prompts";
import { CampaignsService } from "./campaigns.service";

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly campaigns: CampaignsService,
    private readonly engine: AgentEngine,
  ) {}

  private async brandContext(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { brandProfile: true },
    });
    if (!client) throw AppException.notFound("הלקוח לא נמצא");
    const b = client.brandProfile;
    return {
      clientName: client.name,
      industry: client.industry,
      mainProduct: b?.mainProduct ?? null,
      priceRange: b?.priceRange ?? null,
      keyBenefits: (b?.keyBenefits as string[]) ?? [],
      differentiation: b?.differentiation ?? null,
      customerPains: (b?.customerPains as string[]) ?? [],
      commonObjections: (b?.commonObjections as string[]) ?? [],
      brandTone: b?.brandTone ?? null,
      proofs: (b?.proofs as { type: string; description: string }[]) ?? [],
      restrictions: (b?.restrictions ?? {}) as Record<string, string[] | string>,
    };
  }

  async generateStrategy(user: AuthContext, campaignId: string) {
    const campaign = await this.campaigns.loadScoped(user, campaignId);
    const ctx = await this.brandContext(campaign.clientId);
    const personas = await this.prisma.customerPersona.findMany({
      where: { clientId: campaign.clientId, isArchived: false },
      select: { name: true },
    });
    const dailyBudgetIls = campaign.budgetType === "DAILY" && campaign.budgetAmount
      ? Math.round(campaign.budgetAmount / 100)
      : 150;

    const { data, runId } = await this.engine.run({
      agentType: "STRATEGY",
      taskKey: "strategy.generate",
      organizationId: user.organizationId,
      clientId: campaign.clientId,
      triggeredById: user.userId,
      system: AGENT_SYSTEM,
      prompt: buildStrategyPrompt(ctx, campaign.goal, dailyBudgetIls, personas.map((p) => p.name)),
      input: { campaignId, goal: campaign.goal, dailyBudgetIls },
      schema: strategySchema,
    });

    const strategy = await this.prisma.campaignStrategy.upsert({
      where: { campaignId },
      create: {
        organizationId: user.organizationId,
        campaignId,
        structure: data.structure as object,
        budgetSplit: data.budgetSplit as object,
        abTestPlan: data.abTestPlan as object,
        hypotheses: data.abTestPlan.map((t) => t.hypothesis),
        kpis: data.kpis as object,
        rules: data.rules as object,
        summary: data.summary,
        agentRunId: runId,
      },
      update: {
        structure: data.structure as object,
        budgetSplit: data.budgetSplit as object,
        abTestPlan: data.abTestPlan as object,
        hypotheses: data.abTestPlan.map((t) => t.hypothesis),
        kpis: data.kpis as object,
        rules: data.rules as object,
        summary: data.summary,
        agentRunId: runId,
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "campaign.generate.strategy",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { runId },
    });
    return strategy;
  }

  async generateAds(user: AuthContext, campaignId: string, personaIds: string[], variantCount: number) {
    const campaign = await this.campaigns.loadScoped(user, campaignId);
    const ctx = await this.brandContext(campaign.clientId);

    const personas = await this.prisma.customerPersona.findMany({
      where: {
        clientId: campaign.clientId,
        isArchived: false,
        ...(personaIds.length ? { id: { in: personaIds } } : {}),
      },
    });
    const personaNames = personas.map((p) => p.name);

    const { data, runId } = await this.engine.run({
      agentType: "COPY",
      taskKey: "ads.generate",
      organizationId: user.organizationId,
      clientId: campaign.clientId,
      triggeredById: user.userId,
      system: AGENT_SYSTEM,
      prompt: buildAdsPrompt(ctx, personaNames),
      input: { campaignId, personaNames },
      schema: adGenerationSchema,
    });

    // Compliance review of the generated variants
    const assets = data.adVariants.map(
      (v) => `${v.primaryText} | ${v.headline} | ${v.description}`,
    );
    const compliance = await this.engine
      .run({
        agentType: "COMPLIANCE",
        taskKey: "compliance.review",
        organizationId: user.organizationId,
        clientId: campaign.clientId,
        triggeredById: user.userId,
        system: AGENT_SYSTEM,
        prompt: buildCompliancePrompt(ctx, assets),
        input: { assets },
        schema: complianceSchema,
      })
      .catch(() => ({ data: { verdict: "PASS", issues: [], notes: "" }, runId: "" }));

    await this.persistGeneration(user, campaign, campaign.clientId, data, personas, variantCount, runId, compliance.data.notes);

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "campaign.generate.ads",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { runId, variantCount: Math.min(variantCount, data.adVariants.length) },
    });

    return this.campaigns.detail(user, campaignId);
  }

  private async persistGeneration(
    user: AuthContext,
    campaign: { id: string },
    clientId: string,
    data: AdGenerationSchema,
    personas: { id: string; name: string }[],
    variantCount: number,
    runId: string,
    complianceNotes: string,
  ) {
    const organizationId = user.organizationId;

    // Persist the copy bank
    const copyRows: {
      kind: "ANGLE" | "HOOK" | "PRIMARY_TEXT" | "HEADLINE" | "DESCRIPTION" | "CTA" | "IMAGE_IDEA" | "VIDEO_IDEA";
      items: string[];
    }[] = [
      { kind: "ANGLE", items: data.angles },
      { kind: "HOOK", items: data.hooks },
      { kind: "PRIMARY_TEXT", items: data.primaryTexts },
      { kind: "HEADLINE", items: data.headlines },
      { kind: "DESCRIPTION", items: data.descriptions },
      { kind: "CTA", items: data.ctas },
      { kind: "IMAGE_IDEA", items: data.imageIdeas },
      { kind: "VIDEO_IDEA", items: data.videoIdeas },
    ];
    await this.prisma.generatedCopyVariant.createMany({
      data: copyRows.flatMap((row) =>
        row.items.map((content) => ({
          organizationId,
          clientId,
          campaignId: campaign.id,
          kind: row.kind,
          content,
          agentRunId: runId,
        })),
      ),
    });

    const personaByName = new Map(personas.map((p) => [p.name, p]));
    const variants = data.adVariants.slice(0, variantCount);

    // Group variants by persona → one ad set per persona
    const byPersona = new Map<string, typeof variants>();
    for (const v of variants) {
      const key = v.personaName ?? "כללי";
      if (!byPersona.has(key)) byPersona.set(key, []);
      byPersona.get(key)!.push(v);
    }

    for (const [personaName, group] of byPersona) {
      const persona = personaByName.get(personaName) ?? personas.find((p) => personaName.includes(p.name.split(",")[0]));
      const adSet = await this.prisma.adSet.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          name: `קהל — ${personaName}`,
          status: "DRAFT",
        },
      });
      for (const v of group) {
        const creative = await this.prisma.adCreative.create({
          data: {
            organizationId,
            clientId,
            name: `${v.angle} — ${personaName}`,
            type: v.creativeBrief.format,
            brief: v.creativeBrief as object,
            status: "DRAFT",
          },
        });
        await this.prisma.ad.create({
          data: {
            organizationId,
            campaignId: campaign.id,
            adSetId: adSet.id,
            creativeId: creative.id,
            personaId: persona?.id,
            name: `${v.hook.slice(0, 40)}`,
            status: "DRAFT",
            angle: v.angle,
            hook: v.hook,
            primaryText: v.primaryText,
            headline: v.headline,
            description: v.description,
            cta: v.cta,
            variantStyle: v.variantStyle as VariantStyle,
            confidenceScore: Math.round(v.confidenceScore),
            whyItWorks: v.whyItWorks,
            complianceNotes: `${v.complianceNotes}${complianceNotes ? ` | ${complianceNotes}` : ""}`,
          },
        });
      }
    }
  }
}
