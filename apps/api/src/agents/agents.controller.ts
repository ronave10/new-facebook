import { Controller, Get, Query } from "@nestjs/common";
import type { AgentType } from "@campaignos/db";
import { AuthContext, CurrentUser } from "../core/auth-context";
import { RequirePermission } from "../core/permissions.guard";
import { PrismaService } from "../core/prisma.service";

@Controller("agent-runs")
export class AgentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission("client.read")
  async list(
    @CurrentUser() user: AuthContext,
    @Query("clientId") clientId?: string,
    @Query("agentType") agentType?: string,
    @Query("page") page = "1",
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = 20;
    const where = {
      organizationId: user.organizationId,
      ...(clientId ? { clientId } : {}),
      ...(agentType ? { agentType: agentType as AgentType } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.agentRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.agentRun.count({ where }),
    ]);
    const isViewer = user.role === "CLIENT_VIEWER";
    return {
      items: rows.map((r) => ({
        id: r.id,
        agentType: r.agentType,
        status: r.status,
        model: r.model,
        error: r.error,
        createdAt: r.createdAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        // hide raw AI output from read-only client viewers
        output: isViewer ? undefined : r.output,
      })),
      total,
      page: pageNum,
      pageSize,
    };
  }
}
