import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { GET as adCatalogGet, POST as adCatalogPost } from "../src/app/api/ad-catalog/sync/route";
import { GET as fulfillmentGet } from "../src/app/api/fulfillment/submissions/route";
import { GET as fulfillmentHealthGet } from "../src/app/api/fulfillment/health/route";
import { GET as retargetingGet } from "../src/app/api/retargeting/events/route";
import { GET as artistCohortsGet } from "../src/app/api/analytics/artist-cohorts/route";
import { GET as payoutsReconciliationGet } from "../src/app/api/payouts/reconciliation/route";
import { POST as payoutsBatchTransferPost } from "../src/app/api/payouts/batch-transfer/route";
import { GET as fulfillmentCostRouterGet } from "../src/app/api/fulfillment/cost-router/route";
import { GET as payoutsTaxWithholdingGet } from "../src/app/api/payouts/tax-withholding/route";
import { POST as customsClearanceAgingPost } from "../src/app/api/ops/customs-clearance-aging/route";
import { GET as storefrontLocalizationGet } from "../src/app/api/storefront/localization/route";
import { OPS_TOKEN_ENV } from "../src/lib/api-auth";

/**
 * Negative authorization and input tests for the operator routes that had no
 * guard at all: the ad-catalog sync writes the live Meta/Google/Pinterest
 * catalogs with the server's own credentials, and the other two serve order
 * records and configured-credential state.
 *
 * These are written to fail on the old handlers. Reverting any single
 * `requireOperator` call turns the matching 401 assertion red, because the
 * unguarded handler answered 200.
 *
 * `/api/credentials/vercel-pull` has its own equivalents in
 * `credentials-route.test.ts`; the guard mechanism itself is covered by
 * `api-auth.test.ts`.
 */

const TOKEN = "s3cr3t-operator-token";
const AUTHORIZED = { authorization: `Bearer ${TOKEN}` };

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved[OPS_TOKEN_ENV] = process.env[OPS_TOKEN_ENV];
  // Set on purpose: with the token unset every route answers 503, which would
  // let a missing guard pass a "not 200" assertion for the wrong reason.
  process.env[OPS_TOKEN_ENV] = TOKEN;
});

afterEach(() => {
  if (saved[OPS_TOKEN_ENV] === undefined) {
    delete process.env[OPS_TOKEN_ENV];
  } else {
    process.env[OPS_TOKEN_ENV] = saved[OPS_TOKEN_ENV];
  }
});

function request(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://printatelier.com${path}`, { headers });
}

// --- authorization -------------------------------------------------------

const unauthenticated: [string, () => Promise<Response>][] = [
  ["GET /api/ad-catalog/sync", () => adCatalogGet(request("/api/ad-catalog/sync"))],
  ["POST /api/ad-catalog/sync", () => adCatalogPost(request("/api/ad-catalog/sync"))],
  ["GET /api/fulfillment/submissions", () => fulfillmentGet(request("/api/fulfillment/submissions"))],
  ["GET /api/fulfillment/health", () => fulfillmentHealthGet(request("/api/fulfillment/health"))],
  ["GET /api/retargeting/events", () => retargetingGet(request("/api/retargeting/events"))],
  ["GET /api/analytics/artist-cohorts", () => artistCohortsGet(request("/api/analytics/artist-cohorts"))],
  ["GET /api/payouts/reconciliation", () => payoutsReconciliationGet(request("/api/payouts/reconciliation"))],
  ["POST /api/payouts/batch-transfer", () => payoutsBatchTransferPost(request("/api/payouts/batch-transfer"))],
  ["GET /api/fulfillment/cost-router", () => fulfillmentCostRouterGet(request("/api/fulfillment/cost-router"))],
  ["GET /api/payouts/tax-withholding", () => payoutsTaxWithholdingGet(request("/api/payouts/tax-withholding"))],
  ["POST /api/ops/customs-clearance-aging", () => customsClearanceAgingPost(request("/api/ops/customs-clearance-aging"))],
];

for (const [name, call] of unauthenticated) {
  test(`${name} refuses an unauthenticated caller`, async () => {
    const response = await call();
    assert.equal(response.status, 401);
  });
}

const wrongToken: [string, () => Promise<Response>][] = [
  [
    "GET /api/ad-catalog/sync",
    () => adCatalogGet(request("/api/ad-catalog/sync", { authorization: "Bearer wrong" })),
  ],
  [
    "POST /api/ad-catalog/sync",
    () => adCatalogPost(request("/api/ad-catalog/sync", { authorization: "Bearer wrong" })),
  ],
  [
    "GET /api/fulfillment/submissions",
    () =>
      fulfillmentGet(request("/api/fulfillment/submissions", { authorization: "Bearer wrong" })),
  ],
  [
    "GET /api/fulfillment/health",
    () =>
      fulfillmentHealthGet(request("/api/fulfillment/health", { authorization: "Bearer wrong" })),
  ],
  [
    "GET /api/retargeting/events",
    () => retargetingGet(request("/api/retargeting/events", { authorization: "Bearer wrong" })),
  ],
  [
    "GET /api/analytics/artist-cohorts",
    () =>
      artistCohortsGet(request("/api/analytics/artist-cohorts", { authorization: "Bearer wrong" })),
  ],
  [
    "GET /api/payouts/reconciliation",
    () =>
      payoutsReconciliationGet(
        request("/api/payouts/reconciliation", { authorization: "Bearer wrong" }),
      ),
  ],
  [
    "POST /api/payouts/batch-transfer",
    () =>
      payoutsBatchTransferPost(
        request("/api/payouts/batch-transfer", { authorization: "Bearer wrong" }),
      ),
  ],
  [
    "GET /api/fulfillment/cost-router",
    () =>
      fulfillmentCostRouterGet(
        request("/api/fulfillment/cost-router", { authorization: "Bearer wrong" }),
      ),
  ],
  [
    "GET /api/payouts/tax-withholding",
    () =>
      payoutsTaxWithholdingGet(
        request("/api/payouts/tax-withholding", { authorization: "Bearer wrong" }),
      ),
  ],
  [
    "POST /api/ops/customs-clearance-aging",
    () =>
      customsClearanceAgingPost(
        request("/api/ops/customs-clearance-aging", { authorization: "Bearer wrong" }),
      ),
  ],
];

for (const [name, call] of wrongToken) {
  test(`${name} refuses a caller presenting the wrong token`, async () => {
    const response = await call();
    assert.equal(response.status, 401);
  });
}

test("an unauthenticated ad-catalog sync leaks no catalog or credential state", async () => {
  const response = await adCatalogGet(request("/api/ad-catalog/sync"));
  const body = (await response.json()) as Record<string, unknown>;
  // The old handler answered with platform readiness and feed contents. The
  // denial must carry neither.
  assert.deepEqual(Object.keys(body).sort(), ["error", "hint"]);
});

test("an unauthenticated fulfillment read returns no order records", async () => {
  const response = await fulfillmentGet(request("/api/fulfillment/submissions"));
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.recentSubmissions, undefined);
  assert.equal(body.totalSubmissions, undefined);
});

test("the routes fail closed when no operator token is configured", async () => {
  delete process.env[OPS_TOKEN_ENV];
  for (const [name, call] of unauthenticated) {
    const response = await call();
    assert.equal(response.status, 503, `${name} should refuse rather than serve`);
  }
});

// --- input ---------------------------------------------------------------

/**
 * `baseUrl` becomes the `link` and `imageLink` of every product pushed to the
 * ad platforms, so a value that is not an origin the business controls is a
 * poisoned catalog. Authorized callers are checked here — an unauthorized one
 * never reaches the parse.
 */
const badBaseUrls = ["not a url", "javascript:alert(1)", "ftp://example.com", "/relative/path", ""];

for (const value of badBaseUrls) {
  test(`GET /api/ad-catalog/sync rejects baseUrl=${JSON.stringify(value)}`, async () => {
    const response = await adCatalogGet(
      request(`/api/ad-catalog/sync?baseUrl=${encodeURIComponent(value)}`, AUTHORIZED),
    );
    assert.equal(response.status, 400);
  });

  test(`POST /api/ad-catalog/sync rejects baseUrl=${JSON.stringify(value)}`, async () => {
    const response = await adCatalogPost(
      request(`/api/ad-catalog/sync?baseUrl=${encodeURIComponent(value)}`, AUTHORIZED),
    );
    assert.equal(response.status, 400);
  });
}

test("a rejected baseUrl is refused before any outbound sync runs", async () => {
  // `live=true` is the branch that would authenticate to Meta, Google and
  // Pinterest. The 400 proves the parse happens first; a handler that validated
  // after the sync would have already written the poisoned catalog.
  const response = await adCatalogGet(
    request("/api/ad-catalog/sync?live=true&baseUrl=not%20a%20url", AUTHORIZED),
  );
  assert.equal(response.status, 400);
});
