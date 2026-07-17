/**
 * Operator pipeline health — aggregate signals so stuck money and funnel
 * gaps are visible without scanning every lead row.
 * See /docs/process (pipeline-health-metrics + pipeline-health-abandoned-sessions
 * + unreplied-inquiry-pipeline-metric + cold-lead-reengagement
 * + snoozed-leads-pipeline-metric + follow-ups-due-pipeline-metric
 * + closed-leads-pipeline-metric + marketing-packs-due-pipeline-metric
 * + commerce-catalogs-missing-visibility
 * + commerce-catalogs-unsynced-visibility
 * + client-voice-packs-missing-visibility
 * + commerce-order-revenue-ledger
 * + commerce-abandoned-checkout-tracking
 * + commerce-pipeline-health-unpaid-owed
 * + recurring-entitlement-paused-pipeline-digest).
 */

import type { Lead, LeadPipelineStage } from "@/lib/leads/types";
import type { DeployHandoff } from "@/lib/deploy/types";
import type { ClientInquiry, ClientInquiryStatus } from "@/lib/inquiries/types";
import type { OrderRecord } from "@/lib/orders/types";
import type { CheckoutSessionRecord } from "@/lib/checkout/types";
import {
  isAbandonedCheckout,
  isBundleCheckoutSession,
  isCommerceSkuCheckoutSession,
  isRecoveryDue,
  leadSlugsEligibleForCommerceAbandonedRecovery,
} from "@/lib/checkout/abandoned-recovery";
import { listCommerceCatalogsMissing, listCommerceCatalogsUnsynced } from "@/lib/commerce/catalog";
import { listClientVoicePacksDue } from "@/lib/voice/faq-pack";
import { isColdLead, isFollowUpDue } from "@/lib/email/outreach-followups";
import { isLeadSnoozed } from "@/lib/leads/snooze";
import {
  listMarketingPacksDue,
  marketingMonthKey,
} from "@/lib/marketing/monthly-pack";
import {
  commerceOrderNeedsClawback,
  isCommerceOrderDisputed,
  isCommerceOrderPaidOut,
  isCommerceOrderRefunded,
  sumCommerceOrdersRevenueUsd,
} from "@/lib/commerce/orders";
import {
  listRecurringEntitlementPaused,
  oldestRecurringEntitlementPausedAgeHours,
} from "@/lib/orders/recurring";

export interface StageCount {
  stage: LeadPipelineStage;
  label: string;
  count: number;
}

export interface MissingEmailLead {
  slug: string;
  businessName: string;
  stage: LeadPipelineStage;
}

export interface PipelineHealth {
  /** Sum of paid order amounts (USD dollars, as stored by the webhook). */
  revenueTotalUsd: number;
  orderCount: number;
  leadCount: number;
  stageCounts: Record<LeadPipelineStage, number>;
  /** Ordered for display (funnel top → bottom). */
  stageFunnel: StageCount[];
  openHandoffCount: number;
  /** Paid / discovery_call / outreach leads with no email — cannot convert or follow up. */
  leadsMissingEmailCount: number;
  leadsMissingEmail: MissingEmailLead[];
  /** Inquiries still status=new (subset of unreplied). */
  newInquiryCount: number;
  /**
   * Inquiries awaiting a human reply: status new or read (not replied/archived).
   * Support debt on live/paid sites — sits beside paid-not-live.
   */
  unrepliedInquiryCount: number;
  /** Age in whole hours of the oldest unreplied inquiry; null when none. */
  oldestUnrepliedInquiryAgeHours: number | null;
  /** Paid but not yet live — fulfillment debt. */
  paidNotLiveCount: number;
  /** Open checkout sessions past the abandoned threshold (see abandoned-recovery). Bundle plan checkouts only. */
  abandonedCheckoutCount: number;
  /** Abandoned sessions due for an operator recovery nudge. Bundle plan checkouts only. */
  recoveryDueCount: number;
  /** Age in whole hours of the oldest abandoned open bundle session; null when none. */
  oldestAbandonedAgeHours: number | null;
  /** Open commerce Buy now sessions past the abandoned threshold (kind=commerce_sku). */
  commerceAbandonedCheckoutCount: number;
  /** Commerce Buy now sessions due for an operator recovery nudge. */
  commerceRecoveryDueCount: number;
  /** Leads that exhausted Email 1-3 with no reply — see isColdLead. */
  coldLeadCount: number;
  /** Age in whole hours since the oldest cold lead's last outreach send; null when none. */
  oldestColdLeadAgeHours: number | null;
  /**
   * Leads currently parked off Work next via snoozedUntil (see isLeadSnoozed).
   * Aggregate only — not a second priority queue.
   */
  snoozedLeadCount: number;
  /**
   * Whole hours until the soonest snooze expires; null when none snoozed.
   * Helps operators see parked urgency coming back onto Work next.
   */
  soonestSnoozeRemainingHours: number | null;
  /** Leads due for Email 2/3 — see isFollowUpDue. */
  followUpsDueCount: number;
  /** Age in whole hours since the oldest due lead's last outreach send; null when none. */
  oldestFollowUpDueAgeHours: number | null;
  /**
   * Leads in terminal `closed` stage (cold close / not a fit).
   * Same value as stageCounts.closed — surfaced for funnel footnotes, not a second queue.
   */
  closedLeadCount: number;
  /**
   * Paid/live Growth/Complete leads missing this UTC month's marketing pack.
   * Fulfillment debt for sold MRR — not a second priority queue.
   */
  marketingPacksDueCount: number;
  /** UTC YYYY-MM key used for the packs-due count (from nowMs). */
  marketingPacksDueMonth: string;
  /**
   * Paid/live commerceAddon leads missing any catalog row.
   * Commerce fulfillment debt — not a second priority queue.
   */
  commerceCatalogsMissingCount: number;
  /**
   * Paid/live commerceAddon leads with a saved catalog that still has ≥1 SKU
   * without stripePriceId (Sync to Stripe still due). Distinct from missing.
   */
  commerceCatalogsUnsyncedCount: number;
  /**
   * Paid/live Complete leads missing a client voice FAQ pack.
   * Fulfillment debt for the sold phone promise — not a second priority queue.
   */
  clientVoicePacksDueCount: number;
  /**
   * USD still owed to Commerce clients from Buy now orders (excludes rows with
   * paidOutAt OR refundedAt — a refunded end-customer sale owes the client
   * nothing). Deliberately separate from revenueTotalUsd — this is NOT Local
   * Site Studio's own revenue. Matches the Commerce payouts panel + digest
   * unpaid totals until Stripe Connect ships.
   */
  commerceOrdersRevenueUsd: number;
  /** Count of unpaid, unrefunded Commerce Buy now orders still owed to clients. */
  commerceOrdersCount: number;
  /**
   * Count of Commerce Buy now orders refunded by Stripe AFTER the operator
   * already marked them paid out to the client — the operator is out that
   * money and must claw it back from the client (see
   * commerce-order-refund-clawback-tracking). Zero risk otherwise: a refund
   * on an order never paid out simply drops out of commerceOrdersRevenueUsd
   * above with nothing further to do.
   */
  commerceOrdersRefundClawbackCount: number;
  /** Sum of amountPaidUsd across commerceOrdersRefundClawbackCount orders. */
  commerceOrdersRefundClawbackUsd: number;
  /** Age in whole hours since the oldest refund-after-payout was flagged; null when none. */
  oldestCommerceOrdersRefundClawbackAgeHours: number | null;
  /**
   * Count of Commerce Buy now orders disputed (charged back) by Stripe AFTER
   * the operator already marked them paid out to the client — same clawback
   * exposure as commerceOrdersRefundClawbackCount, on the dispute axis (see
   * commerce-order-dispute-clawback-tracking). Zero risk otherwise: a dispute
   * on an order never paid out simply drops out of commerceOrdersRevenueUsd
   * above with nothing further to do.
   */
  commerceOrdersDisputeClawbackCount: number;
  /** Sum of amountPaidUsd across commerceOrdersDisputeClawbackCount orders. */
  commerceOrdersDisputeClawbackUsd: number;
  /** Age in whole hours since the oldest dispute-after-payout was flagged; null when none. */
  oldestCommerceOrdersDisputeClawbackAgeHours: number | null;
  /**
   * Paid/live Growth/Complete/Commerce leads with recurringCanceledAt and no
   * still-active recurring order — MRR recovery debt (Billing Portal chase).
   * Distinct from marketingPacksDue (those drop out when entitlement pauses).
   */
  recurringEntitlementPausedCount: number;
  /** Age in whole hours of the oldest recurring entitlement pause; null when none. */
  oldestRecurringEntitlementPausedAgeHours: number | null;
}

/** new + read still need a human reply; replied/archived are closed. */
export function isUnrepliedInquiryStatus(status: ClientInquiryStatus): boolean {
  return status === "new" || status === "read";
}

const STAGE_LABELS: Record<LeadPipelineStage, string> = {
  discovered: "Discovered",
  site_built: "Site built",
  outreach_sent: "Outreach sent",
  discovery_call: "Discovery call",
  paid: "Paid",
  live: "Live",
  closed: "Closed",
};

/** Active funnel only — `closed` is counted in stageCounts but not the bar chart. */
const FUNNEL_ORDER: LeadPipelineStage[] = [
  "discovered",
  "site_built",
  "outreach_sent",
  "discovery_call",
  "paid",
  "live",
];

/**
 * Stages where missing email blocks revenue motion (Email 1 / follow-ups /
 * recovery / receipts). Exported so daily digest uses the same set as
 * pipeline-health — do not fork a parallel stage list in the digest.
 */
export const EMAIL_CRITICAL_STAGES: ReadonlySet<LeadPipelineStage> = new Set([
  "site_built",
  "outreach_sent",
  "discovery_call",
  "paid",
]);

/** True when the lead is in an email-critical stage with no usable email. */
export function leadIsMissingCriticalEmail(
  lead: Pick<Lead, "stage" | "email">,
): boolean {
  return (
    EMAIL_CRITICAL_STAGES.has(lead.stage) &&
    !(lead.email && lead.email.trim().length > 0)
  );
}

export function emptyStageCounts(): Record<LeadPipelineStage, number> {
  return {
    discovered: 0,
    site_built: 0,
    outreach_sent: 0,
    discovery_call: 0,
    paid: 0,
    live: 0,
    closed: 0,
  };
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Pure aggregation — safe to call from server pages or client components.
 * Pass whatever the operator dashboard already loaded; no extra DB round-trips.
 * Pass `nowMs` (and open checkout sessions) from the caller — never call Date.now()
 * inside this function so tests stay deterministic and React purity rules hold.
 */
export function computePipelineHealth(input: {
  leads: Lead[];
  orders: OrderRecord[];
  handoffs: DeployHandoff[];
  /**
   * Only newInquiryCount / unrepliedInquiryCount / oldestUnrepliedInquiryAgeHours
   * read this — all three are fully covered by status new+read. Pass
   * listUnrepliedInquiries() (uncapped), not a newest-N page of every status;
   * a capped page can drop an older unreplied inquiry once total inquiry
   * volume exceeds the page size and silently hide CRM health debt.
   */
  inquiries: ClientInquiry[];
  openCheckoutSessions?: CheckoutSessionRecord[];
  /** Packs already generated for the current UTC month (optional). */
  marketingPacksThisMonth?: ReadonlyArray<{ leadSlug: string; yearMonth: string }>;
  /** Existing commerce catalogs (optional) — missing/unsynced counts reuse list* helpers. */
  commerceCatalogs?: ReadonlyArray<{
    leadSlug: string;
    items?: ReadonlyArray<{ stripePriceId?: string }>;
  }>;
  /** Existing client voice FAQ packs (one row per Complete lead). */
  clientVoicePacks?: ReadonlyArray<{ leadSlug: string }>;
  /** Recorded Commerce Buy now orders (optional) — unpaid owed uses paidOutAt/refundedAt/disputedAt. */
  commerceOrders?: ReadonlyArray<{
    amountPaidUsd: number;
    paidOutAt?: string;
    refundedAt?: string;
    disputedAt?: string;
  }>;
  /**
   * Every refunded Commerce Buy now order regardless of paidOutAt (optional) —
   * pass listCommerceOrdersRefunded() (uncapped). listUnpaidCommerceOrders /
   * `commerceOrders` above drops a row once paidOutAt is set, so the
   * refund-after-payout clawback case needs this separate, uncapped feed to
   * be visible at all (see commerce-order-refund-clawback-tracking).
   */
  commerceOrdersRefunded?: ReadonlyArray<{
    amountPaidUsd: number;
    paidOutAt?: string;
    refundedAt?: string;
  }>;
  /**
   * Every disputed Commerce Buy now order regardless of paidOutAt (optional) —
   * pass listCommerceOrdersDisputed() (uncapped). Same rationale as
   * commerceOrdersRefunded, on the dispute axis (see
   * commerce-order-dispute-clawback-tracking).
   */
  commerceOrdersDisputed?: ReadonlyArray<{
    amountPaidUsd: number;
    paidOutAt?: string;
    disputedAt?: string;
  }>;
  nowMs?: number;
}): PipelineHealth {
  const stageCounts = emptyStageCounts();
  for (const lead of input.leads) {
    if (lead.stage in stageCounts) {
      stageCounts[lead.stage] += 1;
    }
  }

  const stageFunnel: StageCount[] = FUNNEL_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: stageCounts[stage],
  }));

  let revenueTotalUsd = 0;
  for (const order of input.orders) {
    if (typeof order.amountPaid === "number" && Number.isFinite(order.amountPaid)) {
      revenueTotalUsd += order.amountPaid;
    }
  }

  const leadsMissingEmail: MissingEmailLead[] = input.leads
    .filter(leadIsMissingCriticalEmail)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
      stage: lead.stage,
    }))
    .slice(0, 8);

  const openHandoffCount = input.handoffs.filter((h) => h.status !== "live").length;
  const newInquiryCount = input.inquiries.filter((inq) => inq.status === "new").length;
  const unrepliedInquiries = input.inquiries.filter((inq) =>
    isUnrepliedInquiryStatus(inq.status),
  );
  const unrepliedInquiryCount = unrepliedInquiries.length;
  const paidNotLiveCount = input.leads.filter((l) => l.stage === "paid").length;

  const nowMs = input.nowMs ?? 0;
  const sessions = input.openCheckoutSessions ?? [];
  const bundleSessions = sessions.filter(isBundleCheckoutSession);
  const commerceRecoveryEligibleSlugs = leadSlugsEligibleForCommerceAbandonedRecovery(
    input.leads,
    input.orders,
  );
  // Drop carts for paused/canceled Commerce leads — same predicate as
  // sendCommerceCheckoutRecoveryAction / digest due queue (#348–#350 twins).
  const commerceSessions = sessions.filter(
    (session) =>
      isCommerceSkuCheckoutSession(session) &&
      commerceRecoveryEligibleSlugs.has(session.leadSlug),
  );
  const abandoned = bundleSessions.filter((session) => isAbandonedCheckout(session, nowMs));
  const recoveryDueCount = abandoned.filter((session) => isRecoveryDue(session, nowMs)).length;
  const commerceAbandoned = commerceSessions.filter((session) =>
    isAbandonedCheckout(session, nowMs),
  );
  const commerceRecoveryDueCount = commerceAbandoned.filter((session) =>
    isRecoveryDue(session, nowMs),
  ).length;

  let oldestAbandonedAgeHours: number | null = null;
  for (const session of abandoned) {
    const createdAtMs = Date.parse(session.createdAt);
    if (Number.isNaN(createdAtMs)) continue;
    const ageHours = Math.floor((nowMs - createdAtMs) / HOUR_MS);
    if (oldestAbandonedAgeHours === null || ageHours > oldestAbandonedAgeHours) {
      oldestAbandonedAgeHours = Math.max(0, ageHours);
    }
  }

  let oldestUnrepliedInquiryAgeHours: number | null = null;
  for (const inquiry of unrepliedInquiries) {
    const createdAtMs = Date.parse(inquiry.createdAt);
    if (Number.isNaN(createdAtMs)) continue;
    const ageHours = Math.floor((nowMs - createdAtMs) / HOUR_MS);
    if (
      oldestUnrepliedInquiryAgeHours === null ||
      ageHours > oldestUnrepliedInquiryAgeHours
    ) {
      oldestUnrepliedInquiryAgeHours = Math.max(0, ageHours);
    }
  }

  const coldLeads = input.leads.filter((lead) => isColdLead(lead, nowMs));
  let oldestColdLeadAgeHours: number | null = null;
  for (const lead of coldLeads) {
    if (!lead.lastOutreachAt) continue;
    const lastOutreachMs = Date.parse(lead.lastOutreachAt);
    if (Number.isNaN(lastOutreachMs)) continue;
    const ageHours = Math.floor((nowMs - lastOutreachMs) / HOUR_MS);
    if (oldestColdLeadAgeHours === null || ageHours > oldestColdLeadAgeHours) {
      oldestColdLeadAgeHours = Math.max(0, ageHours);
    }
  }

  const followUpsDue = input.leads.filter((lead) => isFollowUpDue(lead, nowMs));
  let oldestFollowUpDueAgeHours: number | null = null;
  for (const lead of followUpsDue) {
    if (!lead.lastOutreachAt) continue;
    const lastOutreachMs = Date.parse(lead.lastOutreachAt);
    if (Number.isNaN(lastOutreachMs)) continue;
    const ageHours = Math.floor((nowMs - lastOutreachMs) / HOUR_MS);
    if (oldestFollowUpDueAgeHours === null || ageHours > oldestFollowUpDueAgeHours) {
      oldestFollowUpDueAgeHours = Math.max(0, ageHours);
    }
  }

  const snoozedLeads = input.leads.filter((lead) =>
    isLeadSnoozed(lead.snoozedUntil, nowMs),
  );
  let soonestSnoozeRemainingHours: number | null = null;
  for (const lead of snoozedLeads) {
    if (!lead.snoozedUntil) continue;
    const untilMs = Date.parse(lead.snoozedUntil);
    if (Number.isNaN(untilMs) || untilMs <= nowMs) continue;
    const remainingHours = Math.ceil((untilMs - nowMs) / HOUR_MS);
    if (
      soonestSnoozeRemainingHours === null ||
      remainingHours < soonestSnoozeRemainingHours
    ) {
      soonestSnoozeRemainingHours = Math.max(0, remainingHours);
    }
  }

  const marketingPacksDueMonth = marketingMonthKey(nowMs);
  const packsThisMonth = input.marketingPacksThisMonth ?? [];
  const marketingPacksDue = listMarketingPacksDue(
    input.leads,
    input.orders,
    packsThisMonth,
    marketingPacksDueMonth,
  );
  const commerceCatalogsMissing = listCommerceCatalogsMissing(
    input.leads,
    input.orders,
    input.commerceCatalogs ?? [],
  );
  const catalogsWithItems = (input.commerceCatalogs ?? []).filter(
    (catalog): catalog is { leadSlug: string; items: ReadonlyArray<{ stripePriceId?: string }> } =>
      Array.isArray(catalog.items),
  );
  const commerceCatalogsUnsynced = listCommerceCatalogsUnsynced(
    input.leads,
    input.orders,
    catalogsWithItems,
  );
  const clientVoicePacksDue = listClientVoicePacksDue(
    input.leads,
    input.orders,
    input.clientVoicePacks ?? [],
  );

  const commerceOrders = input.commerceOrders ?? [];
  // A refunded or disputed order owes the client nothing — exclude it from
  // "owed" the same way a paid-out order is excluded (see
  // commerce-order-refund-clawback-tracking, commerce-order-dispute-clawback-tracking).
  const unpaidCommerceOrders = commerceOrders.filter(
    (order) =>
      !isCommerceOrderPaidOut(order) &&
      !isCommerceOrderRefunded(order) &&
      !isCommerceOrderDisputed(order),
  );
  const commerceOrdersRevenueUsd = sumCommerceOrdersRevenueUsd(unpaidCommerceOrders);

  const commerceOrdersRefunded = input.commerceOrdersRefunded ?? [];
  const commerceOrdersRefundClawback = commerceOrdersRefunded.filter(
    commerceOrderNeedsClawback,
  );
  const commerceOrdersRefundClawbackUsd = sumCommerceOrdersRevenueUsd(
    commerceOrdersRefundClawback,
  );
  let oldestCommerceOrdersRefundClawbackAgeHours: number | null = null;
  for (const order of commerceOrdersRefundClawback) {
    if (!order.refundedAt) continue;
    const refundedAtMs = Date.parse(order.refundedAt);
    if (Number.isNaN(refundedAtMs)) continue;
    const ageHours = Math.floor((nowMs - refundedAtMs) / HOUR_MS);
    if (
      oldestCommerceOrdersRefundClawbackAgeHours === null ||
      ageHours > oldestCommerceOrdersRefundClawbackAgeHours
    ) {
      oldestCommerceOrdersRefundClawbackAgeHours = Math.max(0, ageHours);
    }
  }

  const commerceOrdersDisputed = input.commerceOrdersDisputed ?? [];
  const commerceOrdersDisputeClawback = commerceOrdersDisputed.filter(
    commerceOrderNeedsClawback,
  );
  const commerceOrdersDisputeClawbackUsd = sumCommerceOrdersRevenueUsd(
    commerceOrdersDisputeClawback,
  );
  let oldestCommerceOrdersDisputeClawbackAgeHours: number | null = null;
  for (const order of commerceOrdersDisputeClawback) {
    if (!order.disputedAt) continue;
    const disputedAtMs = Date.parse(order.disputedAt);
    if (Number.isNaN(disputedAtMs)) continue;
    const ageHours = Math.floor((nowMs - disputedAtMs) / HOUR_MS);
    if (
      oldestCommerceOrdersDisputeClawbackAgeHours === null ||
      ageHours > oldestCommerceOrdersDisputeClawbackAgeHours
    ) {
      oldestCommerceOrdersDisputeClawbackAgeHours = Math.max(0, ageHours);
    }
  }

  const recurringEntitlementPaused = listRecurringEntitlementPaused(
    input.leads,
    input.orders,
  );
  const recurringEntitlementPausedCount = recurringEntitlementPaused.length;
  const oldestRecurringPausedAgeHours = oldestRecurringEntitlementPausedAgeHours(
    recurringEntitlementPaused,
    nowMs,
  );

  return {
    revenueTotalUsd,
    orderCount: input.orders.length,
    leadCount: input.leads.length,
    stageCounts,
    stageFunnel,
    openHandoffCount,
    leadsMissingEmailCount: input.leads.filter(leadIsMissingCriticalEmail).length,
    leadsMissingEmail,
    newInquiryCount,
    unrepliedInquiryCount,
    oldestUnrepliedInquiryAgeHours,
    paidNotLiveCount,
    abandonedCheckoutCount: abandoned.length,
    recoveryDueCount,
    oldestAbandonedAgeHours,
    commerceAbandonedCheckoutCount: commerceAbandoned.length,
    commerceRecoveryDueCount,
    coldLeadCount: coldLeads.length,
    oldestColdLeadAgeHours,
    snoozedLeadCount: snoozedLeads.length,
    soonestSnoozeRemainingHours,
    followUpsDueCount: followUpsDue.length,
    oldestFollowUpDueAgeHours,
    closedLeadCount: stageCounts.closed,
    marketingPacksDueCount: marketingPacksDue.length,
    marketingPacksDueMonth,
    commerceCatalogsMissingCount: commerceCatalogsMissing.length,
    commerceCatalogsUnsyncedCount: commerceCatalogsUnsynced.length,
    clientVoicePacksDueCount: clientVoicePacksDue.length,
    commerceOrdersRevenueUsd,
    commerceOrdersCount: unpaidCommerceOrders.length,
    commerceOrdersRefundClawbackCount: commerceOrdersRefundClawback.length,
    commerceOrdersRefundClawbackUsd,
    oldestCommerceOrdersRefundClawbackAgeHours,
    commerceOrdersDisputeClawbackCount: commerceOrdersDisputeClawback.length,
    commerceOrdersDisputeClawbackUsd,
    oldestCommerceOrdersDisputeClawbackAgeHours,
    recurringEntitlementPausedCount,
    oldestRecurringEntitlementPausedAgeHours: oldestRecurringPausedAgeHours,
  };
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

/** Human-readable abandoned-cart age for the pipeline health panel. */
export function formatAbandonedAgeHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}
