import { Injectable, Logger } from "@nestjs/common";
import type { ZodType } from "zod";
import type { AgentType } from "@campaignos/db";
import { AppException } from "../core/api-error";
import { CryptoService } from "../core/crypto.service";
import { PrismaService } from "../core/prisma.service";
import { AiProviderFactory } from "./ai-provider.factory";

export interface AgentRunParams<T> {
  agentType: AgentType;
  taskKey: string;
  organizationId: string;
  clientId?: string;
  triggeredById?: string;
  system: string;
  prompt: string;
  input: unknown;
  schema: ZodType<T>;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentRunOutcome<T> {
  data: T;
  runId: string;
}

/**
 * Runs a single AI agent and records a full agent_runs row (input/output SHA-256
 * hashes, model, token counts, status). This is the ONLY place the app talks to
 * the AI provider — imported by clients, campaigns and analytics modules.
 */
@Injectable()
export class AgentEngine {
  private readonly logger = new Logger(AgentEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly providers: AiProviderFactory,
  ) {}

  async run<T>(params: AgentRunParams<T>): Promise<AgentRunOutcome<T>> {
    const run = await this.prisma.agentRun.create({
      data: {
        organizationId: params.organizationId,
        clientId: params.clientId,
        agentType: params.agentType,
        status: "RUNNING",
        input: params.input as object,
        inputHash: this.crypto.hashJson(params.input),
        triggeredById: params.triggeredById,
        startedAt: new Date(),
      },
    });

    try {
      const provider = this.providers.get();
      const result = await provider.complete({
        taskKey: params.taskKey,
        system: params.system,
        prompt: params.prompt,
        schema: params.schema,
        maxTokens: params.maxTokens,
        temperature: params.temperature,
      });

      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          output: result.data as object,
          outputHash: this.crypto.sha256(result.rawText),
          model: result.model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          finishedAt: new Date(),
        },
      });

      return { data: result.data, runId: run.id };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Agent ${params.agentType} failed: ${message}`);
      await this.prisma.agentRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: message, finishedAt: new Date() },
      });
      throw AppException.badRequest(
        `סוכן ה-AI (${params.agentType}) נכשל: ${message}`,
        "AGENT_FAILED",
      );
    }
  }
}
