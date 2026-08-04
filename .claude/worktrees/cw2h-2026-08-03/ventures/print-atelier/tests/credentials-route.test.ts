import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { GET, POST } from "../src/app/api/credentials/vercel-pull/route";
import { OPS_TOKEN_ENV } from "../src/lib/api-auth";

const TOKEN = "s3cr3t-operator-token";
const LIVE_STRIPE_KEY = "sk_live_51NabcdefghijklmnopWXYZ";
const AUTHORIZED = { authorization: `Bearer ${TOKEN}` };

const TOUCHED_ENV = [OPS_TOKEN_ENV, "STRIPE_SECRET_KEY", "PRINTFUL_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of TOUCHED_ENV) {
    saved[key] = process.env[key];
  }
  process.env[OPS_TOKEN_ENV] = TOKEN;
  process.env.STRIPE_SECRET_KEY = LIVE_STRIPE_KEY;
  process.env.PRINTFUL_API_KEY = "pf_abcdefghij9999";
});

afterEach(() => {
  for (const key of TOUCHED_ENV) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

function request(
  method: "GET" | "POST",
  { headers = {}, body }: { headers?: Record<string, string>; body?: string } = {},
): Request {
  return new Request("https://printatelier.com/api/credentials/vercel-pull", {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body }),
  });
}

// --- authorization -------------------------------------------------------

test("GET refuses an unauthenticated caller", async () => {
  const response = await GET(request("GET"));
  assert.equal(response.status, 401);
});

test("POST refuses an unauthenticated caller", async () => {
  const response = await POST(request("POST", { body: "{}" }));
  assert.equal(response.status, 401);
});

test("POST refuses a caller presenting the wrong token", async () => {
  const response = await POST(
    request("POST", { headers: { authorization: "Bearer not-the-token" }, body: "{}" }),
  );
  assert.equal(response.status, 401);
});

test("both methods fail closed when no operator token is configured", async () => {
  delete process.env[OPS_TOKEN_ENV];
  for (const response of [
    await GET(request("GET", { headers: AUTHORIZED })),
    await POST(request("POST", { headers: AUTHORIZED, body: "{}" })),
  ]) {
    assert.equal(response.status, 503);
  }
});

// --- the disclosure this route existed to leak ---------------------------

test("an unauthenticated response carries no configuration state at all", async () => {
  const response = await GET(request("GET"));
  const text = await response.text();
  assert.ok(!text.includes("sk_live_"), "must not reveal the Stripe key prefix");
  assert.ok(!text.includes("WXYZ"), "must not reveal trailing characters of a live key");
  assert.ok(!text.includes("overallScore"), "must not reveal vault readiness");
});

test("even an authorized response never carries masked secret material", async () => {
  // Regression: the handler returned `vaultSummary` verbatim, and every
  // configured key carried `maskedValue` — for STRIPE_SECRET_KEY that is
  // `sk_live_••••WXYZ`, which confirms live mode and gives up four real
  // characters. Authorization alone does not fix that; redaction does.
  const response = await POST(
    request("POST", { headers: AUTHORIZED, body: JSON.stringify({}) }),
  );
  assert.equal(response.status, 200);

  const text = await response.text();
  assert.ok(!text.includes("maskedValue"), "the mask field must not be serialized");
  assert.ok(!text.includes("sk_live_"), "must not reveal the Stripe key prefix");
  assert.ok(!text.includes("WXYZ"), "must not reveal trailing characters of a live key");
  assert.ok(!text.includes("9999"), "must not reveal trailing characters of the Printful key");

  // The legitimate signal survives: callers still learn what is configured.
  const payload = JSON.parse(text) as {
    vaultSummary: { credentials: { envKeys: { key: string; configured: boolean }[] }[] };
  };
  const stripeKey = payload.vaultSummary.credentials
    .flatMap((credential) => credential.envKeys)
    .find((item) => item.key === "STRIPE_SECRET_KEY");
  assert.equal(stripeKey?.configured, true);
});

// --- input validation ----------------------------------------------------

test("POST rejects a malformed JSON body instead of treating it as empty", async () => {
  const response = await POST(
    request("POST", { headers: AUTHORIZED, body: "{not json" }),
  );
  assert.equal(response.status, 400);
});

test("POST rejects a body that is not a JSON object", async () => {
  for (const body of ["[]", '"a string"', "42", "null"]) {
    const response = await POST(request("POST", { headers: AUTHORIZED, body }));
    assert.equal(response.status, 400, `expected 400 for body ${body}`);
  }
});

test("POST rejects envOverrides that is not an object of strings", async () => {
  for (const envOverrides of [[], "STRIPE_SECRET_KEY=x", 7, { STRIPE_SECRET_KEY: 7 }]) {
    const response = await POST(
      request("POST", { headers: AUTHORIZED, body: JSON.stringify({ envOverrides }) }),
    );
    assert.equal(
      response.status,
      400,
      `expected 400 for envOverrides ${JSON.stringify(envOverrides)}`,
    );
  }
});

test("POST rejects an unknown environment rather than echoing it back", async () => {
  const response = await POST(
    request("POST", {
      headers: AUTHORIZED,
      body: JSON.stringify({ environment: "prod-ish" }),
    }),
  );
  assert.equal(response.status, 400);
});

test("POST accepts a well-formed override and reports what it synced", async () => {
  const response = await POST(
    request("POST", {
      headers: AUTHORIZED,
      body: JSON.stringify({
        envOverrides: { GELATO_API_KEY: "gel_test_key" },
        environment: "preview",
      }),
    }),
  );
  assert.equal(response.status, 200);

  const payload = (await response.json()) as {
    pulledCount: number;
    environment: string;
    syncedKeys: string[];
  };
  assert.equal(payload.pulledCount, 1);
  assert.equal(payload.environment, "preview");
  assert.deepEqual(payload.syncedKeys, ["GELATO_API_KEY"]);
});
