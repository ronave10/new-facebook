import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { AuthContext, CurrentUser, Public } from "../core/auth-context";
import { AppException } from "../core/api-error";
import { RequirePermission } from "../core/permissions.guard";
import { RateLimit } from "../core/rate-limit.guard";
import { ZodValidationPipe } from "../core/zod-validation.pipe";
import { AssetsService } from "./assets.service";

const uploadSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  kind: z.enum(["IMAGE", "VIDEO"]),
  dataBase64: z.string().min(1),
});

const attachSchema = z.object({ assetId: z.string().min(1) });

@Controller()
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post("clients/:id/assets")
  @RequirePermission("client.write")
  @RateLimit({ limit: 30, windowSec: 60 })
  upload(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(uploadSchema)) body: z.infer<typeof uploadSchema>,
  ) {
    return this.assets.upload(user, id, body);
  }

  @Get("clients/:id/assets")
  @RequirePermission("client.read")
  list(@CurrentUser() user: AuthContext, @Param("id") id: string) {
    return this.assets.list(user, id);
  }

  @Post("creatives/:id/attach-asset")
  @RequirePermission("campaign.write")
  attach(
    @CurrentUser() user: AuthContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(attachSchema)) body: z.infer<typeof attachSchema>,
  ) {
    return this.assets.attachToCreative(user, id, body.assetId);
  }

  // Public content endpoint — files are addressed by an unguessable hashed key.
  @Public()
  @Get("assets/*storageKey")
  async serve(@Param("storageKey") storageKey: string | string[], @Res() res: Response) {
    const key = Array.isArray(storageKey) ? storageKey.join("/") : storageKey;
    const data = await this.assets.serve(key);
    if (!data) throw AppException.notFound("הקובץ לא נמצא");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(data);
  }
}
