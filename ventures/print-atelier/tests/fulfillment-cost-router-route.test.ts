import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/fulfillment/cost-router/route";
import { OPS_TOKEN_ENV } from "../src/lib/api-auth";

describe("GET /api/fulfillment/cost-router", () => {
  const TEST_TOKEN = "router-secret-test-token-123";
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
    const request = new Request("http://localhost/api/fulfillment/cost-router");
    const res = await GET(request);
    assert.equal(res.status, 401);
  });

  it("returns batch report and routing decision when authorized", async () => {
    const request = new Request("http://localhost/api/fulfillment/cost-router?slug=midnight-coast&region=EU", {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    const res = await GET(request);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.singleDecision.selectedProvider, "gelato");
    assert.ok(data.batchReport.totalOrdersEvaluated > 0);
  });
});
