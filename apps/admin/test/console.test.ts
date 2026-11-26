// Owner console: Access + PLATFORM_ADMIN_EMAILS gate, product reads with the service token,
// aggregation that never turns "unreadable" or "not measured" into zero, and the digest switch.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  AdminAccountDto,
  EarlyAccessMetrics,
  ProductAdminMetrics,
} from "../../../packages/admin-metrics/src/index.ts";
import { clearKeyCache } from "../src/access.ts";
import { buildDashboard, productMrp } from "../src/aggregate.ts";
import { parseProducts } from "../src/config.ts";
import { digestWindow } from "../src/digest.ts";
import { type Env, handleApi, runDigest } from "../src/worker.ts";

const TEAM = "https://owner-team.cloudflareaccess.com";
const AUD = "aud-tag-1";
const NOW = new Date("2026-11-26T08:00:00Z");
const TOKEN = "console-service-token-0123456789abcdef";

function b64url(b: Uint8Array | string): string {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : b;
  let bin = "";
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const keys = (await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const jwk = (await crypto.subtle.exportKey("jwk", keys.publicKey)) as JsonWebKey;

async function jwt(claims: Record<string, unknown>, kid = "k1") {
  const h = b64url(JSON.stringify({ alg: "RS256", kid }));
  const p = b64url(
    JSON.stringify({ iss: TEAM, aud: [AUD], exp: NOW.getTime() / 1000 + 600, ...claims }),
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    new TextEncoder().encode(`${h}.${p}`),
  );
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

function appMetrics(over: Partial<ProductAdminMetrics> = {}): ProductAdminMetrics {
  return {
    contractVersion: 1,
    kind: "app",
    product: "payapps",
    productName: "PayApps",
    generatedAt: NOW.toISOString(),
    windowDays: 30,
    signups: { total: 10, verified: 8, unverified: 2, lastWindow: 4, byDay: [], byWeek: [] },
    orgs: { total: 7, active: 5, activeDefinition: "x" },
    trials: { current: 1, startedInWindow: 2, converted: 1, expired: 1, note: "" },
    subscriptions: { byPlan: [], paid: 3 },
    mrr: {
      byCurrency: [{ currency: "USD", amountMinor: 29_700 }],
      subscriptionsCounted: 3,
      subscriptionsUnpriced: 0,
      source: "paddle_webhook",
    },
    cancellations: { inWindow: 1, scheduled: 0 },
    failedPayments: { inWindow: null, pastDueNow: 0 },
    llmSpend: null,
    ...over,
  };
}

const earlyAccess: EarlyAccessMetrics = {
  contractVersion: 1,
  kind: "early_access",
  product: "payapps-site",
  productName: "PayApps early access",
  generatedAt: NOW.toISOString(),
  windowDays: 30,
  total: 40,
  confirmed: 30,
  unsubscribed: 1,
  lastWindow: 6,
  byDay: [],
  bySource: [{ source: "/early-access", count: 40 }],
};

const account = (over: Partial<AdminAccountDto> = {}): AdminAccountDto => ({
  orgId: "org_1",
  orgName: "Acme",
  createdAt: "2026-11-25T10:00:00.000Z",
  owner: { name: "Ann", email: "ann@acme.test", emailVerified: true },
  planKey: "solo",
  status: "trialing",
  trialStartedAt: "2026-11-25T10:00:00.000Z",
  firstPaidAt: null,
  canceledAt: null,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  mrr: null,
  ...over,
});

const PRODUCTS = JSON.stringify([
  { key: "payapps", name: "PayApps", kind: "app", adminUrl: "https://payapps.test/api/admin" },
  { key: "jobshop", name: "Job Shop", kind: "app", adminUrl: "https://jobshop.test/api/admin" },
  {
    key: "payapps-site",
    name: "PayApps early access",
    kind: "early_access",
    adminUrl: "https://site.test/api/admin",
  },
]);

/** Fake network: the Access JWKS plus three products (jobshop is down). Records auth headers. */
function fakeFetch(seen: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `${TEAM}/cdn-cgi/access/certs`) {
      return Response.json({ keys: [{ ...jwk, kid: "k1", alg: "RS256" }] });
    }
    seen.push(`${url} ${new Headers(init?.headers).get("Authorization")}`);
    if (url.startsWith("https://jobshop.test")) return new Response("boom", { status: 500 });
    if (url.startsWith("https://payapps.test/api/admin/metrics"))
      return Response.json(appMetrics());
    if (url.startsWith("https://payapps.test/api/admin/accounts")) {
      const list = new URL(url).searchParams.get("list");
      const items =
        list === "churn"
          ? [
              account({
                orgId: "org_2",
                orgName: "Gone Co",
                status: "canceled",
                canceledAt: "2026-11-25T12:00:00.000Z",
              }),
            ]
          : [account()];
      return Response.json({
        contractVersion: 1,
        kind: "app",
        product: "payapps",
        list,
        items,
        limit: 50,
      });
    }
    if (url.startsWith("https://site.test/api/admin/metrics")) return Response.json(earlyAccess);
    if (url.startsWith("https://site.test/api/admin/accounts")) {
      return Response.json({
        contractVersion: 1,
        kind: "early_access",
        product: "payapps-site",
        list: "recent",
        items: [
          {
            id: "s1",
            email: "lead@x.test",
            name: null,
            source: "/early-access",
            confirmed: true,
            createdAt: "2026-11-25T23:00:00.000Z",
          },
        ],
        limit: 50,
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const env = (over: Partial<Env> = {}): Env => ({
  APP_ENV: "test",
  PRODUCTS,
  PLATFORM_ADMIN_EMAILS: "owner@example.test",
  ADMIN_SERVICE_TOKEN: TOKEN,
  CF_ACCESS_TEAM_DOMAIN: "owner-team",
  CF_ACCESS_AUD: AUD,
  ...over,
});

async function get(path: string, headers: Record<string, string>, e = env(), seen: string[] = []) {
  clearKeyCache();
  const res = await handleApi(new Request(`https://console.test${path}`, { headers }), e, {
    fetch: fakeFetch(seen),
    now: () => NOW,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, res };
}

describe("owner gate", () => {
  it("refuses everything when Access is not configured", async () => {
    const r = await get("/api/me", {}, env({ CF_ACCESS_AUD: "" }));
    assert.equal(r.status, 503);
  });

  it("401 without a JWT or with a bad one, 403 for a valid JWT whose email is not listed", async () => {
    assert.equal((await get("/api/me", {})).status, 401);
    const forged = (await jwt({ email: "owner@example.test" })).replace(/\.[^.]+$/, ".AAAA");
    assert.equal((await get("/api/me", { "Cf-Access-Jwt-Assertion": forged })).status, 401);
    const wrongAud = await jwt({ email: "owner@example.test", aud: ["other"] });
    assert.equal((await get("/api/me", { "Cf-Access-Jwt-Assertion": wrongAud })).status, 401);
    const stranger = await jwt({ email: "eve@example.test" });
    assert.equal((await get("/api/me", { "Cf-Access-Jwt-Assertion": stranger })).status, 403);
    const serviceToken = await jwt({ common_name: "abc.access" });
    assert.equal((await get("/api/me", { "Cf-Access-Jwt-Assertion": serviceToken })).status, 403);
  });

  it("lets the listed owner in and never caches answers", async () => {
    const r = await get("/api/me", {
      "Cf-Access-Jwt-Assertion": await jwt({ email: "Owner@Example.test" }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.email, "Owner@Example.test");
    assert.equal(r.res.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(r.body.digest, { enabled: false, senderConfigured: false, willSend: false });
  });

  it("health needs no auth and says nothing else", async () => {
    const r = await get("/api/health", {});
    assert.deepEqual(r.body, { ok: true, app: "admin-console" });
  });
});

describe("dashboard", () => {
  it("reads each product with the service token and reports an unreadable one instead of zeros", async () => {
    const seen: string[] = [];
    const r = await get(
      "/api/dashboard",
      { "Cf-Access-Jwt-Assertion": await jwt({ email: "owner@example.test" }) },
      env(),
      seen,
    );
    assert.equal(r.status, 200);
    assert.ok(seen.length > 0 && seen.every((s) => s.endsWith(`Bearer ${TOKEN}`)));
    const d = r.body as unknown as ReturnType<typeof buildDashboard>;
    assert.deepEqual(d.unreadable, [{ name: "Job Shop", error: "HTTP 500" }]);
    assert.equal(d.products.find((p) => p.key === "jobshop")?.metrics, null);
    assert.equal(d.totals.orgs, 7);
    assert.deepEqual(d.totals.mrr, [{ currency: "USD", amountMinor: 29_700 }]);
    // PayApps measures no costs: MRP blank, never MRR-as-profit, and the total says where.
    assert.equal(d.totals.mrpSoFar.amountMinor, null);
    assert.deepEqual(d.totals.mrpSoFar.missingIn, ["PayApps"]);
    assert.equal(d.totals.llmSpendMonthToDateMicros.value, null);
    assert.deepEqual(d.totals.failedPaymentsInWindow, { value: null, unmeasuredIn: ["PayApps"] });
    assert.equal(d.totals.earlyAccess.total, 40);
    assert.equal(d.feed[0]?.kind, "early_access");
    assert.equal(d.feed[0]?.email, "lead@x.test");
    assert.equal(d.trials[0]?.orgName, "Acme");
    assert.equal(d.churn[0]?.orgName, "Gone Co");
  });

  it("a product without its token is unreadable, not empty", async () => {
    const products = JSON.stringify([
      {
        key: "p",
        name: "P",
        kind: "app",
        adminUrl: "https://payapps.test/api/admin",
        tokenEnv: "P_TOKEN",
      },
    ]);
    const r = await get(
      "/api/dashboard",
      { "Cf-Access-Jwt-Assertion": await jwt({ email: "owner@example.test" }) },
      env({ PRODUCTS: products }),
    );
    const d = r.body as unknown as ReturnType<typeof buildDashboard>;
    assert.deepEqual(d.unreadable, [{ name: "P", error: "P_TOKEN is not set on the console" }]);
  });

  it("MRP is MRR minus measured LLM spend, blank when costs or currency do not allow it", () => {
    const withLlm = appMetrics({
      llmSpend: { monthToDateMicros: 12_340_000, windowMicros: 20_000_000 },
    });
    assert.equal(productMrp(withLlm).amountMinor, 29_700 - 1_234);
    assert.equal(productMrp(appMetrics()).amountMinor, null);
    const eur = appMetrics({
      llmSpend: { monthToDateMicros: 0, windowMicros: 0 },
      mrr: {
        byCurrency: [{ currency: "EUR", amountMinor: 100 }],
        subscriptionsCounted: 1,
        subscriptionsUnpriced: 0,
        source: "paddle_webhook",
      },
    });
    assert.equal(productMrp(eur).amountMinor, null);
    const all = buildDashboard(
      [
        {
          config: {
            key: "a",
            name: "A",
            kind: "app",
            adminUrl: "https://a",
            tokenEnv: "T",
            metricsTokenEnv: "M",
            accessClientIdEnv: null,
            accessClientSecretEnv: null,
          },
          metrics: { ok: true, data: withLlm },
          recent: { ok: true, data: { items: [] } },
          trials: null,
          churn: null,
        },
      ],
      NOW,
      30,
    );
    assert.equal(all.totals.mrpSoFar.amountMinor, 29_700 - 1_234);
  });
});

describe("config", () => {
  it("rejects malformed product lists", () => {
    assert.equal(parseProducts(undefined).ok, false);
    assert.equal(parseProducts("{}").ok, false);
    assert.equal(
      parseProducts(JSON.stringify([{ key: "A", name: "x", kind: "app", adminUrl: "https://a" }]))
        .ok,
      false,
    );
    assert.equal(
      parseProducts(JSON.stringify([{ key: "a", name: "x", kind: "app", adminUrl: "http://a" }]))
        .ok,
      false,
    );
    assert.equal(
      parseProducts(
        JSON.stringify([{ key: "a", name: "x", kind: "app", adminUrl: "https://u:p@a" }]),
      ).ok,
      false,
    );
    const ok = parseProducts(
      JSON.stringify([{ key: "a", name: "x", kind: "app", adminUrl: "https://a.test/api/admin/" }]),
    );
    assert.ok(ok.ok);
    assert.equal(ok.products[0]?.adminUrl, "https://a.test/api/admin");
    assert.equal(ok.products[0]?.tokenEnv, "ADMIN_SERVICE_TOKEN");
  });
});

describe("daily digest", () => {
  it("covers the 24 hours before today 00:00 UTC", () => {
    const w = digestWindow(NOW);
    assert.equal(w.from.toISOString(), "2026-11-25T00:00:00.000Z");
    assert.equal(w.to.toISOString(), "2026-11-26T00:00:00.000Z");
  });

  it("is off until switched on with a sender configured", async () => {
    const sent: unknown[] = [];
    const EMAIL = {
      send: async (m: unknown) => {
        sent.push(m);
        return { messageId: "m1" };
      },
    };
    assert.equal(
      await runDigest(env({ DIGEST_ENABLED: "on" }), { fetch: fakeFetch(), now: () => NOW }),
      "off",
    );
    assert.equal(
      await runDigest(env({ EMAIL, EMAIL_FROM: "Console <c@x.test>" }), {
        fetch: fakeFetch(),
        now: () => NOW,
      }),
      "off",
    );
    assert.equal(sent.length, 0);
    const r = await runDigest(
      env({ DIGEST_ENABLED: "on", EMAIL, EMAIL_FROM: "Console <c@x.test>" }),
      { fetch: fakeFetch(), now: () => NOW },
    );
    assert.equal(r, "sent");
    const m = sent[0] as { to: string[]; subject: string; text: string };
    assert.deepEqual(m.to, ["owner@example.test"]);
    assert.match(m.text, /Could not read this product: HTTP 500/);
    assert.match(m.text, /Acme/); // trial started yesterday
    assert.match(m.text, /Gone Co/); // canceled yesterday
    assert.match(m.text, /lead@x\.test/);
    assert.match(m.text, /USD 297\.00/);
  });
});
