import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GET as getArtistCohorts } from "../src/app/api/analytics/artist-cohorts/route";
import {
  GET as getCheckout,
  POST as postCheckout,
  PUT as putCheckout,
} from "../src/app/api/stripe/checkout/route";
import {
  GET as getWebhook,
  POST as postWebhook,
} from "../src/app/api/stripe/webhook/route";
import { OPS_TOKEN_ENV } from "../src/lib/api-auth";

const TEST_TOKEN = "test-operator-key";
let savedToken: string | undefined;

describe("API Route Integration Handlers", () => {
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

  describe("artist-cohorts route", () => {
    it("denies unauthenticated anonymous callers", async () => {
      const req = new Request("http://localhost:3000/api/analytics/artist-cohorts");
      const res = await getArtistCohorts(req);
      assert.equal(res.status, 401);
    });

    it("returns analytics for operator-authenticated requests", async () => {
      const req = new Request("http://localhost:3000/api/analytics/artist-cohorts", {
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      const res = await getArtistCohorts(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(json.analytics);
    });
  });

  describe("stripe checkout route", () => {
    it("denies anonymous GET diagnostic requests", async () => {
      const req = new Request("http://localhost:3000/api/stripe/checkout");
      const res = await getCheckout(req);
      assert.equal(res.status, 401);
    });

    it("returns env status on GET for operator requests", async () => {
      const req = new Request("http://localhost:3000/api/stripe/checkout", {
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      const res = await getCheckout(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.endpoint, "/api/stripe/checkout");
    });

    it("handles POST with empty cart gracefully", async () => {
      const req = new Request("http://localhost:3000/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineItems: [] }),
      });
      const res = await postCheckout(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error, "Cart is empty");
    });

    it("handles POST with invalid JSON", async () => {
      const req = new Request("http://localhost:3000/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "invalid-json",
      });
      const res = await postCheckout(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.error, "Invalid JSON body");
    });

    it("handles PUT cart parsing", async () => {
      const req = new Request("http://localhost:3000/api/stripe/checkout", {
        method: "PUT",
        body: JSON.stringify([{ printSlug: "luminary-veil-canvas-24x36", quantity: 1 }]),
      });
      const res = await putCheckout(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.lineItems));
    });
  });

  describe("stripe webhook route", () => {
    it("denies anonymous GET diagnostic requests", async () => {
      const req = new Request("http://localhost:3000/api/stripe/webhook");
      const res = await getWebhook(req);
      assert.equal(res.status, 401);
    });

    it("returns webhook env status for operator requests", async () => {
      const req = new Request("http://localhost:3000/api/stripe/webhook", {
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      const res = await getWebhook(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.endpoint, "/api/stripe/webhook");
    });

    it("returns 503 on POST when STRIPE_WEBHOOK_SECRET is unconfigured", async () => {
      const req = new Request("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      });
      const res = await postWebhook(req);
      assert.equal(res.status, 503);
      const json = await res.json();
      assert.equal(json.error, "Stripe webhook secret not configured");
    });
  });

  describe("fulfillment cost router route", () => {
    it("denies anonymous callers", async () => {
      const { GET } = await import("../src/app/api/fulfillment/cost-router/route");
      const req = new Request("http://localhost:3000/api/fulfillment/cost-router");
      const res = await GET(req);
      assert.equal(res.status, 401);
    });

    it("evaluates specific slug on GET with operator auth", async () => {
      const { GET } = await import("../src/app/api/fulfillment/cost-router/route");
      const req = new Request("http://localhost:3000/api/fulfillment/cost-router?slug=midnight-coast&region=EU", {
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      const res = await GET(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.decision.selectedProvider, "gelato");
    });

    it("evaluates batch of slugs on POST with operator auth", async () => {
      const { POST } = await import("../src/app/api/fulfillment/cost-router/route");
      const req = new Request("http://localhost:3000/api/fulfillment/cost-router", {
        method: "POST",
        headers: {
          authorization: `Bearer ${TEST_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ slugs: ["midnight-coast", "urban-geometry"], regions: ["US", "EU"] }),
      });
      const res = await POST(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.report.totalOrdersEvaluated, 4);
    });
  });

  describe("payouts tax withholding route", () => {
    it("denies anonymous callers", async () => {
      const { GET } = await import("../src/app/api/payouts/tax-withholding/route");
      const req = new Request("http://localhost:3000/api/payouts/tax-withholding");
      const res = await GET(req);
      assert.equal(res.status, 401);
    });

    it("returns recent tax statements on GET with operator auth", async () => {
      const { GET } = await import("../src/app/api/payouts/tax-withholding/route");
      const req = new Request("http://localhost:3000/api/payouts/tax-withholding", {
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      const res = await GET(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.endpoint, "/api/payouts/tax-withholding");
    });

    it("generates tax statement on POST with operator auth", async () => {
      const { POST } = await import("../src/app/api/payouts/tax-withholding/route");
      const req = new Request("http://localhost:3000/api/payouts/tax-withholding", {
        method: "POST",
        headers: {
          authorization: `Bearer ${TEST_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: {
            artistHandle: "elena_wave",
            legalName: "Elena Rostova",
            email: "elena@example.com",
            taxClassification: "individual",
            tinStatus: "verified",
            usResident: true,
            stateCode: "CA",
          },
          payoutData: {
            taxYear: 2026,
            grossSalesUsd: 2500,
            totalArtistNetPayoutsUsd: 750,
            totalStripeFeesUsd: 72,
            payoutCount: 10,
          },
        }),
      });
      const res = await POST(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.statement.requires1099Nec, true);
    });
  });
});

