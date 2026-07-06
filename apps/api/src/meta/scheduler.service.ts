import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { loadConfig } from "../core/config";
import { PrismaService } from "../core/prisma.service";
import { SyncService } from "./sync.service";

/**
 * Periodically enqueues an insights sync for every connected client with a
 * selected ad account. Driver-agnostic (works with BullMQ or the in-process
 * queue). Disabled by default in dev — enable with ENABLE_CRON=true.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
  ) {}

  onModuleInit(): void {
    const cfg = loadConfig();
    if (!cfg.ENABLE_CRON) {
      this.logger.log("Scheduler disabled (ENABLE_CRON!=true)");
      return;
    }
    const intervalMs = Math.max(5, cfg.SYNC_INTERVAL_MINUTES) * 60_000;
    this.logger.log(`Scheduler enabled — insights sync every ${cfg.SYNC_INTERVAL_MINUTES}m`);
    // stagger the first run by 30s so boot isn't hammered
    this.timer = setInterval(() => void this.tick(), intervalMs);
    setTimeout(() => void this.tick(), 30_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      const connections = await this.prisma.metaConnection.findMany({
        where: { status: "CONNECTED", adAccounts: { some: { isSelected: true } } },
        select: { organizationId: true, clientId: true },
      });
      let enqueued = 0;
      for (const c of connections) {
        if (!c.clientId) continue;
        await this.sync.enqueueSync(c.organizationId, c.clientId);
        enqueued++;
      }
      if (enqueued > 0) this.logger.log(`Scheduler enqueued ${enqueued} sync jobs`);
    } catch (err) {
      this.logger.error(`Scheduler tick failed: ${(err as Error).message}`);
    }
  }
}
