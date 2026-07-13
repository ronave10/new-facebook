import { createHmac, timingSafeEqual } from "node:crypto";

export interface SignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [k: string]: unknown;
}

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Parses and verifies a Facebook `signed_request` (used by the Data Deletion and
 * Deauthorize callbacks): `base64url(sig).base64url(payloadJson)`, where sig is
 * HMAC-SHA256 of the encoded payload string keyed by the app secret. Returns the
 * payload, or null if malformed / signature mismatch.
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): SignedRequestPayload | null {
  if (!signedRequest || !signedRequest.includes(".")) return null;
  const [encodedSig, encodedPayload] = signedRequest.split(".", 2);
  if (!encodedSig || !encodedPayload) return null;

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(b64urlToBuffer(encodedPayload).toString("utf8"));
  } catch {
    return null;
  }
  if (String(payload.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") return null;

  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  const provided = b64urlToBuffer(encodedSig);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  return payload;
}

/** Builds a signed_request (for tests / local simulation of Meta's callback). */
export function buildSignedRequest(payload: SignedRequestPayload, appSecret: string): string {
  const body = { algorithm: "HMAC-SHA256", ...payload };
  const encodedPayload = b64url(Buffer.from(JSON.stringify(body), "utf8"));
  const sig = createHmac("sha256", appSecret).update(encodedPayload).digest();
  return `${b64url(sig)}.${encodedPayload}`;
}
