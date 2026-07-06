import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { loadConfig } from "./config";

export type JobHandler = (payload: unknown) => Promise<void>;

/**
 * Queue abstraction: BullMQ when REDIS_URL is set, otherwise an in-process
 * fallback (immediate async execution) so the app runs with zero infra in dev.
 *
 * Queues: "meta-sync" | "agent-runs" | "insights-refresh" | "publish"
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private connection: IORedis | null = null;
  private readonly useRedis: boolean;

  constructor() {
    const url = loadConfig().REDIS_URL;
    this.useRedis = Boolean(url && url.length > 0);
    if (this.useRedis) {
      this.connection = new IORedis(url as string, { maxRetriesPerRequest: null });
      this.connection.on("error", (err) => this.logger.warn(`Redis error: ${err.message}`));
    } else {
      this.logger.warn("REDIS_URL not set — using in-process queue fallback (dev mode)");
    }
  }

  registerHandler(queueName: string, jobName: string, handler: JobHandler): void {
    const key = `${queueName}:${jobName}`;
    this.handlers.set(key, handler);
    if (this.useRedis && this.connection && !this.queues.has(queueName)) {
      this.queues.set(queueName, new Queue(queueName, { connection: this.connection }));
      const worker = new Worker(
        queueName,
        async (job) => {
          const h = this.handlers.get(`${queueName}:${job.name}`);
          if (!h) {
            this.logger.warn(`No handler for ${queueName}:${job.name}`);
            return;
          }
          await h(job.data);
        },
        { connection: this.connection },
      );
      worker.on("failed", (job, err) =>
        this.logger.error(`Job ${queueName}:${job?.name} failed: ${err.message}`),
      );
      this.workers.push(worker);
    }
  }

  async enqueue(
    queueName: string,
    jobName: string,
    payload: unknown,
    opts?: { delayMs?: number; attempts?: number },
  ): Promise<void> {
    if (this.useRedis) {
      const queue = this.queues.get(queueName);
      if (!queue) throw new Error(`Queue ${queueName} has no registered handlers yet`);
      await queue.add(jobName, payload, {
        delay: opts?.delayMs,
        attempts: opts?.attempts ?? 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
      return;
    }
    // In-process fallback: run soon, never block the request.
    const key = `${queueName}:${jobName}`;
    const handler = this.handlers.get(key);
    if (!handler) {
      this.logger.warn(`No in-process handler for ${key}; job dropped`);
      return;
    }
    setTimeout(() => {
      handler(payload).catch((err) =>
        this.logger.error(`In-process job ${key} failed: ${(err as Error).message}`),
      );
    }, opts?.delayMs ?? 0);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      ...this.workers.map((w) => w.close()),
      ...[...this.queues.values()].map((q) => q.close()),
    ]);
    if (this.connection) await this.connection.quit();
  }
}
