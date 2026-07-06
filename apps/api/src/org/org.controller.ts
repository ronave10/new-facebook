import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { createMemberSchema, updateMemberSchema, updateOrgSchema } from "@campaignos/shared";
import { AuthContext, CurrentUser } from "../core/auth-context";
import { RequirePermission } from "../core/permissions.guard";
import { ZodValidationPipe } from "../core/zod-validation.pipe";
import { OrgService } from "./org.service";

@Controller()
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get("org")
  @RequirePermission("org.read")
  get(@CurrentUser() user: AuthContext) {
    return this.org.get(user.organizationId);
  }

  @Put("org")
  @RequirePermission("org.manage")
  update(@CurrentUser() user: AuthContext, @Body(new ZodValidationPipe(updateOrgSchema)) body: any) {
    return this.org.update(user.organizationId, body.name, user.userId);
  }

  @Get("org/members")
  @RequirePermission("member.read")
  members(@CurrentUser() user: AuthContext) {
    return this.org.listMembers(user.organizationId);
  }

  @Post("org/members")
  @RequirePermission("member.manage")
  addMember(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(createMemberSchema)) body: any,
  ) {
    return this.org.addMember(user.organizationId, body, user.userId);
  }

  @Put("org/members/:id")
  @RequirePermission("member.manage")
  updateMember(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: any,
  ) {
    return this.org.updateMember(user.organizationId, id, body, user.userId);
  }

  @Delete("org/members/:id")
  @RequirePermission("member.manage")
  removeMember(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.org.removeMember(user.organizationId, id, user.userId);
  }

  @Get("audit-logs")
  @RequirePermission("auditlog.read")
  auditLogs(
    @CurrentUser() user: AuthContext,
    @Query("page") page = "1",
    @Query("action") action?: string,
  ) {
    return this.org.listAuditLogs(user.organizationId, Math.max(1, parseInt(page, 10) || 1), action);
  }
}
