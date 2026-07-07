import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import {
  brandExtractRequestSchema,
  brandProfileSchema,
  createClientSchema,
  createCompetitorSchema,
  createOfferSchema,
  generatePersonasSchema,
  updateClientSchema,
} from "@campaignos/shared";
import { AuthContext, CurrentUser } from "../core/auth-context";
import { RequirePermission } from "../core/permissions.guard";
import { ZodValidationPipe } from "../core/zod-validation.pipe";
import { ClientsService } from "./clients.service";
import { PersonasService } from "./personas.service";
import { OffersCompetitorsService } from "./offers-competitors.service";
import { ResearchService } from "./research.service";

@Controller()
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly personas: PersonasService,
    private readonly oc: OffersCompetitorsService,
    private readonly research: ResearchService,
  ) {}

  // ── Clients ──
  @Post("clients")
  @RequirePermission("client.write")
  create(@CurrentUser() user: AuthContext, @Body(new ZodValidationPipe(createClientSchema)) body: any) {
    return this.clients.create(user, body);
  }

  @Get("clients")
  @RequirePermission("client.read")
  list(
    @CurrentUser() user: AuthContext,
    @Query("page") page = "1",
    @Query("search") search?: string,
  ) {
    return this.clients.list(user, Math.max(1, parseInt(page, 10) || 1), search);
  }

  @Get("clients/:id")
  @RequirePermission("client.read")
  detail(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.clients.detail(user, id);
  }

  @Put("clients/:id")
  @RequirePermission("client.write")
  update(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: any,
  ) {
    return this.clients.update(user, id, body);
  }

  @Delete("clients/:id")
  @RequirePermission("client.delete")
  archive(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.clients.archive(user, id);
  }

  // ── Brand profile ──
  @Put("clients/:id/brand-profile")
  @RequirePermission("brand.write")
  brandProfile(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(brandProfileSchema)) body: any,
  ) {
    return this.clients.upsertBrandProfile(user, id, body);
  }

  // ── Personas ──
  @Get("clients/:id/personas")
  @RequirePermission("persona.read")
  personaList(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.personas.list(user, id);
  }

  @Post("clients/:id/personas/generate")
  @RequirePermission("persona.generate")
  generatePersonas(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(generatePersonasSchema)) body: any,
  ) {
    return this.personas.generate(user, id, body.count);
  }

  @Delete("personas/:id")
  @RequirePermission("persona.write")
  deletePersona(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.personas.remove(user, id);
  }

  // ── Brand DNA extraction (Magic Fill from website) ──
  @Post("clients/extract-brand")
  @RequirePermission("client.write")
  extractBrand(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(brandExtractRequestSchema)) body: { url: string },
  ) {
    return this.research.extractBrandFromWebsite(user, body.url);
  }

  // ── Competitor research (Ad Library intelligence) ──
  @Post("clients/:id/research")
  @RequirePermission("persona.generate")
  runResearch(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.research.runCompetitorResearch(user, id);
  }

  // ── Offers ──
  @Get("clients/:id/offers")
  @RequirePermission("client.read")
  offers(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.oc.listOffers(user, id);
  }

  @Post("clients/:id/offers")
  @RequirePermission("client.write")
  createOffer(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createOfferSchema)) body: any,
  ) {
    return this.oc.createOffer(user, id, body);
  }

  @Delete("offers/:id")
  @RequirePermission("client.write")
  deleteOffer(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.oc.deleteOffer(user, id);
  }

  // ── Competitors ──
  @Get("clients/:id/competitors")
  @RequirePermission("client.read")
  competitors(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.oc.listCompetitors(user, id);
  }

  @Post("clients/:id/competitors")
  @RequirePermission("client.write")
  createCompetitor(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createCompetitorSchema)) body: any,
  ) {
    return this.oc.createCompetitor(user, id, body);
  }

  @Delete("competitors/:id")
  @RequirePermission("client.write")
  deleteCompetitor(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.oc.deleteCompetitor(user, id);
  }
}
