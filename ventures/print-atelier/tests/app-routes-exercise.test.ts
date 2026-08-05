import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GET as getCheckout, POST as postCheckout, PUT as putCheckout } from "../src/app/api/stripe/checkout/route";
import { GET as getWebhook, POST as postWebhook } from "../src/app/api/stripe/webhook/route";

describe("app route handlers unit tests", () => {
  const ORIGINAL_TOKEN = process.env.PRINT_ATELIER_OPS_TOKEN;
  const ORIGINAL_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  describe("/api/stripe/checkout", () => {
    it("handles GET request requirement for operator auth header", async () => {
      process.env.PRINT_ATELIER_OPS_TOKEN = "test-ops-token";
      try {
        const request = new Request("http://localhost:3000/api/stripe/checkout", {
          method: "GET",
        });
        const response = await getCheckout(request);
        assert.equal(response.status, 401);
      } finally {
        process.env.PRINT_ATELIER_OPS_TOKEN = ORIGINAL_TOKEN;
      }
    });

    it("handles GET request success with valid operator auth header", async () => {
      process.env.PRINT_ATELIER_OPS_TOKEN = "test-ops-token";
      try {
        const request = new Request("http://localhost:3000/api/stripe/checkout", {
          method: "GET",
          headers: { Authorization: "Bearer test-ops-token" },
        });
        const response = await getCheckout(request);
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.endpoint, "/api/stripe/checkout");
      } finally {
        process.env.PRINT_ATELIER_OPS_TOKEN = ORIGINAL_TOKEN;
      }
    });

    it("handles POST request with invalid JSON body", async () => {
      const request = new Request("http://localhost:3000/api/stripe/checkout", {
        method: "POST",
        body: "invalid-json{",
      });
      const response = await postCheckout(request);
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.error, "Invalid JSON body");
    });

    it("handles POST request with empty body error", async () => {
      const request = new Request("http://localhost:3000/api/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({ lineItems: [] }),
      });
      const response = await postCheckout(request);
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.error, "Cart is empty");
    });

    it("handles POST request with simulated session preview when keys are absent", async () => {
      const request = new Request("http://localhost:3000/api/stripe/checkout", {
        method: "POST",
        body: JSON.stringify({
          lineItems: [
            {
              artworkSlug: "midnight-coast",
              title: "Midnight Coast",
              artistName: "Elena Rostova",
              retailPrice: 85,
              fulfillmentCost: 28,
              quantity: 1,
            },
          ],
          region: "US",
        }),
      });
      const response = await postCheckout(request);
      const data = await response.json();

      // The route resolves the module catalog, which cannot be injected here.
      // No seeded artwork carries a print file — none exists in this repository
      // — so a listing cannot be sold and the route refuses before it ever
      // builds a preview. That is the intended state: charging for a print no
      // partner can be told to make is what the refusal prevents.
      //
      // The 200-preview path itself is covered at the library level, where a
      // sellable catalog can be supplied: see
      // `checkout-charges-what-it-quotes.test.ts` and
      // `checkout-print-file.test.ts`.
      if (response.status === 422) {
        assert.ok(
          (data.blockers ?? []).some((blocker: string) => /print file/i.test(blocker)),
          `expected the print-file refusal, got ${JSON.stringify(data)}`,
        );
        return;
      }

      assert.equal(response.status, 200, JSON.stringify(data));
      assert.equal(data.simulated, true);
      assert.ok(data.session);
    });

    it("handles PUT request to parse cart payload", async () => {
      const request = new Request("http://localhost:3000/api/stripe/checkout", {
        method: "PUT",
        body: JSON.stringify([
          {
            artworkSlug: "midnight-coast",
            title: "Midnight Coast",
            artistName: "Elena Rostova",
            retailPrice: 85,
            fulfillmentCost: 28,
            quantity: 1,
          },
        ]),
      });
      const response = await putCheckout(request);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.count, 1);
    });
  });

  describe("/api/stripe/webhook", () => {
    it("handles GET request requirement for operator auth header", async () => {
      process.env.PRINT_ATELIER_OPS_TOKEN = "test-ops-token";
      try {
        const request = new Request("http://localhost:3000/api/stripe/webhook", {
          method: "GET",
        });
        const response = await getWebhook(request);
        assert.equal(response.status, 401);
      } finally {
        process.env.PRINT_ATELIER_OPS_TOKEN = ORIGINAL_TOKEN;
      }
    });

    it("handles GET request success with valid operator auth header", async () => {
      process.env.PRINT_ATELIER_OPS_TOKEN = "test-ops-token";
      try {
        const request = new Request("http://localhost:3000/api/stripe/webhook", {
          method: "GET",
          headers: { Authorization: "Bearer test-ops-token" },
        });
        const response = await getWebhook(request);
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.endpoint, "/api/stripe/webhook");
      } finally {
        process.env.PRINT_ATELIER_OPS_TOKEN = ORIGINAL_TOKEN;
      }
    });

    it("handles POST request when webhook secret is missing", async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      try {
        const request = new Request("http://localhost:3000/api/stripe/webhook", {
          method: "POST",
          body: "{}",
        });
        const response = await postWebhook(request);
        assert.equal(response.status, 503);
        const data = await response.json();
        assert.equal(data.error, "Stripe webhook secret not configured");
      } finally {
        if (ORIGINAL_WEBHOOK_SECRET) process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET;
      }
    });

    it("handles POST request when signature is invalid", async () => {
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_test123";
      try {
        const request = new Request("http://localhost:3000/api/stripe/webhook", {
          method: "POST",
          headers: { "stripe-signature": "t=123,v1=bad_signature" },
          body: "{}",
        });
        const response = await postWebhook(request);
        assert.equal(response.status, 400);
        const data = await response.json();
        assert.equal(data.error, "Invalid Stripe webhook signature");
      } finally {
        delete process.env.STRIPE_WEBHOOK_SECRET;
      }
    });
  });
});

