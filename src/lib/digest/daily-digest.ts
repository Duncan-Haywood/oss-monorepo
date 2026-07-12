/**
 * Operator daily digest — one email summarizing everything urgent so a
 * single-operator business doesn't have to open /dashboard/leads to know
 * what needs attention today. See /docs/process (operator-daily-digest-email
 * + marketing-packs-due-pipeline-metric + starter-upsell-candidates-in-digest
 * + commerce-catalogs-missing-visibility
 * + client-voice-packs-missing-visibility).
 *
 * Pure aggregation over already-loaded data, same shape as pipeline-health.ts
 * and quality-score.ts: pass `nowMs` from the caller, never Date.now() here.
 */

import type { ClientInquiry } from "../inquiries/types";
import type { CheckoutSessionRecord } from "../checkout/types";
import type { Lead } from "../leads/types";
import { rankLeadsForOutreach, type LeadQualityBand } from "../leads/quality-score";
import { listFollowUpsDue, listColdLeads } from "../email/outreach-followups";
import { listAbandonedCheckoutsDue } from "../checkout/abandoned-recovery";
import { isLeadSnoozed } from "../leads/snooze";
import { isUnrepliedInquiryStatus } from "../metrics/pipeline-health";
import {
  listMarketingPacksDue,
  marketingMonthKey,
} from "../marketing/monthly-pack";
import {
  listStarterUpsellCandidates,
  resolveUpsellTargetTier,
  type UpsellTargetTier,
} from "../billing/starter-upsell";
import { listCommerceCatalogsMissing } from "../commerce/catalog";
import { listClientVoicePacksDue } from "../voice/faq-pack";

const WORK_NEXT_LIMIT = 5;
const FOLLOW_UPS_LIMIT = 5;
const RECOVERIES_LIMIT = 5;
const INQUIRIES_LIMIT = 5;
const MARKETING_PACKS_LIMIT = 5;
const UPSELL_LIMIT = 5;
const COMMERCE_CATALOGS_LIMIT = 5;
const CLIENT_VOICE_PACKS_LIMIT = 5;
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

export interface DigestClientVoicePackDue {
  slug: string;
  businessName: string;
}

export interface DailyDigest {
  generatedAtMs: number;
  workNext: DigestWorkNextLead[];
  followUpsDue: DigestFollowUpLead[];
  checkoutRecoveriesDue: DigestCheckoutRecovery[];
  unrepliedInquiries: DigestUnrepliedInquiry[];
  marketingPacksDue: DigestMarketingPackDue[];
  starterUpsellCandidates: DigestStarterUpsellLead[];
  commerceCatalogsMissing: DigestCommerceCatalogMissing[];
  clientVoicePacksDue: DigestClientVoicePackDue[];
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
  inquiries: ClientInquiry[];
  openCheckoutSessions: CheckoutSessionRecord[];
  orders?: Array<{ leadSlug: string; tier: string; commerceAddon: boolean }>;
  marketingPacksThisMonth?: ReadonlyArray<{ leadSlug: string; yearMonth: string }>;
  commerceCatalogs?: ReadonlyArray<{ leadSlug: string }>;
  clientVoicePacks?: ReadonlyArray<{ leadSlug: string }>;
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

  const followUpsDue: DigestFollowUpLead[] = listFollowUpsDue(leads, nowMs)
    .slice(0, FOLLOW_UPS_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
      outreachStep: lead.outreachStep ?? 0,
    }));

  const checkoutRecoveriesDue: DigestCheckoutRecovery[] = listAbandonedCheckoutsDue(
    openCheckoutSessions,
    nowMs,
  )
    .slice(0, RECOVERIES_LIMIT)
    .map((session) => ({
      stripeSessionId: session.stripeSessionId,
      slug: session.leadSlug,
      businessName: leadsBySlug.get(session.leadSlug)?.businessName ?? session.leadSlug,
      tier: session.tier,
    }));

  const unrepliedInquiries: DigestUnrepliedInquiry[] = inquiries
    .filter((inquiry) => isUnrepliedInquiryStatus(inquiry.status))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, INQUIRIES_LIMIT)
    .map((inquiry) => ({
      id: inquiry.id,
      leadSlug: inquiry.leadSlug,
      businessName: inquiry.businessName,
      messagePreview: truncateMessage(inquiry.message),
    }));

  const yearMonth = marketingMonthKey(nowMs);
  const marketingPacksDue: DigestMarketingPackDue[] = listMarketingPacksDue(
    leads,
    orders,
    marketingPacksThisMonth,
    yearMonth,
  )
    .slice(0, MARKETING_PACKS_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
      yearMonth,
    }));

  const starterUpsellCandidates: DigestStarterUpsellLead[] = listStarterUpsellCandidates(
    leads,
    orders,
  )
    .slice(0, UPSELL_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
      targetTier: resolveUpsellTargetTier(lead.recommendedTier),
    }));

  const commerceCatalogsMissing: DigestCommerceCatalogMissing[] =
    listCommerceCatalogsMissing(leads, orders, commerceCatalogs)
      .slice(0, COMMERCE_CATALOGS_LIMIT)
      .map((lead) => ({
        slug: lead.slug,
        businessName: lead.businessName,
      }));

  const clientVoicePacksDue: DigestClientVoicePackDue[] = listClientVoicePacksDue(
    leads,
    orders,
    clientVoicePacks,
  )
    .slice(0, CLIENT_VOICE_PACKS_LIMIT)
    .map((lead) => ({
      slug: lead.slug,
      businessName: lead.businessName,
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
    unrepliedInquiries.length === 0 &&
    marketingPacksDue.length === 0 &&
    starterUpsellCandidates.length === 0 &&
    commerceCatalogsMissing.length === 0 &&
    clientVoicePacksDue.length === 0;

  return {
    generatedAtMs: nowMs,
    workNext,
    followUpsDue,
    checkoutRecoveriesDue,
    unrepliedInquiries,
    marketingPacksDue,
    starterUpsellCandidates,
    commerceCatalogsMissing,
    clientVoicePacksDue,
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
      <p style="margin:0;color:#3f3f46;">Work next, follow-ups, checkout recoveries, inbox, marketing packs, Starter upsells, Commerce catalogs, and Complete voice packs are all clear.</p>
      ${coldFootnote(digest, true)}
      ${snoozedFootnote(digest)}
    `;
  }

  const workNextRows = digest.workNext.map(
    (lead) =>
      `<strong>${escapeHtml(lead.businessName)}</strong> — ${lead.score}/100 (${lead.band})${
        lead.topFactorLabel ? ` · ${escapeHtml(lead.topFactorLabel)}` : ""
      }`,
  );

  const followUpRows = digest.followUpsDue.map(
    (lead) => `<strong>${escapeHtml(lead.businessName)}</strong> — Email ${lead.outreachStep + 1} due`,
  );

  const recoveryRows = digest.checkoutRecoveriesDue.map(
    (recovery) =>
      `<strong>${escapeHtml(recovery.businessName)}</strong> — abandoned ${escapeHtml(recovery.tier)} checkout`,
  );

  const inquiryRows = digest.unrepliedInquiries.map(
    (inquiry) =>
      `<strong>${escapeHtml(inquiry.businessName)}</strong> — “${escapeHtml(inquiry.messagePreview)}”`,
  );

  const packRows = digest.marketingPacksDue.map(
    (pack) =>
      `<strong>${escapeHtml(pack.businessName)}</strong> — ${escapeHtml(pack.yearMonth)} pack not generated`,
  );

  const upsellRows = digest.starterUpsellCandidates.map(
    (lead) =>
      `<strong>${escapeHtml(lead.businessName)}</strong> — Starter paid, suggest ${escapeHtml(lead.targetTier)} upsell`,
  );

  const commerceRows = digest.commerceCatalogsMissing.map(
    (lead) =>
      `<strong>${escapeHtml(lead.businessName)}</strong> — Commerce catalog not created`,
  );

  const voicePackRows = digest.clientVoicePacksDue.map(
    (lead) =>
      `<strong>${escapeHtml(lead.businessName)}</strong> — Complete voice FAQ pack not generated`,
  );

  return `
    <h2 style="margin:0 0 4px 0;color:#09090b;">Today's priorities</h2>
    <p style="margin:0 0 20px 0;color:#71717a;font-size:13px;">
      <a href="${baseUrl}/dashboard/leads" style="color:#2563eb;">Open the dashboard</a> to act on any of these.
    </p>
    ${section(`Work next (${digest.workNext.length})`, workNextRows, "No actionable leads scored right now.")}
    ${section(`Follow-ups due (${digest.followUpsDue.length})`, followUpRows, "No follow-up emails due.")}
    ${section(`Abandoned checkouts (${digest.checkoutRecoveriesDue.length})`, recoveryRows, "No recovery nudges due.")}
    ${section(`Unreplied inquiries (${digest.unrepliedInquiries.length})`, inquiryRows, "Inbox clear.")}
    ${section(`Marketing packs due (${digest.marketingPacksDue.length})`, packRows, "All Growth/Complete packs generated this month.")}
    ${section(`Starter → MRR upsell (${digest.starterUpsellCandidates.length})`, upsellRows, "No Starter-only paid leads ready to upsell.")}
    ${section(`Commerce catalogs missing (${digest.commerceCatalogsMissing.length})`, commerceRows, "All paid Commerce add-on leads have a catalog.")}
    ${section(`Complete voice packs due (${digest.clientVoicePacksDue.length})`, voicePackRows, "All Complete voice FAQ packs generated.")}
    ${coldFootnote(digest, false)}
    ${snoozedFootnote(digest)}
  `;
}
