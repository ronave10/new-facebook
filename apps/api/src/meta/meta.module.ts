import { Module } from "@nestjs/common";
import { MetaController } from "./meta.controller";
import { MetaService } from "./meta.service";
import { MetaConnectorFactory } from "./connector.factory";
import { MetaCallLogger } from "./meta-call-logger.service";
import { SyncService } from "./sync.service";
import { SchedulerService } from "./scheduler.service";
import { AudiencesController } from "./audiences.controller";
import { AudiencesService } from "./audiences.service";

@Module({
  controllers: [MetaController, AudiencesController],
  providers: [MetaService, MetaConnectorFactory, MetaCallLogger, SyncService, SchedulerService, AudiencesService],
  exports: [MetaService, MetaConnectorFactory, MetaCallLogger, SyncService],
})
export class MetaModule {}
