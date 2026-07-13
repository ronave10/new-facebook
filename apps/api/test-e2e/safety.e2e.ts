/**
 * Real HTTP end-to-end tests for the safety-critical invariants, against a booted
 * app + real Postgres (the paths the grill flagged as "manual-curl only"):
 *   1. Tenant isolation — org B cannot read org A's client (404).
 *   2. The publish safety gate — publishing without an approval is rejected (409).
 *   3. RBAC — an ACCOUNT_MANAGER cannot manage members (403).
 *
 * Run with the app's SWC runtime (decorator metadata), NOT vitest/esbuild:
 *   node -r @swc-node/register test-e2e/safety.e2e.ts
 * Requires DATABASE_URL + JWT/encryption env (CI provides them; locally use --env-file=.env).
 */
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api/v1");
  await app.listen(0);
  const base = (await app.getUrl()).replace("[::1]", "127.0.0.1").replace("0.0.0.0", "127.0.0.1") + "/api/v1";

  const req = async (method: string, path: string, token?: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  const uniq = `${Date.now()}${Math.floor(Math.random() * 1e5)}`;
  try {
    // ── register two isolated orgs ──
    const a = await req("POST", "/auth/register", undefined, {
      email: `owner_a_${uniq}@e2e.test`, password: "Passw0rd!", name: "Owner A", organizationName: "Org A",
    });
    check("register org A → 201 + token", a.status === 201 && !!a.body?.accessToken, `status ${a.status}`);
    const b = await req("POST", "/auth/register", undefined, {
      email: `owner_b_${uniq}@e2e.test`, password: "Passw0rd!", name: "Owner B", organizationName: "Org B",
    });
    check("register org B → 201 + token", b.status === 201 && !!b.body?.accessToken, `status ${b.status}`);
    const tokenA = a.body.accessToken as string;
    const tokenB = b.body.accessToken as string;

    // ── 1. tenant isolation ──
    const client = await req("POST", "/clients", tokenA, { name: "Client A", country: "IL" });
    check("A creates client → 201", client.status === 201 && !!client.body?.id, `status ${client.status}`);
    const clientId = client.body?.id;
    const cross = await req("GET", `/clients/${clientId}`, tokenB);
    check("B cannot read A's client → 404 (tenant isolation)", cross.status === 404, `status ${cross.status}`);

    // ── 2. publish safety gate ──
    const camp = await req("POST", "/campaigns/draft", tokenA, { clientId, name: "E2E Campaign", goal: "LEADS" });
    check("A creates campaign draft → 201", camp.status === 201 && !!camp.body?.id, `status ${camp.status}`);
    const pub = await req("POST", `/campaigns/${camp.body?.id}/publish`, tokenA);
    check("publish without approval → 409 (safety gate)", pub.status === 409, `status ${pub.status} ${JSON.stringify(pub.body)}`);

    // ── 3. RBAC ──
    const addMgr = await req("POST", "/org/members", tokenA, {
      email: `mgr_${uniq}@e2e.test`, name: "Manager", password: "Passw0rd!", role: "ACCOUNT_MANAGER",
    });
    check("A adds an ACCOUNT_MANAGER → 201", addMgr.status === 201, `status ${addMgr.status}`);
    const mgrLogin = await req("POST", "/auth/login", undefined, { email: `mgr_${uniq}@e2e.test`, password: "Passw0rd!" });
    check("manager logs in → 200/201", mgrLogin.status === 200 || mgrLogin.status === 201, `status ${mgrLogin.status}`);
    const mgrAdds = await req("POST", "/org/members", mgrLogin.body?.accessToken, {
      email: `x_${uniq}@e2e.test`, name: "X", password: "Passw0rd!", role: "CLIENT_VIEWER",
    });
    check("manager cannot manage members → 403 (RBAC)", mgrAdds.status === 403, `status ${mgrAdds.status}`);
  } finally {
    await app.close();
  }

  console.log(`\nE2E: ${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.env.RUN_E2E === "1" || process.env.RUN_E2E === "true") {
  main().catch((err) => {
    console.error("E2E crashed:", err);
    process.exit(1);
  });
} else {
  console.log("E2E skipped (set RUN_E2E=1 to run against a real DB).");
}
