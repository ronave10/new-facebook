import { createHmac, timingSafeEqual } from "node:crypto";

export interface OAuthState {
  orgId: string;
  userId: string;
  clientId?: string;
  nonce: string;
  exp: number; // epoch ms
}

/**
 * HMAC-signed OAuth `state` param (CSRF protection). Format: base64url(payload).signature
 * Signed with the JWT access secret; verification rejects tampering and expiry.
 */
export function signState(state: OAuthState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(token: string, secret: string): OAuthState {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new Error("invalid state format");
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("state signature mismatch");
  }
  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  if (!state.exp || state.exp < Date.now()) {
    throw new Error("state expired");
  }
  return state;
}
