import { describe, expect, it } from "vitest";
import type { ClientInquiry } from "../inquiries/types";
import type { CheckoutSessionRecord } from "../checkout/types";
import type { Lead } from "../leads/types";
import { buildDailyDigest, renderDailyDigestHtml } from "./daily-digest";

const NOW = Date.parse("2026-07-12T12:00:00.000Z");

function baseLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "test-lead",
    businessName: "Test Lead",
    category: "restaurant",
    city: "Denver",
    state: "CO",
    address: "100 Main St",
    tagline: "Test",
    description: "Test description",
    phone: "(303) 555-0100",
    email: "owner@example.com",
    services: ["Service"],
    hours: { weekday: "Mon–Fri 9–5", weekend: "Closed" },
    stage: "site_built",
    recommendedTier: "growth",
    dataSource: "manual_entry",
    outreachStep: 0,
    ...overrides,
  };
}

function baseInquiry(overrides: Partial<ClientInquiry> = {}): ClientInquiry {
  return {
    id: "inq_1",
    leadSlug: "test-lead",
    businessName: "Test Lead",
    message: "Do you have availability this weekend?",
    status: "new",
    createdAt: "2026-07-12T08:00:00.000Z",
    updatedAt: "2026-07-12T08:00:00.000Z",
    ...overrides,
  };
}

function baseCheckoutSession(
  overrides: Partial<CheckoutSessionRecord> = {},
): CheckoutSessionRecord {
  return {
    stripeSessionId: "cs_test_abandoned",
    leadSlug: "test-lead",
    tier: "starter",
    commerceAddon: false,
    customerEmail: "owner@example.com",
    status: "open",
    // 3h before NOW → abandoned under the 2h threshold
    createdAt: "2026-07-12T09:00:00.000Z",
    ...overrides,
  };
}

describe("buildDailyDigest", () => {
  it("is empty when there is nothing actionable", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.isEmpty).toBe(true);
    expect(digest.workNext).toHaveLength(0);
    expect(digest.followUpsDue).toHaveLength(0);
    expect(digest.checkoutRecoveriesDue).toHaveLength(0);
    expect(digest.unrepliedInquiries).toHaveLength(0);
  });

  it("surfaces a ready-to-outreach lead in workNext", () => {
    const digest = buildDailyDigest({
      leads: [baseLead()],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.isEmpty).toBe(false);
    expect(digest.workNext).toHaveLength(1);
    expect(digest.workNext[0].businessName).toBe("Test Lead");
  });

  it("lists a lead due for follow-up", () => {
    const lead = baseLead({
      stage: "outreach_sent",
      outreachStep: 1,
      lastOutreachAt: "2026-07-01T00:00:00.000Z",
    });
    const digest = buildDailyDigest({
      leads: [lead],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.followUpsDue).toHaveLength(1);
    expect(digest.followUpsDue[0].outreachStep).toBe(1);
  });

  it("lists an abandoned checkout session due for recovery", () => {
    const digest = buildDailyDigest({
      leads: [baseLead()],
      inquiries: [],
      openCheckoutSessions: [baseCheckoutSession()],
      nowMs: NOW,
    });
    expect(digest.checkoutRecoveriesDue).toHaveLength(1);
    expect(digest.checkoutRecoveriesDue[0].businessName).toBe("Test Lead");
  });

  it("does not list a checkout session under the abandoned threshold", () => {
    const digest = buildDailyDigest({
      leads: [baseLead()],
      inquiries: [],
      openCheckoutSessions: [
        baseCheckoutSession({ createdAt: "2026-07-12T11:30:00.000Z" }),
      ],
      nowMs: NOW,
    });
    expect(digest.checkoutRecoveriesDue).toHaveLength(0);
  });

  it("lists unreplied inquiries (new and read) but not replied/archived", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [
        baseInquiry({ id: "inq_new", status: "new" }),
        baseInquiry({ id: "inq_read", status: "read" }),
        baseInquiry({ id: "inq_replied", status: "replied" }),
        baseInquiry({ id: "inq_archived", status: "archived" }),
      ],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.unrepliedInquiries.map((i) => i.id).sort()).toEqual([
      "inq_new",
      "inq_read",
    ]);
  });

  it("truncates a long inquiry message", () => {
    const longMessage = "a".repeat(200);
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [baseInquiry({ message: longMessage })],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.unrepliedInquiries[0].messagePreview.length).toBeLessThan(200);
    expect(digest.unrepliedInquiries[0].messagePreview.endsWith("…")).toBe(true);
  });

  it("counts cold leads without including them in workNext limits", () => {
    const coldLead = baseLead({
      slug: "cold-lead",
      stage: "outreach_sent",
      outreachStep: 3,
      lastOutreachAt: "2026-06-01T00:00:00.000Z",
    });
    const digest = buildDailyDigest({
      leads: [coldLead],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.coldLeadCount).toBe(1);
  });
});

describe("renderDailyDigestHtml", () => {
  it("renders an empty-state message when there is nothing to act on", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Nothing urgent today");
  });

  it("escapes business names and lists sections when there is work to do", () => {
    const digest = buildDailyDigest({
      leads: [baseLead({ businessName: "<Script>Bakery" })],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Work next");
    expect(html).not.toContain("<Script>Bakery");
    expect(html).toContain("&lt;Script&gt;Bakery");
    expect(html).toContain("https://example.com/dashboard/leads");
  });
});
