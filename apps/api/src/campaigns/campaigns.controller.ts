import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import {
  createAbTestSchema,
  createCampaignSchema,
  decideApprovalSchema,
  generateAdsSchema,
  updateCampaignSchema,
} from "@campaignos/shared";
import { AuthContext, CurrentUser } from "../core/auth-context";
import { RequirePermission } from "../core/permissions.guard";
import { ZodValidationPipe } from "../core/zod-validation.pipe";
import { CampaignsService } from "./campaigns.service";
import { GenerationService } from "./generation.service";
import { ApprovalsService } from "./approvals.service";
import { AbTestsService } from "./ab-tests.service";
import { PublishService } from "./publish.service";

@Controller()
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly generation: GenerationService,
    private readonly approvals: ApprovalsService,
    private readonly abTests: AbTestsService,
    private readonly publisher: PublishService,
  ) {}

  @Post("campaigns/draft")
  @RequirePermission("campaign.write")
  draft(@CurrentUser() user: AuthContext, @Body(new ZodValidationPipe(createCampaignSchema)) body: any) {
    return this.campaigns.createDraft(user, body);
  }

  @Get("campaigns")
  @RequirePermission("campaign.read")
  list(
    @CurrentUser() user: AuthContext,
    @Query("clientId") clientId?: string,
    @Query("status") status?: string,
    @Query("page") page = "1",
  ) {
    return this.campaigns.list(user, clientId, status, Math.max(1, parseInt(page, 10) || 1));
  }

  @Get("campaigns/:id")
  @RequirePermission("campaign.read")
  detail(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.campaigns.detail(user, id);
  }

  @Put("campaigns/:id")
  @RequirePermission("campaign.write")
  update(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCampaignSchema)) body: any,
  ) {
    return this.campaigns.update(user, id, body);
  }

  @Delete("campaigns/:id")
  @RequirePermission("campaign.write")
  remove(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.campaigns.remove(user, id);
  }

  @Post("campaigns/:id/generate-strategy")
  @RequirePermission("campaign.generate")
  generateStrategy(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.generation.generateStrategy(user, id);
  }

  @Post("campaigns/:id/generate-ads")
  @RequirePermission("campaign.generate")
  generateAds(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(generateAdsSchema)) body: any,
  ) {
    return this.generation.generateAds(user, id, body.personaIds, body.variantCount);
  }

  @Post("campaigns/:id/request-approval")
  @RequirePermission("campaign.write")
  requestApproval(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.approvals.requestApproval(user, id);
  }

  @Post("campaigns/:id/publish")
  @RequirePermission("campaign.publish")
  publish(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.publisher.publish(user, id);
  }

  @Post("campaigns/:id/pause")
  @RequirePermission("campaign.pause")
  pause(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.publisher.pause(user, id);
  }

  // ── Approvals ──
  @Get("approvals")
  @RequirePermission("campaign.read")
  listApprovals(@CurrentUser() user: AuthContext, @Query("status") status?: string) {
    return this.approvals.list(user, status);
  }

  @Post("approvals/:id/approve")
  @RequirePermission("campaign.approve")
  approve(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decideApprovalSchema)) body: any,
  ) {
    return this.approvals.decide(user, id, true, body.reason);
  }

  @Post("approvals/:id/reject")
  @RequirePermission("campaign.approve")
  reject(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decideApprovalSchema)) body: any,
  ) {
    return this.approvals.decide(user, id, false, body.reason);
  }

  // ── A/B tests (split-test execution) ──
  @Get("campaigns/:id/ab-tests")
  @RequirePermission("campaign.read")
  listAbTests(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.abTests.list(user, id);
  }

  @Post("campaigns/:id/ab-tests")
  @RequirePermission("campaign.write")
  createAbTest(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createAbTestSchema)) body: any,
  ) {
    return this.abTests.create(user, id, body);
  }

  @Post("ab-tests/:id/request-launch")
  @RequirePermission("campaign.write")
  requestAbLaunch(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.abTests.requestLaunch(user, id);
  }

  @Post("ab-tests/:id/refresh")
  @RequirePermission("campaign.read")
  refreshAbTest(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.abTests.refreshResults(user, id);
  }

  @Delete("ab-tests/:id")
  @RequirePermission("campaign.write")
  cancelAbTest(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.abTests.cancel(user, id);
  }
}
