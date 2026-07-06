import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { RecommendationsService } from "./recommendations.service";

@Module({
  imports: [AgentsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RecommendationsService],
})
export class AnalyticsModule {}
