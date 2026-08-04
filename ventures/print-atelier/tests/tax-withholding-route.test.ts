import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/payouts/tax-withholding/route";
import { OPS_TOKEN_ENV } from "../src/lib/api-auth";

describe("GET /api/payouts/tax-withholding", () => {
  const TEST_TOKEN = "tax-secret-test-token-456";
  let savedToken: string | undefined;

  beforeEach(() => {
    savedToken = process.env[OPS_TOKEN_ENV];
    process.env[OPS_TOKEN_ENV] = TEST_TOKEN;
  });

  afterEach(() => {
    if (savedToken === undefined) {
      delete process.env[OPS_TOKEN_ENV];
    } else {
      process.env[OPS_TOKEN_ENV] = savedToken;
    }
  });

  it("denies requests without valid operator token", async () => {
    const request = new Request("http://localhost/api/payouts/tax-withholding");
    const res = await GET(request);
    assert.equal(res.status, 401);
  });

  it("returns batch tax report when authorized", async () => {
    const request = new Request("http://localhost/api/payouts/tax-withholding?year=2026", {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const res = await GET(request);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.taxYear, 2026);
    assert.ok(data.batchReport.totalArtistsProcessed > 0);
    assert.ok(data.batchReport.total1099NecEligibleCount >= 0);
  });
});
