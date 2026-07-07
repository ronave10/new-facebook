import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Server-side URL fetching for the "Magic Fill" brand extractor is a classic
 * SSRF sink: an attacker could point it at cloud metadata endpoints, localhost
 * admin panels or internal services. Every URL — and every redirect hop — is
 * validated here before a single byte is fetched.
 */

const MAX_BYTES = 1_500_000; // 1.5 MB of HTML is plenty for a landing page.
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 8000;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

/** True for loopback / private / link-local / metadata IPs (v4 and v6). */
export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return isPrivateIPv4(address);
  if (kind === 6) return isPrivateIPv6(address);
  return false;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(raw: string): boolean {
  const ip = raw.toLowerCase().split("%")[0]; // strip zone id
  if (ip === "::1" || ip === "::") return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4 address.
  const mapped = ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const first = ip.split(":")[0] ?? "";
  const head = parseInt(first, 16);
  if (Number.isNaN(head)) return true;
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

/**
 * Validates a user-supplied URL and resolves its host to guard against
 * DNS-rebinding to internal addresses. Returns the parsed URL and the vetted IP.
 */
export async function assertSafeUrl(raw: string): Promise<{ url: URL; address: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("כתובת אתר לא תקינה");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("רק כתובות http/https נתמכות");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UnsafeUrlError("כתובת פנימית חסומה");
  }

  // If the host is a literal IP, check it directly; otherwise resolve DNS.
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError("כתובת IP פרטית חסומה");
    return { url, address: host };
  }
  let resolved: { address: string }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("לא ניתן לאתר את כתובת האתר");
  }
  if (resolved.length === 0) throw new UnsafeUrlError("לא ניתן לאתר את כתובת האתר");
  for (const r of resolved) {
    if (isPrivateAddress(r.address)) throw new UnsafeUrlError("כתובת האתר מפנה לרשת פנימית");
  }
  return { url, address: resolved[0].address };
}

/** Strips scripts/styles/tags from HTML and collapses whitespace to plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fetches a public web page as plain text, re-validating every redirect hop
 * (Node's fetch would otherwise follow redirects into private space). Enforces a
 * timeout and a byte cap.
 */
export async function fetchWebsiteText(raw: string): Promise<{ finalUrl: string; text: string }> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { url } = await assertSafeUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "CampaignOS-BrandExtractor/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === "AbortError") throw new UnsafeUrlError("האתר לא הגיב בזמן");
      throw new UnsafeUrlError("שגיאה בטעינת האתר");
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new UnsafeUrlError("שגיאת הפניה באתר");
      current = new URL(location, url).toString();
      continue;
    }
    if (!res.ok) throw new UnsafeUrlError(`האתר החזיר שגיאה (${res.status})`);

    // Read with a byte cap so a huge/streaming response can't exhaust memory.
    const reader = res.body?.getReader();
    if (!reader) return { finalUrl: url.toString(), text: htmlToText(await res.text()) };
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.length;
        if (received > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const html = Buffer.concat(chunks).toString("utf8");
    return { finalUrl: url.toString(), text: htmlToText(html) };
  }
  throw new UnsafeUrlError("יותר מדי הפניות");
}
