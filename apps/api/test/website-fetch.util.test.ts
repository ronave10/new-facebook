import { describe, expect, it } from "vitest";
import {
  assertSafeUrl,
  htmlToText,
  isPrivateAddress,
  UnsafeUrlError,
} from "../src/clients/website-fetch.util";

describe("isPrivateAddress", () => {
  it("flags loopback / private / link-local IPv4", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });
  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });
  it("flags loopback / ULA / link-local / mapped IPv6", () => {
    for (const ip of ["::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });
  it("allows public IPv6", () => {
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("ftp://example.com")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("rejects localhost and internal hostnames without DNS", async () => {
    await expect(assertSafeUrl("http://localhost:3000")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("http://foo.internal")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("http://db.local")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("rejects literal private/metadata IPs", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("http://127.0.0.1:8080")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("http://[::1]/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("rejects garbage input", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe("htmlToText", () => {
  it("strips scripts, styles and tags and collapses whitespace", () => {
    const html = `<html><head><style>.a{color:red}</style><script>alert(1)</script></head>
      <body><h1>שלום</h1><p>עולם &amp; כל&nbsp;השאר</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain("שלום");
    expect(text).toContain("עולם & כל השאר");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
    expect(text).not.toMatch(/<[^>]+>/);
  });
});
