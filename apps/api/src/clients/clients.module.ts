import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents/agents.module";
import { ClientsController } from "./clients.controller";
import { ClientsService } from "./clients.service";
import { PersonasService } from "./personas.service";
import { OffersCompetitorsService } from "./offers-competitors.service";

@Module({
  imports: [AgentsModule],
  controllers: [ClientsController],
  providers: [ClientsService, PersonasService, OffersCompetitorsService],
  exports: [ClientsService],
})
export class ClientsModule {}
