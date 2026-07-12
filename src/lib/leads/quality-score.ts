/**
 * Lead quality / actionability scoring — pure TypeScript so the operator
 * dashboard can sort the highest-probability outreach targets first.
 * See /docs/process (lead-quality-scoring / abandoned-checkout-quality-signal).
 */

import type { CheckoutSessionRecord } from "../checkout/types";
import {
  isAbandonedCheckout,
  isRecoveryDue,
} from "../checkout/abandoned-recovery";
import type { BusinessCategory, Lead, LeadPipelineStage } from "./types";
import { isFollowUpDue, normalizeOutreachStep } from "../email/outreach-followups";
import { isLeadSnoozed } from "./snooze";

/** 0–100; higher = work this lead sooner among active pipeline rows. */
export type LeadQualityScore = number;

export type LeadQualityBand = "hot" | "warm" | "cold" | "blocked" | "fulfillment";

export interface LeadQualityFactor {
  /** Short machine key for tests / analytics. */
  id: string;
  /** Human-readable reason shown on the dashboard. */
  label: string;
  /** Points added (positive) or subtracted (negative). */
  delta: number;
}

export interface LeadQualityResult {
  slug: string;
  score: LeadQualityScore;
  band: LeadQualityBand;
  factors: LeadQualityFactor[];
  /** False for paid/live — still scored, but omitted from the "Work next" queue. */
  actionable: boolean;
}

/**
 * Optional inputs that are not on the Lead row itself. Pass open checkout
 * sessions from listOpenCheckoutSessions() so abandoned carts outrank plain
 * outreach-due leads in Work next.
 */
export interface LeadScoreOptions {
  openCheckoutSessions?: CheckoutSessionRecord[];
}

/** Category → default recommended tier (matches demo catalog / slug inference). */
export const CATEGORY_DEFAULT_TIER: Record<
  BusinessCategory,
  Lead["recommendedTier"]
> = {
  restaurant: "growth",
  salon: "complete",
  trades: "starter",
  generic: "growth",
};

const STAGE_BASE: Record<LeadPipelineStage, number> = {
  discovered: 28,
  site_built: 38,
  outreach_sent: 46,
  discovery_call: 54,
  paid: 22,
  live: 16,
};

const STALE_OUTREACH_MS = 14 * 24 * 60 * 60 * 1000;

function hasText(value: string | undefined | null): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function bandForScore(
  score: LeadQualityScore,
  stage: LeadPipelineStage,
  blocked: boolean,
): LeadQualityBand {
  if (stage === "paid" || stage === "live") return "fulfillment";
  if (blocked) return "blocked";
  if (score >= 80) return "hot";
  if (score >= 60) return "warm";
  return "cold";
}

/**
 * Score a single lead. Pass `nowMs` from the caller (mount snapshot or server)
 * — do not call Date.now() inside render paths that consume this.
 * Pass open checkout sessions via options so abandoned carts boost the score.
 */
export function scoreLead(
  lead: Lead,
  nowMs: number,
  options?: LeadScoreOptions,
): LeadQualityResult {
  const factors: LeadQualityFactor[] = [];
  let score = STAGE_BASE[lead.stage] ?? 40;

  factors.push({
    id: "stage_base",
    label: `Stage: ${lead.stage.replaceAll("_", " ")}`,
    delta: STAGE_BASE[lead.stage] ?? 40,
  });

  const emailOk = hasText(lead.email);
  const phoneOk = hasText(lead.phone);
  const addressOk = hasText(lead.address);

  if (emailOk) {
    score += 16;
    factors.push({ id: "has_email", label: "Has email", delta: 16 });
  } else {
    score -= 30;
    factors.push({
      id: "missing_email",
      label: "Missing email — cannot outreach",
      delta: -30,
    });
  }

  if (phoneOk) {
    score += 5;
    factors.push({ id: "has_phone", label: "Has phone", delta: 5 });
  } else {
    score -= 5;
    factors.push({ id: "missing_phone", label: "Missing phone", delta: -5 });
  }

  if (addressOk) {
    score += 3;
    factors.push({
      id: "has_address",
      label: "Has street address (Maps / SEO)",
      delta: 3,
    });
  } else {
    score -= 2;
    factors.push({
      id: "missing_address",
      label: "Missing street address",
      delta: -2,
    });
  }

  const expectedTier = CATEGORY_DEFAULT_TIER[lead.category] ?? "growth";
  if (lead.recommendedTier === expectedTier) {
    score += 5;
    factors.push({
      id: "tier_fit",
      label: `Tier fits ${lead.category} default (${expectedTier})`,
      delta: 5,
    });
  } else {
    score -= 4;
    factors.push({
      id: "tier_mismatch",
      label: `Tier ${lead.recommendedTier} ≠ ${lead.category} default (${expectedTier})`,
      delta: -4,
    });
  }

  const source = lead.dataSource ?? "";
  if (source === "demo_catalog" || source === "slug_inference") {
    score -= 12;
    factors.push({
      id: "demo_source",
      label: "Demo / inferred lead — deprioritize vs real contacts",
      delta: -12,
    });
  } else if (source === "csv_import" || source === "manual_entry") {
    score += 4;
    factors.push({
      id: "owned_source",
      label: "Operator-owned contact source",
      delta: 4,
    });
  }

  const step = normalizeOutreachStep(lead.outreachStep);
  if (
    (lead.stage === "outreach_sent" || lead.stage === "discovery_call") &&
    emailOk
  ) {
    if (isFollowUpDue(lead, nowMs)) {
      score += 12;
      factors.push({
        id: "follow_up_due",
        label: "Follow-up due now",
        delta: 12,
      });
    } else if (lead.lastOutreachAt) {
      const last = Date.parse(lead.lastOutreachAt);
      if (!Number.isNaN(last) && nowMs - last >= STALE_OUTREACH_MS && step >= 3) {
        score -= 8;
        factors.push({
          id: "stale_exhausted",
          label: "Outreach sequence complete and stale (14d+)",
          delta: -8,
        });
      }
    }
  }

  if (lead.stage === "site_built" && emailOk && step === 0) {
    score += 8;
    factors.push({
      id: "ready_email_1",
      label: "Ready for Email 1 (site built + email)",
      delta: 8,
    });
  }

  if (lead.stage === "discovered" && emailOk) {
    score += 3;
    factors.push({
      id: "discovered_with_email",
      label: "Discovered with email — queue site build",
      delta: 3,
    });
  }

  if (
    lead.lastPreviewOpenAt &&
    (lead.stage === "outreach_sent" || lead.stage === "discovery_call")
  ) {
    const opened = Date.parse(lead.lastPreviewOpenAt);
    if (!Number.isNaN(opened)) {
      score += 10;
      factors.push({
        id: "preview_opened",
        label: "Opened preview (engaged)",
        delta: 10,
      });
      if (
        lead.lastOutreachAt &&
        !Number.isNaN(Date.parse(lead.lastOutreachAt)) &&
        opened >= Date.parse(lead.lastOutreachAt)
      ) {
        score += 4;
        factors.push({
          id: "opened_after_send",
          label: "Opened after last outreach send",
          delta: 4,
        });
      }
    }
  } else if (
    (lead.stage === "outreach_sent" || lead.stage === "discovery_call") &&
    emailOk &&
    step >= 1 &&
    !lead.lastPreviewOpenAt
  ) {
    score -= 5;
    factors.push({
      id: "never_opened",
      label: "No preview open recorded yet",
      delta: -5,
    });
  }

  // Abandoned checkout is hotter than a preview open: the prospect already
  // chose a tier and hit Stripe Checkout. Boost unpaid pipeline stages only
  // (paid/live keep fulfillment banding without Work-next noise).
  if (lead.stage !== "paid" && lead.stage !== "live") {
    const abandonedForLead = (options?.openCheckoutSessions ?? []).filter(
      (session) =>
        session.leadSlug === lead.slug && isAbandonedCheckout(session, nowMs),
    );
    if (abandonedForLead.length > 0) {
      score += 18;
      factors.push({
        id: "abandoned_checkout",
        label: "Abandoned checkout — highest purchase intent",
        delta: 18,
      });
      if (abandonedForLead.some((session) => isRecoveryDue(session, nowMs))) {
        score += 6;
        factors.push({
          id: "checkout_recovery_due",
          label: "Checkout recovery nudge due",
          delta: 6,
        });
      }
    }
  }

  const blocked = !emailOk && lead.stage !== "paid" && lead.stage !== "live";
  const snoozed = isLeadSnoozed(lead.snoozedUntil, nowMs);
  // Snooze parks the lead off Work next without wiping score history — still
  // scored (and visible in the table) but not actionable until the timer elapses.
  if (snoozed) {
    factors.push({
      id: "snoozed",
      label: "Snoozed — parked off Work next",
      delta: 0,
    });
  }
  const actionable =
    lead.stage !== "paid" && lead.stage !== "live" && !snoozed;

  // Clamp after summing absolute stage base already in score — stage_base was
  // both the starting value AND listed as a factor; factors[0].delta equals start.
  const clamped = Math.max(0, Math.min(100, Math.round(score)));

  return {
    slug: lead.slug,
    score: clamped,
    band: bandForScore(clamped, lead.stage, blocked),
    factors,
    actionable,
  };
}

export function scoreLeads(
  leads: Lead[],
  nowMs: number,
  options?: LeadScoreOptions,
): LeadQualityResult[] {
  return leads.map((lead) => scoreLead(lead, nowMs, options));
}

/** Actionable leads sorted highest score first (operator "Work next" queue). */
export function rankLeadsForOutreach(
  leads: Lead[],
  nowMs: number,
  limit = 8,
  options?: LeadScoreOptions,
): LeadQualityResult[] {
  return scoreLeads(leads, nowMs, options)
    .filter((r) => r.actionable)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}

export function qualityBandLabel(band: LeadQualityBand): string {
  switch (band) {
    case "hot":
      return "Hot";
    case "warm":
      return "Warm";
    case "cold":
      return "Cold";
    case "blocked":
      return "Blocked";
    case "fulfillment":
      return "Fulfillment";
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

export function qualityBandClass(band: LeadQualityBand): string {
  switch (band) {
    case "hot":
      return "bg-rose-50 text-rose-800 border-rose-200";
    case "warm":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "cold":
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
    case "blocked":
      return "bg-orange-50 text-orange-800 border-orange-200";
    case "fulfillment":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}
