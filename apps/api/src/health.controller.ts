import { Controller, Get } from "@nestjs/common";
import { Public } from "./core/auth-context";
import { PrismaService } from "./core/prisma.service";

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get("health")
  health(): { status: string; ts: string } {
    return { status: "ok", ts: new Date().toISOString() };
  }

  @Public()
  @Get("ready")
  async ready(): Promise<{ status: string; db: boolean }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", db: true };
    } catch {
      return { status: "degraded", db: false };
    }
  }
}
