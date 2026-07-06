import { Injectable } from "@nestjs/common";
import type { BrandProfileInput, CreateClientInput } from "@campaignos/shared";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Applies CLIENT_VIEWER client-scoping on top of org scoping. */
  private scopeFilter(user: AuthContext) {
    const base = { organizationId: user.organizationId };
    if (user.role === "CLIENT_VIEWER" && user.clientScope.length > 0) {
      return { ...base, id: { in: user.clientScope } };
    }
    return base;
  }

  async create(user: AuthContext, input: CreateClientInput) {
    const { brandProfile, website, ...rest } = input;
    const client = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          organizationId: user.organizationId,
          name: rest.name,
          industry: rest.industry,
          website: website || null,
          activityArea: rest.activityArea,
          language: rest.language,
          currency: rest.currency,
          country: rest.country,
          status: "ONBOARDING",
          createdById: user.userId,
        },
      });
      if (brandProfile) {
        await tx.clientBrandProfile.create({
          data: this.brandProfileData(user.organizationId, created.id, brandProfile),
        });
      }
      return created;
    });

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "client.create",
      entityType: "client",
      entityId: client.id,
      after: { name: client.name },
    });
    return this.detail(user, client.id);
  }

  async list(user: AuthContext, page: number, search?: string) {
    const pageSize = 20;
    const where = {
      ...this.scopeFilter(user),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      status: { not: "ARCHIVED" as const },
    };
    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { campaigns: true } },
          metaConnections: { where: { status: "CONNECTED" }, select: { id: true } },
        },
      }),
      this.prisma.client.count({ where }),
    ]);
    return {
      items: rows.map((c) => ({
        id: c.id,
        name: c.name,
        industry: c.industry,
        status: c.status,
        website: c.website,
        currency: c.currency,
        country: c.country,
        metaConnected: c.metaConnections.length > 0,
        campaignCount: c._count.campaigns,
        createdAt: c.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Loads a client enforcing org + optional client scope. Throws 404 if out of scope. */
  async loadScoped(user: AuthContext, clientId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, ...this.scopeFilter(user) } });
    if (!client) throw AppException.notFound("הלקוח לא נמצא");
    return client;
  }

  async detail(user: AuthContext, clientId: string) {
    await this.loadScoped(user, clientId);
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        brandProfile: true,
        _count: { select: { campaigns: true, personas: true } },
        metaConnections: { where: { status: "CONNECTED" }, select: { id: true } },
      },
    });
    if (!client) throw AppException.notFound("הלקוח לא נמצא");
    return {
      id: client.id,
      name: client.name,
      industry: client.industry,
      website: client.website,
      activityArea: client.activityArea,
      language: client.language,
      currency: client.currency,
      country: client.country,
      status: client.status,
      metaConnected: client.metaConnections.length > 0,
      campaignCount: client._count.campaigns,
      personaCount: client._count.personas,
      brandProfile: client.brandProfile,
      createdAt: client.createdAt.toISOString(),
    };
  }

  async update(user: AuthContext, clientId: string, data: Partial<CreateClientInput>) {
    await this.loadScoped(user, clientId);
    const { brandProfile: _bp, website, ...rest } = data;
    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: {
        ...rest,
        ...(website !== undefined ? { website: website || null } : {}),
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "client.update",
      entityType: "client",
      entityId: clientId,
    });
    return this.detail(user, updated.id);
  }

  async archive(user: AuthContext, clientId: string) {
    await this.loadScoped(user, clientId);
    await this.prisma.client.update({ where: { id: clientId }, data: { status: "ARCHIVED" } });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "client.archive",
      entityType: "client",
      entityId: clientId,
    });
    return { ok: true };
  }

  async upsertBrandProfile(user: AuthContext, clientId: string, input: BrandProfileInput) {
    await this.loadScoped(user, clientId);
    const data = this.brandProfileData(user.organizationId, clientId, input);
    const profile = await this.prisma.clientBrandProfile.upsert({
      where: { clientId },
      create: data,
      update: data,
    });
    // reflect richer profile → move client out of onboarding
    await this.prisma.client.updateMany({
      where: { id: clientId, status: "ONBOARDING" },
      data: { status: "ACTIVE" },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "brand.update",
      entityType: "client",
      entityId: clientId,
    });
    return profile;
  }

  private brandProfileData(organizationId: string, clientId: string, input: BrandProfileInput) {
    return {
      organizationId,
      clientId,
      campaignGoal: input.campaignGoal,
      mainProduct: input.mainProduct,
      priceRange: input.priceRange,
      keyBenefits: input.keyBenefits ?? [],
      differentiation: input.differentiation,
      customerPains: input.customerPains ?? [],
      commonObjections: input.commonObjections ?? [],
      proofs: input.proofs ?? [],
      brandTone: input.brandTone,
      restrictions: input.restrictions ?? {},
    };
  }
}
