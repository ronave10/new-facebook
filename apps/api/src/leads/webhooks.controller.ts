import { Body, Controller, Get, Headers, Logger, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Public } from "../core/auth-context";
import { loadConfig } from "../core/config";
import { LeadsService } from "./leads.service";
import { verifyMetaSignature } from "./webhook-signature.util";

/**
 * Meta Webhooks receiver for leadgen events.
 * - GET verifies the subscription handshake (hub.challenge).
 * - POST receives leadgen entries; the X-Hub-Signature-256 HMAC is verified
 *   against the raw body before any processing.
 */
@Controller("webhooks/meta")
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly leads: LeadsService) {}

  @Public()
  @Get()
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: Response,
  ) {
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "campaignos-verify";
    if (mode === "subscribe" && token === expected) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  @Public()
  @Post()
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Body() body: any,
    @Res() res: Response,
  ) {
    const cfg = loadConfig();
    // Verify signature unless running without an app secret (mock/dev).
    if (cfg.META_APP_SECRET) {
      const ok = verifyMetaSignature(req.rawBody ?? JSON.stringify(body), signature, cfg.META_APP_SECRET);
      if (!ok) {
        this.logger.warn("Rejected leadgen webhook with invalid signature");
        return res.status(401).send("invalid signature");
      }
    }

    // Meta always expects a fast 200; process leads best-effort.
    res.status(200).send("EVENT_RECEIVED");

    try {
      for (const entry of body?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
          if (change.field !== "leadgen") continue;
          const v = change.value ?? {};
          if (v.leadgen_id && v.page_id) {
            await this.leads.ingestFromWebhook(String(v.leadgen_id), String(v.page_id));
          }
        }
      }
    } catch (err) {
      this.logger.error(`Leadgen processing failed: ${(err as Error).message}`);
    }
  }
}
