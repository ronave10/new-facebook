import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { AuthContext, CurrentUser } from "../core/auth-context";
import { RequirePermission } from "../core/permissions.guard";
import { ZodValidationPipe } from "../core/zod-validation.pipe";
import { AudiencesService } from "./audiences.service";

const createSchema = z.object({
  name: z.string().min(2, "יש להזין שם קהל"),
  subtype: z.enum(["WEBSITE", "ENGAGEMENT", "LOOKALIKE"]),
  description: z.string().optional(),
  retentionDays: z.number().int().min(1).max(180).optional(),
  originAudienceId: z.string().optional(),
  ratio: z.number().min(0.01).max(0.2).optional(),
});

@Controller()
export class AudiencesController {
  constructor(private readonly audiences: AudiencesService) {}

  @Get("clients/:id/audiences")
  @RequirePermission("audience.read")
  list(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.audiences.list(user, id);
  }

  @Post("clients/:id/audiences/sync")
  @RequirePermission("audience.read")
  sync(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.audiences.sync(user, id);
  }

  @Post("clients/:id/audiences")
  @RequirePermission("audience.write")
  create(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.audiences.create(user, id, body);
  }

  @Delete("audiences/:id")
  @RequirePermission("audience.write")
  remove(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.audiences.remove(user, id);
  }
}
