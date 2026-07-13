import { describe, expect, it } from "vitest";
import {
  computePipelineHealth,
  emptyStageCounts,
  formatAbandonedAgeHours,
  formatUsd,
  isUnrepliedInquiryStatus,
} from "./pipeline-health";
import type { Lead, LeadPipelineStage } from "../leads/types";
import type { DeployHandoff } from "../deploy/types";
import type { ClientInquiry } from "../inquiries/types";
import type { OrderRecord } from "../orders/types";
import type { CheckoutSessionRecord } from "../checkout/types";
import { ABANDONED_AFTER_HOURS } from "../checkout/abandoned-recovery";

const NOW = Date.parse("2026-07-12T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function makeSession(
  overrides: Partial<CheckoutSessionRecord> = {},
): CheckoutSessionRecord {
  return {
    stripeSessionId: `cs_test_${Math.random().toString(36).slice(2, 8)}`,
    leadSlug: "cart-lead",
    tier: "growth",
    commerceAddon: false,
    customerEmail: "buyer@example.com",
    status: "open",
    createdAt: new Date(NOW - 3 * HOUR_MS).toISOString(),
    ...overrides,
  };
}

function makeLead(stage: LeadPipelineStage, overrides: Partial<Lead> = {}): Lead {
  return {
    slug: `lead-${stage}-${Math.random().toString(36).slice(2, 8)}`,
    businessName: "Test Co",
    category: "generic",
    city: "Denver",
    state: "CO",
    tagline: "t",
    description: "d",
    phone: "(555) 000-0000",
    email: "owner@example.com",
    services: [],
    hours: { weekday: "Mon-Fri", weekend: "Sat" },
    stage,
    recommendedTier: "starter",
    ...overrides,
  };
}

function makeHandoff(status: DeployHandoff["status"]): DeployHandoff {
  return {
    id: "h1",
    leadSlug: "lead-1",
    businessName: "Test Co",
    tier: "starter",
    commerceAddon: false,
    stripeSessionId: "sess_1",
    customerEmail: "owner@example.com",
    previewUrl: "/preview/lead-1",
    suggestedHost: "lead-1.example.com",
    contactFormUrl: "/api/contact/lead-1",
    dnsInstructions: [],
    status,
    notes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeInquiry(
  status: ClientInquiry["status"],
  overrides: Partial<ClientInquiry> = {},
): ClientInquiry {
  return {
    id: `inq_${Math.random().toString(36).slice(2, 8)}`,
    leadSlug: "lead-1",
    businessName: "Test Co",
    message: "Hi",
    status,
    createdAt: new Date(NOW - 2 * HOUR_MS).toISOString(),
    updatedAt: new Date(NOW - 2 * HOUR_MS).toISOString(),
    ...overrides,
  };
}

function makeOrder(amountPaid: number): OrderRecord {
  return {
    id: "order_1",
    leadSlug: "lead-1",
    stripeSessionId: "sess_1",
    tier: "starter",
    commerceAddon: false,
    amountPaid,
    status: "paid",
    createdAt: new Date().toISOString(),
  };
}

describe("computePipelineHealth", () => {
  it("returns all-zero health for empty input", () => {
    const health = computePipelineHealth({ leads: [], orders: [], handoffs: [], inquiries: [] });
    expect(health.revenueTotalUsd).toBe(0);
    expect(health.leadCount).toBe(0);
    expect(health.orderCount).toBe(0);
    expect(health.marketingPacksDueCount).toBe(0);
    expect(health.marketingPacksDueMonth).toBe("1970-01");
    expect(health.commerceCatalogsMissingCount).toBe(0);
    expect(health.commerceCatalogsUnsyncedCount).toBe(0);
    expect(health.clientVoicePacksDueCount).toBe(0);
    expect(health.stageCounts).toEqual(emptyStageCounts());
    expect(health.closedLeadCount).toBe(0);
    expect(health.stageFunnel.map((s) => s.stage)).toEqual([
      "discovered",
      "site_built",
      "outreach_sent",
      "discovery_call",
      "paid",
      "live",
    ]);
  });

  it("sums order revenue and ignores non-finite amounts", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [makeOrder(500), makeOrder(250), { ...makeOrder(NaN) }],
      handoffs: [],
      inquiries: [],
    });
    expect(health.revenueTotalUsd).toBe(750);
    expect(health.orderCount).toBe(3);
  });

  it("counts leads per stage", () => {
    const health = computePipelineHealth({
      leads: [makeLead("discovered"), makeLead("discovered"), makeLead("paid")],
      orders: [],
      handoffs: [],
      inquiries: [],
    });
    expect(health.stageCounts.discovered).toBe(2);
    expect(health.stageCounts.paid).toBe(1);
    expect(health.leadCount).toBe(3);
  });

  it("flags leads missing email only in revenue-critical stages", () => {
    const health = computePipelineHealth({
      leads: [
        makeLead("outreach_sent", { email: undefined, slug: "no-email-critical" }),
        makeLead("discovered", { email: undefined, slug: "no-email-not-critical" }),
        makeLead("paid", { email: "has@example.com", slug: "has-email" }),
      ],
      orders: [],
      handoffs: [],
      inquiries: [],
    });
    expect(health.leadsMissingEmailCount).toBe(1);
    expect(health.leadsMissingEmail.map((l) => l.slug)).toEqual(["no-email-critical"]);
  });

  it("counts open handoffs (non-live) and new inquiries", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [makeHandoff("pending"), makeHandoff("awaiting_dns"), makeHandoff("live")],
      inquiries: [makeInquiry("new"), makeInquiry("read"), makeInquiry("new")],
    });
    expect(health.openHandoffCount).toBe(2);
    expect(health.newInquiryCount).toBe(2);
    expect(health.unrepliedInquiryCount).toBe(3);
  });

  it("counts unreplied inquiries (new+read) with oldest age; ignores replied/archived", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [
        makeInquiry("new", {
          id: "inq_new",
          createdAt: new Date(NOW - 5 * HOUR_MS).toISOString(),
        }),
        makeInquiry("read", {
          id: "inq_read",
          createdAt: new Date(NOW - 30 * HOUR_MS).toISOString(),
        }),
        makeInquiry("replied", {
          id: "inq_replied",
          createdAt: new Date(NOW - 100 * HOUR_MS).toISOString(),
        }),
        makeInquiry("archived", {
          id: "inq_archived",
          createdAt: new Date(NOW - 200 * HOUR_MS).toISOString(),
        }),
      ],
      nowMs: NOW,
    });
    expect(health.newInquiryCount).toBe(1);
    expect(health.unrepliedInquiryCount).toBe(2);
    expect(health.oldestUnrepliedInquiryAgeHours).toBe(30);
  });

  it("defaults unreplied inquiry metrics to zero without inquiries", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });
    expect(health.unrepliedInquiryCount).toBe(0);
    expect(health.oldestUnrepliedInquiryAgeHours).toBeNull();
  });

  it("a newest-N inquiries page hides an older unreplied inquiry that the uncapped set catches", () => {
    // Simulate listClientInquiries(N)'s newest-first page: an old unreplied
    // inquiry pushed off the page by newer replied/archived traffic. Callers
    // must feed computePipelineHealth from listUnrepliedInquiries() (uncapped
    // status new+read), not a capped newest-N page of every status.
    const oldUnreplied = makeInquiry("new", {
      id: "inq_old_unreplied",
      createdAt: new Date(NOW - 500 * HOUR_MS).toISOString(),
    });
    const newerReplied = Array.from({ length: 3 }, (_, i) =>
      makeInquiry("replied", {
        id: `inq_replied_${i}`,
        createdAt: new Date(NOW - i * HOUR_MS).toISOString(),
      }),
    );
    const fullSet = [oldUnreplied, ...newerReplied];
    const truncatedToNewestTwo = [...fullSet]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 2);

    const fromFullSet = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: fullSet,
      nowMs: NOW,
    });
    const fromTruncatedPage = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: truncatedToNewestTwo,
      nowMs: NOW,
    });

    expect(fromFullSet.unrepliedInquiryCount).toBe(1);
    expect(fromTruncatedPage.unrepliedInquiryCount).toBe(0);
  });

  it("counts paid-not-live leads as those still in the paid stage", () => {
    const health = computePipelineHealth({
      leads: [makeLead("paid"), makeLead("paid"), makeLead("live")],
      orders: [],
      handoffs: [],
      inquiries: [],
    });
    expect(health.paidNotLiveCount).toBe(2);
  });

  it("defaults abandoned checkout metrics to zero without sessions", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });
    expect(health.abandonedCheckoutCount).toBe(0);
    expect(health.recoveryDueCount).toBe(0);
    expect(health.oldestAbandonedAgeHours).toBeNull();
  });

  it("counts abandoned and recovery-due sessions with oldest age", () => {
    const fresh = makeSession({
      stripeSessionId: "cs_fresh",
      createdAt: new Date(NOW - (ABANDONED_AFTER_HOURS - 1) * HOUR_MS).toISOString(),
    });
    const abandonedDue = makeSession({
      stripeSessionId: "cs_due",
      createdAt: new Date(NOW - 5 * HOUR_MS).toISOString(),
    });
    const abandonedCooldown = makeSession({
      stripeSessionId: "cs_cooldown",
      createdAt: new Date(NOW - 30 * HOUR_MS).toISOString(),
      recoverySentAt: new Date(NOW - 1 * HOUR_MS).toISOString(),
    });
    const complete = makeSession({
      stripeSessionId: "cs_done",
      status: "complete",
      createdAt: new Date(NOW - 40 * HOUR_MS).toISOString(),
    });

    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      openCheckoutSessions: [fresh, abandonedDue, abandonedCooldown, complete],
      nowMs: NOW,
    });

    expect(health.abandonedCheckoutCount).toBe(2);
    expect(health.recoveryDueCount).toBe(1);
    expect(health.oldestAbandonedAgeHours).toBe(30);
    expect(health.commerceAbandonedCheckoutCount).toBe(0);
    expect(health.commerceRecoveryDueCount).toBe(0);
  });

  it("counts commerce Buy now abandoned carts separately from bundle carts", () => {
    const bundleDue = makeSession({
      stripeSessionId: "cs_bundle",
      createdAt: new Date(NOW - 5 * HOUR_MS).toISOString(),
    });
    const commerceDue = makeSession({
      stripeSessionId: "cs_commerce",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      createdAt: new Date(NOW - 6 * HOUR_MS).toISOString(),
    });
    const commerceFresh = makeSession({
      stripeSessionId: "cs_commerce_fresh",
      kind: "commerce_sku",
      skuId: "sku_tea",
      tier: "",
      createdAt: new Date(NOW - 1 * HOUR_MS).toISOString(),
    });

    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      openCheckoutSessions: [bundleDue, commerceDue, commerceFresh],
      nowMs: NOW,
    });

    expect(health.abandonedCheckoutCount).toBe(1);
    expect(health.recoveryDueCount).toBe(1);
    expect(health.commerceAbandonedCheckoutCount).toBe(1);
    expect(health.commerceRecoveryDueCount).toBe(1);
  });

  it("defaults cold lead metrics to zero without cold leads", () => {
    const health = computePipelineHealth({
      leads: [makeLead("outreach_sent", { outreachStep: 1 })],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });
    expect(health.coldLeadCount).toBe(0);
    expect(health.oldestColdLeadAgeHours).toBeNull();
  });

  it("counts leads that exhausted Email 1-3 with no reply, with oldest age", () => {
    const cold = makeLead("outreach_sent", {
      slug: "cold-lead",
      outreachStep: 3,
      lastOutreachAt: new Date(NOW - 30 * 24 * HOUR_MS).toISOString(),
    });
    const stillDue = makeLead("outreach_sent", {
      slug: "due-lead",
      outreachStep: 1,
      lastOutreachAt: new Date(NOW - 10 * HOUR_MS).toISOString(),
    });
    const paidOld = makeLead("paid", {
      slug: "paid-lead",
      outreachStep: 3,
      lastOutreachAt: new Date(NOW - 60 * 24 * HOUR_MS).toISOString(),
    });

    const health = computePipelineHealth({
      leads: [cold, stillDue, paidOld],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });

    expect(health.coldLeadCount).toBe(1);
    expect(health.oldestColdLeadAgeHours).toBe(30 * 24);
  });

  it("defaults snoozed lead metrics to zero without active snoozes", () => {
    const expired = makeLead("outreach_sent", {
      snoozedUntil: new Date(NOW - HOUR_MS).toISOString(),
    });
    const health = computePipelineHealth({
      leads: [expired],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });
    expect(health.snoozedLeadCount).toBe(0);
    expect(health.soonestSnoozeRemainingHours).toBeNull();
  });

  it("counts currently-snoozed leads and soonest remaining hours", () => {
    const soon = makeLead("outreach_sent", {
      slug: "snooze-soon",
      snoozedUntil: new Date(NOW + 3 * HOUR_MS).toISOString(),
    });
    const later = makeLead("discovery_call", {
      slug: "snooze-later",
      snoozedUntil: new Date(NOW + 2 * 24 * HOUR_MS).toISOString(),
    });
    const paidSnoozed = makeLead("paid", {
      slug: "paid-snoozed",
      snoozedUntil: new Date(NOW + HOUR_MS).toISOString(),
    });
    const notSnoozed = makeLead("site_built", { slug: "awake" });

    const health = computePipelineHealth({
      leads: [soon, later, paidSnoozed, notSnoozed],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });

    expect(health.snoozedLeadCount).toBe(3);
    expect(health.soonestSnoozeRemainingHours).toBe(1);
  });

  it("defaults follow-up-due metrics to zero without due leads", () => {
    const notYetDue = makeLead("outreach_sent", {
      outreachStep: 1,
      lastOutreachAt: new Date(NOW - 10 * HOUR_MS).toISOString(),
    });
    const health = computePipelineHealth({
      leads: [notYetDue],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });
    expect(health.followUpsDueCount).toBe(0);
    expect(health.oldestFollowUpDueAgeHours).toBeNull();
  });

  it("counts leads due for Email 2/3 with oldest age since last outreach", () => {
    const due2 = makeLead("outreach_sent", {
      slug: "due-email-2",
      outreachStep: 1,
      lastOutreachAt: new Date(NOW - 4 * 24 * HOUR_MS).toISOString(),
    });
    const due3Older = makeLead("discovery_call", {
      slug: "due-email-3",
      outreachStep: 2,
      lastOutreachAt: new Date(NOW - 10 * 24 * HOUR_MS).toISOString(),
    });
    const notDueYet = makeLead("outreach_sent", {
      slug: "not-due",
      outreachStep: 1,
      lastOutreachAt: new Date(NOW - HOUR_MS).toISOString(),
    });
    const exhausted = makeLead("outreach_sent", {
      slug: "exhausted",
      outreachStep: 3,
      lastOutreachAt: new Date(NOW - 30 * 24 * HOUR_MS).toISOString(),
    });

    const health = computePipelineHealth({
      leads: [due2, due3Older, notDueYet, exhausted],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });

    expect(health.followUpsDueCount).toBe(2);
    expect(health.oldestFollowUpDueAgeHours).toBe(10 * 24);
  });

  it("counts Growth/Complete leads missing this month's marketing pack", () => {
    const needsPack = makeLead("paid", { slug: "needs-pack" });
    const hasPack = makeLead("live", { slug: "has-pack" });
    const starterOnly = makeLead("paid", { slug: "starter-only" });
    const health = computePipelineHealth({
      leads: [needsPack, hasPack, starterOnly],
      orders: [
        { ...makeOrder(599), id: "o1", leadSlug: "needs-pack", tier: "growth" },
        { ...makeOrder(699), id: "o2", leadSlug: "has-pack", tier: "complete" },
        { ...makeOrder(500), id: "o3", leadSlug: "starter-only", tier: "starter" },
      ],
      handoffs: [],
      inquiries: [],
      marketingPacksThisMonth: [{ leadSlug: "has-pack", yearMonth: "2026-07" }],
      nowMs: NOW,
    });
    expect(health.marketingPacksDueCount).toBe(1);
    expect(health.marketingPacksDueMonth).toBe("2026-07");
  });

  it("counts paid/live commerceAddon leads missing a catalog", () => {
    const needsCatalog = makeLead("paid", { slug: "needs-catalog" });
    const hasCatalog = makeLead("live", { slug: "has-catalog" });
    const noAddon = makeLead("paid", { slug: "no-addon" });
    const health = computePipelineHealth({
      leads: [needsCatalog, hasCatalog, noAddon],
      orders: [
        {
          ...makeOrder(849),
          id: "o1",
          leadSlug: "needs-catalog",
          tier: "starter",
          commerceAddon: true,
        },
        {
          ...makeOrder(849),
          id: "o2",
          leadSlug: "has-catalog",
          tier: "growth",
          commerceAddon: true,
        },
        {
          ...makeOrder(500),
          id: "o3",
          leadSlug: "no-addon",
          tier: "starter",
          commerceAddon: false,
        },
      ],
      handoffs: [],
      inquiries: [],
      commerceCatalogs: [{ leadSlug: "has-catalog" }],
      nowMs: NOW,
    });
    expect(health.commerceCatalogsMissingCount).toBe(1);
  });

  it("counts saved Commerce catalogs that still need Sync to Stripe", () => {
    const unsynced = makeLead("paid", { slug: "unsynced-shop" });
    const synced = makeLead("live", { slug: "synced-shop" });
    const health = computePipelineHealth({
      leads: [unsynced, synced],
      orders: [
        {
          ...makeOrder(849),
          id: "o1",
          leadSlug: "unsynced-shop",
          tier: "starter",
          commerceAddon: true,
        },
        {
          ...makeOrder(849),
          id: "o2",
          leadSlug: "synced-shop",
          tier: "growth",
          commerceAddon: true,
        },
      ],
      handoffs: [],
      inquiries: [],
      commerceCatalogs: [
        {
          leadSlug: "unsynced-shop",
          items: [{ id: "a", stripePriceId: undefined }],
        },
        {
          leadSlug: "synced-shop",
          items: [{ id: "b", stripePriceId: "price_b" }],
        },
      ],
      nowMs: NOW,
    });
    expect(health.commerceCatalogsMissingCount).toBe(0);
    expect(health.commerceCatalogsUnsyncedCount).toBe(1);
  });

  it("counts Complete leads missing a client voice FAQ pack", () => {
    const needsVoice = makeLead("paid", { slug: "needs-voice" });
    const hasVoice = makeLead("live", { slug: "has-voice" });
    const growthOnly = makeLead("paid", { slug: "growth-only" });
    const health = computePipelineHealth({
      leads: [needsVoice, hasVoice, growthOnly],
      orders: [
        { ...makeOrder(699), id: "o1", leadSlug: "needs-voice", tier: "complete" },
        { ...makeOrder(699), id: "o2", leadSlug: "has-voice", tier: "complete" },
        { ...makeOrder(599), id: "o3", leadSlug: "growth-only", tier: "growth" },
      ],
      handoffs: [],
      inquiries: [],
      clientVoicePacks: [{ leadSlug: "has-voice" }],
      nowMs: NOW,
    });
    expect(health.clientVoicePacksDueCount).toBe(1);
  });

  it("sums commerce Buy now order revenue separately from revenueTotalUsd", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [{ ...makeOrder(500), id: "o1", leadSlug: "starter-lead", tier: "starter" }],
      handoffs: [],
      inquiries: [],
      commerceOrders: [
        { amountPaidUsd: 12.5 },
        { amountPaidUsd: 7.25 },
      ],
      nowMs: NOW,
    });
    expect(health.commerceOrdersRevenueUsd).toBe(19.75);
    expect(health.commerceOrdersCount).toBe(2);
    // Bundle revenue and Commerce pass-through sales never mix.
    expect(health.revenueTotalUsd).toBe(500);
  });

  it("excludes paid-out commerce orders from the owed pass-through card", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      commerceOrders: [
        { amountPaidUsd: 12.5, paidOutAt: "2026-07-12T10:00:00.000Z" },
        { amountPaidUsd: 7.25 },
        { amountPaidUsd: 3.0, paidOutAt: "2026-07-12T11:00:00.000Z" },
      ],
      nowMs: NOW,
    });
    expect(health.commerceOrdersRevenueUsd).toBe(7.25);
    expect(health.commerceOrdersCount).toBe(1);
  });

  it("defaults commerce order revenue to zero when none recorded", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });
    expect(health.commerceOrdersRevenueUsd).toBe(0);
    expect(health.commerceOrdersCount).toBe(0);
  });

  it("defaults closed lead count to zero when none are closed", () => {
    const health = computePipelineHealth({
      leads: [makeLead("outreach_sent"), makeLead("paid")],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });
    expect(health.closedLeadCount).toBe(0);
    expect(health.stageCounts.closed).toBe(0);
  });

  it("counts closed leads and keeps them out of the active stage funnel", () => {
    const closedA = makeLead("closed", { slug: "closed-a" });
    const closedB = makeLead("closed", { slug: "closed-b" });
    const live = makeLead("live", { slug: "live-a" });

    const health = computePipelineHealth({
      leads: [closedA, closedB, live],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });

    expect(health.closedLeadCount).toBe(2);
    expect(health.stageCounts.closed).toBe(2);
    expect(health.stageFunnel.map((s) => s.stage)).not.toContain("closed");
    expect(health.stageFunnel.find((s) => s.stage === "live")?.count).toBe(1);
  });
});

describe("isUnrepliedInquiryStatus", () => {
  it("treats new and read as unreplied", () => {
    expect(isUnrepliedInquiryStatus("new")).toBe(true);
    expect(isUnrepliedInquiryStatus("read")).toBe(true);
    expect(isUnrepliedInquiryStatus("replied")).toBe(false);
    expect(isUnrepliedInquiryStatus("archived")).toBe(false);
  });
});

describe("formatUsd", () => {
  it("formats whole dollars without decimals", () => {
    expect(formatUsd(500)).toBe("$500");
  });

  it("formats fractional dollars with cents", () => {
    expect(formatUsd(499.5)).toBe("$499.50");
  });
});

describe("formatAbandonedAgeHours", () => {
  it("renders a dash when there is no abandoned session", () => {
    expect(formatAbandonedAgeHours(null)).toBe("—");
  });

  it("renders hours under a day and day+hour combinations", () => {
    expect(formatAbandonedAgeHours(3)).toBe("3h");
    expect(formatAbandonedAgeHours(24)).toBe("1d");
    expect(formatAbandonedAgeHours(30)).toBe("1d 6h");
  });
});
