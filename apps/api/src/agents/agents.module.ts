import { Module } from "@nestjs/common";
import { AgentsController } from "./agents.controller";
import { AgentEngine } from "./agent-engine.service";
import { AiProviderFactory } from "./ai-provider.factory";

/** Exposes AgentEngine to clients/campaigns/analytics modules. */
@Module({
  controllers: [AgentsController],
  providers: [AgentEngine, AiProviderFactory],
  exports: [AgentEngine],
})
export class AgentsModule {}
