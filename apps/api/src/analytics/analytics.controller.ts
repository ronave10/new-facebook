import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  decideRecommendationSchema,
  generateRecommendationsSchema,
} from "@campaignos/shared";
import { AuthContext, CurrentUser } from "../core/auth-context";
import { RequirePermission } from "../core/permissions.guard";
import { ZodValidationPipe } from "../core/zod-validation.pipe";
import { AnalyticsService } from "./analytics.service";
import { RecommendationsService } from "./recommendations.service";

@Controller()
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly recommendations: RecommendationsService,
  ) {}

  @Get("analytics/client/:id")
  @RequirePermission("analytics.read")
  clientOverview(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Query("datePreset") datePreset?: string,
  ) {
    return this.analytics.clientOverview(user, id, datePreset);
  }

  @Get("analytics/campaign/:id/timeseries")
  @RequirePermission("analytics.read")
  timeseries(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Query("granularity") granularity = "DAY",
  ) {
    return this.analytics.campaignTimeseries(user, id, granularity);
  }

  @Post("recommendations/generate")
  @RequirePermission("recommendation.generate")
  generate(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(generateRecommendationsSchema)) body: any,
  ) {
    return this.recommendations.generate(user, body.clientId);
  }

  @Get("recommendations")
  @RequirePermission("recommendation.read")
  list(
    @CurrentUser() user: AuthContext,
    @Query("clientId") clientId?: string,
    @Query("status") status?: string,
  ) {
    return this.recommendations.list(user, clientId, status);
  }

  @Post("recommendations/:id/decide")
  @RequirePermission("recommendation.decide")
  decide(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decideRecommendationSchema)) body: any,
  ) {
    return this.recommendations.decide(user, id, body.decision);
  }

  // Applying a budget recommendation creates an approval — nothing changes on
  // Meta until a checker approves it (same safety gate as publishing).
  @Post("recommendations/:id/apply")
  @RequirePermission("recommendation.decide")
  apply(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.recommendations.apply(user, id);
  }
}
