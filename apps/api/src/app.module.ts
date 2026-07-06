import { Module } from "@nestjs/common";
import { CoreModule } from "./core/core.module";
import { HealthController } from "./health.controller";
import { AuthModule } from "./auth/auth.module";
import { OrgModule } from "./org/org.module";
import { AgentsModule } from "./agents/agents.module";
import { ClientsModule } from "./clients/clients.module";
import { MetaModule } from "./meta/meta.module";
import { CampaignsModule } from "./campaigns/campaigns.module";
import { AnalyticsModule } from "./analytics/analytics.module";

@Module({
  imports: [
    CoreModule,
    AuthModule,
    OrgModule,
    AgentsModule,
    ClientsModule,
    MetaModule,
    CampaignsModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
