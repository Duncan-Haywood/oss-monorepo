import { describe, expect, it } from "vitest";
import {
  computePipelineHealth,
  deployHandoffAgeHours,
  emptyStageCounts,
  formatAbandonedAgeHours,
  formatUsd,
  isUnrepliedInquiryStatus,
  oldestBundleOrderRefundOrDisputeAgeHours,
  oldestCommerceOrdersOwedAgeHours,
  oldestOpenHandoffAgeHours,
  oldestPaidNotLiveAgeHours,
  oldestUnrepliedInquiryAgeHoursFor,
} from "./pipeline-health";
import type { Lead, LeadPipelineStage } from "../leads/types";
import type { DeployHandoff } from "../deploy/types";
import type { ClientInquiry } from "../inquiries/types";
import type { OrderRecord } from "../orders/types";
import type { CheckoutSessionRecord } from "../checkout/types";
import { ABANDONED_AFTER_HOURS } from "../checkout/abandoned-recovery";

const NOW = Date.parse("2026-07-12T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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

function makeHandoff(
  status: DeployHandoff["status"],
  overrides: Partial<DeployHandoff> = {},
): DeployHandoff {
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
    ...overrides,
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
    expect(health.bundleOrdersRefundedCount).toBe(0);
    expect(health.bundleOrdersRefundedUsd).toBe(0);
    expect(health.oldestBundleOrdersRefundedAgeHours).toBeNull();
    expect(health.bundleOrdersDisputedCount).toBe(0);
    expect(health.bundleOrdersDisputedUsd).toBe(0);
    expect(health.oldestBundleOrdersDisputedAgeHours).toBeNull();
    expect(health.marketingPacksDueCount).toBe(0);
    expect(health.marketingPacksDueMonth).toBe("1970-01");
    expect(health.oldestMarketingPacksDueAgeHours).toBeNull();
    expect(health.commerceCatalogsMissingCount).toBe(0);
    expect(health.oldestCommerceCatalogsMissingAgeHours).toBeNull();
    expect(health.commerceCatalogsUnsyncedCount).toBe(0);
    expect(health.oldestCommerceCatalogsUnsyncedAgeHours).toBeNull();
    expect(health.clientVoicePacksDueCount).toBe(0);
    expect(health.oldestClientVoicePacksDueAgeHours).toBeNull();
    expect(health.recurringEntitlementPausedCount).toBe(0);
    expect(health.oldestRecurringEntitlementPausedAgeHours).toBeNull();
    expect(health.starterUpsellCandidatesCount).toBe(0);
    expect(health.oldestStarterUpsellCandidateAgeHours).toBeNull();
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

  it("excludes refunded bundle orders from revenueTotalUsd but keeps orderCount", () => {
    const refunded = { ...makeOrder(300), refundedAt: "2026-07-01T00:00:00.000Z" };
    const health = computePipelineHealth({
      leads: [],
      orders: [makeOrder(500), refunded],
      handoffs: [],
      inquiries: [],
      nowMs: Date.parse("2026-07-03T00:00:00.000Z"),
    });
    expect(health.revenueTotalUsd).toBe(500);
    expect(health.orderCount).toBe(2);
    expect(health.bundleOrdersRefundedCount).toBe(1);
    expect(health.bundleOrdersRefundedUsd).toBe(300);
    expect(health.oldestBundleOrdersRefundedAgeHours).toBe(48);
  });

  it("returns zero bundle refund stats and null age when nothing is refunded", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [makeOrder(500)],
      handoffs: [],
      inquiries: [],
    });
    expect(health.bundleOrdersRefundedCount).toBe(0);
    expect(health.bundleOrdersRefundedUsd).toBe(0);
    expect(health.oldestBundleOrdersRefundedAgeHours).toBeNull();
  });

  it("reports the oldest refundedAt among multiple refunded bundle orders", () => {
    const older = {
      ...makeOrder(100),
      id: "order_older",
      refundedAt: "2026-06-01T00:00:00.000Z",
    };
    const newer = {
      ...makeOrder(200),
      id: "order_newer",
      refundedAt: "2026-07-01T00:00:00.000Z",
    };
    const health = computePipelineHealth({
      leads: [],
      orders: [newer, older],
      handoffs: [],
      inquiries: [],
      nowMs: Date.parse("2026-07-02T00:00:00.000Z"),
    });
    expect(health.bundleOrdersRefundedCount).toBe(2);
    expect(health.bundleOrdersRefundedUsd).toBe(300);
    expect(health.oldestBundleOrdersRefundedAgeHours).toBeGreaterThan(700);
  });

  it("excludes disputed bundle orders from revenueTotalUsd but keeps orderCount", () => {
    const disputed = { ...makeOrder(300), disputedAt: "2026-07-01T00:00:00.000Z" };
    const health = computePipelineHealth({
      leads: [],
      orders: [makeOrder(500), disputed],
      handoffs: [],
      inquiries: [],
      nowMs: Date.parse("2026-07-03T00:00:00.000Z"),
    });
    expect(health.revenueTotalUsd).toBe(500);
    expect(health.orderCount).toBe(2);
    expect(health.bundleOrdersDisputedCount).toBe(1);
    expect(health.bundleOrdersDisputedUsd).toBe(300);
    expect(health.oldestBundleOrdersDisputedAgeHours).toBe(48);
  });

  it("returns zero bundle dispute stats and null age when nothing is disputed", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [makeOrder(500)],
      handoffs: [],
      inquiries: [],
    });
    expect(health.bundleOrdersDisputedCount).toBe(0);
    expect(health.bundleOrdersDisputedUsd).toBe(0);
    expect(health.oldestBundleOrdersDisputedAgeHours).toBeNull();
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

  it("reports the oldest open handoff age (ignoring live rows) and null when none open", () => {
    const withOpen = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [
        makeHandoff("pending", {
          id: "h_recent",
          createdAt: new Date(NOW - 4 * HOUR_MS).toISOString(),
        }),
        makeHandoff("awaiting_dns", {
          id: "h_old",
          createdAt: new Date(NOW - 40 * HOUR_MS).toISOString(),
        }),
        // A live handoff that is older still must NOT anchor the age — it is
        // no longer open fulfillment debt.
        makeHandoff("live", {
          id: "h_live_older",
          createdAt: new Date(NOW - 500 * HOUR_MS).toISOString(),
        }),
      ],
      inquiries: [],
      nowMs: NOW,
    });
    expect(withOpen.openHandoffCount).toBe(2);
    expect(withOpen.oldestOpenHandoffAgeHours).toBe(40);

    const noneOpen = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [makeHandoff("live", { createdAt: new Date(NOW - 9 * HOUR_MS).toISOString() })],
      inquiries: [],
      nowMs: NOW,
    });
    expect(noneOpen.openHandoffCount).toBe(0);
    expect(noneOpen.oldestOpenHandoffAgeHours).toBeNull();
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
    // No order at all for either paid lead — nothing to anchor the age on.
    expect(health.oldestPaidNotLiveAgeHours).toBeNull();
  });

  it("anchors oldestPaidNotLiveAgeHours to the oldest matching order and skips leads with no order", () => {
    const leadWithOlderOrder = makeLead("paid", { slug: "lead-with-older-order" });
    const leadWithNewerOrder = makeLead("paid", { slug: "lead-with-newer-order" });
    const leadWithNoOrder = makeLead("paid", { slug: "lead-with-no-order" });
    const liveLeadWithOldOrder = makeLead("live", { slug: "live-lead-old-order" });
    const olderOrder: OrderRecord = {
      ...makeOrder(500),
      leadSlug: "lead-with-older-order",
      createdAt: new Date(NOW - 80 * HOUR_MS).toISOString(),
    };
    const newerOrder: OrderRecord = {
      ...makeOrder(500),
      leadSlug: "lead-with-newer-order",
      createdAt: new Date(NOW - 5 * HOUR_MS).toISOString(),
    };
    // Ancient order belongs to a lead that is already live — must not anchor
    // the paid-not-live signal (same "only open debt anchors" rule as
    // oldestOpenHandoffAgeHours excluding live handoffs).
    const liveOrder: OrderRecord = {
      ...makeOrder(500),
      leadSlug: "live-lead-old-order",
      createdAt: new Date(NOW - 500 * HOUR_MS).toISOString(),
    };

    const health = computePipelineHealth({
      leads: [leadWithOlderOrder, leadWithNewerOrder, leadWithNoOrder, liveLeadWithOldOrder],
      orders: [olderOrder, newerOrder, liveOrder],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });

    expect(health.paidNotLiveCount).toBe(3);
    expect(health.oldestPaidNotLiveAgeHours).toBe(80);
  });

  it("does not let a refunded order's old createdAt anchor oldestPaidNotLiveAgeHours over a fresh later payment (paid-not-live-refund-dispute-age-guard)", () => {
    const lead = makeLead("paid", { slug: "lead-a" });
    const refundedOldOrder: OrderRecord = {
      ...makeOrder(500),
      leadSlug: "lead-a",
      createdAt: new Date(NOW - 2160 * HOUR_MS).toISOString(),
      refundedAt: new Date(NOW - 2000 * HOUR_MS).toISOString(),
    };
    const freshOrder: OrderRecord = {
      ...makeOrder(500),
      leadSlug: "lead-a",
      createdAt: new Date(NOW - 2 * HOUR_MS).toISOString(),
    };

    const health = computePipelineHealth({
      leads: [lead],
      orders: [refundedOldOrder, freshOrder],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });

    expect(health.oldestPaidNotLiveAgeHours).toBe(2);
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
    expect(health.oldestCommerceAbandonedAgeHours).toBeNull();
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
      leads: [makeLead("paid", { slug: "cart-lead" })],
      orders: [
        {
          id: "ord_1",
          leadSlug: "cart-lead",
          tier: "starter",
          amountPaid: 800,
          stripeSessionId: "cs_paid",
          commerceAddon: true,
          status: "paid",
          createdAt: new Date(NOW - 10 * DAY_MS).toISOString(),
        },
      ],
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

  it("computes oldest age for commerce Buy now abandoned carts, independent of bundle carts", () => {
    const bundleOlder = makeSession({
      stripeSessionId: "cs_bundle_old",
      createdAt: new Date(NOW - 40 * HOUR_MS).toISOString(),
    });
    const commerceNewer = makeSession({
      stripeSessionId: "cs_commerce_newer",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      createdAt: new Date(NOW - 6 * HOUR_MS).toISOString(),
    });
    const commerceOlder = makeSession({
      stripeSessionId: "cs_commerce_older",
      kind: "commerce_sku",
      skuId: "sku_tea",
      tier: "",
      createdAt: new Date(NOW - 20 * HOUR_MS).toISOString(),
    });

    const health = computePipelineHealth({
      leads: [makeLead("paid", { slug: "cart-lead" })],
      orders: [
        {
          id: "ord_1",
          leadSlug: "cart-lead",
          tier: "starter",
          amountPaid: 800,
          stripeSessionId: "cs_paid",
          commerceAddon: true,
          status: "paid",
          createdAt: new Date(NOW - 10 * DAY_MS).toISOString(),
        },
      ],
      handoffs: [],
      inquiries: [],
      openCheckoutSessions: [bundleOlder, commerceNewer, commerceOlder],
      nowMs: NOW,
    });

    // Bundle oldest age (40h) must not leak into the commerce-only field.
    expect(health.oldestAbandonedAgeHours).toBe(40);
    expect(health.commerceAbandonedCheckoutCount).toBe(2);
    expect(health.oldestCommerceAbandonedAgeHours).toBe(20);
  });

  it("omits commerce abandoned carts when recurring entitlement is paused", () => {
    const commerceDue = makeSession({
      stripeSessionId: "cs_commerce_paused",
      kind: "commerce_sku",
      skuId: "sku_latte",
      tier: "",
      createdAt: new Date(NOW - 6 * HOUR_MS).toISOString(),
    });

    const health = computePipelineHealth({
      leads: [makeLead("paid", { slug: "cart-lead" })],
      orders: [
        {
          id: "ord_paused",
          leadSlug: "cart-lead",
          tier: "starter",
          amountPaid: 800,
          stripeSessionId: "cs_paid",
          commerceAddon: true,
          recurringCanceledAt: Date.parse("2026-07-01T00:00:00.000Z"),
          status: "paid",
          createdAt: new Date(NOW - 10 * DAY_MS).toISOString(),
        },
      ],
      handoffs: [],
      inquiries: [],
      openCheckoutSessions: [commerceDue],
      nowMs: NOW,
    });

    expect(health.commerceAbandonedCheckoutCount).toBe(0);
    expect(health.commerceRecoveryDueCount).toBe(0);
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

  it("anchors oldestMarketingPacksDueAgeHours to month start, not the subscriber's original order", () => {
    const longTimeSubscriber = makeLead("paid", { slug: "long-time" });
    const health = computePipelineHealth({
      leads: [longTimeSubscriber],
      orders: [
        {
          ...makeOrder(599),
          id: "o1",
          leadSlug: "long-time",
          tier: "growth",
          // Subscribed months before July — due-since is still 2026-07-01, not
          // this order's createdAt, so tenure doesn't inflate the age forever.
          createdAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
        },
      ],
      handoffs: [],
      inquiries: [],
      marketingPacksThisMonth: [],
      nowMs: NOW,
    });
    const expectedMonthStartMs = Date.UTC(2026, 6, 1);
    expect(health.marketingPacksDueCount).toBe(1);
    expect(health.oldestMarketingPacksDueAgeHours).toBe(
      Math.floor((NOW - expectedMonthStartMs) / HOUR_MS),
    );
  });

  it("counts paid/live leads with paused recurring entitlement (not marketing packs due)", () => {
    const paused = makeLead("paid", { slug: "paused-mrr" });
    const active = makeLead("live", { slug: "active-mrr" });
    const pausedAt = NOW - 5 * 60 * 60 * 1000;
    const health = computePipelineHealth({
      leads: [paused, active],
      orders: [
        {
          ...makeOrder(599),
          id: "o1",
          leadSlug: "paused-mrr",
          tier: "growth",
          recurringCanceledAt: pausedAt,
          stripeCustomerId: "cus_paused",
        },
        {
          ...makeOrder(699),
          id: "o2",
          leadSlug: "active-mrr",
          tier: "complete",
        },
      ],
      handoffs: [],
      inquiries: [],
      marketingPacksThisMonth: [],
      nowMs: NOW,
    });
    // Paused lead drops out of packs-due; active Complete still needs a pack.
    expect(health.marketingPacksDueCount).toBe(1);
    expect(health.recurringEntitlementPausedCount).toBe(1);
    expect(health.oldestRecurringEntitlementPausedAgeHours).toBe(5);
  });

  it("counts paid/live Starter-only leads ready for a Growth/Complete upsell nudge", () => {
    const upsellCandidate = makeLead("paid", { slug: "starter-upsell", email: "owner@example.com" });
    const olderCandidate = makeLead("live", { slug: "starter-upsell-older", email: "owner2@example.com" });
    const alreadyRecurring = makeLead("live", { slug: "already-growth", email: "owner3@example.com" });
    const noEmail = makeLead("paid", { slug: "starter-no-email", email: undefined });
    const olderCreatedAt = NOW - 10 * HOUR_MS;
    const health = computePipelineHealth({
      leads: [upsellCandidate, olderCandidate, alreadyRecurring, noEmail],
      orders: [
        {
          ...makeOrder(500),
          id: "o1",
          leadSlug: "starter-upsell",
          tier: "starter",
          createdAt: new Date(NOW - 4 * HOUR_MS).toISOString(),
        },
        {
          ...makeOrder(500),
          id: "o2",
          leadSlug: "starter-upsell-older",
          tier: "starter",
          createdAt: new Date(olderCreatedAt).toISOString(),
        },
        { ...makeOrder(599), id: "o3", leadSlug: "already-growth", tier: "growth" },
        {
          ...makeOrder(500),
          id: "o4",
          leadSlug: "starter-no-email",
          tier: "starter",
          createdAt: new Date(NOW - 20 * HOUR_MS).toISOString(),
        },
      ],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });
    expect(health.starterUpsellCandidatesCount).toBe(2);
    expect(health.oldestStarterUpsellCandidateAgeHours).toBe(10);
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
          createdAt: new Date(NOW - 8 * HOUR_MS).toISOString(),
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
    expect(health.oldestCommerceCatalogsMissingAgeHours).toBe(8);
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
          createdAt: new Date(NOW - 12 * HOUR_MS).toISOString(),
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
          items: [{ stripePriceId: undefined }],
        },
        {
          leadSlug: "synced-shop",
          items: [{ stripePriceId: "price_b" }],
        },
      ],
      nowMs: NOW,
    });
    expect(health.commerceCatalogsMissingCount).toBe(0);
    expect(health.commerceCatalogsUnsyncedCount).toBe(1);
    expect(health.oldestCommerceCatalogsUnsyncedAgeHours).toBe(12);
  });

  it("counts Complete leads missing a client voice FAQ pack", () => {
    const needsVoice = makeLead("paid", { slug: "needs-voice" });
    const hasVoice = makeLead("live", { slug: "has-voice" });
    const growthOnly = makeLead("paid", { slug: "growth-only" });
    const health = computePipelineHealth({
      leads: [needsVoice, hasVoice, growthOnly],
      orders: [
        {
          ...makeOrder(699),
          id: "o1",
          leadSlug: "needs-voice",
          tier: "complete",
          createdAt: new Date(NOW - 6 * HOUR_MS).toISOString(),
        },
        { ...makeOrder(699), id: "o2", leadSlug: "has-voice", tier: "complete" },
        { ...makeOrder(599), id: "o3", leadSlug: "growth-only", tier: "growth" },
      ],
      handoffs: [],
      inquiries: [],
      clientVoicePacks: [{ leadSlug: "has-voice" }],
      nowMs: NOW,
    });
    expect(health.clientVoicePacksDueCount).toBe(1);
    expect(health.oldestClientVoicePacksDueAgeHours).toBe(6);
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

  it("excludes refunded commerce orders from the owed pass-through card (never paid out)", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      commerceOrders: [
        { amountPaidUsd: 12.5, refundedAt: "2026-07-12T10:00:00.000Z" },
        { amountPaidUsd: 7.25 },
      ],
      nowMs: NOW,
    });
    expect(health.commerceOrdersRevenueUsd).toBe(7.25);
    expect(health.commerceOrdersCount).toBe(1);
    expect(health.commerceOrdersRefundClawbackCount).toBe(0);
  });

  it("surfaces refund-after-payout as a clawback owed from the client", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      commerceOrdersRefunded: [
        {
          amountPaidUsd: 40,
          paidOutAt: "2026-07-10T10:00:00.000Z",
          refundedAt: "2026-07-14T10:00:00.000Z",
        },
        // Refunded but never paid out — zero clawback risk, excluded.
        { amountPaidUsd: 15, refundedAt: "2026-07-15T10:00:00.000Z" },
      ],
      nowMs: NOW,
    });
    expect(health.commerceOrdersRefundClawbackCount).toBe(1);
    expect(health.commerceOrdersRefundClawbackUsd).toBe(40);
    expect(health.oldestCommerceOrdersRefundClawbackAgeHours).not.toBeNull();
  });

  it("defaults clawback fields to zero/null when no refunds recorded", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });
    expect(health.commerceOrdersRefundClawbackCount).toBe(0);
    expect(health.commerceOrdersRefundClawbackUsd).toBe(0);
    expect(health.oldestCommerceOrdersRefundClawbackAgeHours).toBeNull();
  });

  it("excludes disputed commerce orders from the owed pass-through card (never paid out)", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      commerceOrders: [
        { amountPaidUsd: 12.5, disputedAt: "2026-07-12T10:00:00.000Z" },
        { amountPaidUsd: 7.25 },
      ],
      nowMs: NOW,
    });
    expect(health.commerceOrdersRevenueUsd).toBe(7.25);
    expect(health.commerceOrdersCount).toBe(1);
    expect(health.commerceOrdersDisputeClawbackCount).toBe(0);
  });

  it("surfaces dispute-after-payout as a clawback owed from the client", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      commerceOrdersDisputed: [
        {
          amountPaidUsd: 40,
          paidOutAt: "2026-07-10T10:00:00.000Z",
          disputedAt: "2026-07-14T10:00:00.000Z",
        },
        // Disputed but never paid out — zero clawback risk, excluded.
        { amountPaidUsd: 15, disputedAt: "2026-07-15T10:00:00.000Z" },
      ],
      nowMs: NOW,
    });
    expect(health.commerceOrdersDisputeClawbackCount).toBe(1);
    expect(health.commerceOrdersDisputeClawbackUsd).toBe(40);
    expect(health.oldestCommerceOrdersDisputeClawbackAgeHours).not.toBeNull();
  });

  it("defaults dispute clawback fields to zero/null when no disputes recorded", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      nowMs: NOW,
    });
    expect(health.commerceOrdersDisputeClawbackCount).toBe(0);
    expect(health.commerceOrdersDisputeClawbackUsd).toBe(0);
    expect(health.oldestCommerceOrdersDisputeClawbackAgeHours).toBeNull();
  });

  it("a newest-N commerce orders page hides older unpaid liability the unpaid set catches", () => {
    // Simulate listCommerceOrders(N)'s newest-first page: an old unpaid Buy now
    // row pushed off the page by newer paid-out traffic. Callers must feed
    // computePipelineHealth from listUnpaidCommerceOrders() (uncapped unpaid),
    // not a capped newest-N page of every commerce order — otherwise owed
    // totals undercount and the operator can double-pay a client.
    const olderUnpaid = { amountPaidUsd: 40, paidOutAt: undefined as string | undefined };
    const recentPaidOut = Array.from({ length: 5 }, () => ({
      amountPaidUsd: 10,
      paidOutAt: "2026-06-10T00:00:00.000Z",
    }));
    // Full unpaid set = just the older unpaid row (what listUnpaidCommerceOrders returns).
    const unpaidOnly = [olderUnpaid];
    // Newest-5 page of mixed status hides the older unpaid row (created earlier).
    const truncatedNewestFive = [...recentPaidOut];

    const fromUnpaidSet = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      commerceOrders: unpaidOnly,
      nowMs: NOW,
    });
    const fromTruncatedPage = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      commerceOrders: truncatedNewestFive,
      nowMs: NOW,
    });

    expect(fromUnpaidSet.commerceOrdersRevenueUsd).toBe(40);
    expect(fromUnpaidSet.commerceOrdersCount).toBe(1);
    expect(fromTruncatedPage.commerceOrdersRevenueUsd).toBe(0);
    expect(fromTruncatedPage.commerceOrdersCount).toBe(0);
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
    expect(health.oldestCommerceOrdersOwedAgeHours).toBeNull();
  });

  it("anchors oldestCommerceOrdersOwedAgeHours to the oldest still-owed order, ignoring paid-out/refunded/disputed and no-createdAt rows", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      handoffs: [],
      inquiries: [],
      commerceOrders: [
        // Oldest still-owed row — anchors the signal.
        { amountPaidUsd: 12.5, createdAt: new Date(NOW - 80 * HOUR_MS).toISOString() },
        // Newer still-owed row — does not win over the older one.
        { amountPaidUsd: 7.25, createdAt: new Date(NOW - 5 * HOUR_MS).toISOString() },
        // Paid out — excluded from the owed set entirely, so its older createdAt must not anchor.
        {
          amountPaidUsd: 3.0,
          createdAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
          paidOutAt: "2026-07-12T10:00:00.000Z",
        },
        // Refunded (never paid out) — also excluded, older createdAt must not anchor.
        {
          amountPaidUsd: 9.0,
          createdAt: new Date(NOW - 999 * HOUR_MS).toISOString(),
          refundedAt: "2026-07-12T10:00:00.000Z",
        },
        // No createdAt at all — must be skipped, not treated as age 0.
        { amountPaidUsd: 1.0 },
      ],
      nowMs: NOW,
    });
    expect(health.oldestCommerceOrdersOwedAgeHours).toBe(80);
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

describe("deployHandoffAgeHours", () => {
  it("computes whole hours since createdAt, clamped to 0 for a future timestamp", () => {
    expect(
      deployHandoffAgeHours(new Date(NOW - 40 * HOUR_MS).toISOString(), NOW),
    ).toBe(40);
    expect(deployHandoffAgeHours(new Date(NOW + HOUR_MS).toISOString(), NOW)).toBe(0);
    expect(deployHandoffAgeHours(new Date(NOW).toISOString(), NOW)).toBe(0);
  });

  it("returns null when createdAt fails to parse", () => {
    expect(deployHandoffAgeHours("not-a-date", NOW)).toBeNull();
  });

  it("matches the aggregate oldestOpenHandoffAgeHours loop for the oldest open handoff", () => {
    const health = computePipelineHealth({
      leads: [],
      orders: [],
      inquiries: [],
      handoffs: [
        makeHandoff("pending", {
          createdAt: new Date(NOW - 40 * HOUR_MS).toISOString(),
        }),
        makeHandoff("awaiting_dns", {
          createdAt: new Date(NOW - 10 * HOUR_MS).toISOString(),
        }),
      ],
      nowMs: NOW,
    });
    expect(health.oldestOpenHandoffAgeHours).toBe(40);
    expect(
      deployHandoffAgeHours(new Date(NOW - 40 * HOUR_MS).toISOString(), NOW),
    ).toBe(health.oldestOpenHandoffAgeHours);
  });
});

describe("oldestCommerceOrdersOwedAgeHours", () => {
  it("returns null for an empty order set", () => {
    expect(oldestCommerceOrdersOwedAgeHours([], NOW)).toBeNull();
  });

  it("returns null when every order is missing createdAt or fails to parse", () => {
    expect(
      oldestCommerceOrdersOwedAgeHours(
        [{ createdAt: undefined }, { createdAt: "not-a-date" }],
        NOW,
      ),
    ).toBeNull();
  });

  it("selects the maximum age across orders, skipping unparseable rows", () => {
    expect(
      oldestCommerceOrdersOwedAgeHours(
        [
          { createdAt: new Date(NOW - 5 * HOUR_MS).toISOString() },
          { createdAt: new Date(NOW - 60 * HOUR_MS).toISOString() },
          { createdAt: "not-a-date" },
          { createdAt: undefined },
        ],
        NOW,
      ),
    ).toBe(60);
  });

  it("clamps a future createdAt to 0", () => {
    expect(
      oldestCommerceOrdersOwedAgeHours(
        [{ createdAt: new Date(NOW + HOUR_MS).toISOString() }],
        NOW,
      ),
    ).toBe(0);
  });
});

describe("oldestOpenHandoffAgeHours", () => {
  it("returns null for an empty handoff set", () => {
    expect(oldestOpenHandoffAgeHours([], NOW)).toBeNull();
  });

  it("returns null when every handoff's createdAt fails to parse", () => {
    expect(oldestOpenHandoffAgeHours([{ createdAt: "not-a-date" }], NOW)).toBeNull();
  });

  it("selects the maximum age across handoffs, skipping unparseable rows", () => {
    expect(
      oldestOpenHandoffAgeHours(
        [
          { createdAt: new Date(NOW - 5 * HOUR_MS).toISOString() },
          { createdAt: new Date(NOW - 72 * HOUR_MS).toISOString() },
          { createdAt: "not-a-date" },
        ],
        NOW,
      ),
    ).toBe(72);
  });

  it("clamps a future createdAt to 0", () => {
    expect(
      oldestOpenHandoffAgeHours([{ createdAt: new Date(NOW + HOUR_MS).toISOString() }], NOW),
    ).toBe(0);
  });
});

describe("oldestBundleOrderRefundOrDisputeAgeHours", () => {
  it("returns null for empty refund and dispute sets", () => {
    expect(oldestBundleOrderRefundOrDisputeAgeHours([], [], NOW)).toBeNull();
  });

  it("returns null when every candidate is missing its timestamp or fails to parse", () => {
    expect(
      oldestBundleOrderRefundOrDisputeAgeHours(
        [{ refundedAt: undefined }, { refundedAt: "not-a-date" }],
        [{ disputedAt: undefined }, { disputedAt: "not-a-date" }],
        NOW,
      ),
    ).toBeNull();
  });

  it("selects the maximum age across both refunds and disputes, skipping unparseable rows", () => {
    expect(
      oldestBundleOrderRefundOrDisputeAgeHours(
        [
          { refundedAt: new Date(NOW - 5 * HOUR_MS).toISOString() },
          { refundedAt: "not-a-date" },
        ],
        [
          { disputedAt: new Date(NOW - 90 * HOUR_MS).toISOString() },
          { disputedAt: undefined },
        ],
        NOW,
      ),
    ).toBe(90);
  });

  it("clamps a future refundedAt/disputedAt to 0", () => {
    expect(
      oldestBundleOrderRefundOrDisputeAgeHours(
        [{ refundedAt: new Date(NOW + HOUR_MS).toISOString() }],
        [],
        NOW,
      ),
    ).toBe(0);
  });
});

describe("oldestUnrepliedInquiryAgeHoursFor", () => {
  it("returns null for an empty inquiry set", () => {
    expect(oldestUnrepliedInquiryAgeHoursFor([], NOW)).toBeNull();
  });

  it("returns null when every inquiry is replied/archived (no unreplied candidates)", () => {
    expect(
      oldestUnrepliedInquiryAgeHoursFor(
        [
          { status: "replied", createdAt: new Date(NOW - 40 * HOUR_MS).toISOString() },
          { status: "archived", createdAt: new Date(NOW - 90 * HOUR_MS).toISOString() },
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("selects the maximum age across new/read inquiries, skipping replied/archived and unparseable rows", () => {
    expect(
      oldestUnrepliedInquiryAgeHoursFor(
        [
          { status: "new", createdAt: new Date(NOW - 5 * HOUR_MS).toISOString() },
          { status: "read", createdAt: new Date(NOW - 30 * HOUR_MS).toISOString() },
          { status: "replied", createdAt: new Date(NOW - 200 * HOUR_MS).toISOString() },
          { status: "new", createdAt: "not-a-date" },
        ],
        NOW,
      ),
    ).toBe(30);
  });

  it("clamps a future createdAt to 0", () => {
    expect(
      oldestUnrepliedInquiryAgeHoursFor(
        [{ status: "new", createdAt: new Date(NOW + HOUR_MS).toISOString() }],
        NOW,
      ),
    ).toBe(0);
  });
});

describe("oldestPaidNotLiveAgeHours", () => {
  it("returns null for no candidates", () => {
    expect(oldestPaidNotLiveAgeHours([], [], NOW)).toBeNull();
  });

  it("returns null when no order matches any candidate slug", () => {
    const candidates = [{ slug: "paid-lead" }];
    const orders = [{ leadSlug: "other-lead", createdAt: new Date(NOW - 10 * HOUR_MS).toISOString() }];
    expect(oldestPaidNotLiveAgeHours(candidates, orders, NOW)).toBeNull();
  });

  it("returns null when the only matching order has no createdAt or an unparseable one", () => {
    const candidates = [{ slug: "paid-lead" }];
    expect(
      oldestPaidNotLiveAgeHours(candidates, [{ leadSlug: "paid-lead" }], NOW),
    ).toBeNull();
    expect(
      oldestPaidNotLiveAgeHours(
        candidates,
        [{ leadSlug: "paid-lead", createdAt: "not-a-date" }],
        NOW,
      ),
    ).toBeNull();
  });

  it("picks the oldest matching order across every candidate", () => {
    const candidates = [{ slug: "lead-a" }, { slug: "lead-b" }];
    const orders = [
      { leadSlug: "lead-a", createdAt: new Date(NOW - 10 * HOUR_MS).toISOString() },
      { leadSlug: "lead-b", createdAt: new Date(NOW - 30 * HOUR_MS).toISOString() },
      // Not a candidate — must not anchor the signal even though it's older.
      { leadSlug: "lead-c", createdAt: new Date(NOW - 900 * HOUR_MS).toISOString() },
    ];
    expect(oldestPaidNotLiveAgeHours(candidates, orders, NOW)).toBe(30);
  });

  it("clamps to 0 when the matching order's createdAt is in the future", () => {
    const candidates = [{ slug: "lead-a" }];
    const orders = [
      { leadSlug: "lead-a", createdAt: new Date(NOW + 5 * HOUR_MS).toISOString() },
    ];
    expect(oldestPaidNotLiveAgeHours(candidates, orders, NOW)).toBe(0);
  });

  it("ignores a refunded order's old createdAt in favor of a genuinely fresh later payment (paid-not-live-refund-dispute-age-guard)", () => {
    const candidates = [{ slug: "lead-a" }];
    const orders = [
      {
        leadSlug: "lead-a",
        createdAt: new Date(NOW - 2160 * HOUR_MS).toISOString(), // 90 days ago
        refundedAt: new Date(NOW - 2000 * HOUR_MS).toISOString(),
      },
      {
        leadSlug: "lead-a",
        createdAt: new Date(NOW - 2 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestPaidNotLiveAgeHours(candidates, orders, NOW)).toBe(2);
  });

  it("ignores a disputed order the same way, and returns null when every matching order is refunded/disputed", () => {
    const candidates = [{ slug: "lead-a" }];
    const orders = [
      {
        leadSlug: "lead-a",
        createdAt: new Date(NOW - 500 * HOUR_MS).toISOString(),
        disputedAt: new Date(NOW - 100 * HOUR_MS).toISOString(),
      },
    ];
    expect(oldestPaidNotLiveAgeHours(candidates, orders, NOW)).toBeNull();
  });
});
