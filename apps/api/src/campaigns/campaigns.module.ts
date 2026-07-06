import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { MetaModule } from "../meta/meta.module";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";
import { GenerationService } from "./generation.service";
import { ApprovalsService } from "./approvals.service";
import { PublishService } from "./publish.service";

@Module({
  imports: [AgentsModule, MetaModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, GenerationService, ApprovalsService, PublishService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
