import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { MetaModule } from "../meta/meta.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { PersonasService } from "./personas.service";
import { OffersCompetitorsService } from "./offers-competitors.service";
import { ResearchService } from "./research.service";

@Module({
  imports: [AgentsModule, MetaModule],
  controllers: [ClientsController],
  providers: [ClientsService, PersonasService, OffersCompetitorsService, ResearchService],
  exports: [ClientsService],
})
export class ClientsModule {}
