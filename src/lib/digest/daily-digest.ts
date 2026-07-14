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
 * + leads-missing-email-in-digest).
 *
 * Pure aggregation over already-loaded data, same shape as pipeline-health.ts
 * and quality-score.ts: pass `nowMs` from the caller, never Date.now() here.
 */

import type { ClientInquiry } from "../inquiries/types";
import type { CheckoutSessionRecord } from "../checkout/types";
import type { DeployHandoff, DeployHandoffStatus } from "../deploy/types";
import type { Lead, LeadPipelineStage } from "../leads/types";
import { rankLeadsForOutreach, type LeadQualityBand } from "../leads/quality-score";
import { listFollowUpsDue, listColdLeads } from "../email/outreach-followups";
import { escapeHtmlForEmail } from "../inquiries/reply";
import {
  listAbandonedCheckoutsDue,
  listCommerceAbandonedCheckoutsDue,
} from "../checkout/abandoned-recovery";
import { isLeadSnoozed } from "../leads/snooze";
import {
  isUnrepliedInquiryStatus,
  leadIsMissingCriticalEmail,
} from "../metrics/pipeline-health";
import {
  listMarketingPacksDue,
  marketingMonthKey,
} from "../marketing/monthly-pack";
import {
  listStarterUpsellCandidates,
  resolveUpsellTargetTier,
  type UpsellTargetTier,
} from "../billing/starter-upsell";
import { listCommerceCatalogsMissing, listCommerceCatalogsUnsynced } from "../commerce/catalog";
import {
  summarizeCommerceOrdersByLead,
  type CommerceOrderRecord,
} from "../commerce/orders";
import { listClientVoicePacksDue } from "../voice/faq-pack";

const WORK_NEXT_LIMIT = 5;
const FOLLOW_UPS_LIMIT = 5;
const RECOVERIES_LIMIT = 5;
const INQUIRIES_LIMIT = 5;
const MARKETING_PACKS_LIMIT = 5;
const UPSELL_LIMIT = 5;
const COMMERCE_CATALOGS_LIMIT = 5;
const COMMERCE_UNSYNCED_LIMIT = 5;
const CLIENT_VOICE_PACKS_LIMIT = 5;
const COMMERCE_PAYOUTS_LIMIT = 5;
const OPEN_HANDOFFS_LIMIT = 5;
const PAID_NOT_LIVE_LIMIT = 5;
const LEADS_MISSING_EMAIL_LIMIT = 5;
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
}

export interface DigestCommerceCheckoutRecovery {
  stripeSessionId: string;
  slug: string;
  businessName: string;
  skuId: string;
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

/** Pass-through Buy now totals owed to a Commerce client (manual payouts). */
export interface DigestCommercePayoutOwed {
  slug: string;
  businessName: string;
  orderCount: number;
  totalUsd: number;
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
  starterUpsellCandidates: DigestStarterUpsellLead[];
  starterUpsellCandidatesCount: number;
  commerceCatalogsMissing: DigestCommerceCatalogMissing[];
  commerceCatalogsMissingCount: number;
  commerceCatalogsUnsynced: DigestCommerceCatalogUnsynced[];
  commerceCatalogsUnsyncedCount: number;
  clientVoicePacksDue: DigestClientVoicePackDue[];
  clientVoicePacksDueCount: number;
  /** Per-lead pass-through Buy now totals still owed until Connect (action section). */
  commercePayoutsOwed: DigestCommercePayoutOwed[];
  /** True count before the COMMERCE_PAYOUTS_LIMIT slice — use for the section header. */
  commercePayoutsOwedCount: number;
  /** Sum of commercePayoutsOwed totals (USD dollars) — already computed pre-slice, unaffected by the cap. */
  commercePayoutsOwedTotalUsd: number;
  /**
   * Paid sites still awaiting DNS / Mark live — same status !== "live" filter as
   * pipeline-health openHandoffCount (action section).
   */
  openHandoffs: DigestOpenHandoff[];
  openHandoffsCount: number;
  /**
   * Leads with stage="paid" — same predicate as pipeline-health
   * paidNotLiveCount (action section). Not the same set as openHandoffs: a
   * lead can be marked paid via the stage dropdown or CSV import with no
   * deploy_handoffs row, so it would never surface there.
   */
  paidNotLive: DigestPaidNotLive[];
  paidNotLiveCount: number;
  /**
   * Email-critical leads with no usable email — same predicate as
   * pipeline-health leadsMissingEmailCount (action section). Distinct from
   * paidNotLive / openHandoffs: those are post-payment fulfillment; this is
   * the pre-send contact gap that blocks outreach revenue motion entirely.
   */
  leadsMissingEmail: DigestLeadMissingEmail[];
  /** True count before the LEADS_MISSING_EMAIL_LIMIT slice — use for the section header. */
  leadsMissingEmailCount: number;
  coldLeadCount: number;
  /**
   * Leads currently parked off Work next via snoozedUntil (same predicate as
   * pipeline-health snoozedLeadCount). Footnote only — not a digest action section.
   */
  snoozedLeadCount: number;
  /** Whole hours until the soonest snooze expires; null when none snoozed. */
  soonestSnoozeRemainingHours: number | null;
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
  orders?: Array<{ leadSlug: string; tier: string; commerceAddon: boolean }>;
  marketingPacksThisMonth?: ReadonlyArray<{ leadSlug: string; yearMonth: string }>;
  commerceCatalogs?: ReadonlyArray<{
    leadSlug: string;
    items?: ReadonlyArray<{ stripePriceId?: string }>;
  }>;
  clientVoicePacks?: ReadonlyArray<{ leadSlug: string }>;
  /** Pass-through Buy now ledger rows — reuse summarizeCommerceOrdersByLead. */
  commerceOrders?: ReadonlyArray<CommerceOrderRecord>;
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
  const followUpsDue: DigestFollowUpLead[] = followUpsDueAll
    .slice(0, FOLLOW_UPS_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
      outreachStep: lead.outreachStep ?? 0,
    }));

  const checkoutRecoveriesDueAll = listAbandonedCheckoutsDue(openCheckoutSessions, nowMs);
  const checkoutRecoveriesDueCount = checkoutRecoveriesDueAll.length;
  const checkoutRecoveriesDue: DigestCheckoutRecovery[] = checkoutRecoveriesDueAll
    .slice(0, RECOVERIES_LIMIT)
    .map((session) => ({
      stripeSessionId: session.stripeSessionId,
      slug: session.leadSlug,
      businessName: leadsBySlug.get(session.leadSlug)?.businessName ?? session.leadSlug,
      tier: session.tier,
    }));

  const commerceCheckoutRecoveriesDueAll = listCommerceAbandonedCheckoutsDue(
    openCheckoutSessions,
    nowMs,
  );
  const commerceCheckoutRecoveriesDueCount = commerceCheckoutRecoveriesDueAll.length;
  const commerceCheckoutRecoveriesDue: DigestCommerceCheckoutRecovery[] =
    commerceCheckoutRecoveriesDueAll.slice(0, RECOVERIES_LIMIT).map((session) => ({
      stripeSessionId: session.stripeSessionId,
      slug: session.leadSlug,
      businessName: leadsBySlug.get(session.leadSlug)?.businessName ?? session.leadSlug,
      skuId: session.skuId ?? "sku",
    }));

  const unrepliedInquiriesAll = inquiries
    .filter((inquiry) => isUnrepliedInquiryStatus(inquiry.status))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const unrepliedInquiriesCount = unrepliedInquiriesAll.length;
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

  // Same status !== "live" predicate as pipeline-health openHandoffCount.
  const openHandoffsAll = handoffs
    .filter((handoff) => handoff.status !== "live")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const openHandoffsCount = openHandoffsAll.length;
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

  const coldLeadCount = listColdLeads(leads, nowMs).length;

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

  const isEmpty =
    workNext.length === 0 &&
    followUpsDue.length === 0 &&
    checkoutRecoveriesDue.length === 0 &&
    commerceCheckoutRecoveriesDue.length === 0 &&
    unrepliedInquiries.length === 0 &&
    marketingPacksDue.length === 0 &&
    starterUpsellCandidates.length === 0 &&
    commerceCatalogsMissing.length === 0 &&
    commerceCatalogsUnsynced.length === 0 &&
    clientVoicePacksDue.length === 0 &&
    commercePayoutsOwed.length === 0 &&
    openHandoffs.length === 0 &&
    paidNotLive.length === 0 &&
    leadsMissingEmail.length === 0;

  return {
    generatedAtMs: nowMs,
    workNext,
    followUpsDue,
    followUpsDueCount,
    checkoutRecoveriesDue,
    checkoutRecoveriesDueCount,
    commerceCheckoutRecoveriesDue,
    commerceCheckoutRecoveriesDueCount,
    unrepliedInquiries,
    unrepliedInquiriesCount,
    marketingPacksDue,
    marketingPacksDueCount,
    starterUpsellCandidates,
    starterUpsellCandidatesCount,
    commerceCatalogsMissing,
    commerceCatalogsMissingCount,
    commerceCatalogsUnsynced,
    commerceCatalogsUnsyncedCount,
    clientVoicePacksDue,
    clientVoicePacksDueCount,
    commercePayoutsOwed,
    commercePayoutsOwedCount,
    commercePayoutsOwedTotalUsd,
    openHandoffs,
    openHandoffsCount,
    paidNotLive,
    paidNotLiveCount,
    leadsMissingEmail,
    leadsMissingEmailCount,
    coldLeadCount,
    snoozedLeadCount: snoozedLeads.length,
    soonestSnoozeRemainingHours,
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

function coldFootnote(digest: DailyDigest, emptyState: boolean): string {
  if (digest.coldLeadCount <= 0) return "";
  if (emptyState) {
    return `<p style="margin:16px 0 0 0;color:#71717a;font-size:13px;">${digest.coldLeadCount} lead${digest.coldLeadCount === 1 ? "" : "s"} went cold after Email 3 — see /dashboard/leads to re-engage or close them out.</p>`;
  }
  return `<p style="margin:16px 0 0 0;color:#71717a;font-size:13px;">${digest.coldLeadCount} lead${digest.coldLeadCount === 1 ? "" : "s"} also went cold after Email 3 — not actionable above, but worth a manual look.</p>`;
}

/** Renders the digest as email-safe inline-styled HTML. Pure — no fetch/DOM. */
export function renderDailyDigestHtml(digest: DailyDigest, baseUrl: string): string {
  if (digest.isEmpty) {
    return `
      <h2 style="margin:0 0 16px 0;color:#09090b;">Nothing urgent today</h2>
      <p style="margin:0;color:#3f3f46;">Work next, follow-ups, checkout recoveries, Buy now carts, inbox, marketing packs, Starter upsells, Commerce catalogs, Sync to Stripe, Complete voice packs, Commerce payouts owed, and production handoffs are all clear.</p>
      ${coldFootnote(digest, true)}
      ${snoozedFootnote(digest)}
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
      `<strong>${escapeHtmlForEmail(recovery.businessName)}</strong> — abandoned ${escapeHtmlForEmail(recovery.tier)} checkout`,
  );

  const commerceRecoveryRows = digest.commerceCheckoutRecoveriesDue.map(
    (recovery) =>
      `<strong>${escapeHtmlForEmail(recovery.businessName)}</strong> — abandoned Buy now (${escapeHtmlForEmail(recovery.skuId)})`,
  );

  const inquiryRows = digest.unrepliedInquiries.map(
    (inquiry) =>
      `<strong>${escapeHtmlForEmail(inquiry.businessName)}</strong> — “${escapeHtmlForEmail(inquiry.messagePreview)}”`,
  );

  const packRows = digest.marketingPacksDue.map(
    (pack) =>
      `<strong>${escapeHtmlForEmail(pack.businessName)}</strong> — ${escapeHtmlForEmail(pack.yearMonth)} pack not generated`,
  );

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

  const payoutRows = digest.commercePayoutsOwed.map(
    (row) =>
      `<strong>${escapeHtmlForEmail(row.businessName)}</strong> — $${row.totalUsd.toFixed(2)} owed (${row.orderCount} order${row.orderCount === 1 ? "" : "s"})`,
  );
  const payoutTitle =
    digest.commercePayoutsOwedCount > 0
      ? `Commerce payouts owed ($${digest.commercePayoutsOwedTotalUsd.toFixed(2)} · ${digest.commercePayoutsOwedCount} client${digest.commercePayoutsOwedCount === 1 ? "" : "s"})`
      : "Commerce payouts owed (0)";

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

  return `
    <h2 style="margin:0 0 4px 0;color:#09090b;">Today's priorities</h2>
    <p style="margin:0 0 20px 0;color:#71717a;font-size:13px;">
      <a href="${escapeHtmlForEmail(baseUrl)}/dashboard/leads" style="color:#2563eb;">Open the dashboard</a> to act on any of these.
    </p>
    ${section(`Work next (${digest.workNext.length})`, workNextRows, "No actionable leads scored right now.")}
    ${section(`Follow-ups due (${digest.followUpsDueCount})`, followUpRows, "No follow-up emails due.")}
    ${section(`Abandoned checkouts (${digest.checkoutRecoveriesDueCount})`, recoveryRows, "No recovery nudges due.")}
    ${section(`Abandoned Buy now (${digest.commerceCheckoutRecoveriesDueCount})`, commerceRecoveryRows, "No Commerce Buy now carts due for recovery.")}
    ${section(`Unreplied inquiries (${digest.unrepliedInquiriesCount})`, inquiryRows, "Inbox clear.")}
    ${section(`Marketing packs due (${digest.marketingPacksDueCount})`, packRows, "All Growth/Complete packs generated this month.")}
    ${section(`Starter → MRR upsell (${digest.starterUpsellCandidatesCount})`, upsellRows, "No Starter-only paid leads ready to upsell.")}
    ${section(`Commerce catalogs missing (${digest.commerceCatalogsMissingCount})`, commerceRows, "All paid Commerce add-on leads have a catalog.")}
    ${section(`Commerce Sync to Stripe due (${digest.commerceCatalogsUnsyncedCount})`, commerceUnsyncedRows, "All saved Commerce catalogs are synced for Buy now.")}
    ${section(`Complete voice packs due (${digest.clientVoicePacksDueCount})`, voicePackRows, "All Complete voice FAQ packs generated.")}
    ${section(payoutTitle, payoutRows, "No pass-through Buy now money owed to clients.")}
    ${section(`Production handoffs open (${digest.openHandoffsCount})`, handoffRows, "No paid sites awaiting DNS / Mark live.")}
    ${section(`Paid, not yet live (${digest.paidNotLiveCount})`, paidNotLiveRows, "No leads stuck at stage=Paid with nothing else due.")}
    ${section(`Leads missing email (${digest.leadsMissingEmailCount})`, missingEmailRows, "Every email-critical lead has a usable address.")}
    ${coldFootnote(digest, false)}
    ${snoozedFootnote(digest)}
  `;
}
