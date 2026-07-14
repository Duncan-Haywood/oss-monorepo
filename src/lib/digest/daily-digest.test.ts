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
    expect(digest.commerceCheckoutRecoveriesDue).toHaveLength(0);
    expect(digest.unrepliedInquiries).toHaveLength(0);
    expect(digest.marketingPacksDue).toHaveLength(0);
    expect(digest.starterUpsellCandidates).toHaveLength(0);
    expect(digest.commerceCatalogsMissing).toHaveLength(0);
    expect(digest.commerceCatalogsUnsynced).toHaveLength(0);
    expect(digest.clientVoicePacksDue).toHaveLength(0);
    expect(digest.commercePayoutsOwed).toHaveLength(0);
    expect(digest.openHandoffs).toHaveLength(0);
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
    expect(digest.commerceCheckoutRecoveriesDue).toHaveLength(0);
  });

  it("lists abandoned commerce Buy now separately from bundle recoveries", () => {
    const digest = buildDailyDigest({
      leads: [baseLead()],
      inquiries: [],
      openCheckoutSessions: [
        baseCheckoutSession(),
        baseCheckoutSession({
          stripeSessionId: "cs_commerce",
          kind: "commerce_sku",
          skuId: "sku_latte",
          tier: "",
        }),
      ],
      nowMs: NOW,
    });
    expect(digest.checkoutRecoveriesDue).toHaveLength(1);
    expect(digest.commerceCheckoutRecoveriesDue).toHaveLength(1);
    expect(digest.commerceCheckoutRecoveriesDue[0].skuId).toBe("sku_latte");
    expect(digest.isEmpty).toBe(false);
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

  it("a newest-N inquiries page hides an older unreplied inquiry that the uncapped set catches", () => {
    // Callers must feed buildDailyDigest from listUnrepliedInquiries()
    // (uncapped status new+read), not a capped newest-N page of every status —
    // a capped page can drop an older unreplied inquiry past the window.
    const oldUnreplied = baseInquiry({
      id: "inq_old_unreplied",
      status: "new",
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    const newerReplied = Array.from({ length: 3 }, (_, i) =>
      baseInquiry({
        id: `inq_replied_${i}`,
        status: "replied",
        createdAt: `2026-07-1${i}T00:00:00.000Z`,
      }),
    );
    const fullSet = [oldUnreplied, ...newerReplied];
    const truncatedToNewestTwo = [...fullSet]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 2);

    const fromFullSet = buildDailyDigest({
      leads: [],
      inquiries: fullSet,
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const fromTruncatedPage = buildDailyDigest({
      leads: [],
      inquiries: truncatedToNewestTwo,
      openCheckoutSessions: [],
      nowMs: NOW,
    });

    expect(fromFullSet.unrepliedInquiries.map((i) => i.id)).toEqual(["inq_old_unreplied"]);
    expect(fromTruncatedPage.unrepliedInquiries).toHaveLength(0);
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

  it("lists saved Commerce catalogs that still need Sync to Stripe", () => {
    const unsynced = baseLead({
      slug: "unsynced-shop",
      businessName: "Unsynced Boutique",
      stage: "paid",
    });
    const synced = baseLead({
      slug: "synced-shop",
      businessName: "Synced Market",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [unsynced, synced],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        { leadSlug: "unsynced-shop", tier: "starter", commerceAddon: true },
        { leadSlug: "synced-shop", tier: "growth", commerceAddon: true },
      ],
      commerceCatalogs: [
        {
          leadSlug: "unsynced-shop",
          items: [{ id: "a", priceCents: 100 }],
        },
        {
          leadSlug: "synced-shop",
          items: [{ id: "b", priceCents: 200, stripePriceId: "price_b" }],
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commerceCatalogsMissing).toHaveLength(0);
    expect(digest.commerceCatalogsUnsynced).toHaveLength(1);
    expect(digest.commerceCatalogsUnsynced[0]?.businessName).toBe("Unsynced Boutique");
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

  it("lists Commerce payouts owed from pass-through Buy now orders", () => {
    const cafe = baseLead({
      slug: "owed-cafe",
      businessName: "Owed Cafe",
      stage: "live",
    });
    const salon = baseLead({
      slug: "owed-salon",
      businessName: "Owed Salon",
      stage: "paid",
    });
    const digest = buildDailyDigest({
      leads: [cafe, salon],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrders: [
        {
          id: "co_1",
          leadSlug: "owed-cafe",
          skuId: "sku_latte",
          skuName: "Latte",
          amountPaidUsd: 12.5,
          stripeSessionId: "cs_1",
          createdAt: "2026-07-12T10:00:00.000Z",
        },
        {
          id: "co_2",
          leadSlug: "owed-cafe",
          skuId: "sku_muffin",
          skuName: "Muffin",
          amountPaidUsd: 4.0,
          stripeSessionId: "cs_2",
          createdAt: "2026-07-12T11:00:00.000Z",
        },
        {
          id: "co_3",
          leadSlug: "owed-salon",
          skuId: "sku_deposit",
          skuName: "Deposit",
          amountPaidUsd: 50,
          stripeSessionId: "cs_3",
          createdAt: "2026-07-11T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commercePayoutsOwed).toHaveLength(2);
    expect(digest.commercePayoutsOwed[0]?.businessName).toBe("Owed Salon");
    expect(digest.commercePayoutsOwed[0]?.totalUsd).toBe(50);
    expect(digest.commercePayoutsOwed[1]?.businessName).toBe("Owed Cafe");
    expect(digest.commercePayoutsOwed[1]?.totalUsd).toBe(16.5);
    expect(digest.commercePayoutsOwed[1]?.orderCount).toBe(2);
    expect(digest.commercePayoutsOwedTotalUsd).toBe(66.5);
    expect(digest.isEmpty).toBe(false);
  });

  it("excludes commerce orders already marked paid out", () => {
    const cafe = baseLead({
      slug: "settled-cafe",
      businessName: "Settled Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [cafe],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrders: [
        {
          id: "co_1",
          leadSlug: "settled-cafe",
          skuId: "sku_latte",
          skuName: "Latte",
          amountPaidUsd: 12.5,
          stripeSessionId: "cs_1",
          createdAt: "2026-07-12T10:00:00.000Z",
          paidOutAt: "2026-07-12T11:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commercePayoutsOwed).toHaveLength(0);
    expect(digest.commercePayoutsOwedTotalUsd).toBe(0);
  });

  it("lists open production handoffs (status !== live) oldest-first and skips live", () => {
    const cafe = baseLead({
      slug: "awaiting-cafe",
      businessName: "Awaiting Cafe",
      stage: "paid",
    });
    const salon = baseLead({
      slug: "live-salon",
      businessName: "Live Salon",
      stage: "live",
    });
    const trades = baseLead({
      slug: "provisioned-trades",
      businessName: "Provisioned Trades",
      stage: "paid",
    });
    const digest = buildDailyDigest({
      leads: [cafe, salon, trades],
      inquiries: [],
      openCheckoutSessions: [],
      handoffs: [
        {
          id: "dh_live",
          leadSlug: "live-salon",
          businessName: "Live Salon",
          tier: "growth",
          commerceAddon: false,
          stripeSessionId: "cs_live",
          customerEmail: "salon@example.com",
          previewUrl: "https://example.com/preview/live-salon",
          suggestedHost: "live-salon.example.com",
          contactFormUrl: "https://example.com/api/contact/live-salon",
          dnsInstructions: [],
          status: "live",
          notes: [],
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-10T00:00:00.000Z",
        },
        {
          id: "dh_new",
          leadSlug: "provisioned-trades",
          businessName: "Provisioned Trades",
          tier: "complete",
          commerceAddon: false,
          stripeSessionId: "cs_new",
          customerEmail: "trades@example.com",
          previewUrl: "https://example.com/preview/provisioned-trades",
          suggestedHost: "provisioned-trades.example.com",
          customDomain: "trades.example.com",
          contactFormUrl: "https://example.com/api/contact/provisioned-trades",
          dnsInstructions: [],
          status: "provisioned",
          notes: [],
          createdAt: "2026-07-11T12:00:00.000Z",
          updatedAt: "2026-07-11T12:00:00.000Z",
        },
        {
          id: "dh_old",
          leadSlug: "awaiting-cafe",
          businessName: "Awaiting Cafe",
          tier: "starter",
          commerceAddon: false,
          stripeSessionId: "cs_old",
          customerEmail: "cafe@example.com",
          previewUrl: "https://example.com/preview/awaiting-cafe",
          suggestedHost: "awaiting-cafe.example.com",
          contactFormUrl: "https://example.com/api/contact/awaiting-cafe",
          dnsInstructions: [],
          status: "awaiting_dns",
          notes: [],
          createdAt: "2026-07-08T08:00:00.000Z",
          updatedAt: "2026-07-08T08:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    expect(digest.openHandoffs).toHaveLength(2);
    expect(digest.openHandoffs[0]?.businessName).toBe("Awaiting Cafe");
    expect(digest.openHandoffs[0]?.status).toBe("awaiting_dns");
    expect(digest.openHandoffs[0]?.host).toBe("awaiting-cafe.example.com");
    expect(digest.openHandoffs[1]?.businessName).toBe("Provisioned Trades");
    expect(digest.openHandoffs[1]?.status).toBe("provisioned");
    expect(digest.openHandoffs[1]?.host).toBe("trades.example.com");
    expect(digest.isEmpty).toBe(false);
  });

  it("a newest-N commerce orders page hides older unpaid liability the unpaid set catches", () => {
    // Callers must feed buildDailyDigest from listUnpaidCommerceOrders()
    // (uncapped unpaid), not a capped newest-N page of every commerce order —
    // a capped page can drop an older unpaid Buy now row past the window and
    // undercount Commerce payouts owed (double-pay risk).
    const oldClient = baseLead({
      slug: "old-client",
      businessName: "Old Client Cafe",
      stage: "live",
    });
    const olderUnpaid = {
      id: "co_old",
      leadSlug: "old-client",
      skuId: "sku_old",
      skuName: "Old SKU",
      amountPaidUsd: 40,
      stripeSessionId: "cs_old",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const recentPaidOut = Array.from({ length: 5 }, (_, i) => ({
      id: `co_new_${i}`,
      leadSlug: "new-client",
      skuId: `sku_new_${i}`,
      skuName: `New SKU ${i}`,
      amountPaidUsd: 10,
      stripeSessionId: `cs_new_${i}`,
      createdAt: `2026-06-0${i + 1}T00:00:00.000Z`,
      paidOutAt: "2026-06-10T00:00:00.000Z",
    }));
    const full = [olderUnpaid, ...recentPaidOut];
    const truncatedToNewestFive = [...full]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
    const unpaidOnly = full.filter((row) => !row.paidOutAt);

    const fromUnpaidSet = buildDailyDigest({
      leads: [oldClient],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrders: unpaidOnly,
      nowMs: NOW,
    });
    const fromTruncatedPage = buildDailyDigest({
      leads: [oldClient],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrders: truncatedToNewestFive,
      nowMs: NOW,
    });

    expect(fromUnpaidSet.commercePayoutsOwedTotalUsd).toBe(40);
    expect(fromUnpaidSet.commercePayoutsOwed[0]?.businessName).toBe("Old Client Cafe");
    expect(fromTruncatedPage.commercePayoutsOwed).toHaveLength(0);
    expect(fromTruncatedPage.commercePayoutsOwedTotalUsd).toBe(0);
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
          slug: "commerce-unsynced",
          businessName: "Unsynced Boutique",
          stage: "live",
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
        { leadSlug: "commerce-unsynced", tier: "starter", commerceAddon: true },
        { leadSlug: "voice-due", tier: "complete", commerceAddon: false },
      ],
      marketingPacksThisMonth: [],
      commerceCatalogs: [
        {
          leadSlug: "commerce-unsynced",
          items: [{ id: "sku_1", priceCents: 1200 }],
        },
      ],
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
    expect(html).toContain("Commerce Sync to Stripe due");
    expect(html).toContain("Sync to Stripe still due");
    expect(html).toContain("Complete voice packs due");
    expect(html).toContain("Complete voice FAQ pack not generated");
  });

  it("renders Commerce payouts owed section from summarizeCommerceOrdersByLead", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "owed-shop",
          businessName: "Owed <Shop>",
          stage: "live",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrders: [
        {
          id: "co_owed",
          leadSlug: "owed-shop",
          skuId: "sku_1",
          skuName: "Gift card",
          amountPaidUsd: 25,
          stripeSessionId: "cs_owed",
          createdAt: "2026-07-12T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Commerce payouts owed");
    expect(html).toContain("$25.00 owed");
    expect(html).toContain("Owed &lt;Shop&gt;");
    expect(html).not.toContain("Owed <Shop>");
  });

  it("renders production handoffs open with escaped host and status", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "dns-cafe",
          businessName: "DNS <Cafe>",
          stage: "paid",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      handoffs: [
        {
          id: "dh_1",
          leadSlug: "dns-cafe",
          businessName: "DNS <Cafe>",
          tier: "starter",
          commerceAddon: false,
          stripeSessionId: "cs_dns",
          customerEmail: "cafe@example.com",
          previewUrl: "https://example.com/preview/dns-cafe",
          suggestedHost: "dns-cafe.example.com",
          contactFormUrl: "https://example.com/api/contact/dns-cafe",
          dnsInstructions: [],
          status: "awaiting_dns",
          notes: [],
          createdAt: "2026-07-10T00:00:00.000Z",
          updatedAt: "2026-07-10T00:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Production handoffs open");
    expect(html).toContain("awaiting_dns");
    expect(html).toContain("dns-cafe.example.com");
    expect(html).toContain("DNS &lt;Cafe&gt;");
    expect(html).not.toContain("DNS <Cafe>");
  });
});
