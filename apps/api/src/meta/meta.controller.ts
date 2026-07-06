import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthContext, CurrentUser, Public } from "../core/auth-context";
import { AppException } from "../core/api-error";
import { loadConfig } from "../core/config";
import { RequirePermission } from "../core/permissions.guard";
import { MetaService } from "./meta.service";
import { SyncService } from "./sync.service";
import { signState, verifyState } from "./oauth-state.util";

@Controller("meta")
export class MetaController {
  constructor(
    private readonly meta: MetaService,
    private readonly sync: SyncService,
  ) {}

  @Post("connect/start")
  @RequirePermission("meta.connect")
  async start(@CurrentUser() user: AuthContext, @Body("clientId") clientId?: string) {
    const cfg = loadConfig();
    return this.meta.startConnect(user, clientId, () =>
      signState(
        {
          orgId: user.organizationId,
          userId: user.userId,
          clientId,
          nonce: Math.random().toString(36).slice(2),
          exp: Date.now() + 10 * 60 * 1000,
        },
        cfg.JWT_ACCESS_SECRET,
      ),
    );
  }

  @Public()
  @Get("connect/callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
    @Query("error") error?: string,
  ) {
    const cfg = loadConfig();
    const redirect = (ok: boolean, clientId?: string, reason?: string) => {
      const target = clientId ? `${cfg.WEB_URL}/clients/${clientId}?tab=meta` : `${cfg.WEB_URL}/clients`;
      const sep = target.includes("?") ? "&" : "?";
      return res.redirect(`${target}${sep}connected=${ok ? 1 : 0}${reason ? `&reason=${reason}` : ""}`);
    };
    if (error || !code || !state) return redirect(false, undefined, "denied");
    try {
      const parsed = verifyState(state, cfg.JWT_ACCESS_SECRET);
      await this.meta.completeOAuth(parsed.orgId, parsed.userId, parsed.clientId, code);
      return redirect(true, parsed.clientId);
    } catch (err) {
      return redirect(false, undefined, (err as Error).message.slice(0, 40));
    }
  }

  @Get("connections")
  @RequirePermission("meta.read")
  connections(@CurrentUser() user: AuthContext, @Query("clientId") clientId?: string) {
    return this.meta.listConnections(user.organizationId, clientId);
  }

  @Post("connections/:id/refresh")
  @RequirePermission("meta.connect")
  async refresh(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    await this.meta.syncAssets(user.organizationId, id);
    return { ok: true };
  }

  @Delete("connections/:id")
  @RequirePermission("meta.connect")
  disconnect(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.meta.disconnect(user, id);
  }

  @Get("ad-accounts")
  @RequirePermission("meta.read")
  adAccounts(@CurrentUser() user: AuthContext, @Query("connectionId") connectionId: string) {
    if (!connectionId) throw AppException.badRequest("חסר connectionId");
    return this.meta.listAdAccounts(user.organizationId, connectionId);
  }

  @Post("ad-accounts/select")
  @RequirePermission("meta.connect")
  select(
    @CurrentUser() user: AuthContext,
    @Body("adAccountId") adAccountId: string,
    @Body("clientId") clientId: string,
  ) {
    if (!adAccountId || !clientId) throw AppException.badRequest("חסרים פרטי בחירה");
    return this.meta.selectAdAccount(user, adAccountId, clientId);
  }

  @Post("sync/:clientId")
  @RequirePermission("meta.sync")
  async syncClient(@CurrentUser() user: AuthContext, @Param("clientId") clientId: string) {
    await this.sync.enqueueSync(user.organizationId, clientId);
    return { ok: true, message: "סנכרון נתונים החל ברקע" };
  }
}
