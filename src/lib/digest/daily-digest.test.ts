import { describe, expect, it } from "vitest";
import type { ClientInquiry } from "../inquiries/types";
import type { CheckoutSessionRecord } from "../checkout/types";
import type { DeployHandoff } from "../deploy/types";
import type { Lead } from "../leads/types";
import {
  bundleDnsHandoffEmailSentNote,
  bundleReceiptEmailSentNote,
} from "../payments/bundle-side-effect-recovery";
import {
  buildDailyDigest,
  formatSnoozeRemainingHours,
  joinWithAnd,
  renderDailyDigestHtml,
} from "./daily-digest";

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

function makeHandoff(overrides: Partial<DeployHandoff> = {}): DeployHandoff {
  return {
    id: "dh_1",
    leadSlug: "handoff-lead",
    businessName: "Handoff Co",
    tier: "growth",
    commerceAddon: false,
    stripeSessionId: "cs_handoff_1",
    customerEmail: "buyer@example.com",
    previewUrl: "https://example.com/preview/handoff-lead",
    suggestedHost: "handoff-lead.example.com",
    contactFormUrl: "https://example.com/api/contact/handoff-lead",
    dnsInstructions: [],
    status: "awaiting_dns",
    notes: [],
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
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
    expect(digest.oldestMarketingPacksDueAgeHours).toBeNull();
    expect(digest.recurringEntitlementPaused).toHaveLength(0);
    expect(digest.recurringEntitlementPausedCount).toBe(0);
    expect(digest.oldestRecurringEntitlementPausedAgeHours).toBeNull();
    expect(digest.starterUpsellCandidates).toHaveLength(0);
    expect(digest.commerceCatalogsMissing).toHaveLength(0);
    expect(digest.oldestCommerceCatalogsMissingAgeHours).toBeNull();
    expect(digest.commerceCatalogsUnsynced).toHaveLength(0);
    expect(digest.oldestCommerceCatalogsUnsyncedAgeHours).toBeNull();
    expect(digest.clientVoicePacksDue).toHaveLength(0);
    expect(digest.oldestClientVoicePacksDueAgeHours).toBeNull();
    expect(digest.commercePayoutsOwed).toHaveLength(0);
    expect(digest.oldestCommerceOrdersOwedAgeHours).toBeNull();
    expect(digest.openHandoffs).toHaveLength(0);
    expect(digest.paidNotLive).toHaveLength(0);
    expect(digest.leadsMissingEmail).toHaveLength(0);
    expect(digest.snoozedLeadCount).toBe(0);
    expect(digest.soonestSnoozeRemainingHours).toBeNull();
    expect(digest.connectOnboardingIncomplete).toHaveLength(0);
    expect(digest.connectOnboardingIncompleteCount).toBe(0);
    expect(digest.oldestConnectOnboardingIncompleteAgeHours).toBeNull();
    expect(digest.bufferProfileMappingMissing).toHaveLength(0);
    expect(digest.bufferProfileMappingMissingCount).toBe(0);
    expect(digest.oldestBufferProfileMappingMissingAgeHours).toBeNull();
    expect(digest.actionableItemCount).toBe(0);
  });

  it("actionableItemCount sums every section, not just workNext/followUpsDue/checkoutRecoveriesDue/unrepliedInquiries", () => {
    // Regression for daily-digest-button-item-count-drift: the dashboard's
    // Send daily digest button used to hand-sum only those 4 sections. A
    // live lead missing only this month's marketing pack makes isEmpty
    // false via marketingPacksDue alone, with every one of those 4 sections
    // staying empty (a live lead is not workNext-actionable, has no
    // outreach/checkout/inquiry activity, and — unlike stage="paid" — does
    // not also trip paidNotLive) — exactly the case the old button logic
    // silently reported as "nothing urgent today".
    const needsPack = baseLead({
      slug: "needs-pack",
      businessName: "Needs Pack Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [needsPack],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        {
          leadSlug: "needs-pack",
          tier: "growth",
          commerceAddon: false,
          createdAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
        },
      ],
      marketingPacksThisMonth: [],
      nowMs: NOW,
    });
    expect(digest.workNext).toHaveLength(0);
    expect(digest.followUpsDue).toHaveLength(0);
    expect(digest.checkoutRecoveriesDue).toHaveLength(0);
    expect(digest.unrepliedInquiries).toHaveLength(0);
    expect(digest.marketingPacksDue).toHaveLength(1);
    expect(digest.isEmpty).toBe(false);
    expect(digest.actionableItemCount).toBe(1);
  });

  it("actionableSectionLabels covers every section actionableItemCount sums, including the clawback/dispute/paid-not-live/missing-email sections", () => {
    // Regression for daily-digest-empty-state-copy-drift: renderDailyDigestHtml's
    // "Nothing urgent today" prose used to hand-duplicate a 13-section subset
    // of this same 19-section list, silently omitting refund clawback, dispute
    // clawback, bundle refunds, bundle disputes, paid-not-live, and missing
    // email from the sentence even though those sections gate isEmpty too.
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.actionableSectionLabels).toEqual([
      "Work next",
      "follow-ups",
      "checkout recoveries",
      "Buy now carts",
      "inbox",
      "marketing packs",
      "marketing packs not emailed",
      "Starter upsells",
      "Commerce catalogs",
      "Sync to Stripe",
      "Complete voice packs",
      "Complete voice packs not emailed",
      "Commerce payouts owed",
      "Refund clawback",
      "Dispute clawback",
      "Missing client receipt",
      "Bundle buyer email missing",
      "Bundle refunds",
      "Bundle disputes",
      "production handoffs",
      "Paid, not live",
      "Missing email",
      "paused/canceled MRR recoveries",
      "Stripe Connect onboarding incomplete",
      "Buffer profile mapping missing",
    ]);
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

  it("computes oldestFollowUpDueAgeHours from the oldest due follow-up lead", () => {
    const oldLead = baseLead({
      slug: "old-lead",
      stage: "outreach_sent",
      outreachStep: 1,
      lastOutreachAt: "2026-06-30T00:00:00.000Z",
    });
    const recentLead = baseLead({
      slug: "recent-lead",
      stage: "outreach_sent",
      outreachStep: 2,
      lastOutreachAt: "2026-07-05T00:00:00.000Z",
    });
    const digest = buildDailyDigest({
      leads: [recentLead, oldLead],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    // Oldest is 288h (12 days * 24h) from NOW, roughly — 12 days from
    // 2026-06-30T00:00 to 2026-07-12T12:00 is 12*24 + 12 = 300h
    expect(digest.oldestFollowUpDueAgeHours).toBeGreaterThanOrEqual(280);
    expect(digest.oldestFollowUpDueAgeHours).toBeLessThanOrEqual(312);
  });

  it("reports null oldestFollowUpDueAgeHours when there are no follow-ups due", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.oldestFollowUpDueAgeHours).toBeNull();
  });

  it("computes oldestAbandonedAgeHours from the oldest abandoned bundle checkout", () => {
    const session = baseCheckoutSession({
      createdAt: "2026-07-10T00:00:00.000Z", // ~60h before NOW
    });
    const digest = buildDailyDigest({
      leads: [baseLead()],
      inquiries: [],
      openCheckoutSessions: [session],
      nowMs: NOW,
    });
    expect(digest.checkoutRecoveriesDueCount).toBe(1);
    // 60h = 2.5 days from 2026-07-10T00:00 to 2026-07-12T12:00
    expect(digest.oldestAbandonedAgeHours).toBeGreaterThanOrEqual(59);
    expect(digest.oldestAbandonedAgeHours).toBeLessThanOrEqual(61);
  });

  it("reports null oldestAbandonedAgeHours when there are no abandoned checkouts", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.oldestAbandonedAgeHours).toBeNull();
  });

  it("computes oldestCommerceAbandonedAgeHours from the oldest abandoned Buy now cart, independent of bundle carts", () => {
    const bundleSession = baseCheckoutSession({
      createdAt: "2026-07-12T09:00:00.000Z", // ~3h before NOW
    });
    const commerceSession = baseCheckoutSession({
      stripeSessionId: "cs_commerce",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      createdAt: "2026-07-10T00:00:00.000Z", // ~60h before NOW
    });
    const digest = buildDailyDigest({
      leads: [baseLead({ stage: "paid" })],
      inquiries: [],
      openCheckoutSessions: [bundleSession, commerceSession],
      orders: [{ leadSlug: "test-lead", tier: "starter", commerceAddon: true }],
      nowMs: NOW,
    });
    expect(digest.commerceCheckoutRecoveriesDueCount).toBe(1);
    // Bundle session's own ~3h age must not leak into the commerce-only field.
    expect(digest.oldestCommerceAbandonedAgeHours).toBeGreaterThanOrEqual(59);
    expect(digest.oldestCommerceAbandonedAgeHours).toBeLessThanOrEqual(61);
  });

  it("reports null oldestCommerceAbandonedAgeHours when there are no abandoned Buy now carts", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.oldestCommerceAbandonedAgeHours).toBeNull();
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
    expect(digest.checkoutRecoveriesDue[0].nextNudgeNumber).toBe(1);
    expect(digest.commerceCheckoutRecoveriesDue).toHaveLength(0);
  });

  it("computes nextNudgeNumber from recoverySentCount for both bundle and commerce recoveries", () => {
    const digest = buildDailyDigest({
      leads: [baseLead({ stage: "paid" })],
      inquiries: [],
      openCheckoutSessions: [
        baseCheckoutSession({ recoverySentCount: 1 }),
        baseCheckoutSession({
          stripeSessionId: "cs_commerce",
          kind: "commerce_sku",
          skuId: "sku_latte",
          tier: "",
          recoverySentCount: 3,
        }),
      ],
      orders: [{ leadSlug: "test-lead", tier: "starter", commerceAddon: true }],
      nowMs: NOW,
    });
    expect(digest.checkoutRecoveriesDue[0].nextNudgeNumber).toBe(2);
    expect(digest.commerceCheckoutRecoveriesDue[0].nextNudgeNumber).toBe(4);
  });

  it("lists abandoned commerce Buy now separately from bundle recoveries", () => {
    const digest = buildDailyDigest({
      leads: [baseLead({ stage: "paid" })],
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
      orders: [
        { leadSlug: "test-lead", tier: "starter", commerceAddon: true },
      ],
      nowMs: NOW,
    });
    expect(digest.checkoutRecoveriesDue).toHaveLength(1);
    expect(digest.commerceCheckoutRecoveriesDue).toHaveLength(1);
    expect(digest.commerceCheckoutRecoveriesDue[0].skuId).toBe("sku_latte");
    expect(digest.isEmpty).toBe(false);
  });

  it("omits commerce Buy now recovery when recurring entitlement is paused", () => {
    const digest = buildDailyDigest({
      leads: [baseLead({ stage: "paid" })],
      inquiries: [],
      openCheckoutSessions: [
        baseCheckoutSession({
          stripeSessionId: "cs_commerce",
          kind: "commerce_sku",
          skuId: "sku_latte",
          tier: "",
        }),
      ],
      orders: [
        {
          leadSlug: "test-lead",
          tier: "starter",
          commerceAddon: true,
          recurringCanceledAt: Date.parse("2026-07-01T00:00:00.000Z"),
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commerceCheckoutRecoveriesDue).toHaveLength(0);
    expect(digest.commerceCheckoutRecoveriesDueCount).toBe(0);
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

  it("separates newInquiryCount from unrepliedInquiriesCount", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [
        baseInquiry({ id: "inq_new", status: "new", createdAt: "2026-07-12T10:00:00.000Z" }),
        baseInquiry({ id: "inq_read", status: "read", createdAt: "2026-07-12T09:00:00.000Z" }),
        baseInquiry({ id: "inq_older_new", status: "new", createdAt: "2026-07-12T08:00:00.000Z" }),
      ],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.unrepliedInquiriesCount).toBe(3);
    expect(digest.newInquiryCount).toBe(2);
  });

  it("computes oldestUnrepliedInquiryAgeHours from the oldest unreplied inquiry", () => {
    // 4h old (created 8:00, now 12:00)
    const fourHourOld = baseInquiry({
      id: "inq_old",
      createdAt: "2026-07-12T08:00:00.000Z",
    });
    const twoHourOld = baseInquiry({
      id: "inq_newer",
      createdAt: "2026-07-12T10:00:00.000Z",
    });
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [twoHourOld, fourHourOld],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.oldestUnrepliedInquiryAgeHours).toBe(4);
  });

  it("reports null oldestUnrepliedInquiryAgeHours when there are no unreplied inquiries", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.oldestUnrepliedInquiryAgeHours).toBeNull();
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

  it("computes oldestColdLeadAgeHours from the oldest cold lead", () => {
    const oldCold = baseLead({
      slug: "old-cold",
      stage: "outreach_sent",
      outreachStep: 3,
      lastOutreachAt: "2026-05-15T00:00:00.000Z", // ~58d before NOW
    });
    const recentCold = baseLead({
      slug: "recent-cold",
      stage: "outreach_sent",
      outreachStep: 3,
      lastOutreachAt: "2026-07-01T00:00:00.000Z",
    });
    const digest = buildDailyDigest({
      leads: [recentCold, oldCold],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.coldLeadCount).toBe(2);
    // Oldest is ~58 days from 2026-05-15T00:00 to 2026-07-12T12:00
    expect(digest.oldestColdLeadAgeHours).toBeGreaterThanOrEqual(58 * 24);
    expect(digest.oldestColdLeadAgeHours).toBeLessThanOrEqual(60 * 24);
  });

  it("reports null oldestColdLeadAgeHours when there are no cold leads", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.oldestColdLeadAgeHours).toBeNull();
  });

  it("counts closed leads in closedLeadCount without affecting isEmpty", () => {
    const closed = baseLead({
      slug: "closed-lead",
      stage: "closed",
    });
    const digest = buildDailyDigest({
      leads: [closed],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.closedLeadCount).toBe(1);
    expect(digest.isEmpty).toBe(true);
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

  it("counts bounce/complaint suppressions in the last 7 days, ignoring unsubscribes and older events, without affecting isEmpty", () => {
    const HOUR_MS = 60 * 60 * 1000;
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      suppressions: [
        { email: "recent-bounce@example.com", reason: "bounce", createdAt: NOW - 3 * HOUR_MS },
        {
          email: "recent-complaint@example.com",
          reason: "complaint",
          createdAt: NOW - 24 * HOUR_MS,
        },
        { email: "recent-unsub@example.com", reason: "unsubscribe", createdAt: NOW - HOUR_MS },
        {
          email: "old-bounce@example.com",
          reason: "bounce",
          createdAt: NOW - 24 * 8 * HOUR_MS,
        },
      ],
      nowMs: NOW,
    });
    expect(digest.recentBounceOrComplaintSuppressionCount).toBe(2);
    expect(digest.newestBounceOrComplaintSuppressionAgeHours).toBe(3);
    expect(digest.isEmpty).toBe(true);
  });

  it("reports zero bounce/complaint count and null age when no suppressions are passed", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.recentBounceOrComplaintSuppressionCount).toBe(0);
    expect(digest.newestBounceOrComplaintSuppressionAgeHours).toBeNull();
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
        {
          leadSlug: "needs-pack",
          tier: "growth",
          commerceAddon: false,
          // Well before this month started — due-since anchors to month
          // start, not this order's createdAt (see marketingMonthStartMs).
          createdAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
        },
        { leadSlug: "has-pack", tier: "complete", commerceAddon: false },
      ],
      marketingPacksThisMonth: [{ leadSlug: "has-pack", yearMonth: "2026-07" }],
      nowMs: NOW,
    });
    expect(digest.marketingPacksDue).toHaveLength(1);
    expect(digest.marketingPacksDue[0]?.businessName).toBe("Needs Pack Cafe");
    expect(digest.marketingPacksDue[0]?.yearMonth).toBe("2026-07");
    const monthStartMs = Date.UTC(2026, 6, 1);
    expect(digest.oldestMarketingPacksDueAgeHours).toBe(
      Math.floor((NOW - monthStartMs) / (60 * 60 * 1000)),
    );
    expect(digest.isEmpty).toBe(false);

    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain(
      `Marketing packs due (1 · oldest ${digest.oldestMarketingPacksDueAgeHours}h)`,
    );
  });

  it("lists marketing packs generated this month but never emailed to the client", () => {
    const notSent = baseLead({
      slug: "not-sent",
      businessName: "Not Sent Cafe",
      stage: "paid",
    });
    const sent = baseLead({ slug: "sent", businessName: "Sent Salon", stage: "live" });
    const digest = buildDailyDigest({
      leads: [notSent, sent],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        { leadSlug: "not-sent", tier: "growth", commerceAddon: false },
        { leadSlug: "sent", tier: "complete", commerceAddon: false },
      ],
      marketingPacksThisMonth: [
        {
          leadSlug: "not-sent",
          yearMonth: "2026-07",
          generatedAt: new Date(NOW - 9 * 60 * 60 * 1000).toISOString(),
        },
        {
          leadSlug: "sent",
          yearMonth: "2026-07",
          generatedAt: new Date(NOW - 40 * 60 * 60 * 1000).toISOString(),
          sentToClientAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        },
      ],
      nowMs: NOW,
    });
    expect(digest.marketingPacksMissingClientSend).toHaveLength(1);
    expect(digest.marketingPacksMissingClientSend[0]?.businessName).toBe("Not Sent Cafe");
    expect(digest.marketingPacksMissingClientSendCount).toBe(1);
    expect(digest.oldestMarketingPacksMissingClientSendAgeHours).toBe(9);
    expect(digest.isEmpty).toBe(false);

    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain(
      `Marketing packs not emailed (1 · oldest ${digest.oldestMarketingPacksMissingClientSendAgeHours}h)`,
    );
  });

  it("lists paid/live MRR customers with paused recurring entitlement for Billing Portal chase", () => {
    const paused = baseLead({
      slug: "paused-mrr",
      businessName: "Paused Growth Co",
      stage: "paid",
    });
    const active = baseLead({
      slug: "active-mrr",
      businessName: "Active Complete Co",
      stage: "live",
    });
    const pausedAt = NOW - 3 * 60 * 60 * 1000;
    const digest = buildDailyDigest({
      leads: [paused, active],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        {
          leadSlug: "paused-mrr",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: pausedAt,
          stripeCustomerId: "cus_paused",
        },
        {
          leadSlug: "active-mrr",
          tier: "complete",
          commerceAddon: false,
        },
      ],
      marketingPacksThisMonth: [{ leadSlug: "active-mrr", yearMonth: "2026-07" }],
      nowMs: NOW,
    });
    expect(digest.recurringEntitlementPausedCount).toBe(1);
    expect(digest.recurringEntitlementPaused).toHaveLength(1);
    expect(digest.recurringEntitlementPaused[0]?.businessName).toBe("Paused Growth Co");
    expect(digest.recurringEntitlementPaused[0]?.hasStripeCustomerId).toBe(true);
    expect(digest.oldestRecurringEntitlementPausedAgeHours).toBe(3);
    expect(digest.marketingPacksDue).toHaveLength(0);
    expect(digest.isEmpty).toBe(false);

    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("MRR paused / canceled (1 · oldest 3h)");
    expect(html).toContain("Paused Growth Co");
    expect(html).toContain("Manage billing / Billing Portal");
  });

  it("lists leads with an incomplete Stripe Connect account (stripe-connect-onboarding-pipeline-health-visibility)", () => {
    const incomplete = baseLead({
      slug: "connect-incomplete",
      businessName: "Connect Pending Co",
      stage: "paid",
      stripeConnectAccountId: "acct_1",
      stripeConnectAccountCreatedAt: new Date(NOW - 12 * 60 * 60 * 1000).toISOString(),
    });
    const complete = baseLead({
      slug: "connect-complete",
      businessName: "Connect Ready Co",
      stage: "live",
      stripeConnectAccountId: "acct_2",
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: true,
    });
    const digest = buildDailyDigest({
      leads: [incomplete, complete],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.connectOnboardingIncompleteCount).toBe(1);
    expect(digest.connectOnboardingIncomplete).toHaveLength(1);
    expect(digest.connectOnboardingIncomplete[0]?.businessName).toBe("Connect Pending Co");
    expect(digest.oldestConnectOnboardingIncompleteAgeHours).toBe(12);
    expect(digest.isEmpty).toBe(false);

    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Stripe Connect onboarding incomplete (1 · oldest 12h)");
    expect(html).toContain("Connect Pending Co");
    expect(html).not.toContain("Connect Ready Co");
  });

  it("lists Growth/Complete leads missing a Buffer profile mapping only when marketingSchedulingEnabled (marketing-scheduling-buffer-profile-mapping-missing-visibility)", () => {
    const missing = baseLead({
      slug: "buffer-missing",
      businessName: "No Buffer Co",
      stage: "paid",
    });
    const mapped = baseLead({
      slug: "buffer-mapped",
      businessName: "Buffer Ready Co",
      stage: "live",
      bufferProfileIds: ["p1"],
    });
    const orders = [
      {
        leadSlug: "buffer-missing",
        tier: "growth",
        commerceAddon: false,
        createdAt: new Date(NOW - 12 * 60 * 60 * 1000).toISOString(),
      },
      { leadSlug: "buffer-mapped", tier: "complete", commerceAddon: false },
    ];

    const disabled = buildDailyDigest({
      leads: [missing, mapped],
      inquiries: [],
      openCheckoutSessions: [],
      orders,
      nowMs: NOW,
    });
    expect(disabled.bufferProfileMappingMissingCount).toBe(0);
    expect(disabled.bufferProfileMappingMissing).toHaveLength(0);
    expect(disabled.oldestBufferProfileMappingMissingAgeHours).toBeNull();

    const digest = buildDailyDigest({
      leads: [missing, mapped],
      inquiries: [],
      openCheckoutSessions: [],
      orders,
      marketingSchedulingEnabled: true,
      nowMs: NOW,
    });
    expect(digest.bufferProfileMappingMissingCount).toBe(1);
    expect(digest.bufferProfileMappingMissing).toHaveLength(1);
    expect(digest.bufferProfileMappingMissing[0]?.businessName).toBe("No Buffer Co");
    expect(digest.oldestBufferProfileMappingMissingAgeHours).toBe(12);
    expect(digest.isEmpty).toBe(false);

    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Buffer profile mapping missing (1 · oldest 12h)");
    expect(html).toContain("<strong>No Buffer Co</strong> — no Buffer profiles selected yet");
    expect(html).not.toContain("<strong>Buffer Ready Co</strong> — no Buffer profiles selected yet");
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
    expect(digest.oldestStarterUpsellCandidateAgeHours).toBeNull();
    expect(digest.isEmpty).toBe(false);
  });

  it("surfaces oldest-age staleness for the Starter → MRR upsell section", () => {
    const starter = baseLead({
      slug: "starter-paid",
      businessName: "Starter Shop",
      stage: "paid",
      recommendedTier: "growth",
    });
    const digest = buildDailyDigest({
      leads: [starter],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        {
          leadSlug: "starter-paid",
          tier: "starter",
          commerceAddon: false,
          createdAt: new Date(NOW - 5 * 60 * 60 * 1000).toISOString(),
        },
      ],
      nowMs: NOW,
    });
    expect(digest.oldestStarterUpsellCandidateAgeHours).toBe(5);

    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Starter → MRR upsell (1 · oldest 5h)");
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
        {
          leadSlug: "needs-catalog",
          tier: "starter",
          commerceAddon: true,
          createdAt: new Date(NOW - 8 * 60 * 60 * 1000).toISOString(),
        },
        { leadSlug: "has-catalog", tier: "growth", commerceAddon: true },
      ],
      commerceCatalogs: [{ leadSlug: "has-catalog" }],
      nowMs: NOW,
    });
    expect(digest.commerceCatalogsMissing).toHaveLength(1);
    expect(digest.commerceCatalogsMissing[0]?.businessName).toBe("Needs Catalog Retail");
    expect(digest.oldestCommerceCatalogsMissingAgeHours).toBe(8);
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
        {
          leadSlug: "unsynced-shop",
          tier: "starter",
          commerceAddon: true,
          createdAt: new Date(NOW - 12 * 60 * 60 * 1000).toISOString(),
        },
        { leadSlug: "synced-shop", tier: "growth", commerceAddon: true },
      ],
      commerceCatalogs: [
        {
          leadSlug: "unsynced-shop",
          items: [{ stripePriceId: undefined }],
        },
        {
          leadSlug: "synced-shop",
          items: [{ stripePriceId: "price_b" }],
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commerceCatalogsMissing).toHaveLength(0);
    expect(digest.commerceCatalogsUnsynced).toHaveLength(1);
    expect(digest.commerceCatalogsUnsynced[0]?.businessName).toBe("Unsynced Boutique");
    expect(digest.oldestCommerceCatalogsUnsyncedAgeHours).toBe(12);
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
        {
          leadSlug: "needs-voice",
          tier: "complete",
          commerceAddon: false,
          createdAt: new Date(NOW - 6 * 60 * 60 * 1000).toISOString(),
        },
        { leadSlug: "has-voice", tier: "complete", commerceAddon: false },
      ],
      clientVoicePacks: [{ leadSlug: "has-voice" }],
      nowMs: NOW,
    });
    expect(digest.clientVoicePacksDue).toHaveLength(1);
    expect(digest.clientVoicePacksDue[0]?.businessName).toBe("Needs Voice Spa");
    expect(digest.oldestClientVoicePacksDueAgeHours).toBe(6);
    expect(digest.isEmpty).toBe(false);
  });

  it("lists client voice packs generated but never emailed to the client", () => {
    const notSent = baseLead({
      slug: "voice-not-sent",
      businessName: "Voice Not Sent Spa",
      stage: "paid",
    });
    const sent = baseLead({
      slug: "voice-sent",
      businessName: "Voice Sent Spa",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [notSent, sent],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        { leadSlug: "voice-not-sent", tier: "complete", commerceAddon: false },
        { leadSlug: "voice-sent", tier: "complete", commerceAddon: false },
      ],
      clientVoicePacks: [
        {
          leadSlug: "voice-not-sent",
          generatedAt: new Date(NOW - 15 * 60 * 60 * 1000).toISOString(),
        },
        {
          leadSlug: "voice-sent",
          generatedAt: new Date(NOW - 50 * 60 * 60 * 1000).toISOString(),
          sentToClientAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
        },
      ],
      nowMs: NOW,
    });
    expect(digest.clientVoicePacksMissingClientSend).toHaveLength(1);
    expect(digest.clientVoicePacksMissingClientSend[0]?.businessName).toBe("Voice Not Sent Spa");
    expect(digest.oldestClientVoicePacksMissingClientSendAgeHours).toBe(15);
    expect(digest.isEmpty).toBe(false);

    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain(
      `Complete voice packs not emailed (1 · oldest ${digest.oldestClientVoicePacksMissingClientSendAgeHours}h)`,
    );
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
    // Oldest still-owed order is the salon's co_3 (2026-07-11T09:00), 27h before NOW.
    expect(digest.oldestCommerceOrdersOwedAgeHours).toBe(27);
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
    expect(digest.oldestCommerceOrdersOwedAgeHours).toBeNull();
  });

  it("excludes $0 (100%-off promo) commerce orders from payouts owed", () => {
    const cafe = baseLead({
      slug: "free-order-cafe",
      businessName: "Free Order Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [cafe],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrders: [
        {
          id: "co_1",
          leadSlug: "free-order-cafe",
          skuId: "sku_latte",
          skuName: "Latte",
          amountPaidUsd: 0,
          stripeSessionId: "cs_1",
          createdAt: "2026-07-12T10:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commercePayoutsOwed).toHaveLength(0);
    expect(digest.commercePayoutsOwedTotalUsd).toBe(0);
    expect(digest.oldestCommerceOrdersOwedAgeHours).toBeNull();
  });

  it("excludes refunded commerce orders from payouts owed (never paid out)", () => {
    const cafe = baseLead({
      slug: "refunded-cafe",
      businessName: "Refunded Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [cafe],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrders: [
        {
          id: "co_1",
          leadSlug: "refunded-cafe",
          skuId: "sku_latte",
          skuName: "Latte",
          amountPaidUsd: 12.5,
          stripeSessionId: "cs_1",
          createdAt: "2026-07-12T10:00:00.000Z",
          refundedAt: "2026-07-13T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commercePayoutsOwed).toHaveLength(0);
    expect(digest.commercePayoutsOwedTotalUsd).toBe(0);
    expect(digest.oldestCommerceOrdersOwedAgeHours).toBeNull();
  });

  it("anchors oldestCommerceOrdersOwedAgeHours to the oldest still-owed order across leads, ignoring disputed rows", () => {
    const cafe = baseLead({
      slug: "mixed-cafe",
      businessName: "Mixed Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [cafe],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrders: [
        {
          id: "co_1",
          leadSlug: "mixed-cafe",
          skuId: "sku_latte",
          skuName: "Latte",
          amountPaidUsd: 4.5,
          stripeSessionId: "cs_1",
          // Newer still-owed row.
          createdAt: new Date(NOW - 5 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "co_2",
          leadSlug: "mixed-cafe",
          skuId: "sku_muffin",
          skuName: "Muffin",
          amountPaidUsd: 3.0,
          stripeSessionId: "cs_2",
          // Older, but disputed and never paid out — excluded from the owed set,
          // so it must not anchor the staleness signal.
          createdAt: new Date(NOW - 999 * 60 * 60 * 1000).toISOString(),
          disputedAt: "2026-07-12T10:00:00.000Z",
        },
        {
          id: "co_3",
          leadSlug: "mixed-cafe",
          skuId: "sku_scone",
          skuName: "Scone",
          amountPaidUsd: 2.5,
          stripeSessionId: "cs_3",
          // Oldest genuinely still-owed row — anchors the signal.
          createdAt: new Date(NOW - 48 * 60 * 60 * 1000).toISOString(),
        },
      ],
      nowMs: NOW,
    });
    expect(digest.oldestCommerceOrdersOwedAgeHours).toBe(48);
  });

  it("surfaces refund-after-payout as a clawback owed from the client", () => {
    const cafe = baseLead({
      slug: "clawback-cafe",
      businessName: "Clawback Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [cafe],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersRefunded: [
        {
          id: "co_1",
          leadSlug: "clawback-cafe",
          skuId: "sku_latte",
          skuName: "Latte",
          amountPaidUsd: 12.5,
          stripeSessionId: "cs_1",
          createdAt: "2026-07-12T10:00:00.000Z",
          paidOutAt: "2026-07-12T11:00:00.000Z",
          refundedAt: "2026-07-13T09:00:00.000Z",
        },
        {
          // Refunded but never paid out — zero clawback risk, excluded.
          id: "co_2",
          leadSlug: "clawback-cafe",
          skuId: "sku_muffin",
          skuName: "Muffin",
          amountPaidUsd: 5,
          stripeSessionId: "cs_2",
          createdAt: "2026-07-12T10:00:00.000Z",
          refundedAt: "2026-07-13T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commerceOrdersRefundClawback).toHaveLength(1);
    expect(digest.commerceOrdersRefundClawback[0]).toMatchObject({
      slug: "clawback-cafe",
      businessName: "Clawback Cafe",
      skuName: "Latte",
      amountPaidUsd: 12.5,
    });
    expect(digest.commerceOrdersRefundClawbackCount).toBe(1);
    expect(digest.commerceOrdersRefundClawbackTotalUsd).toBe(12.5);
    expect(digest.isEmpty).toBe(false);
  });

  it("defaults refund clawback fields to zero when no refunds recorded", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.commerceOrdersRefundClawback).toHaveLength(0);
    expect(digest.commerceOrdersRefundClawbackCount).toBe(0);
    expect(digest.commerceOrdersRefundClawbackTotalUsd).toBe(0);
    expect(digest.oldestCommerceOrdersRefundClawbackAgeHours).toBeNull();
  });

  it("computes oldestCommerceOrdersRefundClawbackAgeHours from the oldest refund-clawback order", () => {
    const cafe = baseLead({
      slug: "clawback-cafe",
      businessName: "Clawback Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [cafe],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersRefunded: [
        {
          id: "co_recent",
          leadSlug: "clawback-cafe",
          skuId: "sku_muffin",
          skuName: "Muffin",
          amountPaidUsd: 5,
          stripeSessionId: "cs_recent",
          createdAt: "2026-07-05T00:00:00.000Z",
          paidOutAt: "2026-07-05T01:00:00.000Z",
          refundedAt: "2026-07-05T10:00:00.000Z",
        },
        {
          id: "co_old",
          leadSlug: "clawback-cafe",
          skuId: "sku_latte",
          skuName: "Latte",
          amountPaidUsd: 12.5,
          stripeSessionId: "cs_old",
          createdAt: "2026-06-30T00:00:00.000Z",
          paidOutAt: "2026-06-30T01:00:00.000Z",
          refundedAt: "2026-06-30T00:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    // Oldest refundedAt is 2026-06-30T00:00, ~300h before NOW.
    expect(digest.oldestCommerceOrdersRefundClawbackAgeHours).toBeGreaterThanOrEqual(280);
    expect(digest.oldestCommerceOrdersRefundClawbackAgeHours).toBeLessThanOrEqual(312);
  });

  it("surfaces dispute-after-payout as a clawback owed from the client", () => {
    const cafe = baseLead({
      slug: "clawback-cafe",
      businessName: "Clawback Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [cafe],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersDisputed: [
        {
          id: "co_1",
          leadSlug: "clawback-cafe",
          skuId: "sku_latte",
          skuName: "Latte",
          amountPaidUsd: 12.5,
          stripeSessionId: "cs_1",
          createdAt: "2026-07-12T10:00:00.000Z",
          paidOutAt: "2026-07-12T11:00:00.000Z",
          disputedAt: "2026-07-13T09:00:00.000Z",
        },
        {
          // Disputed but never paid out — zero clawback risk, excluded.
          id: "co_2",
          leadSlug: "clawback-cafe",
          skuId: "sku_muffin",
          skuName: "Muffin",
          amountPaidUsd: 5,
          stripeSessionId: "cs_2",
          createdAt: "2026-07-12T10:00:00.000Z",
          disputedAt: "2026-07-13T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commerceOrdersDisputeClawback).toHaveLength(1);
    expect(digest.commerceOrdersDisputeClawback[0]).toMatchObject({
      slug: "clawback-cafe",
      businessName: "Clawback Cafe",
      skuName: "Latte",
      amountPaidUsd: 12.5,
    });
    expect(digest.commerceOrdersDisputeClawbackCount).toBe(1);
    expect(digest.commerceOrdersDisputeClawbackTotalUsd).toBe(12.5);
    expect(digest.isEmpty).toBe(false);
  });

  it("defaults dispute clawback fields to zero when no disputes recorded", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.commerceOrdersDisputeClawback).toHaveLength(0);
    expect(digest.commerceOrdersDisputeClawbackCount).toBe(0);
    expect(digest.commerceOrdersDisputeClawbackTotalUsd).toBe(0);
    expect(digest.oldestCommerceOrdersDisputeClawbackAgeHours).toBeNull();
  });

  it("computes oldestCommerceOrdersDisputeClawbackAgeHours from the oldest dispute-clawback order", () => {
    const cafe = baseLead({
      slug: "clawback-cafe",
      businessName: "Clawback Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [cafe],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersDisputed: [
        {
          id: "co_recent",
          leadSlug: "clawback-cafe",
          skuId: "sku_muffin",
          skuName: "Muffin",
          amountPaidUsd: 5,
          stripeSessionId: "cs_recent",
          createdAt: "2026-07-05T00:00:00.000Z",
          paidOutAt: "2026-07-05T01:00:00.000Z",
          disputedAt: "2026-07-05T10:00:00.000Z",
        },
        {
          id: "co_old",
          leadSlug: "clawback-cafe",
          skuId: "sku_latte",
          skuName: "Latte",
          amountPaidUsd: 12.5,
          stripeSessionId: "cs_old",
          createdAt: "2026-06-30T00:00:00.000Z",
          paidOutAt: "2026-06-30T01:00:00.000Z",
          disputedAt: "2026-06-30T00:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    // Oldest disputedAt is 2026-06-30T00:00, ~300h before NOW.
    expect(digest.oldestCommerceOrdersDisputeClawbackAgeHours).toBeGreaterThanOrEqual(280);
    expect(digest.oldestCommerceOrdersDisputeClawbackAgeHours).toBeLessThanOrEqual(312);
  });

  it("surfaces refunded bundle orders as a visibility footnote, not a clawback", () => {
    const cafe = baseLead({
      slug: "refund-cafe",
      businessName: "Refund Cafe",
      stage: "live",
    });
    const digest = buildDailyDigest({
      leads: [cafe],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        {
          leadSlug: "refund-cafe",
          tier: "growth",
          commerceAddon: false,
          amountPaid: 300,
          refundedAt: "2026-07-13T09:00:00.000Z",
        },
        {
          // Never refunded — excluded.
          leadSlug: "refund-cafe",
          tier: "starter",
          commerceAddon: false,
          amountPaid: 100,
        },
      ],
      nowMs: NOW,
    });
    expect(digest.bundleOrdersRefunded).toHaveLength(1);
    expect(digest.bundleOrdersRefunded[0]).toMatchObject({
      slug: "refund-cafe",
      businessName: "Refund Cafe",
      tier: "growth",
      amountPaidUsd: 300,
      refundedAt: "2026-07-13T09:00:00.000Z",
    });
    expect(digest.bundleOrdersRefundedCount).toBe(1);
    expect(digest.bundleOrdersRefundedTotalUsd).toBe(300);
    expect(digest.isEmpty).toBe(false);
  });

  it("defaults bundle order refund fields to zero when no orders refunded", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.bundleOrdersRefunded).toHaveLength(0);
    expect(digest.bundleOrdersRefundedCount).toBe(0);
    expect(digest.bundleOrdersRefundedTotalUsd).toBe(0);
    expect(digest.oldestBundleOrdersRefundedAgeHours).toBeNull();
  });

  it("computes oldestBundleOrdersRefundedAgeHours from the oldest refunded bundle order", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({ slug: "refund-cafe-1", businessName: "Refund Cafe 1", stage: "live" }),
        baseLead({ slug: "refund-cafe-2", businessName: "Refund Cafe 2", stage: "live" }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        {
          leadSlug: "refund-cafe-1",
          tier: "growth",
          commerceAddon: false,
          amountPaid: 300,
          refundedAt: "2026-07-05T00:00:00.000Z",
        },
        {
          leadSlug: "refund-cafe-2",
          tier: "starter",
          commerceAddon: false,
          amountPaid: 100,
          refundedAt: "2026-06-30T00:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    // Oldest refundedAt is 2026-06-30T00:00, ~300h before NOW.
    expect(digest.oldestBundleOrdersRefundedAgeHours).toBeGreaterThanOrEqual(280);
    expect(digest.oldestBundleOrdersRefundedAgeHours).toBeLessThanOrEqual(312);
  });

  it("lists disputed bundle orders with pre-slice count and total", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "dispute-cafe",
          businessName: "Dispute Cafe",
          stage: "live",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        {
          leadSlug: "dispute-cafe",
          tier: "complete",
          commerceAddon: false,
          amountPaid: 500,
          disputedAt: "2026-07-13T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    expect(digest.bundleOrdersDisputed).toHaveLength(1);
    expect(digest.bundleOrdersDisputed[0]).toMatchObject({
      slug: "dispute-cafe",
      businessName: "Dispute Cafe",
      tier: "complete",
      amountPaidUsd: 500,
      disputedAt: "2026-07-13T09:00:00.000Z",
    });
    expect(digest.bundleOrdersDisputedCount).toBe(1);
    expect(digest.bundleOrdersDisputedTotalUsd).toBe(500);
    expect(digest.isEmpty).toBe(false);
  });

  it("defaults bundle order dispute fields to zero when no orders disputed", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.bundleOrdersDisputed).toHaveLength(0);
    expect(digest.bundleOrdersDisputedCount).toBe(0);
    expect(digest.bundleOrdersDisputedTotalUsd).toBe(0);
    expect(digest.oldestBundleOrdersDisputedAgeHours).toBeNull();
  });

  it("computes oldestBundleOrdersDisputedAgeHours from the oldest disputed bundle order", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({ slug: "dispute-cafe-1", businessName: "Dispute Cafe 1", stage: "live" }),
        baseLead({ slug: "dispute-cafe-2", businessName: "Dispute Cafe 2", stage: "live" }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        {
          leadSlug: "dispute-cafe-1",
          tier: "complete",
          commerceAddon: false,
          amountPaid: 500,
          disputedAt: "2026-07-05T00:00:00.000Z",
        },
        {
          leadSlug: "dispute-cafe-2",
          tier: "growth",
          commerceAddon: false,
          amountPaid: 300,
          disputedAt: "2026-06-30T00:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    // Oldest disputedAt is 2026-06-30T00:00, ~300h before NOW.
    expect(digest.oldestBundleOrdersDisputedAgeHours).toBeGreaterThanOrEqual(280);
    expect(digest.oldestBundleOrdersDisputedAgeHours).toBeLessThanOrEqual(312);
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
    // Staleness anchored to the oldest OPEN handoff (awaiting-cafe, 2026-07-08T08:00,
    // 100h before NOW) — the older dh_live row (2026-07-01) is live and must not anchor it.
    expect(digest.oldestOpenHandoffAgeHours).toBe(100);
    expect(digest.isEmpty).toBe(false);
  });

  it("surfaces stage=paid leads with no deploy_handoffs row via paidNotLive (openHandoffs alone misses them)", () => {
    // A lead can be moved to stage=paid via the dashboard stage dropdown or
    // CSV import with no deploy_handoffs row ever created — it would never
    // appear in openHandoffs, but is still fulfillment debt.
    const csvImportedPaidLead = baseLead({
      slug: "legacy-bakery",
      businessName: "Legacy Bakery",
      stage: "paid",
    });
    const notYetPaidLead = baseLead({
      slug: "outreach-diner",
      businessName: "Outreach Diner",
      stage: "outreach_sent",
    });
    const digest = buildDailyDigest({
      leads: [csvImportedPaidLead, notYetPaidLead],
      inquiries: [],
      openCheckoutSessions: [],
      handoffs: [],
      nowMs: NOW,
    });
    expect(digest.paidNotLive).toHaveLength(1);
    expect(digest.paidNotLive[0]?.slug).toBe("legacy-bakery");
    expect(digest.paidNotLive[0]?.businessName).toBe("Legacy Bakery");
    expect(digest.openHandoffs).toHaveLength(0);
    expect(digest.isEmpty).toBe(false);
    // No order row at all for a CSV-backfilled paid lead — nothing to anchor
    // the staleness signal on (see oldestPaidNotLiveAgeHours's skip-if-no-order
    // contract in pipeline-health.ts).
    expect(digest.oldestPaidNotLiveAgeHours).toBeNull();
  });

  it("anchors oldestPaidNotLiveAgeHours to the oldest matching order across paid-not-live leads", () => {
    const withOlderOrder = baseLead({
      slug: "paid-with-older-order",
      businessName: "Older Order Co",
      stage: "paid",
    });
    const withNewerOrder = baseLead({
      slug: "paid-with-newer-order",
      businessName: "Newer Order Co",
      stage: "paid",
    });
    const csvBackfilledNoOrder = baseLead({
      slug: "csv-backfilled",
      businessName: "CSV Backfilled Co",
      stage: "paid",
    });
    const digest = buildDailyDigest({
      leads: [withOlderOrder, withNewerOrder, csvBackfilledNoOrder],
      inquiries: [],
      openCheckoutSessions: [],
      handoffs: [],
      orders: [
        {
          leadSlug: "paid-with-older-order",
          tier: "starter",
          commerceAddon: false,
          createdAt: "2026-07-09T00:00:00.000Z", // 84h before NOW
        },
        {
          leadSlug: "paid-with-newer-order",
          tier: "growth",
          commerceAddon: false,
          createdAt: "2026-07-12T02:00:00.000Z", // 10h before NOW
        },
      ],
      nowMs: NOW,
    });
    expect(digest.paidNotLiveCount).toBe(3);
    expect(digest.oldestPaidNotLiveAgeHours).toBe(84);
  });

  it("surfaces email-critical leads with no usable email via leadsMissingEmail", () => {
    // pipeline-health already flags these on the dashboard; digest must too —
    // discovered (non-critical) and leads that already have email stay out.
    const missingCritical = baseLead({
      slug: "no-email-salon",
      businessName: "No Email Salon",
      stage: "outreach_sent",
      email: undefined,
    });
    const whitespaceOnly = baseLead({
      slug: "blank-email-trades",
      businessName: "Blank Email Trades",
      stage: "site_built",
      email: "   ",
    });
    const discoveredNoEmail = baseLead({
      slug: "early-discovery",
      businessName: "Early Discovery",
      stage: "discovered",
      email: undefined,
    });
    const hasEmail = baseLead({
      slug: "ready-cafe",
      businessName: "Ready Cafe",
      stage: "outreach_sent",
      email: "owner@example.com",
    });
    const digest = buildDailyDigest({
      leads: [missingCritical, whitespaceOnly, discoveredNoEmail, hasEmail],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    expect(digest.leadsMissingEmail).toHaveLength(2);
    expect(digest.leadsMissingEmailCount).toBe(2);
    expect(digest.leadsMissingEmail.map((l) => l.slug)).toEqual([
      "no-email-salon",
      "blank-email-trades",
    ]);
    expect(digest.leadsMissingEmail[0]?.stage).toBe("outreach_sent");
    expect(digest.isEmpty).toBe(false);
  });

  it("reports the true paidNotLive/openHandoffs count even past their 5-row display cap", () => {
    // Each section's *Count field must reflect the full filtered set, not
    // just the capped display array — otherwise the digest silently
    // undercounts once a queue exceeds its LIMIT, the same bug class
    // AGENT_PROTOCOL already flags for uncapped debt lists.
    const paidLeads = Array.from({ length: 7 }, (_, i) =>
      baseLead({ slug: `paid-${i}`, businessName: `Paid ${i}`, stage: "paid" }),
    );
    const handoffs = Array.from({ length: 6 }, (_, i) => ({
      id: `dh_${i}`,
      leadSlug: `handoff-${i}`,
      businessName: `Handoff ${i}`,
      tier: "starter" as const,
      commerceAddon: false,
      stripeSessionId: `cs_${i}`,
      customerEmail: `handoff-${i}@example.com`,
      previewUrl: `https://example.com/preview/handoff-${i}`,
      suggestedHost: `handoff-${i}.example.com`,
      contactFormUrl: `https://example.com/api/contact/handoff-${i}`,
      dnsInstructions: [],
      status: "awaiting_dns" as const,
      notes: [],
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
    }));
    const digest = buildDailyDigest({
      leads: paidLeads,
      inquiries: [],
      openCheckoutSessions: [],
      handoffs,
      nowMs: NOW,
    });
    expect(digest.paidNotLiveCount).toBe(7);
    expect(digest.paidNotLive).toHaveLength(5);
    expect(digest.openHandoffsCount).toBe(6);
    expect(digest.openHandoffs).toHaveLength(5);
  });

  it("flags bundle handoffs missing a buyer receipt and/or DNS handoff email", () => {
    const missingBoth = makeHandoff({
      id: "dh_missing_both",
      leadSlug: "missing-both",
      businessName: "Missing Both Co",
      stripeSessionId: "cs_missing_both",
      createdAt: "2026-07-10T00:00:00.000Z",
    });
    const missingDnsOnly = makeHandoff({
      id: "dh_missing_dns",
      leadSlug: "missing-dns",
      businessName: "Missing Dns Co",
      stripeSessionId: "cs_missing_dns",
      notes: [bundleReceiptEmailSentNote("cs_missing_dns")],
      createdAt: "2026-07-11T00:00:00.000Z",
    });
    const fullyNotified = makeHandoff({
      id: "dh_notified",
      leadSlug: "notified",
      stripeSessionId: "cs_notified",
      notes: [
        bundleReceiptEmailSentNote("cs_notified"),
        bundleDnsHandoffEmailSentNote("cs_notified"),
      ],
    });
    const noCustomerEmail = makeHandoff({
      id: "dh_no_email",
      leadSlug: "no-email",
      stripeSessionId: "cs_no_email",
      customerEmail: "",
    });
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      handoffs: [missingBoth, missingDnsOnly, fullyNotified, noCustomerEmail],
      nowMs: NOW,
    });
    expect(digest.bundleOrdersMissingBuyerEmailCount).toBe(2);
    expect(digest.bundleOrdersMissingBuyerEmail).toHaveLength(2);
    // Sorted oldest first, same convention as openHandoffs.
    expect(digest.bundleOrdersMissingBuyerEmail.map((row) => row.slug)).toEqual([
      "missing-both",
      "missing-dns",
    ]);
    expect(digest.bundleOrdersMissingBuyerEmail[0]).toMatchObject({
      businessName: "Missing Both Co",
      missingReceipt: true,
      missingDnsHandoff: true,
    });
    expect(digest.bundleOrdersMissingBuyerEmail[1]).toMatchObject({
      businessName: "Missing Dns Co",
      missingReceipt: false,
      missingDnsHandoff: true,
    });
    expect(digest.oldestBundleOrdersMissingBuyerEmailAgeHours).not.toBeNull();
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
      paidOutAt: undefined as string | undefined,
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

describe("joinWithAnd", () => {
  it("joins zero, one, two, and three-or-more items", () => {
    expect(joinWithAnd([])).toBe("");
    expect(joinWithAnd(["a"])).toBe("a");
    expect(joinWithAnd(["a", "b"])).toBe("a and b");
    expect(joinWithAnd(["a", "b", "c"])).toBe("a, b, and c");
    expect(joinWithAnd(["a", "b", "c", "d"])).toBe("a, b, c, and d");
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

  it("empty-state prose enumerates every actionable section, not a stale hand-duplicated subset", () => {
    // Regression for daily-digest-empty-state-copy-drift.
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    for (const label of digest.actionableSectionLabels) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Refund clawback");
    expect(html).toContain("Dispute clawback");
    expect(html).toContain("Bundle refunds");
    expect(html).toContain("Bundle disputes");
    expect(html).toContain("Paid, not live");
    expect(html).toContain("Missing email");
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

  it("escapes baseUrl before interpolating it into the dashboard link href", () => {
    const digest = buildDailyDigest({
      leads: [baseLead()],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, '"><script>alert(1)</script>');
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;/dashboard/leads");
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
          items: [{ stripePriceId: undefined }],
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
    // createdAt 2026-07-12T09:00 is 3h before NOW (2026-07-12T12:00).
    expect(html).toContain("Commerce payouts owed ($25.00 · 1 client · oldest 3h)");
    expect(html).toContain("$25.00 owed");
    expect(html).toContain("Owed &lt;Shop&gt;");
    expect(html).not.toContain("Owed <Shop>");
  });

  it("renders Refund clawback needed section and escapes business names", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "clawback-shop",
          businessName: "Clawback <Shop>",
          stage: "live",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersRefunded: [
        {
          id: "co_clawback",
          leadSlug: "clawback-shop",
          skuId: "sku_1",
          skuName: "Gift card",
          amountPaidUsd: 25,
          stripeSessionId: "cs_clawback",
          createdAt: "2026-07-12T09:00:00.000Z",
          paidOutAt: "2026-07-12T10:00:00.000Z",
          refundedAt: "2026-07-13T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Refund clawback needed");
    expect(html).toContain("$25.00 paid out");
    expect(html).toContain("Clawback &lt;Shop&gt;");
    expect(html).not.toContain("Clawback <Shop>");
  });

  it("renders a × N quantity suffix on the Refund clawback row when known and greater than 1", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "clawback-shop",
          businessName: "Clawback Shop",
          stage: "live",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersRefunded: [
        {
          id: "co_clawback",
          leadSlug: "clawback-shop",
          skuId: "sku_1",
          skuName: "Gift card",
          amountPaidUsd: 25,
          stripeSessionId: "cs_clawback",
          createdAt: "2026-07-12T09:00:00.000Z",
          paidOutAt: "2026-07-12T10:00:00.000Z",
          refundedAt: "2026-07-13T09:00:00.000Z",
          quantity: 3,
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commerceOrdersRefundClawback[0]?.quantity).toBe(3);
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Gift card × 3, then refunded");
  });

  it("renders Dispute clawback needed section and escapes business names", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "clawback-shop",
          businessName: "Clawback <Shop>",
          stage: "live",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersDisputed: [
        {
          id: "co_clawback",
          leadSlug: "clawback-shop",
          skuId: "sku_1",
          skuName: "Gift card",
          amountPaidUsd: 25,
          stripeSessionId: "cs_clawback",
          createdAt: "2026-07-12T09:00:00.000Z",
          paidOutAt: "2026-07-12T10:00:00.000Z",
          disputedAt: "2026-07-13T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Dispute clawback needed");
    expect(html).toContain("$25.00 paid out");
    expect(html).toContain("Clawback &lt;Shop&gt;");
    expect(html).not.toContain("Clawback <Shop>");
  });

  it("renders a × N quantity suffix on the Dispute clawback row when known and greater than 1", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "clawback-shop",
          businessName: "Clawback Shop",
          stage: "live",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersDisputed: [
        {
          id: "co_clawback",
          leadSlug: "clawback-shop",
          skuId: "sku_1",
          skuName: "Gift card",
          amountPaidUsd: 25,
          stripeSessionId: "cs_clawback",
          createdAt: "2026-07-12T09:00:00.000Z",
          paidOutAt: "2026-07-12T10:00:00.000Z",
          disputedAt: "2026-07-13T09:00:00.000Z",
          quantity: 2,
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commerceOrdersDisputeClawback[0]?.quantity).toBe(2);
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Gift card × 2, then disputed");
  });

  it("renders Missing client receipt section and escapes business names", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "silent-shop",
          businessName: "Silent <Shop>",
          stage: "live",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersMissingClientReceipt: [
        {
          id: "co_missing",
          leadSlug: "silent-shop",
          skuId: "sku_1",
          skuName: "Gift card",
          amountPaidUsd: 25,
          stripeSessionId: "cs_missing",
          createdAt: "2026-07-12T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Missing client receipt");
    expect(html).toContain("sold Gift card ($25.00)");
    expect(html).toContain("Silent &lt;Shop&gt;");
    expect(html).not.toContain("Silent <Shop>");
    expect(digest.commerceOrdersMissingClientReceiptCount).toBe(1);
    expect(digest.oldestCommerceOrdersMissingClientReceiptAgeHours).not.toBeNull();
  });

  it("renders a × N quantity suffix on the Missing client receipt row when known and greater than 1", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "silent-shop",
          businessName: "Silent Shop",
          stage: "live",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersMissingClientReceipt: [
        {
          id: "co_missing",
          leadSlug: "silent-shop",
          skuId: "sku_1",
          skuName: "Gift card",
          amountPaidUsd: 25,
          stripeSessionId: "cs_missing",
          createdAt: "2026-07-12T09:00:00.000Z",
          quantity: 4,
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commerceOrdersMissingClientReceipt[0]?.quantity).toBe(4);
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("sold Gift card × 4 ($25.00)");
  });

  it("does not conflate missing-client-receipt with payout/refund/dispute status", () => {
    const digest = buildDailyDigest({
      leads: [baseLead({ slug: "paid-shop", stage: "live" })],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersMissingClientReceipt: [
        {
          id: "co_paid_but_silent",
          leadSlug: "paid-shop",
          skuId: "sku_1",
          skuName: "Latte",
          amountPaidUsd: 5,
          stripeSessionId: "cs_paid_but_silent",
          createdAt: "2026-07-12T09:00:00.000Z",
          paidOutAt: "2026-07-13T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    expect(digest.commerceOrdersMissingClientReceiptCount).toBe(1);
  });

  it("omits the × N quantity suffix when quantity is exactly 1 or unknown", () => {
    const digest = buildDailyDigest({
      leads: [baseLead({ slug: "single-shop", businessName: "Single Shop", stage: "live" })],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersMissingClientReceipt: [
        {
          id: "co_single",
          leadSlug: "single-shop",
          skuId: "sku_1",
          skuName: "Gift card",
          amountPaidUsd: 25,
          stripeSessionId: "cs_single",
          createdAt: "2026-07-12T09:00:00.000Z",
          quantity: 1,
        },
        {
          id: "co_unknown",
          leadSlug: "single-shop",
          skuId: "sku_2",
          skuName: "Mug",
          amountPaidUsd: 10,
          stripeSessionId: "cs_unknown",
          createdAt: "2026-07-12T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("sold Gift card ($25.00)");
    expect(html).not.toContain("Gift card × 1");
    expect(html).toContain("sold Mug ($10.00)");
    expect(html).not.toContain("Mug ×");
  });

  it("renders Bundle revenue refunded section and escapes business names", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "refund-shop",
          businessName: "Refund <Shop>",
          stage: "live",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        {
          leadSlug: "refund-shop",
          tier: "growth",
          commerceAddon: false,
          amountPaid: 300,
          refundedAt: "2026-07-13T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Bundle revenue refunded");
    expect(html).toContain("$300.00");
    expect(html).toContain("Refund &lt;Shop&gt;");
    expect(html).not.toContain("Refund <Shop>");
  });

  it("renders Bundle revenue disputed section and escapes business names", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "dispute-shop",
          businessName: "Dispute <Shop>",
          stage: "live",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      orders: [
        {
          leadSlug: "dispute-shop",
          tier: "complete",
          commerceAddon: false,
          amountPaid: 500,
          disputedAt: "2026-07-13T09:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Bundle revenue disputed");
    expect(html).toContain("$500.00");
    expect(html).toContain("Dispute &lt;Shop&gt;");
    expect(html).not.toContain("Dispute <Shop>");
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
    // Header carries the staleness signal: handoff created 2026-07-10T00:00,
    // 60h before NOW (2026-07-12T12:00).
    expect(html).toContain("Production handoffs open (1 · oldest 60h)");
    expect(html).toContain("awaiting_dns");
    expect(html).toContain("dns-cafe.example.com");
    expect(html).toContain("DNS &lt;Cafe&gt;");
    expect(html).not.toContain("DNS <Cafe>");
  });

  it("renders paid-not-live leads with an escaped business name, even with no handoff row", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "legacy-<script>-bakery",
          businessName: "Legacy <Script> Bakery",
          stage: "paid",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      handoffs: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    // No order row for this lead — header carries no staleness suffix.
    expect(html).toContain("Paid, not yet live (1)");
    expect(html).not.toContain("Paid, not yet live (1 ·");
    expect(html).toContain("Legacy &lt;Script&gt; Bakery");
    expect(html).not.toContain("Legacy <Script> Bakery");
  });

  it("renders paid-not-live header with the oldest matching order's staleness suffix", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "stale-paid-cafe",
          businessName: "Stale Paid Cafe",
          stage: "paid",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      handoffs: [],
      orders: [
        {
          leadSlug: "stale-paid-cafe",
          tier: "starter",
          commerceAddon: false,
          createdAt: "2026-07-10T00:00:00.000Z", // 60h before NOW
        },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Paid, not yet live (1 · oldest 60h)");
  });

  it("renders leads-missing-email with escaped business name and stage", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "no-email-<script>-salon",
          businessName: "No Email <Script> Salon",
          stage: "discovery_call",
          email: undefined,
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Leads missing email");
    expect(html).toContain("No Email &lt;Script&gt; Salon");
    expect(html).toContain("discovery_call");
    expect(html).not.toContain("No Email <Script> Salon");
  });

  it("shows the true section count in the header even when the list itself is capped at 5 rows", () => {
    const paidLeads = Array.from({ length: 9 }, (_, i) =>
      baseLead({ slug: `paid-${i}`, businessName: `Paid ${i}`, stage: "paid" }),
    );
    const digest = buildDailyDigest({
      leads: paidLeads,
      inquiries: [],
      openCheckoutSessions: [],
      handoffs: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Paid, not yet live (9)");
    expect(html).not.toContain("Paid, not yet live (5)");
    const rowMatches = html.match(/stage is Paid/g) ?? [];
    expect(rowMatches).toHaveLength(5);
  });

  it("shows newInquiryCount and oldestUnrepliedInquiryAgeHours in the unreplied inquiries header", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [
        baseInquiry({ id: "inq_new_1", createdAt: "2026-07-12T10:00:00.000Z" }),
        baseInquiry({ id: "inq_new_2", status: "new", createdAt: "2026-07-12T11:00:00.000Z" }),
        baseInquiry({ id: "inq_read", status: "read", createdAt: "2026-07-12T06:00:00.000Z" }),
      ],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("2 new");
    expect(html).toContain("oldest 6h");
  });

  it("does not show new inquiry count when all unreplied are new (redundant)", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [
        baseInquiry({ id: "inq_new_1", createdAt: "2026-07-12T08:00:00.000Z" }),
        baseInquiry({ id: "inq_new_2", createdAt: "2026-07-12T10:00:00.000Z" }),
      ],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Unreplied inquiries (2 · oldest 4h)");
    expect(html).not.toContain("new");
  });

  it("shows oldestAbandonedAgeHours in the abandoned checkouts header", () => {
    const digest = buildDailyDigest({
      leads: [baseLead()],
      inquiries: [],
      openCheckoutSessions: [
        baseCheckoutSession({ createdAt: "2026-07-10T00:00:00.000Z" }),
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Abandoned checkouts (1 · oldest");
    expect(html).toContain("h)");
  });

  it("shows the upcoming nudge number on abandoned checkout and Buy now recovery rows", () => {
    const digest = buildDailyDigest({
      leads: [baseLead({ stage: "paid" })],
      inquiries: [],
      openCheckoutSessions: [
        baseCheckoutSession({ recoverySentCount: 1 }),
        baseCheckoutSession({
          stripeSessionId: "cs_commerce",
          kind: "commerce_sku",
          skuId: "sku_latte",
          tier: "",
          recoverySentCount: 2,
        }),
      ],
      orders: [{ leadSlug: "test-lead", tier: "starter", commerceAddon: true }],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("abandoned starter checkout (nudge #2)");
    expect(html).toContain("abandoned Buy now (sku_latte) (nudge #3)");
  });

  it("shows oldestCommerceAbandonedAgeHours in the Abandoned Buy now header", () => {
    const digest = buildDailyDigest({
      leads: [baseLead({ stage: "paid" })],
      inquiries: [],
      openCheckoutSessions: [
        baseCheckoutSession({
          stripeSessionId: "cs_commerce",
          kind: "commerce_sku",
          skuId: "sku_latte",
          tier: "",
          createdAt: "2026-07-10T00:00:00.000Z",
        }),
      ],
      orders: [{ leadSlug: "test-lead", tier: "starter", commerceAddon: true }],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Abandoned Buy now (1 · oldest");
    expect(html).toContain("h)");
  });

  it("shows oldestColdLeadAgeHours in the cold footnote", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "cold",
          stage: "outreach_sent",
          outreachStep: 3,
          lastOutreachAt: "2026-06-01T00:00:00.000Z",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("also went cold after Email 3");
    expect(html).toContain("oldest");
    expect(html).toContain("h");
  });

  it("shows the bounce/complaint footnote with count and most-recent age in the non-empty render", () => {
    const HOUR_MS = 60 * 60 * 1000;
    const digest = buildDailyDigest({
      leads: [baseLead({ stage: "paid" })],
      inquiries: [],
      openCheckoutSessions: [],
      suppressions: [
        { email: "bounce@example.com", reason: "bounce", createdAt: NOW - 5 * HOUR_MS },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("1 hard bounce/spam complaint suppressed in the last 7 days");
    expect(html).toContain("most recent 5h ago");
  });

  it("shows the bounce/complaint footnote (pluralized) in the empty-state render", () => {
    const HOUR_MS = 60 * 60 * 1000;
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      suppressions: [
        { email: "bounce@example.com", reason: "bounce", createdAt: NOW - 5 * HOUR_MS },
        { email: "complaint@example.com", reason: "complaint", createdAt: NOW - HOUR_MS },
      ],
      nowMs: NOW,
    });
    expect(digest.isEmpty).toBe(true);
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Nothing urgent today");
    expect(html).toContain("2 hard bounces/spam complaints suppressed in the last 7 days");
    expect(html).toContain("most recent 1h ago");
  });

  it("omits the bounce/complaint footnote entirely when no recent bounce/complaint exists", () => {
    const digest = buildDailyDigest({
      leads: [],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).not.toContain("sender-reputation risk");
  });

  it("shows oldestFollowUpDueAgeHours in the follow-ups header", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({
          slug: "old-due",
          stage: "outreach_sent",
          outreachStep: 1,
          lastOutreachAt: "2026-07-05T00:00:00.000Z",
        }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Follow-ups due (1 · oldest");
    expect(html).toContain("h)");
  });

  it("shows oldest age in the refund/dispute clawback and bundle refund/dispute section headers", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({ slug: "clawback-cafe", businessName: "Clawback Cafe", stage: "live" }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      commerceOrdersRefunded: [
        {
          id: "co_refund",
          leadSlug: "clawback-cafe",
          skuId: "sku_latte",
          skuName: "Latte",
          amountPaidUsd: 12.5,
          stripeSessionId: "cs_refund",
          createdAt: "2026-07-05T00:00:00.000Z",
          paidOutAt: "2026-07-05T01:00:00.000Z",
          refundedAt: "2026-07-05T10:00:00.000Z",
        },
      ],
      commerceOrdersDisputed: [
        {
          id: "co_dispute",
          leadSlug: "clawback-cafe",
          skuId: "sku_muffin",
          skuName: "Muffin",
          amountPaidUsd: 5,
          stripeSessionId: "cs_dispute",
          createdAt: "2026-07-05T00:00:00.000Z",
          paidOutAt: "2026-07-05T01:00:00.000Z",
          disputedAt: "2026-07-05T10:00:00.000Z",
        },
      ],
      orders: [
        {
          leadSlug: "clawback-cafe",
          tier: "growth",
          commerceAddon: false,
          amountPaid: 300,
          refundedAt: "2026-07-05T00:00:00.000Z",
        },
        {
          leadSlug: "clawback-cafe",
          tier: "complete",
          commerceAddon: false,
          amountPaid: 500,
          disputedAt: "2026-07-05T00:00:00.000Z",
        },
      ],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Refund clawback needed ($12.50 · 1 order · oldest");
    expect(html).toContain("Dispute clawback needed ($5.00 · 1 order · oldest");
    expect(html).toContain("Bundle revenue refunded ($300.00 · 1 order · oldest");
    expect(html).toContain("Bundle revenue disputed ($500.00 · 1 order · oldest");
  });

  it("shows a closed lead footnote when there are closed leads and nothing else is urgent", () => {
    const digest = buildDailyDigest({
      leads: [baseLead({ slug: "done", stage: "closed" })],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Nothing urgent today");
    expect(html).toContain("settled inventory");
    expect(html).toContain("1 lead");
  });

  it("shows a closed lead footnote after the action sections when there is also urgent work", () => {
    const digest = buildDailyDigest({
      leads: [
        baseLead({ slug: "done", stage: "closed" }),
        baseLead({ slug: "urgent", stage: "paid" }),
      ],
      inquiries: [],
      openCheckoutSessions: [],
      nowMs: NOW,
    });
    const html = renderDailyDigestHtml(digest, "https://example.com");
    expect(html).toContain("Paid, not yet live");
    expect(html).toContain("settled inventory");
  });
});
