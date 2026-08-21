import { describe, expect, it } from "vitest";
import { getLeadBySlug, recordLeadPayment, upsertLead } from "./db";
import type { Lead } from "./leads/types";

/**
 * Exercises the SQLite fallback path directly (NEXT_PUBLIC_CONVEX_URL is
 * unset in this test environment, so db.ts never constructs a Convex
 * client and every call here goes straight to local.db).
 */
function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: `db-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    businessName: "Test Fixture Co",
    category: "generic",
    city: "Boulder",
    state: "CO",
    tagline: "Test fixture",
    description: "Test fixture lead for db.test.ts",
    phone: "(303) 555-0100",
    services: ["Test service"],
    hours: { weekday: "Mon-Fri 9-5", weekend: "Closed" },
    stage: "discovery_call",
    recommendedTier: "growth",
    dataSource: "manual_entry",
    ...overrides,
  };
}

describe("recordLeadPayment SQLite fallback stage transition", () => {
  it("advances a pre-payment lead to stage 'paid'", async () => {
    const lead = baseLead({ stage: "discovery_call" });
    await upsertLead(lead);

    const result = await recordLeadPayment({
      slug: lead.slug,
      stripeSessionId: `cs_test_${lead.slug}_1`,
      customerEmail: "owner@example.com",
      tier: "growth",
      commerceAddon: false,
      amountTotal: 300,
    });

    expect(result).toEqual({ alreadyRecorded: false });
    const updated = await getLeadBySlug(lead.slug);
    expect(updated?.stage).toBe("paid");
  });

  it("does not regress an already-live lead back to 'paid' on a second (upsell) payment", async () => {
    const lead = baseLead({ stage: "live" });
    await upsertLead(lead);

    // A Starter -> Growth upsell reuses the same slug but a brand-new Stripe
    // Checkout Session id, so the stripeSessionId idempotency check does not
    // short-circuit it.
    const result = await recordLeadPayment({
      slug: lead.slug,
      stripeSessionId: `cs_test_${lead.slug}_upsell`,
      customerEmail: "owner@example.com",
      tier: "complete",
      commerceAddon: false,
      amountTotal: 500,
    });

    expect(result).toEqual({ alreadyRecorded: false });
    const updated = await getLeadBySlug(lead.slug);
    expect(updated?.stage).toBe("live");
  });

  it("still no-ops a redelivered webhook for an already-recorded stripeSessionId", async () => {
    const lead = baseLead({ stage: "live" });
    await upsertLead(lead);
    const stripeSessionId = `cs_test_${lead.slug}_dup`;

    const first = await recordLeadPayment({
      slug: lead.slug,
      stripeSessionId,
      customerEmail: "owner@example.com",
      tier: "growth",
      commerceAddon: false,
      amountTotal: 300,
    });
    expect(first).toEqual({ alreadyRecorded: false });

    const redelivered = await recordLeadPayment({
      slug: lead.slug,
      stripeSessionId,
      customerEmail: "owner@example.com",
      tier: "growth",
      commerceAddon: false,
      amountTotal: 300,
    });
    expect(redelivered).toEqual({ alreadyRecorded: true });
  });
});
