import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { StorageService } from "./storage.service";

@Module({
  controllers: [AssetsController],
  providers: [StorageService, AssetsService],
  exports: [StorageService, AssetsService],
})
export class StorageModule {}
