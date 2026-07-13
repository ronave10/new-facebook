import { describe, expect, it } from "vitest";
import { buildSignedRequest, parseSignedRequest } from "../src/leads/signed-request.util";

const SECRET = "app-secret-123";

describe("signed_request", () => {
  it("round-trips a valid signed_request and extracts user_id", () => {
    const sr = buildSignedRequest({ user_id: "fbuser_9" }, SECRET);
    const payload = parseSignedRequest(sr, SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.user_id).toBe("fbuser_9");
    expect(String(payload!.algorithm).toUpperCase()).toBe("HMAC-SHA256");
  });

  it("rejects a tampered signature", () => {
    const sr = buildSignedRequest({ user_id: "x" }, SECRET);
    const [sig, payload] = sr.split(".");
    const badSig = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(parseSignedRequest(`${badSig}.${payload}`, SECRET)).toBeNull();
  });

  it("rejects a wrong app secret", () => {
    const sr = buildSignedRequest({ user_id: "x" }, SECRET);
    expect(parseSignedRequest(sr, "different-secret")).toBeNull();
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const sr = buildSignedRequest({ user_id: "victim" }, SECRET);
    const [sig] = sr.split(".");
    const forged = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "attacker" }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(parseSignedRequest(`${sig}.${forged}`, SECRET)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseSignedRequest("", SECRET)).toBeNull();
    expect(parseSignedRequest("nodot", SECRET)).toBeNull();
    expect(parseSignedRequest("a.b.c", SECRET)).toBeNull();
  });
});
