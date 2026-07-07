import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "../src/leads/webhook-signature.util";

const secret = "app-secret-xyz";
const body = JSON.stringify({ object: "page", entry: [{ changes: [{ field: "leadgen" }] }] });
const sign = (b: string, s: string) => "sha256=" + createHmac("sha256", s).update(b).digest("hex");

describe("verifyMetaSignature", () => {
  it("accepts a correctly signed body", () => {
    expect(verifyMetaSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = sign(body, secret);
    expect(verifyMetaSignature(body + "x", header, secret)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyMetaSignature(body, sign(body, "other"), secret)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, "md5=abc", secret)).toBe(false);
  });
});
