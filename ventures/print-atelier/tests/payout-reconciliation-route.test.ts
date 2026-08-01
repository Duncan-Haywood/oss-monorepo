import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { GET } from "../src/app/api/payouts/reconciliation/route";
import { OPS_TOKEN_ENV } from "../src/lib/api-auth";

/**
 * `src/lib/payout-reconciliation.ts` is covered by `payout-reconciliation.test.ts`,
 * but nothing exercised the route that publishes it. The route was an
 * unauthenticated `GET` returning per-artist amounts owed, Stripe-paid totals,
 * the variance between them, and Connect account attribution.
 *
 * These tests hold the authorization decision at the route layer, where the
 * status code actually lives.
 */

const TOKEN = "s3cr3t-operator-token";
const AUTHORIZED = { authorization: `Bearer ${TOKEN}` };

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved[OPS_TOKEN_ENV] = process.env[OPS_TOKEN_ENV];
  process.env[OPS_TOKEN_ENV] = TOKEN;
});

afterEach(() => {
  if (saved[OPS_TOKEN_ENV] === undefined) {
    delete process.env[OPS_TOKEN_ENV];
  } else {
    process.env[OPS_TOKEN_ENV] = saved[OPS_TOKEN_ENV];
  }
});

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://printatelier.com/api/payouts/reconciliation", {
    method: "GET",
    headers,
  });
}

// --- authorization -------------------------------------------------------

test("refuses an unauthenticated caller", async () => {
  const response = await GET(request());
  assert.equal(response.status, 401);
});

test("refuses a caller presenting the wrong token", async () => {
  const response = await GET(request({ authorization: `Bearer ${TOKEN}-wrong` }));
  assert.equal(response.status, 401);
});

test("refuses a malformed Authorization header", async () => {
  for (const authorization of ["", "Bearer", "Basic " + TOKEN, TOKEN, `Bearer  ${TOKEN} extra`]) {
    const response = await GET(request({ authorization }));
    assert.equal(response.status, 401, `expected 401 for header ${JSON.stringify(authorization)}`);
  }
});

test("fails closed when no operator token is configured", async () => {
  delete process.env[OPS_TOKEN_ENV];
  // A correct-looking credential must not be enough when the server has nothing
  // to compare it against; an unset token denies rather than opens the route.
  const response = await GET(request(AUTHORIZED));
  assert.equal(response.status, 503);
});

// --- the disclosure this route existed to leak ---------------------------

test("an unauthorized response carries no reconciliation data at all", async () => {
  const response = await GET(request());
  const text = await response.text();

  for (const field of [
    "report",
    "attributionGap",
    "ordersConsidered",
    "skippedOrders",
    "expected",
    "variance",
  ]) {
    assert.ok(!text.includes(field), `must not disclose \`${field}\` to an anonymous caller`);
  }
});

// --- the legitimate signal still works -----------------------------------

test("serves the reconciliation to an authorized operator", async () => {
  const response = await GET(request(AUTHORIZED));
  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    report: unknown;
    attributionGap: { ordersConsidered: number; skippedOrders: unknown[] };
  };
  assert.ok(payload.report, "an authorized caller still receives the report");
  assert.equal(typeof payload.attributionGap.ordersConsidered, "number");
  assert.ok(Array.isArray(payload.attributionGap.skippedOrders));
});
