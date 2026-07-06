import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { loginSchema, refreshSchema, registerSchema } from "@campaignos/shared";
import { AuthContext, CurrentUser, Public } from "../core/auth-context";
import { RateLimit } from "../core/rate-limit.guard";
import { ZodValidationPipe } from "../core/zod-validation.pipe";
import { AuthService } from "./auth.service";

function meta(req: Request) {
  return { ip: req.ip, userAgent: req.headers["user-agent"] };
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @RateLimit({ limit: 10, windowSec: 60 })
  register(@Body(new ZodValidationPipe(registerSchema)) body: any, @Req() req: Request) {
    return this.auth.register(body, meta(req));
  }

  @Public()
  @Post("login")
  @RateLimit({ limit: 10, windowSec: 60 })
  login(@Body(new ZodValidationPipe(loginSchema)) body: any, @Req() req: Request) {
    return this.auth.login(body, meta(req));
  }

  @Public()
  @Post("refresh")
  @RateLimit({ limit: 30, windowSec: 60 })
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: any) {
    return this.auth.refresh(body.refreshToken);
  }

  @Public()
  @Post("logout")
  async logout(@Body(new ZodValidationPipe(refreshSchema)) body: any) {
    await this.auth.logout(body.refreshToken);
    return { ok: true };
  }

  @Get("me")
  me(@CurrentUser() user: AuthContext) {
    return this.auth.me(user.userId, user.organizationId);
  }
}
