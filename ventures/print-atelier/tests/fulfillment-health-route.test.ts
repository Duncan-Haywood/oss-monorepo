import assert from "node:assert/strict";
import { test } from "node:test";

import { GET } from "../src/app/api/fulfillment/health/route.ts";

test("GET /api/fulfillment/health returns 503 when ops token is not set", async () => {
  delete process.env.PRINT_ATELIER_OPS_TOKEN;
  const req = new Request("http://localhost:3000/api/fulfillment/health", {
    headers: {},
  });
  const res = await GET(req);
  assert.equal(res.status, 503);
});

test("GET /api/fulfillment/health blocks unauthorized requests when token set", async () => {
  process.env.PRINT_ATELIER_OPS_TOKEN = "ops-test-secret-123";
  try {
    const req = new Request("http://localhost:3000/api/fulfillment/health", {
      headers: {},
    });
    const res = await GET(req);
    assert.equal(res.status, 401);
  } finally {
    delete process.env.PRINT_ATELIER_OPS_TOKEN;
  }
});

test("GET /api/fulfillment/health returns SKU sync status for authorized operators", async () => {
  process.env.PRINT_ATELIER_OPS_TOKEN = "ops-test-secret-123";
  try {
    const req = new Request("http://localhost:3000/api/fulfillment/health", {
      headers: {
        authorization: "Bearer ops-test-secret-123",
      },
    });
    const res = await GET(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.health);
    assert.equal(typeof data.health.syncStatus, "string");
    assert.ok(Array.isArray(data.health.activePartnersReady));
  } finally {
    delete process.env.PRINT_ATELIER_OPS_TOKEN;
  }
});
