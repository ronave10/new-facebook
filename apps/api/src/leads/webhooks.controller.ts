import { Body, Controller, Get, Headers, Logger, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Public } from "../core/auth-context";
import { loadConfig } from "../core/config";
import { LeadsService } from "./leads.service";
import { verifyMetaSignature } from "./webhook-signature.util";
import { parseSignedRequest, type SignedRequestPayload } from "./signed-request.util";

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

  /** Reads and verifies the `signed_request` field. In dev (no app secret) the
   * payload is decoded without HMAC so the flow is testable offline. */
  private readSignedRequest(body: any): SignedRequestPayload | null {
    const raw = body?.signed_request;
    if (typeof raw !== "string" || !raw) return null;
    const cfg = loadConfig();
    // These are PUBLIC endpoints that DELETE data. We ALWAYS require a verified
    // signature — there is no unverified path in any environment. Without an app
    // secret we cannot verify, so we fail closed (set META_APP_SECRET, even in dev).
    if (!cfg.META_APP_SECRET) {
      this.logger.error("Rejected signed_request: META_APP_SECRET is not configured — cannot verify a data-deletion request");
      return null;
    }
    return parseSignedRequest(raw, cfg.META_APP_SECRET);
  }

  /**
   * Meta Data Deletion Request Callback (required for apps handling user data).
   * Verifies the signed_request, erases the user's leads, and returns the
   * { url, confirmation_code } Meta expects.
   */
  @Public()
  @Post("data-deletion")
  async dataDeletion(@Body() body: any, @Res() res: Response) {
    const payload = this.readSignedRequest(body);
    if (!payload) return res.status(400).json({ error: "invalid signed_request" });
    const { code } = await this.leads.handleDataDeletion(payload.user_id ? String(payload.user_id) : undefined);
    return res.status(200).json({
      url: `${loadConfig().API_URL}/api/v1/webhooks/meta/data-deletion/status?code=${code}`,
      confirmation_code: code,
    });
  }

  /** Status endpoint Meta (or the user) can poll to confirm the deletion. */
  @Public()
  @Get("data-deletion/status")
  async dataDeletionStatus(@Query("code") code: string, @Res() res: Response) {
    if (!code) return res.status(400).json({ error: "missing code" });
    try {
      return res.status(200).json(await this.leads.getDeletionStatus(code));
    } catch {
      return res.status(404).json({ error: "not found" });
    }
  }

  /** Meta Deauthorize Callback (fired when a user removes the app). We record it
   * as a deletion-class event and erase that user's leads. */
  @Public()
  @Post("deauthorize")
  async deauthorize(@Body() body: any, @Res() res: Response) {
    const payload = this.readSignedRequest(body);
    if (!payload) return res.status(400).json({ error: "invalid signed_request" });
    await this.leads.handleDataDeletion(payload.user_id ? String(payload.user_id) : undefined, "deauthorize");
    return res.status(200).json({ ok: true });
  }
}
