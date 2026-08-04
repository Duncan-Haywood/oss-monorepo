import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/storefront/localization/route.ts";
import { OPS_TOKEN_ENV } from "../src/lib/api-auth.ts";

process.env[OPS_TOKEN_ENV] = process.env[OPS_TOKEN_ENV] || "test-operator-token-loc";

test("GET /api/storefront/localization returns localized widget state", async () => {
  const savedToken = process.env[OPS_TOKEN_ENV];
  const TEST_TOKEN = savedToken || "test-operator-token-loc";
  process.env[OPS_TOKEN_ENV] = TEST_TOKEN;

  try {
    const req = new Request("http://localhost/api/storefront/localization?country=DE&amount=10000", {
      headers: {
        "accept-language": "de-DE,de;q=0.9",
        authorization: `Bearer ${TEST_TOKEN}`,
      },
    });

    const res = await GET(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.countryCode, "DE");
    assert.equal(data.currency, "EUR");
    assert.equal(data.vatInclusive, true);
    assert.ok(data.priceDisplay.includes("€"));
  } finally {
    if (savedToken === undefined) {
      delete process.env[OPS_TOKEN_ENV];
    } else {
      process.env[OPS_TOKEN_ENV] = savedToken;
    }
  }
});
