import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";
import { AuthContext, CurrentUser } from "../core/auth-context";
import { RequirePermission } from "../core/permissions.guard";
import { ZodValidationPipe } from "../core/zod-validation.pipe";
import { LeadsService } from "./leads.service";

const statusSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "DISQUALIFIED", "CONVERTED"]),
  notes: z.string().optional(),
});

@Controller()
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get("clients/:id/leads")
  @RequirePermission("analytics.read")
  list(@CurrentUser() user: AuthContext, @Param("id") id: string, @Query("status") status?: string) {
    return this.leads.list(user, id, status);
  }

  // Dev/demo: fabricate an incoming lead so the inbox works without a live Meta webhook.
  @Post("clients/:id/leads/simulate")
  @RequirePermission("meta.sync")
  simulate(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.leads.simulate(user, id);
  }

  @Put("leads/:id/status")
  @RequirePermission("client.write")
  updateStatus(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(statusSchema)) body: z.infer<typeof statusSchema>,
  ) {
    return this.leads.updateStatus(user, id, body.status, body.notes);
  }
}
