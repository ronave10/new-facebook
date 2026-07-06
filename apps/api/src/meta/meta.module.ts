import { Module } from "@nestjs/common";
import { MetaController } from "./meta.controller";
import { MetaService } from "./meta.service";
import { MetaConnectorFactory } from "./connector.factory";
import { MetaCallLogger } from "./meta-call-logger.service";
import { SyncService } from "./sync.service";
import { SchedulerService } from "./scheduler.service";

@Module({
  controllers: [MetaController],
  providers: [MetaService, MetaConnectorFactory, MetaCallLogger, SyncService, SchedulerService],
  exports: [MetaService, MetaConnectorFactory, MetaCallLogger, SyncService],
})
export class MetaModule {}
