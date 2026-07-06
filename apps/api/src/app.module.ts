import { Module } from "@nestjs/common";
import { CoreModule } from "./core/core.module";
import { HealthController } from "./health.controller";

// Feature modules are appended here as they are built (integration step).
@Module({
  imports: [CoreModule],
  controllers: [HealthController],
})
export class AppModule {}
