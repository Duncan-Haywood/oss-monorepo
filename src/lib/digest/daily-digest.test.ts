import { describe, expect, it } from "vitest";
import type { ClientInquiry } from "../inquiries/types";
import type { CheckoutSessionRecord } from "../checkout/types";
import type { Lead } from "../leads/types";
import { buildDailyDigest, formatSnoozeRemainingHours, renderDailyDigestHtml } from "./daily-digest";

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
    expect(digest.marketingPacksDue).toHaveLength(0);
    expect(digest.starterUpsellCandidates).toHaveLength(0);
    expect(digest.commerceCatalogsMissing).toHaveLength(0);
    expect(digest.clientVoicePacksDue).toHaveLength(0);
    expect(digest.snoozedLeadCount).toBe(0);
    expect(digest.soonestSnoozeRemainingHours).toBeNull();
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

  it("counts currently-snoozed leads and soonest remaining hours without making isEmpty false", () => {
    const snoozedSoon = baseLead({
      slug: "snoozed-soon",
      snoozedUntil: "2026-07-12T15:00:00.000Z", // 3h after NOW
    });
    const snoozedLater = baseLead({
      slug: "snoozed-later",
      snoozedUntil: "2026-07-14T12:00:00.000Z", // 2d later
    });
    const expiredSnooze = baseLead({
      slug: "expired-snooze",
      stage: "closed",
      snoozedUntil: "2026-07-12T11:00:00.000Z",
    });
    const digest = buildDailyDigest({
      leads: [snoozedSoon, snoozedLater, expiredSnooze],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    // Expired does not count; active snoozes are footnotes only (Work next
    // excludes them via actionable=false), so isEmpty stays true.
    expect(digest.snoozedLeadCount).toBe(2);
    expect(digest.soonestSnoozeRemainingHours).toBe(3);
    expect(digest.workNext).toHaveLength(0);
    expect(digest.isEmpty).toBe(true);
  });

  it("lists Growth/Complete leads missing this month's marketing pack", () => {
    const needsPack = baseLead({
      slug: "needs-pack",
      businessName: "Needs Pack Cafe",
      stage: "paid",
    });
    const hasPack = baseLead({
      slug: "has-pack",
      businessName: "Has Pack Salon",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [needsPack, hasPack],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        { leadSlug: "needs-pack", tier: "growth", commerceAddon: false },
        { leadSlug: "has-pack", tier: "complete", commerceAddon: false },
      ],
      marketingPacksThisMonth: [{ leadSlug: "has-pack", yearMonth: "2026-07" }],
      nowMs: NOW,
    });
    expect(digest.marketingPacksDue).toHaveLength(1);
    expect(digest.marketingPacksDue[0]?.businessName).toBe("Needs Pack Cafe");
    expect(digest.marketingPacksDue[0]?.yearMonth).toBe("2026-07");
    expect(digest.isEmpty).toBe(false);
  });

  it("lists Starter → MRR upsell candidates", () => {
    const starter = baseLead({
      slug: "starter-paid",
      businessName: "Starter Shop",
      stage: "paid",
      recommendedTier: "complete",
    });
    const digest = buildDailyDigest({
      leads: [starter],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [{ leadSlug: "starter-paid", tier: "starter", commerceAddon: false }],
      nowMs: NOW,
    });
    expect(digest.starterUpsellCandidates).toHaveLength(1);
    expect(digest.starterUpsellCandidates[0]?.targetTier).toBe("complete");
    expect(digest.isEmpty).toBe(false);
  });

  it("lists paid Commerce add-on leads missing a catalog", () => {
    const needsCatalog = baseLead({
      slug: "needs-catalog",
      businessName: "Needs Catalog Retail",
      stage: "paid",
    });
    const hasCatalog = baseLead({
      slug: "has-catalog",
      businessName: "Has Catalog Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [needsCatalog, hasCatalog],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        { leadSlug: "needs-catalog", tier: "starter", commerceAddon: true },
        { leadSlug: "has-catalog", tier: "growth", commerceAddon: true },
      ],
      commerceCatalogs: [{ leadSlug: "has-catalog" }],
      nowMs: NOW,
    });
    expect(digest.commerceCatalogsMissing).toHaveLength(1);
    expect(digest.commerceCatalogsMissing[0]?.businessName).toBe("Needs Catalog Retail");
    expect(digest.isEmpty).toBe(false);
  });

  it("lists Complete leads missing a client voice FAQ pack", () => {
    const needsVoice = baseLead({
      slug: "needs-voice",
      businessName: "Needs Voice Spa",
      stage: "paid",
    });
    const hasVoice = baseLead({
      slug: "has-voice",
      businessName: "Has Voice Salon",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [needsVoice, hasVoice],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        { leadSlug: "needs-voice", tier: "complete", commerceAddon: false },
        { leadSlug: "has-voice", tier: "complete", commerceAddon: false },
      ],
      clientVoicePacks: [{ leadSlug: "has-voice" }],
      nowMs: NOW,
    });
    expect(digest.clientVoicePacksDue).toHaveLength(1);
    expect(digest.clientVoicePacksDue[0]?.businessName).toBe("Needs Voice Spa");
    expect(digest.isEmpty).toBe(false);
  });
});

describe("formatSnoozeRemainingHours", () => {
  it("formats hours and multi-day remaining", () => {
    expect(formatSnoozeRemainingHours(null)).toBe("");
    expect(formatSnoozeRemainingHours(3)).toBe("3h");
    expect(formatSnoozeRemainingHours(24)).toBe("1d");
    expect(formatSnoozeRemainingHours(30)).toBe("1d 6h");
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

  it("mentions snoozed leads as a footnote even when the digest is otherwise empty", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "parked",
          snoozedUntil: "2026-07-13T12:00:00.000Z",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Nothing urgent today");
    expect(html).toContain("currently snoozed off Work next");
    expect(html).toContain("soonest returns in");
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

  it("renders marketing pack due, starter upsell, commerce catalog, and Complete voice pack sections", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "pack-due",
          businessName: "Pack Due Cafe",
          stage: "paid",
        }),
        baseLead({
          slug: "upsell-me",
          businessName: "Upsell Me LLC",
          stage: "live",
          recommendedTier: "growth",
        }),
        baseLead({
          slug: "commerce-due",
          businessName: "Commerce Due Shop",
          stage: "paid",
        }),
        baseLead({
          slug: "voice-due",
          businessName: "Voice Due Barbers",
          stage: "paid",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        { leadSlug: "pack-due", tier: "growth", commerceAddon: false },
        { leadSlug: "upsell-me", tier: "starter", commerceAddon: false },
        { leadSlug: "commerce-due", tier: "starter", commerceAddon: true },
        { leadSlug: "voice-due", tier: "complete", commerceAddon: false },
      ],
      marketingPacksThisMonth: [],
      commerceCatalogs: [],
      clientVoicePacks: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Marketing packs due");
    expect(html).toContain("2026-07 pack not generated");
    expect(html).toContain("Starter → MRR upsell");
    expect(html).toContain("suggest growth upsell");
    expect(html).toContain("Commerce catalogs missing");
    expect(html).toContain("Commerce catalog not created");
    expect(html).toContain("Complete voice packs due");
    expect(html).toContain("Complete voice FAQ pack not generated");
  });
});
