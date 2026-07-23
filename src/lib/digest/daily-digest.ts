/**
 * Operator daily digest — one email summarizing everything urgent so a
 * single-operator business doesn't have to open /dashboard/leads to know
 * what needs attention today. See /docs/process (operator-daily-digest-email
 * + marketing-packs-due-pipeline-metric + starter-upsell-candidates-in-digest
 * + commerce-catalogs-missing-visibility
 * + commerce-catalogs-unsynced-visibility
 * + client-voice-packs-missing-visibility
 * + commerce-abandoned-checkout-tracking
 * + commerce-payouts-owed-in-digest
 * + open-handoffs-in-digest
 * + paid-not-live-in-digest
 * + digest-section-counts-uncapped
 * + leads-missing-email-in-digest
 * + recurring-entitlement-paused-pipeline-digest
 * + commerce-order-refund-clawback-tracking
 * + marketing-voice-pack-client-send-visibility
 * + stripe-connect-onboarding-pipeline-health-visibility).
 *
 * Pure aggregation over already-loaded data, same shape as pipeline-health.ts
 * and quality-score.ts: pass `nowMs` from the caller, never Date.now() here.
 */

import type { ClientInquiry } from "../inquiries/types";
import type { CheckoutSessionRecord } from "../checkout/types";
import type { DeployHandoff, DeployHandoffStatus } from "../deploy/types";
import type { Lead, LeadPipelineStage } from "../leads/types";
import { rankLeadsForOutreach, type LeadQualityBand } from "../leads/quality-score";
import {
  listFollowUpsDue,
  listColdLeads,
  oldestLastOutreachAgeHours,
} from "../email/outreach-followups";
import { escapeHtmlForEmail } from "../inquiries/reply";
import {
  leadSlugsEligibleForCommerceAbandonedRecovery,
  listAbandonedCheckoutsDue,
  listCommerceAbandonedCheckoutsDue,
  oldestCheckoutSessionAgeHours,
} from "../checkout/abandoned-recovery";
import { isLeadSnoozed } from "../leads/snooze";
import {
  isUnrepliedInquiryStatus,
  leadIsMissingCriticalEmail,
  oldestCommerceOrdersOwedAgeHours,
  oldestPaidNotLiveAgeHours,
} from "../metrics/pipeline-health";
import {
  listMarketingPacksDue,
  marketingMonthKey,
  oldestMarketingPacksDueAgeHours,
  listMarketingPacksMissingClientSend,
  oldestMarketingPackMissingClientSendAgeHours,
} from "../marketing/monthly-pack";
import {
  listStarterUpsellCandidates,
  oldestStarterUpsellCandidateAgeHours,
  resolveUpsellTargetTier,
  type UpsellTargetTier,
} from "../billing/starter-upsell";
import {
  listCommerceCatalogsMissing,
  listCommerceCatalogsUnsynced,
  oldestCommerceCatalogCandidateAgeHours,
} from "../commerce/catalog";
import {
  commerceOrderNeedsClawback,
  isCommerceOrderDisputed,
  isCommerceOrderPaidOut,
  isCommerceOrderRefunded,
  summarizeCommerceOrdersByLead,
  type CommerceOrderRecord,
} from "../commerce/orders";
import {
  listClientVoicePacksDue,
  oldestClientVoicePacksDueAgeHours,
  listClientVoicePacksMissingClientSend,
  oldestClientVoicePackMissingClientSendAgeHours,
} from "../voice/faq-pack";
import {
  listRecurringEntitlementPaused,
  oldestRecurringEntitlementPausedAgeHours,
  type RecurringEntitlementPausedStage,
} from "../orders/recurring";
import {
  listLeadsWithIncompleteConnectOnboarding,
  oldestConnectOnboardingIncompleteAgeHours,
} from "../commerce/stripe-connect";

const WORK_NEXT_LIMIT = 5;
const FOLLOW_UPS_LIMIT = 5;
const RECOVERIES_LIMIT = 5;
const INQUIRIES_LIMIT = 5;
const MARKETING_PACKS_LIMIT = 5;
const MARKETING_PACKS_MISSING_SEND_LIMIT = 5;
const CLIENT_VOICE_PACKS_MISSING_SEND_LIMIT = 5;
const UPSELL_LIMIT = 5;
const COMMERCE_CATALOGS_LIMIT = 5;
const COMMERCE_UNSYNCED_LIMIT = 5;
const CLIENT_VOICE_PACKS_LIMIT = 5;
const COMMERCE_PAYOUTS_LIMIT = 5;
const COMMERCE_REFUND_CLAWBACK_LIMIT = 5;
const COMMERCE_DISPUTE_CLAWBACK_LIMIT = 5;
const COMMERCE_MISSING_CLIENT_RECEIPT_LIMIT = 5;
const BUNDLE_ORDERS_REFUNDED_LIMIT = 5;
const BUNDLE_ORDERS_DISPUTED_LIMIT = 5;
const OPEN_HANDOFFS_LIMIT = 5;
const PAID_NOT_LIVE_LIMIT = 5;
const LEADS_MISSING_EMAIL_LIMIT = 5;
const RECURRING_ENTITLEMENT_PAUSED_LIMIT = 5;
const CONNECT_ONBOARDING_INCOMPLETE_LIMIT = 5;
const MESSAGE_PREVIEW_CHARS = 140;
const HOUR_MS = 60 * 60 * 1000;

export interface DigestWorkNextLead {
  slug: string;
  businessName: string;
  score: number;
  band: LeadQualityBand;
  topFactorLabel?: string;
}

export interface DigestFollowUpLead {
  slug: string;
  businessName: string;
  outreachStep: number;
}

export interface DigestCheckoutRecovery {
  stripeSessionId: string;
  slug: string;
  businessName: string;
  tier: string;
  /** 1-indexed nudge about to fire next — see recoveryNudgeTier in resend.ts. */
  nextNudgeNumber: number;
}

export interface DigestCommerceCheckoutRecovery {
  stripeSessionId: string;
  slug: string;
  businessName: string;
  skuId: string;
  /** 1-indexed nudge about to fire next — see recoveryNudgeTier in resend.ts. */
  nextNudgeNumber: number;
}

export interface DigestUnrepliedInquiry {
  id: string;
  leadSlug: string;
  businessName: string;
  messagePreview: string;
}

export interface DigestMarketingPackDue {
  slug: string;
  businessName: string;
  yearMonth: string;
}

/**
 * A marketing pack generated this month but never emailed to the client —
 * see marketing-voice-pack-client-send-visibility. Distinct from
 * DigestMarketingPackDue (that's generation debt; this is delivery debt on
 * a pack that already exists).
 */
export interface DigestMarketingPackMissingClientSend {
  slug: string;
  businessName: string;
  yearMonth: string;
}

export interface DigestStarterUpsellLead {
  slug: string;
  businessName: string;
  targetTier: UpsellTargetTier;
}

export interface DigestCommerceCatalogMissing {
  slug: string;
  businessName: string;
}

export interface DigestCommerceCatalogUnsynced {
  slug: string;
  businessName: string;
}

export interface DigestClientVoicePackDue {
  slug: string;
  businessName: string;
}

/**
 * A client voice pack generated but never emailed to the client — see
 * marketing-voice-pack-client-send-visibility. Distinct from
 * DigestClientVoicePackDue (generation debt vs. delivery debt).
 */
export interface DigestClientVoicePackMissingClientSend {
  slug: string;
  businessName: string;
}

/** Pass-through Buy now totals owed to a Commerce client (manual payouts). */
export interface DigestCommercePayoutOwed {
  slug: string;
  businessName: string;
  orderCount: number;
  totalUsd: number;
}

/**
 * A commerce order Stripe refunded AFTER the operator already marked it paid
 * out to the client — the operator is out that money and must claw it back
 * (see commerce-order-refund-clawback-tracking). Distinct from
 * commercePayoutsOwed: a refund on an order never paid out just drops out of
 * that "owed" total with nothing further to do.
 */
export interface DigestCommerceOrderRefundClawback {
  slug: string;
  businessName: string;
  skuName: string;
  amountPaidUsd: number;
  refundedAt: string;
  /** See CommerceOrderRecord.quantity — optional, undefined means unknown (never assumed as 1). */
  quantity?: number;
}

/**
 * A commerce order Stripe disputed (chargeback) AFTER the operator already
 * marked it paid out to the client — the operator is out that money and must
 * claw it back (see commerce-order-dispute-clawback-tracking). Same shape as
 * DigestCommerceOrderRefundClawback, distinct feed/axis.
 */
export interface DigestCommerceOrderDisputeClawback {
  slug: string;
  businessName: string;
  skuName: string;
  amountPaidUsd: number;
  disputedAt: string;
  /** See CommerceOrderRecord.quantity — optional, undefined means unknown (never assumed as 1). */
  quantity?: number;
}

/**
 * A commerce order with no client-receipt-sent marker — the local business
 * was never notified they made a Buy now sale (see
 * commerce-buy-now-client-receipt-visibility). Independent of payout status.
 */
export interface DigestCommerceOrderMissingClientReceipt {
  slug: string;
  businessName: string;
  skuName: string;
  amountPaidUsd: number;
  createdAt: string;
  /** See CommerceOrderRecord.quantity — optional, undefined means unknown (never assumed as 1). */
  quantity?: number;
}

/**
 * A bundle (Starter/Growth/Complete/Commerce-addon) order Stripe refunded
 * (charge.refunded, full or partial) — see bundle-order-refund-tracking.
 * Visibility only: unlike Commerce Buy now clawback tracking, this ledger has
 * no manual-payout double-loss risk, so this is not an action-required
 * clawback, just operator awareness that revenueTotalUsd already excludes it.
 */
export interface DigestBundleOrderRefund {
  slug: string;
  businessName: string;
  tier: string;
  amountPaidUsd: number;
  refundedAt: string;
}

/**
 * A bundle order Stripe disputed (charge.dispute.created, or dispute.closed
 * lost) — see bundle-order-dispute-tracking. Visibility only; cleared on
 * dispute.closed won / warning_closed.
 */
export interface DigestBundleOrderDispute {
  slug: string;
  businessName: string;
  tier: string;
  amountPaidUsd: number;
  disputedAt: string;
}

/** Paid production handoff not yet Mark live (same predicate as openHandoffCount). */
export interface DigestOpenHandoff {
  slug: string;
  businessName: string;
  status: DeployHandoffStatus;
  /** customDomain when set, otherwise suggestedHost. */
  host: string;
  tier: string;
}

/**
 * Lead whose stage is "paid" (same predicate as pipeline-health
 * paidNotLiveCount) — distinct from openHandoffs: a lead can be moved to
 * stage=paid (dashboard stage dropdown or CSV import) with no deploy_handoffs
 * row ever created, so it would never appear in openHandoffs.
 */
export interface DigestPaidNotLive {
  slug: string;
  businessName: string;
}

/**
 * Lead in an email-critical stage (site_built / outreach_sent / discovery_call /
 * paid) with no usable email — same predicate as pipeline-health
 * leadsMissingEmailCount via leadIsMissingCriticalEmail. Top-of-funnel block:
 * Email 1 / follow-ups / recovery / receipts cannot leave without an address.
 */
export interface DigestLeadMissingEmail {
  slug: string;
  businessName: string;
  stage: LeadPipelineStage;
}

/**
 * Paid/live Growth/Complete/Commerce lead with recurringCanceledAt and no
 * still-active recurring order — same predicate as pipeline-health
 * recurringEntitlementPausedCount. Chase Billing Portal / Manage billing.
 */
export interface DigestRecurringEntitlementPaused {
  slug: string;
  businessName: string;
  stage: RecurringEntitlementPausedStage;
  hasStripeCustomerId: boolean;
}

/**
 * Lead with a Stripe Connect Express account created but not yet confirmed
 * fully onboarded (see stripe-connect-onboarding-pipeline-health-visibility)
 * — same predicate as pipeline-health connectOnboardingIncompleteCount via
 * connectOnboardingIncomplete. Dormant-scaffold visibility only; this moves
 * no money (commerce-payouts-stripe-connect stays operator/legal-gated).
 */
export interface DigestConnectOnboardingIncomplete {
  slug: string;
  businessName: string;
}

export interface DailyDigest {
  generatedAtMs: number;
  workNext: DigestWorkNextLead[];
  followUpsDue: DigestFollowUpLead[];
  /** True count before the FOLLOW_UPS_LIMIT slice — use for the section header, never followUpsDue.length. */
  followUpsDueCount: number;
  checkoutRecoveriesDue: DigestCheckoutRecovery[];
  checkoutRecoveriesDueCount: number;
  commerceCheckoutRecoveriesDue: DigestCommerceCheckoutRecovery[];
  commerceCheckoutRecoveriesDueCount: number;
  unrepliedInquiries: DigestUnrepliedInquiry[];
  unrepliedInquiriesCount: number;
  marketingPacksDue: DigestMarketingPackDue[];
  marketingPacksDueCount: number;
  /** Age in whole hours since the oldest due lead's pack first became due this month; null when none. */
  oldestMarketingPacksDueAgeHours: number | null;
  /** Marketing packs generated this month but never emailed to the client (delivery debt, not generation debt). */
  marketingPacksMissingClientSend: DigestMarketingPackMissingClientSend[];
  /** True count before the MARKETING_PACKS_MISSING_SEND_LIMIT slice — use for the section header. */
  marketingPacksMissingClientSendCount: number;
  /** Age in whole hours since the oldest such pack was generated; null when none. */
  oldestMarketingPacksMissingClientSendAgeHours: number | null;
  starterUpsellCandidates: DigestStarterUpsellLead[];
  starterUpsellCandidatesCount: number;
  /** Age in whole hours since the oldest candidate's qualifying Starter-only order; null when none. */
  oldestStarterUpsellCandidateAgeHours: number | null;
  commerceCatalogsMissing: DigestCommerceCatalogMissing[];
  commerceCatalogsMissingCount: number;
  /** Age in whole hours since the oldest missing-catalog lead's qualifying order; null when none. */
  oldestCommerceCatalogsMissingAgeHours: number | null;
  commerceCatalogsUnsynced: DigestCommerceCatalogUnsynced[];
  commerceCatalogsUnsyncedCount: number;
  /** Age in whole hours since the oldest unsynced-catalog lead's qualifying order; null when none. */
  oldestCommerceCatalogsUnsyncedAgeHours: number | null;
  clientVoicePacksDue: DigestClientVoicePackDue[];
  clientVoicePacksDueCount: number;
  /** Age in whole hours since the oldest voice-pack-due lead's qualifying order; null when none. */
  oldestClientVoicePacksDueAgeHours: number | null;
  /** Client voice packs generated but never emailed to the client (delivery debt, not generation debt). */
  clientVoicePacksMissingClientSend: DigestClientVoicePackMissingClientSend[];
  /** True count before the CLIENT_VOICE_PACKS_MISSING_SEND_LIMIT slice — use for the section header. */
  clientVoicePacksMissingClientSendCount: number;
  /** Age in whole hours since the oldest such pack was generated; null when none. */
  oldestClientVoicePacksMissingClientSendAgeHours: number | null;
  /** Per-lead pass-through Buy now totals still owed until Connect (action section). */
  commercePayoutsOwed: DigestCommercePayoutOwed[];
  /** True count before the COMMERCE_PAYOUTS_LIMIT slice — use for the section header. */
  commercePayoutsOwedCount: number;
  /** Sum of commercePayoutsOwed totals (USD dollars) — already computed pre-slice, unaffected by the cap. */
  commercePayoutsOwedTotalUsd: number;
  /**
   * Age in whole hours since the oldest still-owed (unpaid/unrefunded/
   * undisputed) Commerce Buy now order's createdAt; null when none owed.
   * Same staleness signal as pipeline-health oldestCommerceOrdersOwedAgeHours
   * — the "not yet paid out" axis, distinct from
   * oldestCommerceOrdersRefundClawbackAgeHours /
   * oldestCommerceOrdersDisputeClawbackAgeHours below.
   */
  oldestCommerceOrdersOwedAgeHours: number | null;
  /** Commerce orders refunded after payout — clawback owed from the client (action section). */
  commerceOrdersRefundClawback: DigestCommerceOrderRefundClawback[];
  /** True count before the COMMERCE_REFUND_CLAWBACK_LIMIT slice — use for the section header. */
  commerceOrdersRefundClawbackCount: number;
  /** Sum of amountPaidUsd across commerceOrdersRefundClawbackCount orders — already computed pre-slice. */
  commerceOrdersRefundClawbackTotalUsd: number;
  /** Age in whole hours of the oldest refund-clawback order (by refundedAt); null when none. */
  oldestCommerceOrdersRefundClawbackAgeHours: number | null;
  /** Commerce orders disputed after payout — clawback owed from the client (action section). */
  commerceOrdersDisputeClawback: DigestCommerceOrderDisputeClawback[];
  /** True count before the COMMERCE_DISPUTE_CLAWBACK_LIMIT slice — use for the section header. */
  commerceOrdersDisputeClawbackCount: number;
  /** Sum of amountPaidUsd across commerceOrdersDisputeClawbackCount orders — already computed pre-slice. */
  commerceOrdersDisputeClawbackTotalUsd: number;
  /** Age in whole hours of the oldest dispute-clawback order (by disputedAt); null when none. */
  oldestCommerceOrdersDisputeClawbackAgeHours: number | null;
  /** Commerce orders with no client-receipt-sent marker (visibility section). */
  commerceOrdersMissingClientReceipt: DigestCommerceOrderMissingClientReceipt[];
  /** True count before the COMMERCE_MISSING_CLIENT_RECEIPT_LIMIT slice — use for the section header. */
  commerceOrdersMissingClientReceiptCount: number;
  /** Age in whole hours since the oldest order still missing a client receipt; null when none. */
  oldestCommerceOrdersMissingClientReceiptAgeHours: number | null;
  /**
   * Bundle (Starter/Growth/Complete/Commerce-addon) orders Stripe refunded —
   * visibility footnote, not an action section (no clawback owed on this
   * ledger; see bundle-order-refund-tracking).
   */
  bundleOrdersRefunded: DigestBundleOrderRefund[];
  /** True count before the BUNDLE_ORDERS_REFUNDED_LIMIT slice — use for the section header. */
  bundleOrdersRefundedCount: number;
  /** Sum of amountPaidUsd across bundleOrdersRefundedCount orders — already computed pre-slice. */
  bundleOrdersRefundedTotalUsd: number;
  /** Age in whole hours of the oldest refunded bundle order (by refundedAt); null when none. */
  oldestBundleOrdersRefundedAgeHours: number | null;
  /**
   * Bundle orders Stripe disputed — visibility footnote (see
   * bundle-order-dispute-tracking). Cleared on dispute.closed won.
   */
  bundleOrdersDisputed: DigestBundleOrderDispute[];
  /** True count before the BUNDLE_ORDERS_DISPUTED_LIMIT slice — use for the section header. */
  bundleOrdersDisputedCount: number;
  /** Sum of amountPaidUsd across bundleOrdersDisputedCount orders — already computed pre-slice. */
  bundleOrdersDisputedTotalUsd: number;
  /** Age in whole hours of the oldest disputed bundle order (by disputedAt); null when none. */
  oldestBundleOrdersDisputedAgeHours: number | null;
  /**
   * Paid sites still awaiting DNS / Mark live — same status !== "live" filter as
   * pipeline-health openHandoffCount (action section).
   */
  openHandoffs: DigestOpenHandoff[];
  openHandoffsCount: number;
  /**
   * Age in whole hours of the oldest open deploy handoff; null when none.
   * Same staleness signal as pipeline-health oldestOpenHandoffAgeHours — how
   * long a paid site has been awaiting DNS / Mark live.
   */
  oldestOpenHandoffAgeHours: number | null;
  /**
   * Leads with stage="paid" — same predicate as pipeline-health
   * paidNotLiveCount (action section). Not the same set as openHandoffs: a
   * lead can be marked paid via the stage dropdown or CSV import with no
   * deploy_handoffs row, so it would never surface there.
   */
  paidNotLive: DigestPaidNotLive[];
  paidNotLiveCount: number;
  /**
   * Age in whole hours since the oldest paid-not-live lead's earliest bundle
   * order was created; null when none of those leads has a matching order.
   * Same staleness signal as pipeline-health oldestPaidNotLiveAgeHours — see
   * that function's doc comment for why a lead promoted to stage=paid with
   * no order row (dashboard stage dropdown / CSV backfill) is silently
   * skipped from this age signal while still counted in paidNotLiveCount.
   */
  oldestPaidNotLiveAgeHours: number | null;
  /**
   * Email-critical leads with no usable email — same predicate as
   * pipeline-health leadsMissingEmailCount (action section). Distinct from
   * paidNotLive / openHandoffs: those are post-payment fulfillment; this is
   * the pre-send contact gap that blocks outreach revenue motion entirely.
   */
  leadsMissingEmail: DigestLeadMissingEmail[];
  /** True count before the LEADS_MISSING_EMAIL_LIMIT slice — use for the section header. */
  leadsMissingEmailCount: number;
  /** Count of new (unseen) inquiries in the unreplied set. */
  newInquiryCount: number;
  /** Age in whole hours of the oldest unreplied inquiry; null when none. */
  oldestUnrepliedInquiryAgeHours: number | null;
  /** Age in whole hours of the oldest follow-up due lead; null when none. */
  oldestFollowUpDueAgeHours: number | null;
  /** Age in whole hours of the oldest abandoned bundle checkout session; null when none. */
  oldestAbandonedAgeHours: number | null;
  /** Age in whole hours of the oldest abandoned open Commerce Buy now session; null when none. */
  oldestCommerceAbandonedAgeHours: number | null;
  /** Age in whole hours of the oldest cold lead (went cold after Email 3); null when none. */
  oldestColdLeadAgeHours: number | null;
  coldLeadCount: number;
  /** Leads at terminal closed stage — same predicate as pipeline-health closedLeadCount. */
  closedLeadCount: number;
  /**
   * Leads currently parked off Work next via snoozedUntil (same predicate as
   * pipeline-health snoozedLeadCount). Footnote only — not a digest action section.
   */
  snoozedLeadCount: number;
  /** Whole hours until the soonest snooze expires; null when none snoozed. */
  soonestSnoozeRemainingHours: number | null;
  /**
   * Paid/live MRR customers with paused/canceled recurring entitlement — same
   * predicate as pipeline-health recurringEntitlementPausedCount (action section).
   */
  recurringEntitlementPaused: DigestRecurringEntitlementPaused[];
  /** True count before the RECURRING_ENTITLEMENT_PAUSED_LIMIT slice. */
  recurringEntitlementPausedCount: number;
  /** Age in whole hours of the oldest recurring entitlement pause; null when none. */
  oldestRecurringEntitlementPausedAgeHours: number | null;
  /**
   * Leads with a Stripe Connect Express account not yet confirmed fully
   * onboarded — same predicate as pipeline-health
   * connectOnboardingIncompleteCount (see
   * stripe-connect-onboarding-pipeline-health-visibility).
   */
  connectOnboardingIncomplete: DigestConnectOnboardingIncomplete[];
  /** True count before the CONNECT_ONBOARDING_INCOMPLETE_LIMIT slice. */
  connectOnboardingIncompleteCount: number;
  /** Age in whole hours since the oldest incomplete account was created; null when none/unanchored. */
  oldestConnectOnboardingIncompleteAgeHours: number | null;
  /**
   * True pre-slice sum of every actionable section's count (the same fields
   * isEmpty checks) — the single source of truth for "how many items does
   * this digest carry." Callers that need a headline number (e.g. the
   * dashboard's Send daily digest button) must read this instead of
   * hand-summing a subset of sections: daily-digest-button-item-count-drift
   * found the dashboard button hand-summing only 4 of 19 sections, so a
   * digest whose only actionable items were e.g. marketingPacksDue or
   * commerceCatalogsMissing silently displayed "nothing urgent today" while
   * the email just sent listed real fulfillment/revenue debt.
   */
  actionableItemCount: number;
  /**
   * Human-readable label per section, in the same order and over the same
   * set of sections actionableItemCount sums — the single source of truth
   * for the "Nothing urgent today" empty-state prose (renderDailyDigestHtml),
   * so a future section added to actionableItemCount can't silently miss
   * that sentence the way six sections (refund/dispute clawback, bundle
   * refunds/disputes, paid-not-live, missing email) previously did (see
   * daily-digest-empty-state-copy-drift).
   */
  actionableSectionLabels: readonly string[];
  /** True when none of the above sections have anything for the operator to act on. */
  isEmpty: boolean;
}

export interface BuildDailyDigestInput {
  leads: Lead[];
  /**
   * Only the unrepliedInquiries section reads this. Pass
   * listUnrepliedInquiries() (uncapped status new+read), not a newest-N page
   * of every status — a capped page can drop an older unreplied inquiry once
   * total inquiry volume exceeds the page size.
   */
  inquiries: ClientInquiry[];
  openCheckoutSessions: CheckoutSessionRecord[];
  orders?: Array<{
    leadSlug: string;
    tier: string;
    commerceAddon: boolean;
    recurringCanceledAt?: number | null;
    stripeCustomerId?: string | null;
    /** ISO timestamp. Marketing/catalog/voice-pack oldest-age sections read this. */
    createdAt?: string;
    /** USD dollars. Bundle refunded/disputed sections read this. */
    amountPaid?: number;
    /** ISO timestamp when charge.refunded flagged this order — see bundle-order-refund-tracking. */
    refundedAt?: string;
    /** ISO timestamp when charge.dispute.created flagged this order — see bundle-order-dispute-tracking. */
    disputedAt?: string;
  }>;
  marketingPacksThisMonth?: ReadonlyArray<{
    leadSlug: string;
    yearMonth: string;
    /** Anchors marketingPacksMissingClientSend's age signal. */
    generatedAt?: string;
    /** Unset means never emailed to the client — see marketing-voice-pack-client-send-visibility. */
    sentToClientAt?: string;
  }>;
  commerceCatalogs?: ReadonlyArray<{
    leadSlug: string;
    items?: ReadonlyArray<{ stripePriceId?: string }>;
  }>;
  clientVoicePacks?: ReadonlyArray<{
    leadSlug: string;
    /** Anchors clientVoicePacksMissingClientSend's age signal. */
    generatedAt?: string;
    /** Unset means never emailed to the client — see marketing-voice-pack-client-send-visibility. */
    sentToClientAt?: string;
  }>;
  /** Pass-through Buy now ledger rows — reuse summarizeCommerceOrdersByLead. */
  commerceOrders?: ReadonlyArray<CommerceOrderRecord>;
  /**
   * Every refunded Commerce Buy now order regardless of paidOutAt — pass
   * listCommerceOrdersRefunded() (uncapped). `commerceOrders` above (fed from
   * listUnpaidCommerceOrders) drops a row once paidOutAt is set, so the
   * refund-after-payout clawback case needs this separate feed to be visible
   * at all (see commerce-order-refund-clawback-tracking).
   */
  commerceOrdersRefunded?: ReadonlyArray<CommerceOrderRecord>;
  /**
   * Every disputed Commerce Buy now order regardless of paidOutAt — pass
   * listCommerceOrdersDisputed() (uncapped). Same rationale as
   * commerceOrdersRefunded, on the dispute axis (see
   * commerce-order-dispute-clawback-tracking).
   */
  commerceOrdersDisputed?: ReadonlyArray<CommerceOrderRecord>;
  /**
   * Every Commerce Buy now order with no client-receipt-sent marker — pass
   * listCommerceOrdersMissingClientReceipt() (uncapped). Independent of
   * paidOutAt/refundedAt/disputedAt (see commerce-buy-now-client-receipt-visibility).
   */
  commerceOrdersMissingClientReceipt?: ReadonlyArray<CommerceOrderRecord>;
  /**
   * Production deploy handoffs — pass listDeployHandoffs() (uncapped). Live rows
   * are filtered out; open rows drive the Production handoffs open section.
   */
  handoffs?: ReadonlyArray<DeployHandoff>;
  nowMs: number;
}

function truncateMessage(message: string): string {
  const trimmed = message.trim();
  return trimmed.length > MESSAGE_PREVIEW_CHARS
    ? `${trimmed.slice(0, MESSAGE_PREVIEW_CHARS)}…`
    : trimmed;
}

/** Builds the digest payload. Pass nowMs from the caller (server action), not Date.now() here. */
export function buildDailyDigest(input: BuildDailyDigestInput): DailyDigest {
  const {
    leads,
    inquiries,
    openCheckoutSessions,
    orders = [],
    marketingPacksThisMonth = [],
    commerceCatalogs = [],
    clientVoicePacks = [],
    commerceOrders = [],
    commerceOrdersRefunded = [],
    commerceOrdersDisputed = [],
    commerceOrdersMissingClientReceipt: commerceOrdersMissingClientReceiptInput = [],
    handoffs = [],
    nowMs,
  } = input;
  const leadsBySlug = new Map(leads.map((lead) => [lead.slug, lead]));

  const workNext: DigestWorkNextLead[] = rankLeadsForOutreach(leads, nowMs, WORK_NEXT_LIMIT, {
    openCheckoutSessions,
  }).map((result) => {
    const lead = leadsBySlug.get(result.slug);
    const topFactor = [...result.factors].sort((a, b) => b.delta - a.delta)[0];
    return {
      slug: result.slug,
      businessName: lead?.businessName ?? result.slug,
      score: result.score,
      band: result.band,
      topFactorLabel: topFactor?.label,
    };
  });

  const followUpsDueAll = listFollowUpsDue(leads, nowMs);
  const followUpsDueCount = followUpsDueAll.length;
  const oldestFollowUpDueAgeHours = oldestLastOutreachAgeHours(followUpsDueAll, nowMs);
  const followUpsDue: DigestFollowUpLead[] = followUpsDueAll
    .slice(0, FOLLOW_UPS_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
      outreachStep: lead.outreachStep ?? 0,
    }));

  const checkoutRecoveriesDueAll = listAbandonedCheckoutsDue(openCheckoutSessions, nowMs);
  const checkoutRecoveriesDueCount = checkoutRecoveriesDueAll.length;
  const oldestAbandonedAgeHours = oldestCheckoutSessionAgeHours(checkoutRecoveriesDueAll, nowMs);
  const checkoutRecoveriesDue: DigestCheckoutRecovery[] = checkoutRecoveriesDueAll
    .slice(0, RECOVERIES_LIMIT)
    .map((session) => ({
      stripeSessionId: session.stripeSessionId,
      slug: session.leadSlug,
      businessName: leadsBySlug.get(session.leadSlug)?.businessName ?? session.leadSlug,
      tier: session.tier,
      nextNudgeNumber: (session.recoverySentCount ?? 0) + 1,
    }));

  const commerceRecoveryEligibleSlugs = leadSlugsEligibleForCommerceAbandonedRecovery(
    leads,
    orders,
  );
  const commerceCheckoutRecoveriesDueAll = listCommerceAbandonedCheckoutsDue(
    openCheckoutSessions,
    nowMs,
    commerceRecoveryEligibleSlugs,
  );
  const commerceCheckoutRecoveriesDueCount = commerceCheckoutRecoveriesDueAll.length;
  const oldestCommerceAbandonedAgeHours = oldestCheckoutSessionAgeHours(
    commerceCheckoutRecoveriesDueAll,
    nowMs,
  );
  const commerceCheckoutRecoveriesDue: DigestCommerceCheckoutRecovery[] =
    commerceCheckoutRecoveriesDueAll.slice(0, RECOVERIES_LIMIT).map((session) => ({
      stripeSessionId: session.stripeSessionId,
      slug: session.leadSlug,
      businessName: leadsBySlug.get(session.leadSlug)?.businessName ?? session.leadSlug,
      skuId: session.skuId ?? "sku",
      nextNudgeNumber: (session.recoverySentCount ?? 0) + 1,
    }));

  const unrepliedInquiriesAll = inquiries
    .filter((inquiry) => isUnrepliedInquiryStatus(inquiry.status))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const unrepliedInquiriesCount = unrepliedInquiriesAll.length;
  const newInquiryCount = inquiries.filter((inquiry) => inquiry.status === "new").length;
  const oldestUnrepliedInquiryAgeHours: number | null =
    unrepliedInquiriesAll.length > 0
      ? Math.max(0, Math.floor((nowMs - Date.parse(unrepliedInquiriesAll[0].createdAt)) / HOUR_MS))
      : null;
  const unrepliedInquiries: DigestUnrepliedInquiry[] = unrepliedInquiriesAll
    .slice(0, INQUIRIES_LIMIT)
    .map((inquiry) => ({
      id: inquiry.id,
      leadSlug: inquiry.leadSlug,
      businessName: inquiry.businessName,
      messagePreview: truncateMessage(inquiry.message),
    }));

  const yearMonth = marketingMonthKey(nowMs);
  const marketingPacksDueAll = listMarketingPacksDue(
    leads,
    orders,
    marketingPacksThisMonth,
    yearMonth,
  );
  const marketingPacksDueCount = marketingPacksDueAll.length;
  const marketingPacksDue: DigestMarketingPackDue[] = marketingPacksDueAll
    .slice(0, MARKETING_PACKS_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
      yearMonth,
    }));

  const marketingPacksMissingClientSendAll = listMarketingPacksMissingClientSend(
    marketingPacksThisMonth,
    leads,
    orders,
  );
  const marketingPacksMissingClientSendCount = marketingPacksMissingClientSendAll.length;
  const marketingPacksMissingClientSend: DigestMarketingPackMissingClientSend[] =
    marketingPacksMissingClientSendAll
      .slice(0, MARKETING_PACKS_MISSING_SEND_LIMIT)
      .map((pack) => ({
        slug: pack.leadSlug,
        businessName: leadsBySlug.get(pack.leadSlug)?.businessName ?? pack.leadSlug,
        yearMonth: pack.yearMonth,
      }));
  const oldestMarketingPacksMissingClientSendAgeHoursValue =
    oldestMarketingPackMissingClientSendAgeHours(marketingPacksMissingClientSendAll, nowMs);

  const starterUpsellCandidatesAll = listStarterUpsellCandidates(leads, orders);
  const starterUpsellCandidatesCount = starterUpsellCandidatesAll.length;
  const starterUpsellCandidates: DigestStarterUpsellLead[] = starterUpsellCandidatesAll
    .slice(0, UPSELL_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
      targetTier: resolveUpsellTargetTier(lead.recommendedTier),
    }));

  const commerceCatalogsMissingAll = listCommerceCatalogsMissing(leads, orders, commerceCatalogs);
  const commerceCatalogsMissingCount = commerceCatalogsMissingAll.length;
  const commerceCatalogsMissing: DigestCommerceCatalogMissing[] = commerceCatalogsMissingAll
    .slice(0, COMMERCE_CATALOGS_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
    }));

  const catalogsWithItems = commerceCatalogs.filter(
    (catalog): catalog is { leadSlug: string; items: ReadonlyArray<{ stripePriceId?: string }> } =>
      Array.isArray(catalog.items),
  );
  const commerceCatalogsUnsyncedAll = listCommerceCatalogsUnsynced(
    leads,
    orders,
    catalogsWithItems,
  );
  const commerceCatalogsUnsyncedCount = commerceCatalogsUnsyncedAll.length;
  const commerceCatalogsUnsynced: DigestCommerceCatalogUnsynced[] = commerceCatalogsUnsyncedAll
    .slice(0, COMMERCE_UNSYNCED_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
    }));

  const clientVoicePacksDueAll = listClientVoicePacksDue(leads, orders, clientVoicePacks);
  const clientVoicePacksDueCount = clientVoicePacksDueAll.length;
  const clientVoicePacksDue: DigestClientVoicePackDue[] = clientVoicePacksDueAll
    .slice(0, CLIENT_VOICE_PACKS_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
    }));

  const clientVoicePacksMissingClientSendAll = listClientVoicePacksMissingClientSend(
    clientVoicePacks,
    leads,
    orders,
  );
  const clientVoicePacksMissingClientSendCount = clientVoicePacksMissingClientSendAll.length;
  const clientVoicePacksMissingClientSend: DigestClientVoicePackMissingClientSend[] =
    clientVoicePacksMissingClientSendAll
      .slice(0, CLIENT_VOICE_PACKS_MISSING_SEND_LIMIT)
      .map((pack) => ({
        slug: pack.leadSlug,
        businessName: leadsBySlug.get(pack.leadSlug)?.businessName ?? pack.leadSlug,
      }));
  const oldestClientVoicePacksMissingClientSendAgeHoursValue =
    oldestClientVoicePackMissingClientSendAgeHours(clientVoicePacksMissingClientSendAll, nowMs);

  const oldestMarketingPacksDueAgeHoursValue = oldestMarketingPacksDueAgeHours(
    marketingPacksDueAll,
    orders,
    yearMonth,
    nowMs,
  );
  const oldestCommerceCatalogsMissingAgeHoursValue = oldestCommerceCatalogCandidateAgeHours(
    commerceCatalogsMissingAll,
    orders,
    nowMs,
  );
  const oldestCommerceCatalogsUnsyncedAgeHoursValue = oldestCommerceCatalogCandidateAgeHours(
    commerceCatalogsUnsyncedAll,
    orders,
    nowMs,
  );
  const oldestClientVoicePacksDueAgeHoursValue = oldestClientVoicePacksDueAgeHours(
    clientVoicePacksDueAll,
    orders,
    nowMs,
  );
  const oldestStarterUpsellCandidateAgeHoursValue = oldestStarterUpsellCandidateAgeHours(
    starterUpsellCandidatesAll,
    orders,
    nowMs,
  );

  const commercePayoutSummaries = summarizeCommerceOrdersByLead(commerceOrders).filter(
    (summary) => summary.unpaidCount > 0,
  );
  const commercePayoutsOwedCount = commercePayoutSummaries.length;
  const commercePayoutsOwedTotalUsd = commercePayoutSummaries.reduce(
    (sum, row) => sum + row.unpaidTotalUsd,
    0,
  );
  const commercePayoutsOwed: DigestCommercePayoutOwed[] = commercePayoutSummaries
    .slice(0, COMMERCE_PAYOUTS_LIMIT)
    .map((summary) => ({
      slug: summary.leadSlug,
      businessName: leadsBySlug.get(summary.leadSlug)?.businessName ?? summary.leadSlug,
      orderCount: summary.unpaidCount,
      totalUsd: summary.unpaidTotalUsd,
    }));
  // commerceOrders (fed from listUnpaidCommerceOrders) only excludes paidOutAt
  // — re-filter out refunded/disputed rows too so a still-open refund/dispute
  // does not anchor the "owed" staleness signal (mirrors the unpaidCommerceOrders
  // filter in pipeline-health.ts's computePipelineHealth exactly).
  const commerceOrdersOwed = commerceOrders.filter(
    (order) =>
      !isCommerceOrderPaidOut(order) &&
      !isCommerceOrderRefunded(order) &&
      !isCommerceOrderDisputed(order),
  );
  const oldestCommerceOrdersOwedAgeHoursValue = oldestCommerceOrdersOwedAgeHours(
    commerceOrdersOwed,
    nowMs,
  );

  // Refund-after-payout clawback — distinct feed from commerceOrders above,
  // which drops any row once paidOutAt is set (see
  // commerce-order-refund-clawback-tracking).
  const commerceOrdersRefundClawbackAll = commerceOrdersRefunded.filter(
    commerceOrderNeedsClawback,
  );
  const commerceOrdersRefundClawbackCount = commerceOrdersRefundClawbackAll.length;
  const commerceOrdersRefundClawbackTotalUsd = commerceOrdersRefundClawbackAll.reduce(
    (sum, order) => sum + order.amountPaidUsd,
    0,
  );
  const commerceOrdersRefundClawback: DigestCommerceOrderRefundClawback[] =
    commerceOrdersRefundClawbackAll
      .slice(0, COMMERCE_REFUND_CLAWBACK_LIMIT)
      .map((order) => ({
        slug: order.leadSlug,
        businessName: leadsBySlug.get(order.leadSlug)?.businessName ?? order.leadSlug,
        skuName: order.skuName,
        amountPaidUsd: order.amountPaidUsd,
        refundedAt: order.refundedAt ?? "",
        quantity: order.quantity,
      }));
  const oldestCommerceOrdersRefundClawbackAgeHours: number | null = (() => {
    let oldestMs = Infinity;
    for (const order of commerceOrdersRefundClawbackAll) {
      if (!order.refundedAt) continue;
      const parsed = Date.parse(order.refundedAt);
      if (Number.isNaN(parsed)) continue;
      if (parsed < oldestMs) oldestMs = parsed;
    }
    return oldestMs === Infinity ? null : Math.max(0, Math.floor((nowMs - oldestMs) / HOUR_MS));
  })();

  // Dispute-after-payout clawback — distinct feed from commerceOrders above,
  // which drops any row once paidOutAt is set (see
  // commerce-order-dispute-clawback-tracking).
  const commerceOrdersDisputeClawbackAll = commerceOrdersDisputed.filter(
    commerceOrderNeedsClawback,
  );
  const commerceOrdersDisputeClawbackCount = commerceOrdersDisputeClawbackAll.length;
  const commerceOrdersDisputeClawbackTotalUsd = commerceOrdersDisputeClawbackAll.reduce(
    (sum, order) => sum + order.amountPaidUsd,
    0,
  );
  const commerceOrdersDisputeClawback: DigestCommerceOrderDisputeClawback[] =
    commerceOrdersDisputeClawbackAll
      .slice(0, COMMERCE_DISPUTE_CLAWBACK_LIMIT)
      .map((order) => ({
        slug: order.leadSlug,
        businessName: leadsBySlug.get(order.leadSlug)?.businessName ?? order.leadSlug,
        skuName: order.skuName,
        amountPaidUsd: order.amountPaidUsd,
        disputedAt: order.disputedAt ?? "",
        quantity: order.quantity,
      }));
  const oldestCommerceOrdersDisputeClawbackAgeHours: number | null = (() => {
    let oldestMs = Infinity;
    for (const order of commerceOrdersDisputeClawbackAll) {
      if (!order.disputedAt) continue;
      const parsed = Date.parse(order.disputedAt);
      if (Number.isNaN(parsed)) continue;
      if (parsed < oldestMs) oldestMs = parsed;
    }
    return oldestMs === Infinity ? null : Math.max(0, Math.floor((nowMs - oldestMs) / HOUR_MS));
  })();

  // Client-receipt visibility — independent axis from payout status; a
  // permanently-bad email or sustained Resend outage leaves this unset
  // forever with nothing else surfacing the gap (see
  // commerce-buy-now-client-receipt-visibility).
  const commerceOrdersMissingClientReceiptCount =
    commerceOrdersMissingClientReceiptInput.length;
  const commerceOrdersMissingClientReceipt: DigestCommerceOrderMissingClientReceipt[] =
    commerceOrdersMissingClientReceiptInput
      .slice(0, COMMERCE_MISSING_CLIENT_RECEIPT_LIMIT)
      .map((order) => ({
        slug: order.leadSlug,
        businessName: leadsBySlug.get(order.leadSlug)?.businessName ?? order.leadSlug,
        skuName: order.skuName,
        amountPaidUsd: order.amountPaidUsd,
        createdAt: order.createdAt,
        quantity: order.quantity,
      }));
  const oldestCommerceOrdersMissingClientReceiptAgeHoursValue =
    oldestCommerceOrdersOwedAgeHours(commerceOrdersMissingClientReceiptInput, nowMs);

  // Bundle order refunds — visibility footnote, not a clawback action (no
  // payout-panel double-loss risk on this ledger; see
  // bundle-order-refund-tracking).
  const bundleOrdersRefundedAll = orders.filter(
    (order): order is typeof order & { refundedAt: string } => Boolean(order.refundedAt),
  );
  const bundleOrdersRefundedCount = bundleOrdersRefundedAll.length;
  const bundleOrdersRefundedTotalUsd = bundleOrdersRefundedAll.reduce(
    (sum, order) => sum + (typeof order.amountPaid === "number" ? order.amountPaid : 0),
    0,
  );
  const bundleOrdersRefunded: DigestBundleOrderRefund[] = bundleOrdersRefundedAll
    .slice(0, BUNDLE_ORDERS_REFUNDED_LIMIT)
    .map((order) => ({
      slug: order.leadSlug,
      businessName: leadsBySlug.get(order.leadSlug)?.businessName ?? order.leadSlug,
      tier: order.tier,
      amountPaidUsd: typeof order.amountPaid === "number" ? order.amountPaid : 0,
      refundedAt: order.refundedAt,
    }));
  const oldestBundleOrdersRefundedAgeHours: number | null = (() => {
    let oldestMs = Infinity;
    for (const order of bundleOrdersRefundedAll) {
      const parsed = Date.parse(order.refundedAt);
      if (Number.isNaN(parsed)) continue;
      if (parsed < oldestMs) oldestMs = parsed;
    }
    return oldestMs === Infinity ? null : Math.max(0, Math.floor((nowMs - oldestMs) / HOUR_MS));
  })();

  // Bundle order disputes — same visibility footnote shape
  // (bundle-order-dispute-tracking).
  const bundleOrdersDisputedAll = orders.filter(
    (order): order is typeof order & { disputedAt: string } => Boolean(order.disputedAt),
  );
  const bundleOrdersDisputedCount = bundleOrdersDisputedAll.length;
  const bundleOrdersDisputedTotalUsd = bundleOrdersDisputedAll.reduce(
    (sum, order) => sum + (typeof order.amountPaid === "number" ? order.amountPaid : 0),
    0,
  );
  const bundleOrdersDisputed: DigestBundleOrderDispute[] = bundleOrdersDisputedAll
    .slice(0, BUNDLE_ORDERS_DISPUTED_LIMIT)
    .map((order) => ({
      slug: order.leadSlug,
      businessName: leadsBySlug.get(order.leadSlug)?.businessName ?? order.leadSlug,
      tier: order.tier,
      amountPaidUsd: typeof order.amountPaid === "number" ? order.amountPaid : 0,
      disputedAt: order.disputedAt,
    }));
  const oldestBundleOrdersDisputedAgeHours: number | null = (() => {
    let oldestMs = Infinity;
    for (const order of bundleOrdersDisputedAll) {
      const parsed = Date.parse(order.disputedAt);
      if (Number.isNaN(parsed)) continue;
      if (parsed < oldestMs) oldestMs = parsed;
    }
    return oldestMs === Infinity ? null : Math.max(0, Math.floor((nowMs - oldestMs) / HOUR_MS));
  })();

  // Same status !== "live" predicate as pipeline-health openHandoffCount.
  const openHandoffsAll = handoffs
    .filter((handoff) => handoff.status !== "live")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const openHandoffsCount = openHandoffsAll.length;
  const oldestOpenHandoffAgeHours: number | null = (() => {
    if (openHandoffsAll.length === 0) return null;
    let oldestMs = Infinity;
    for (const handoff of openHandoffsAll) {
      const parsed = Date.parse(handoff.createdAt);
      if (Number.isNaN(parsed)) continue;
      if (parsed < oldestMs) oldestMs = parsed;
    }
    return oldestMs === Infinity ? null : Math.max(0, Math.floor((nowMs - oldestMs) / HOUR_MS));
  })();
  const openHandoffs: DigestOpenHandoff[] = openHandoffsAll
    .slice(0, OPEN_HANDOFFS_LIMIT)
    .map((handoff) => ({
      slug: handoff.leadSlug,
      businessName:
        leadsBySlug.get(handoff.leadSlug)?.businessName ||
        handoff.businessName ||
        handoff.leadSlug,
      status: handoff.status,
      host: handoff.customDomain?.trim() || handoff.suggestedHost,
      tier: handoff.tier,
    }));

  // Same lead.stage === "paid" predicate as pipeline-health paidNotLiveCount.
  // Distinct set from openHandoffs above — a lead can be marked paid (stage
  // dropdown or CSV import) with no deploy_handoffs row ever created.
  const paidNotLiveAll = leads.filter((lead) => lead.stage === "paid");
  const paidNotLiveCount = paidNotLiveAll.length;
  const oldestPaidNotLiveAgeHoursValue = oldestPaidNotLiveAgeHours(
    paidNotLiveAll,
    orders,
    nowMs,
  );
  const paidNotLive: DigestPaidNotLive[] = paidNotLiveAll
    .slice(0, PAID_NOT_LIVE_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
    }));

  // Same EMAIL_CRITICAL_STAGES + empty-email predicate as pipeline-health
  // leadsMissingEmailCount (via leadIsMissingCriticalEmail). Distinct from
  // paidNotLive / openHandoffs — those are post-payment; this blocks Email 1.
  const leadsMissingEmailAll = leads.filter(leadIsMissingCriticalEmail);
  const leadsMissingEmailCount = leadsMissingEmailAll.length;
  const leadsMissingEmail: DigestLeadMissingEmail[] = leadsMissingEmailAll
    .slice(0, LEADS_MISSING_EMAIL_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
      stage: lead.stage,
    }));

  const coldLeads = listColdLeads(leads, nowMs);
  const coldLeadCount = coldLeads.length;
  const oldestColdLeadAgeHours = oldestLastOutreachAgeHours(coldLeads, nowMs);
  const closedLeadCount = leads.filter((lead) => lead.stage === "closed").length;

  const snoozedLeads = leads.filter((lead) =>
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

  const recurringEntitlementPausedAll = listRecurringEntitlementPaused(leads, orders);
  const recurringEntitlementPausedCount = recurringEntitlementPausedAll.length;
  const oldestRecurringEntitlementPausedAgeHoursValue =
    oldestRecurringEntitlementPausedAgeHours(recurringEntitlementPausedAll, nowMs);
  const recurringEntitlementPaused: DigestRecurringEntitlementPaused[] =
    recurringEntitlementPausedAll
      .slice(0, RECURRING_ENTITLEMENT_PAUSED_LIMIT)
      .map((lead) => ({
        slug: lead.slug,
        businessName: lead.businessName,
        stage: lead.stage,
        hasStripeCustomerId: lead.hasStripeCustomerId,
      }));

  const connectOnboardingIncompleteAll = listLeadsWithIncompleteConnectOnboarding(leads);
  const connectOnboardingIncompleteCount = connectOnboardingIncompleteAll.length;
  const oldestConnectOnboardingIncompleteAgeHoursValue = oldestConnectOnboardingIncompleteAgeHours(
    connectOnboardingIncompleteAll,
    nowMs,
  );
  const connectOnboardingIncomplete: DigestConnectOnboardingIncomplete[] =
    connectOnboardingIncompleteAll
      .slice(0, CONNECT_ONBOARDING_INCOMPLETE_LIMIT)
      .map((lead) => ({
        slug: lead.slug,
        businessName: lead.businessName,
      }));

  // Pre-slice true count per section (mirrors the *Count fields below, using
  // workNext.length directly since it's a ranked top-N pick list rather than
  // a due-queue with its own separate uncapped count). Single source of
  // truth for actionableItemCount, actionableSectionLabels, and isEmpty so
  // the three can never drift from each other, and so a caller that needs
  // "how many items" or "what did we check" never has to hand-duplicate this
  // list (see actionableItemCount doc comment; the empty-state prose in
  // renderDailyDigestHtml used to hand-duplicate a subset of these labels
  // and silently fell six sections behind — daily-digest-empty-state-copy-drift).
  const actionableSections: ReadonlyArray<{ label: string; count: number }> = [
    { label: "Work next", count: workNext.length },
    { label: "follow-ups", count: followUpsDueCount },
    { label: "checkout recoveries", count: checkoutRecoveriesDueCount },
    { label: "Buy now carts", count: commerceCheckoutRecoveriesDueCount },
    { label: "inbox", count: unrepliedInquiriesCount },
    { label: "marketing packs", count: marketingPacksDueCount },
    { label: "marketing packs not emailed", count: marketingPacksMissingClientSendCount },
    { label: "Starter upsells", count: starterUpsellCandidatesCount },
    { label: "Commerce catalogs", count: commerceCatalogsMissingCount },
    { label: "Sync to Stripe", count: commerceCatalogsUnsyncedCount },
    { label: "Complete voice packs", count: clientVoicePacksDueCount },
    { label: "Complete voice packs not emailed", count: clientVoicePacksMissingClientSendCount },
    { label: "Commerce payouts owed", count: commercePayoutsOwedCount },
    { label: "Refund clawback", count: commerceOrdersRefundClawbackCount },
    { label: "Dispute clawback", count: commerceOrdersDisputeClawbackCount },
    { label: "Missing client receipt", count: commerceOrdersMissingClientReceiptCount },
    { label: "Bundle refunds", count: bundleOrdersRefundedCount },
    { label: "Bundle disputes", count: bundleOrdersDisputedCount },
    { label: "production handoffs", count: openHandoffsCount },
    { label: "Paid, not live", count: paidNotLiveCount },
    { label: "Missing email", count: leadsMissingEmailCount },
    { label: "paused/canceled MRR recoveries", count: recurringEntitlementPausedCount },
    { label: "Stripe Connect onboarding incomplete", count: connectOnboardingIncompleteCount },
  ];
  const actionableItemCount = actionableSections.reduce(
    (sum, section) => sum + section.count,
    0,
  );
  const actionableSectionLabels = actionableSections.map((section) => section.label);
  const isEmpty = actionableItemCount === 0;

  return {
    generatedAtMs: nowMs,
    actionableItemCount,
    actionableSectionLabels,
    workNext,
    followUpsDue,
    followUpsDueCount,
    checkoutRecoveriesDue,
    checkoutRecoveriesDueCount,
    commerceCheckoutRecoveriesDue,
    commerceCheckoutRecoveriesDueCount,
    oldestCommerceAbandonedAgeHours,
    unrepliedInquiries,
    unrepliedInquiriesCount,
    marketingPacksDue,
    marketingPacksDueCount,
    oldestMarketingPacksDueAgeHours: oldestMarketingPacksDueAgeHoursValue,
    marketingPacksMissingClientSend,
    marketingPacksMissingClientSendCount,
    oldestMarketingPacksMissingClientSendAgeHours:
      oldestMarketingPacksMissingClientSendAgeHoursValue,
    starterUpsellCandidates,
    starterUpsellCandidatesCount,
    oldestStarterUpsellCandidateAgeHours: oldestStarterUpsellCandidateAgeHoursValue,
    commerceCatalogsMissing,
    commerceCatalogsMissingCount,
    oldestCommerceCatalogsMissingAgeHours: oldestCommerceCatalogsMissingAgeHoursValue,
    commerceCatalogsUnsynced,
    commerceCatalogsUnsyncedCount,
    oldestCommerceCatalogsUnsyncedAgeHours: oldestCommerceCatalogsUnsyncedAgeHoursValue,
    clientVoicePacksDue,
    clientVoicePacksDueCount,
    oldestClientVoicePacksDueAgeHours: oldestClientVoicePacksDueAgeHoursValue,
    clientVoicePacksMissingClientSend,
    clientVoicePacksMissingClientSendCount,
    oldestClientVoicePacksMissingClientSendAgeHours:
      oldestClientVoicePacksMissingClientSendAgeHoursValue,
    commercePayoutsOwed,
    commercePayoutsOwedCount,
    commercePayoutsOwedTotalUsd,
    oldestCommerceOrdersOwedAgeHours: oldestCommerceOrdersOwedAgeHoursValue,
    commerceOrdersRefundClawback,
    commerceOrdersRefundClawbackCount,
    commerceOrdersRefundClawbackTotalUsd,
    oldestCommerceOrdersRefundClawbackAgeHours,
    commerceOrdersDisputeClawback,
    commerceOrdersDisputeClawbackCount,
    commerceOrdersDisputeClawbackTotalUsd,
    oldestCommerceOrdersDisputeClawbackAgeHours,
    commerceOrdersMissingClientReceipt,
    commerceOrdersMissingClientReceiptCount,
    oldestCommerceOrdersMissingClientReceiptAgeHours:
      oldestCommerceOrdersMissingClientReceiptAgeHoursValue,
    bundleOrdersRefunded,
    bundleOrdersRefundedCount,
    bundleOrdersRefundedTotalUsd,
    oldestBundleOrdersRefundedAgeHours,
    bundleOrdersDisputed,
    bundleOrdersDisputedCount,
    bundleOrdersDisputedTotalUsd,
    oldestBundleOrdersDisputedAgeHours,
    openHandoffs,
    openHandoffsCount,
    oldestOpenHandoffAgeHours,
    paidNotLive,
    paidNotLiveCount,
    oldestPaidNotLiveAgeHours: oldestPaidNotLiveAgeHoursValue,
    leadsMissingEmail,
    leadsMissingEmailCount,
    newInquiryCount,
    oldestUnrepliedInquiryAgeHours,
    oldestFollowUpDueAgeHours,
    oldestAbandonedAgeHours,
    oldestColdLeadAgeHours,
    coldLeadCount,
    closedLeadCount,
    snoozedLeadCount: snoozedLeads.length,
    soonestSnoozeRemainingHours,
    recurringEntitlementPaused,
    recurringEntitlementPausedCount,
    oldestRecurringEntitlementPausedAgeHours:
      oldestRecurringEntitlementPausedAgeHoursValue,
    connectOnboardingIncomplete,
    connectOnboardingIncompleteCount,
    oldestConnectOnboardingIncompleteAgeHours: oldestConnectOnboardingIncompleteAgeHoursValue,
    isEmpty,
  };
}

/** Human-readable remaining snooze for digest footnotes (e.g. "3h", "2d"). */
export function formatSnoozeRemainingHours(hours: number | null): string {
  if (hours === null) return "";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}

function section(title: string, rows: string[], emptyNote: string): string {
  const body =
    rows.length > 0
      ? `<ul style="margin:0;padding-left:18px;">${rows.map((row) => `<li style="margin-bottom:6px;">${row}</li>`).join("")}</ul>`
      : `<p style="margin:0;color:#71717a;font-size:13px;">${emptyNote}</p>`;
  return `
    <div style="margin-bottom:24px;">
      <h3 style="margin:0 0 8px 0;font-size:15px;color:#09090b;">${title}</h3>
      ${body}
    </div>
  `;
}

function snoozedFootnote(digest: DailyDigest): string {
  if (digest.snoozedLeadCount <= 0) return "";
  const soonest = formatSnoozeRemainingHours(digest.soonestSnoozeRemainingHours);
  const soonestBit = soonest ? ` · soonest returns in ${soonest}` : "";
  return `<p style="margin:16px 0 0 0;color:#71717a;font-size:13px;">${digest.snoozedLeadCount} lead${digest.snoozedLeadCount === 1 ? "" : "s"} currently snoozed off Work next${soonestBit} — parked urgency, not a second queue.</p>`;
}

function closedLeadFootnote(digest: DailyDigest): string {
  if (digest.closedLeadCount <= 0) return "";
  return `<p style="margin:16px 0 0 0;color:#71717a;font-size:13px;">${digest.closedLeadCount} lead${digest.closedLeadCount === 1 ? "" : "s"} marked closed — settled inventory, not actionable above.</p>`;
}

function coldFootnote(digest: DailyDigest, emptyState: boolean): string {
  if (digest.coldLeadCount <= 0) return "";
  const oldestBit = digest.oldestColdLeadAgeHours !== null ? ` · oldest ${digest.oldestColdLeadAgeHours}h` : "";
  if (emptyState) {
    return `<p style="margin:16px 0 0 0;color:#71717a;font-size:13px;">${digest.coldLeadCount} lead${digest.coldLeadCount === 1 ? "" : "s"} went cold after Email 3${oldestBit} — see /dashboard/leads to re-engage or close them out.</p>`;
  }
  return `<p style="margin:16px 0 0 0;color:#71717a;font-size:13px;">${digest.coldLeadCount} lead${digest.coldLeadCount === 1 ? "" : "s"} also went cold after Email 3${oldestBit} — not actionable above, but worth a manual look.</p>`;
}

/** Joins items with commas and "and" before the last (Oxford comma for 3+). */
export function joinWithAnd(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Renders the digest as email-safe inline-styled HTML. Pure — no fetch/DOM. */
export function renderDailyDigestHtml(digest: DailyDigest, baseUrl: string): string {
  if (digest.isEmpty) {
    return `
      <h2 style="margin:0 0 16px 0;color:#09090b;">Nothing urgent today</h2>
      <p style="margin:0;color:#3f3f46;">${joinWithAnd(digest.actionableSectionLabels)} are all clear.</p>
      ${coldFootnote(digest, true)}
      ${snoozedFootnote(digest)}
      ${closedLeadFootnote(digest)}
    `;
  }

  const workNextRows = digest.workNext.map(
    (lead) =>
      `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — ${lead.score}/100 (${lead.band})${
        lead.topFactorLabel ? ` · ${escapeHtmlForEmail(lead.topFactorLabel)}` : ""
      }`,
  );

  const followUpRows = digest.followUpsDue.map(
    (lead) => `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — Email ${lead.outreachStep + 1} due`,
  );

  const recoveryRows = digest.checkoutRecoveriesDue.map(
    (recovery) =>
      `<strong>${escapeHtmlForEmail(recovery.businessName)}</strong> — abandoned ${escapeHtmlForEmail(recovery.tier)} checkout (nudge #${recovery.nextNudgeNumber})`,
  );

  const commerceRecoveryRows = digest.commerceCheckoutRecoveriesDue.map(
    (recovery) =>
      `<strong>${escapeHtmlForEmail(recovery.businessName)}</strong> — abandoned Buy now (${escapeHtmlForEmail(recovery.skuId)}) (nudge #${recovery.nextNudgeNumber})`,
  );

  const inquiryRows = digest.unrepliedInquiries.map(
    (inquiry) =>
      `<strong>${escapeHtmlForEmail(inquiry.businessName)}</strong> — “${escapeHtmlForEmail(inquiry.messagePreview)}”`,
  );

  const packRows = digest.marketingPacksDue.map(
    (pack) =>
      `<strong>${escapeHtmlForEmail(pack.businessName)}</strong> — ${escapeHtmlForEmail(pack.yearMonth)} pack not generated`,
  );

  const packMissingSendRows = digest.marketingPacksMissingClientSend.map(
    (pack) =>
      `<strong>${escapeHtmlForEmail(pack.businessName)}</strong> — ${escapeHtmlForEmail(pack.yearMonth)} pack generated but never emailed to client`,
  );
  const packMissingSendTitle = `Marketing packs not emailed (${digest.marketingPacksMissingClientSendCount}${digest.oldestMarketingPacksMissingClientSendAgeHours !== null ? ` · oldest ${digest.oldestMarketingPacksMissingClientSendAgeHours}h` : ""})`;

  const upsellRows = digest.starterUpsellCandidates.map(
    (lead) =>
      `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — Starter paid, suggest ${escapeHtmlForEmail(lead.targetTier)} upsell`,
  );

  const commerceRows = digest.commerceCatalogsMissing.map(
    (lead) =>
      `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — Commerce catalog not created`,
  );

  const commerceUnsyncedRows = digest.commerceCatalogsUnsynced.map(
    (lead) =>
      `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — Sync to Stripe still due`,
  );

  const voicePackRows = digest.clientVoicePacksDue.map(
    (lead) =>
      `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — Complete voice FAQ pack not generated`,
  );

  const voicePackMissingSendRows = digest.clientVoicePacksMissingClientSend.map(
    (lead) =>
      `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — Complete voice FAQ pack generated but never emailed to client`,
  );
  const voicePackMissingSendTitle = `Complete voice packs not emailed (${digest.clientVoicePacksMissingClientSendCount}${digest.oldestClientVoicePacksMissingClientSendAgeHours !== null ? ` · oldest ${digest.oldestClientVoicePacksMissingClientSendAgeHours}h` : ""})`;

  const payoutRows = digest.commercePayoutsOwed.map(
    (row) =>
      `<strong>${escapeHtmlForEmail(row.businessName)}</strong> — $${row.totalUsd.toFixed(2)} owed (${row.orderCount} order${row.orderCount === 1 ? "" : "s"})`,
  );
  const payoutTitle =
    digest.commercePayoutsOwedCount > 0
      ? `Commerce payouts owed ($${digest.commercePayoutsOwedTotalUsd.toFixed(2)} · ${digest.commercePayoutsOwedCount} client${digest.commercePayoutsOwedCount === 1 ? "" : "s"}${digest.oldestCommerceOrdersOwedAgeHours !== null ? ` · oldest ${digest.oldestCommerceOrdersOwedAgeHours}h` : ""})`
      : "Commerce payouts owed (0)";

  const clawbackRows = digest.commerceOrdersRefundClawback.map(
    (row) =>
      `<strong>${escapeHtmlForEmail(row.businessName)}</strong> — $${row.amountPaidUsd.toFixed(2)} paid out for ${escapeHtmlForEmail(row.skuName)}${row.quantity && row.quantity > 1 ? ` × ${row.quantity}` : ""}, then refunded by Stripe — claw back from client`,
  );
  const clawbackTitle =
    digest.commerceOrdersRefundClawbackCount > 0
      ? `Refund clawback needed ($${digest.commerceOrdersRefundClawbackTotalUsd.toFixed(2)} · ${digest.commerceOrdersRefundClawbackCount} order${digest.commerceOrdersRefundClawbackCount === 1 ? "" : "s"}${digest.oldestCommerceOrdersRefundClawbackAgeHours !== null ? ` · oldest ${digest.oldestCommerceOrdersRefundClawbackAgeHours}h` : ""})`
      : "Refund clawback needed (0)";

  const disputeClawbackRows = digest.commerceOrdersDisputeClawback.map(
    (row) =>
      `<strong>${escapeHtmlForEmail(row.businessName)}</strong> — $${row.amountPaidUsd.toFixed(2)} paid out for ${escapeHtmlForEmail(row.skuName)}${row.quantity && row.quantity > 1 ? ` × ${row.quantity}` : ""}, then disputed by the shopper's bank — claw back from client`,
  );
  const disputeClawbackTitle =
    digest.commerceOrdersDisputeClawbackCount > 0
      ? `Dispute clawback needed ($${digest.commerceOrdersDisputeClawbackTotalUsd.toFixed(2)} · ${digest.commerceOrdersDisputeClawbackCount} order${digest.commerceOrdersDisputeClawbackCount === 1 ? "" : "s"}${digest.oldestCommerceOrdersDisputeClawbackAgeHours !== null ? ` · oldest ${digest.oldestCommerceOrdersDisputeClawbackAgeHours}h` : ""})`
      : "Dispute clawback needed (0)";

  const missingClientReceiptRows = digest.commerceOrdersMissingClientReceipt.map(
    (row) =>
      `<strong>${escapeHtmlForEmail(row.businessName)}</strong> — sold ${escapeHtmlForEmail(row.skuName)}${row.quantity && row.quantity > 1 ? ` × ${row.quantity}` : ""} ($${row.amountPaidUsd.toFixed(2)}), but was never notified — resend the receipt`,
  );
  const missingClientReceiptTitle = `Missing client receipt (${digest.commerceOrdersMissingClientReceiptCount}${digest.oldestCommerceOrdersMissingClientReceiptAgeHours !== null ? ` · oldest ${digest.oldestCommerceOrdersMissingClientReceiptAgeHours}h` : ""})`;

  const bundleRefundRows = digest.bundleOrdersRefunded.map(
    (row) =>
      `<strong>${escapeHtmlForEmail(row.businessName)}</strong> — $${row.amountPaidUsd.toFixed(2)} (${escapeHtmlForEmail(row.tier)}) refunded by Stripe — already excluded from revenue, no action needed`,
  );
  const bundleRefundTitle =
    digest.bundleOrdersRefundedCount > 0
      ? `Bundle revenue refunded ($${digest.bundleOrdersRefundedTotalUsd.toFixed(2)} · ${digest.bundleOrdersRefundedCount} order${digest.bundleOrdersRefundedCount === 1 ? "" : "s"}${digest.oldestBundleOrdersRefundedAgeHours !== null ? ` · oldest ${digest.oldestBundleOrdersRefundedAgeHours}h` : ""})`
      : "Bundle revenue refunded (0)";

  const bundleDisputeRows = digest.bundleOrdersDisputed.map(
    (row) =>
      `<strong>${escapeHtmlForEmail(row.businessName)}</strong> — $${row.amountPaidUsd.toFixed(2)} (${escapeHtmlForEmail(row.tier)}) disputed by Stripe — already excluded from revenue, no action needed`,
  );
  const bundleDisputeTitle =
    digest.bundleOrdersDisputedCount > 0
      ? `Bundle revenue disputed ($${digest.bundleOrdersDisputedTotalUsd.toFixed(2)} · ${digest.bundleOrdersDisputedCount} order${digest.bundleOrdersDisputedCount === 1 ? "" : "s"}${digest.oldestBundleOrdersDisputedAgeHours !== null ? ` · oldest ${digest.oldestBundleOrdersDisputedAgeHours}h` : ""})`
      : "Bundle revenue disputed (0)";

  const handoffRows = digest.openHandoffs.map(
    (handoff) =>
      `<strong>${escapeHtmlForEmail(handoff.businessName)}</strong> — ${escapeHtmlForEmail(handoff.status)} · ${escapeHtmlForEmail(handoff.host)} (${escapeHtmlForEmail(handoff.tier)})`,
  );

  const paidNotLiveRows = digest.paidNotLive.map(
    (lead) => `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — stage is Paid`,
  );

  const missingEmailRows = digest.leadsMissingEmail.map(
    (lead) =>
      `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — no email · ${escapeHtmlForEmail(lead.stage)}`,
  );

  const recurringPausedRows = digest.recurringEntitlementPaused.map((lead) => {
    const billingHint = lead.hasStripeCustomerId
      ? " · Manage billing / Billing Portal"
      : " · no Stripe customer on file";
    return `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — ${escapeHtmlForEmail(lead.stage)} MRR paused/canceled${billingHint}`;
  });

  const connectOnboardingIncompleteRows = digest.connectOnboardingIncomplete.map(
    (lead) =>
      `<strong>${escapeHtmlForEmail(lead.businessName)}</strong> — Stripe Connect account not yet confirmed fully onboarded`,
  );

  return `
    <h2 style="margin:0 0 4px 0;color:#09090b;">Today's priorities</h2>
    <p style="margin:0 0 20px 0;color:#71717a;font-size:13px;">
      <a href="${escapeHtmlForEmail(baseUrl)}/dashboard/leads" style="color:#2563eb;">Open the dashboard</a> to act on any of these.
    </p>
    ${section(`Work next (${digest.workNext.length})`, workNextRows, "No actionable leads scored right now.")}
    ${section(
      `Follow-ups due (${digest.followUpsDueCount}${digest.oldestFollowUpDueAgeHours !== null ? ` · oldest ${digest.oldestFollowUpDueAgeHours}h` : ""})`,
      followUpRows,
      "No follow-up emails due.",
    )}
    ${section(`Abandoned checkouts (${digest.checkoutRecoveriesDueCount}${digest.oldestAbandonedAgeHours !== null ? ` · oldest ${digest.oldestAbandonedAgeHours}h` : ""})`, recoveryRows, "No recovery nudges due.")}
    ${section(`Abandoned Buy now (${digest.commerceCheckoutRecoveriesDueCount}${digest.oldestCommerceAbandonedAgeHours !== null ? ` · oldest ${digest.oldestCommerceAbandonedAgeHours}h` : ""})`, commerceRecoveryRows, "No Commerce Buy now carts due for recovery.")}
    ${section(
      `Unreplied inquiries (${digest.unrepliedInquiriesCount}${digest.newInquiryCount > 0 && digest.newInquiryCount !== digest.unrepliedInquiriesCount ? ` · ${digest.newInquiryCount} new` : ""}${digest.oldestUnrepliedInquiryAgeHours !== null ? ` · oldest ${digest.oldestUnrepliedInquiryAgeHours}h` : ""})`,
      inquiryRows,
      "Inbox clear.",
    )}
    ${section(`Marketing packs due (${digest.marketingPacksDueCount}${digest.oldestMarketingPacksDueAgeHours !== null ? ` · oldest ${digest.oldestMarketingPacksDueAgeHours}h` : ""})`, packRows, "All Growth/Complete packs generated this month.")}
    ${section(packMissingSendTitle, packMissingSendRows, "Every generated marketing pack this month has been emailed to its client.")}
    ${section(
      `MRR paused / canceled (${digest.recurringEntitlementPausedCount}${digest.oldestRecurringEntitlementPausedAgeHours !== null ? ` · oldest ${digest.oldestRecurringEntitlementPausedAgeHours}h` : ""})`,
      recurringPausedRows,
      "No paused or canceled Growth/Complete/Commerce subscribers need recovery.",
    )}
    ${section(`Starter → MRR upsell (${digest.starterUpsellCandidatesCount}${digest.oldestStarterUpsellCandidateAgeHours !== null ? ` · oldest ${digest.oldestStarterUpsellCandidateAgeHours}h` : ""})`, upsellRows, "No Starter-only paid leads ready to upsell.")}
    ${section(`Commerce catalogs missing (${digest.commerceCatalogsMissingCount}${digest.oldestCommerceCatalogsMissingAgeHours !== null ? ` · oldest ${digest.oldestCommerceCatalogsMissingAgeHours}h` : ""})`, commerceRows, "All paid Commerce add-on leads have a catalog.")}
    ${section(`Commerce Sync to Stripe due (${digest.commerceCatalogsUnsyncedCount}${digest.oldestCommerceCatalogsUnsyncedAgeHours !== null ? ` · oldest ${digest.oldestCommerceCatalogsUnsyncedAgeHours}h` : ""})`, commerceUnsyncedRows, "All saved Commerce catalogs are synced for Buy now.")}
    ${section(`Stripe Connect onboarding incomplete (${digest.connectOnboardingIncompleteCount}${digest.oldestConnectOnboardingIncompleteAgeHours !== null ? ` · oldest ${digest.oldestConnectOnboardingIncompleteAgeHours}h` : ""})`, connectOnboardingIncompleteRows, "Every Connect account is fully onboarded (or none created yet).")}
    ${section(`Complete voice packs due (${digest.clientVoicePacksDueCount}${digest.oldestClientVoicePacksDueAgeHours !== null ? ` · oldest ${digest.oldestClientVoicePacksDueAgeHours}h` : ""})`, voicePackRows, "All Complete voice FAQ packs generated.")}
    ${section(voicePackMissingSendTitle, voicePackMissingSendRows, "Every generated Complete voice FAQ pack has been emailed to its client.")}
    ${section(payoutTitle, payoutRows, "No pass-through Buy now money owed to clients.")}
    ${section(clawbackTitle, clawbackRows, "No Commerce payouts have been refunded after the fact.")}
    ${section(disputeClawbackTitle, disputeClawbackRows, "No Commerce payouts have been disputed after the fact.")}
    ${section(missingClientReceiptTitle, missingClientReceiptRows, "Every Commerce Buy now sale has notified the client.")}
    ${section(bundleRefundTitle, bundleRefundRows, "No bundle orders refunded.")}
    ${section(bundleDisputeTitle, bundleDisputeRows, "No bundle orders disputed.")}
    ${section(`Production handoffs open (${digest.openHandoffsCount}${digest.oldestOpenHandoffAgeHours !== null ? ` · oldest ${digest.oldestOpenHandoffAgeHours}h` : ""})`, handoffRows, "No paid sites awaiting DNS / Mark live.")}
    ${section(`Paid, not yet live (${digest.paidNotLiveCount}${digest.oldestPaidNotLiveAgeHours !== null ? ` · oldest ${digest.oldestPaidNotLiveAgeHours}h` : ""})`, paidNotLiveRows, "No leads stuck at stage=Paid with nothing else due.")}
    ${section(`Leads missing email (${digest.leadsMissingEmailCount})`, missingEmailRows, "Every email-critical lead has a usable address.")}
    ${coldFootnote(digest, false)}
    ${snoozedFootnote(digest)}
    ${closedLeadFootnote(digest)}
  `;
}
