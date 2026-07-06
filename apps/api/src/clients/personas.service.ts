import { Injectable } from "@nestjs/common";
import { personaListSchema, type BrandProfileInput } from "@campaignos/shared";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { AgentEngine } from "../agents/agent-engine.service";
import { AGENT_SYSTEM, buildPersonaPrompt } from "../agents/prompts";
import { ClientsService } from "./clients.service";

@Injectable()
export class PersonasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clients: ClientsService,
    private readonly engine: AgentEngine,
  ) {}

  async list(user: AuthContext, clientId: string) {
    await this.clients.loadScoped(user, clientId);
    return this.prisma.customerPersona.findMany({
      where: { clientId, organizationId: user.organizationId, isArchived: false },
      orderBy: { createdAt: "asc" },
    });
  }

  async generate(user: AuthContext, clientId: string, count: number) {
    const client = await this.clients.loadScoped(user, clientId);
    const brand = await this.prisma.clientBrandProfile.findUnique({ where: { clientId } });

    const input = this.brandContext(client, brand);
    const { data, runId } = await this.engine.run({
      agentType: "PERSONA",
      taskKey: "persona.generate",
      organizationId: user.organizationId,
      clientId,
      triggeredById: user.userId,
      system: AGENT_SYSTEM,
      prompt: buildPersonaPrompt(input, count),
      input,
      schema: personaListSchema,
    });

    const created = await this.prisma.$transaction(
      data.slice(0, count).map((p) =>
        this.prisma.customerPersona.create({
          data: {
            organizationId: user.organizationId,
            clientId,
            name: p.name,
            ageRange: p.ageRange,
            lifeSituation: p.lifeSituation,
            pains: p.pains,
            desires: p.desires,
            fears: p.fears,
            objections: p.objections,
            emotionalTriggers: p.emotionalTriggers,
            conversionDrivers: p.conversionDrivers,
            distrustTriggers: p.distrustTriggers,
            copyStyle: p.copyStyle,
            creativeStyle: p.creativeStyle,
            matchingOffers: p.matchingOffers,
            campaignAngles: p.campaignAngles,
            source: "AI",
            agentRunId: runId,
          },
        }),
      ),
    );

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "persona.generate",
      entityType: "client",
      entityId: clientId,
      metadata: { count: created.length, runId },
    });
    return created;
  }

  async remove(user: AuthContext, personaId: string) {
    const persona = await this.prisma.customerPersona.findFirst({
      where: { id: personaId, organizationId: user.organizationId },
    });
    if (!persona) return { ok: true };
    await this.prisma.customerPersona.update({
      where: { id: personaId },
      data: { isArchived: true },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "persona.delete",
      entityType: "persona",
      entityId: personaId,
    });
    return { ok: true };
  }

  private brandContext(
    client: { name: string; industry: string | null },
    brand: {
      mainProduct: string | null;
      priceRange: string | null;
      keyBenefits: unknown;
      differentiation: string | null;
      customerPains: unknown;
      commonObjections: unknown;
      brandTone: string | null;
      proofs: unknown;
      restrictions: unknown;
    } | null,
  ) {
    const r = (brand?.restrictions ?? {}) as BrandProfileInput["restrictions"];
    return {
      clientName: client.name,
      industry: client.industry,
      mainProduct: brand?.mainProduct,
      priceRange: brand?.priceRange,
      keyBenefits: (brand?.keyBenefits as string[]) ?? [],
      differentiation: brand?.differentiation,
      customerPains: (brand?.customerPains as string[]) ?? [],
      commonObjections: (brand?.commonObjections as string[]) ?? [],
      brandTone: brand?.brandTone,
      proofs: (brand?.proofs as { type: string; description: string }[]) ?? [],
      restrictions: r,
    };
  }
}
