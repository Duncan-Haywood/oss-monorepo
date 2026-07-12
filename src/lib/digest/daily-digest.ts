/**
 * Operator daily digest — one email summarizing everything urgent so a
 * single-operator business doesn't have to open /dashboard/leads to know
 * what needs attention today. See /docs/process (operator-daily-digest-email).
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
import { isUnrepliedInquiryStatus } from "../metrics/pipeline-health";

const WORK_NEXT_LIMIT = 5;
const FOLLOW_UPS_LIMIT = 5;
const RECOVERIES_LIMIT = 5;
const INQUIRIES_LIMIT = 5;
const MESSAGE_PREVIEW_CHARS = 140;

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

export interface DailyDigest {
  generatedAtMs: number;
  workNext: DigestWorkNextLead[];
  followUpsDue: DigestFollowUpLead[];
  checkoutRecoveriesDue: DigestCheckoutRecovery[];
  unrepliedInquiries: DigestUnrepliedInquiry[];
  coldLeadCount: number;
  /** True when none of the above sections have anything for the operator to act on. */
  isEmpty: boolean;
}

export interface BuildDailyDigestInput {
  leads: Lead[];
  inquiries: ClientInquiry[];
  openCheckoutSessions: CheckoutSessionRecord[];
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
  const { leads, inquiries, openCheckoutSessions, nowMs } = input;
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

  const coldLeadCount = listColdLeads(leads, nowMs).length;

  const isEmpty =
    workNext.length === 0 &&
    followUpsDue.length === 0 &&
    checkoutRecoveriesDue.length === 0 &&
    unrepliedInquiries.length === 0;

  return {
    generatedAtMs: nowMs,
    workNext,
    followUpsDue,
    checkoutRecoveriesDue,
    unrepliedInquiries,
    coldLeadCount,
    isEmpty,
  };
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

/** Renders the digest as email-safe inline-styled HTML. Pure — no fetch/DOM. */
export function renderDailyDigestHtml(digest: DailyDigest, baseUrl: string): string {
  if (digest.isEmpty) {
    return `
      <h2 style="margin:0 0 16px 0;color:#09090b;">Nothing urgent today</h2>
      <p style="margin:0;color:#3f3f46;">Work next, follow-ups, checkout recoveries, and the inbox are all clear.</p>
      ${digest.coldLeadCount > 0 ? `<p style="margin:16px 0 0 0;color:#71717a;font-size:13px;">${digest.coldLeadCount} lead${digest.coldLeadCount === 1 ? "" : "s"} went cold after Email 3 — see /dashboard/leads to re-engage or close them out.</p>` : ""}
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

  return `
    <h2 style="margin:0 0 4px 0;color:#09090b;">Today's priorities</h2>
    <p style="margin:0 0 20px 0;color:#71717a;font-size:13px;">
      <a href="${baseUrl}/dashboard/leads" style="color:#2563eb;">Open the dashboard</a> to act on any of these.
    </p>
    ${section(`Work next (${digest.workNext.length})`, workNextRows, "No actionable leads scored right now.")}
    ${section(`Follow-ups due (${digest.followUpsDue.length})`, followUpRows, "No follow-up emails due.")}
    ${section(`Abandoned checkouts (${digest.checkoutRecoveriesDue.length})`, recoveryRows, "No recovery nudges due.")}
    ${section(`Unreplied inquiries (${digest.unrepliedInquiries.length})`, inquiryRows, "Inbox clear.")}
    ${digest.coldLeadCount > 0 ? `<p style="margin:16px 0 0 0;color:#71717a;font-size:13px;">${digest.coldLeadCount} lead${digest.coldLeadCount === 1 ? "" : "s"} also went cold after Email 3 — not actionable above, but worth a manual look.</p>` : ""}
  `;
}
