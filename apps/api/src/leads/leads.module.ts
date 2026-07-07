import { Module } from "@nestjs/common";
import { MetaModule } from "../meta/meta.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [MetaModule],
  controllers: [LeadsController, WebhooksController],
  providers: [LeadsService],
})
export class LeadsModule {}
