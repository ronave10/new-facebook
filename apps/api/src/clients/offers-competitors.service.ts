import { Injectable } from "@nestjs/common";
import { AppException } from "../core/api-error";
import { AuditService } from "../core/audit.service";
import { PrismaService } from "../core/prisma.service";
import { AuthContext } from "../core/auth-context";
import { ClientsService } from "./clients.service";

interface OfferInput {
  name: string;
  description?: string;
  price?: string;
  offerType?: string;
}
interface CompetitorInput {
  name: string;
  website?: string;
  notes?: string;
  strengths?: string[];
  weaknesses?: string[];
}

@Injectable()
export class OffersCompetitorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clients: ClientsService,
  ) {}

  async listOffers(user: AuthContext, clientId: string) {
    await this.clients.loadScoped(user, clientId);
    return this.prisma.offer.findMany({
      where: { clientId, organizationId: user.organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  async createOffer(user: AuthContext, clientId: string, input: OfferInput) {
    await this.clients.loadScoped(user, clientId);
    const offer = await this.prisma.offer.create({
      data: { organizationId: user.organizationId, clientId, ...input },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "offer.create",
      entityType: "offer",
      entityId: offer.id,
    });
    return offer;
  }

  async deleteOffer(user: AuthContext, offerId: string) {
    const offer = await this.prisma.offer.findFirst({
      where: { id: offerId, organizationId: user.organizationId },
    });
    if (!offer) throw AppException.notFound("ההצעה לא נמצאה");
    await this.prisma.offer.delete({ where: { id: offerId } });
    return { ok: true };
  }

  async listCompetitors(user: AuthContext, clientId: string) {
    await this.clients.loadScoped(user, clientId);
    return this.prisma.competitor.findMany({
      where: { clientId, organizationId: user.organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  async createCompetitor(user: AuthContext, clientId: string, input: CompetitorInput) {
    await this.clients.loadScoped(user, clientId);
    const competitor = await this.prisma.competitor.create({
      data: {
        organizationId: user.organizationId,
        clientId,
        name: input.name,
        website: input.website,
        notes: input.notes,
        strengths: input.strengths ?? [],
        weaknesses: input.weaknesses ?? [],
      },
    });
    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.userId,
      action: "competitor.create",
      entityType: "competitor",
      entityId: competitor.id,
    });
    return competitor;
  }

  async deleteCompetitor(user: AuthContext, competitorId: string) {
    const competitor = await this.prisma.competitor.findFirst({
      where: { id: competitorId, organizationId: user.organizationId },
    });
    if (!competitor) throw AppException.notFound("המתחרה לא נמצא");
    await this.prisma.competitor.delete({ where: { id: competitorId } });
    return { ok: true };
  }
}
