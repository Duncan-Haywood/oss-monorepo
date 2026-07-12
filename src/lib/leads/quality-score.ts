/**
 * Lead quality scoring — pure TypeScript so operators work the highest-
 * probability rows first. No DB writes; score from fields already on Lead.
 * See /docs/process (lead-quality-scoring).
 */

import type { BusinessCategory, Lead, LeadPipelineStage } from "./types";
import { isFollowUpDue, normalizeOutreachStep } from "../email/outreach-followups";

export type LeadScoreBand = "hot" | "warm" | "cold" | "parked";

export interface LeadScoreFactor {
  /** Short machine-ish id for tests / analytics. */
  id: string;
  /** Human label for dashboard tooltips. */
  label: string;
  /** Points added (may be negative). */
  delta: number;
}

export interface LeadQualityScore {
  slug: string;
  /** Clamped 0–100. Higher = work this lead sooner. */
  score: number;
  band: LeadScoreBand;
  factors: LeadScoreFactor[];
  /** False for paid/live — still scored, but sort them to the bottom by default. */
  actionable: boolean;
}

const BASE_SCORE = 40;

const CATEGORY_FIT: Record<BusinessCategory, number> = {
  restaurant: 12,
  salon: 12,
  trades: 12,
  generic: 0,
};

const TIER_UPSIDE: Record<Lead["recommendedTier"], number> = {
  starter: 4,
  growth: 8,
  complete: 12,
};

/** Stages where the operator can still move revenue with outreach/data cleanup. */
const ACTIONABLE_STAGES: ReadonlySet<LeadPipelineStage> = new Set([
  "discovered",
  "site_built",
  "outreach_sent",
  "discovery_call",
]);

function hasText(value: string | undefined | null): boolean {
  return Boolean(value && value.trim().length > 0);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function bandForScore(score: number, actionable: boolean): LeadScoreBand {
  if (!actionable) return "parked";
  if (score >= 75) return "hot";
  if (score >= 50) return "warm";
  return "cold";
}

/**
 * Score one lead. Pass `nowMs` for stale/due checks (same purity rule as
 * follow-up cadence — never call Date.now() inside render without a snapshot).
 */
export function scoreLead(lead: Lead, nowMs: number): LeadQualityScore {
  const factors: LeadScoreFactor[] = [
    { id: "base", label: "Base", delta: BASE_SCORE },
  ];

  const actionable = ACTIONABLE_STAGES.has(lead.stage);

  if (!actionable) {
    factors.push({
      id: "stage_parked",
      label: lead.stage === "live" ? "Already live" : "Already paid — fulfill, don't re-score for outreach",
      delta: -25,
    });
  } else if (lead.stage === "discovery_call") {
    factors.push({
      id: "stage_discovery",
      label: "In discovery — high intent",
      delta: 18,
    });
  } else if (lead.stage === "outreach_sent") {
    factors.push({
      id: "stage_outreach",
      label: "Outreach in flight",
      delta: 10,
    });
  } else if (lead.stage === "site_built") {
    factors.push({
      id: "stage_built",
      label: "Preview ready to send",
      delta: 8,
    });
  } else {
    factors.push({
      id: "stage_discovered",
      label: "Newly discovered",
      delta: 2,
    });
  }

  if (hasText(lead.email)) {
    factors.push({ id: "email_present", label: "Has email", delta: 22 });
  } else {
    factors.push({
      id: "email_missing",
      label: "Missing email — blocks outreach",
      delta: -28,
    });
  }

  if (hasText(lead.phone)) {
    factors.push({ id: "phone_present", label: "Has phone", delta: 8 });
  } else {
    factors.push({ id: "phone_missing", label: "Missing phone", delta: -6 });
  }

  if (hasText(lead.address)) {
    factors.push({
      id: "address_present",
      label: "Has street address (Maps + LocalBusiness SEO)",
      delta: 6,
    });
  } else {
    factors.push({
      id: "address_missing",
      label: "Missing street address",
      delta: -3,
    });
  }

  const categoryDelta = CATEGORY_FIT[lead.category];
  factors.push({
    id: "category_fit",
    label:
      lead.category === "generic"
        ? "Generic category — weaker template fit"
        : `Strong ${lead.category} template fit`,
    delta: categoryDelta,
  });

  const tierDelta = TIER_UPSIDE[lead.recommendedTier];
  factors.push({
    id: "tier_upside",
    label: `Recommended ${lead.recommendedTier} (revenue upside)`,
    delta: tierDelta,
  });

  if (actionable && hasText(lead.email) && isFollowUpDue(lead, nowMs)) {
    factors.push({
      id: "follow_up_due",
      label: "Follow-up due now",
      delta: 16,
    });
  } else if (actionable && normalizeOutreachStep(lead.outreachStep) === 3) {
    factors.push({
      id: "sequence_complete",
      label: "Email sequence complete — lower outreach priority",
      delta: -10,
    });
  } else if (
    actionable &&
    lead.lastOutreachAt &&
    normalizeOutreachStep(lead.outreachStep) >= 1
  ) {
    const last = Date.parse(lead.lastOutreachAt);
    if (!Number.isNaN(last)) {
      const ageDays = (nowMs - last) / (24 * 60 * 60 * 1000);
      if (ageDays >= 10) {
        factors.push({
          id: "stale_outreach",
          label: "Stale outreach (≥10d since last send)",
          delta: 8,
        });
      }
    }
  }

  const raw = factors.reduce((sum, f) => sum + f.delta, 0);
  const score = clampScore(raw);

  return {
    slug: lead.slug,
    score,
    band: bandForScore(score, actionable),
    factors,
    actionable,
  };
}

/** Sort actionable hot leads first, then by score desc; parked (paid/live) last. */
export function compareLeadQuality(a: LeadQualityScore, b: LeadQualityScore): number {
  if (a.actionable !== b.actionable) {
    return a.actionable ? -1 : 1;
  }
  if (b.score !== a.score) return b.score - a.score;
  return a.slug.localeCompare(b.slug);
}

export function scoreLeads(leads: Lead[], nowMs: number): LeadQualityScore[] {
  return leads.map((lead) => scoreLead(lead, nowMs)).sort(compareLeadQuality);
}

/** Default table sort: highest score among actionable leads first. */
export function sortLeadsByQuality(leads: Lead[], nowMs: number): Lead[] {
  const scored = new Map(scoreLeads(leads, nowMs).map((s) => [s.slug, s]));
  return [...leads].sort((a, b) => {
    const sa = scored.get(a.slug);
    const sb = scored.get(b.slug);
    if (!sa || !sb) return 0;
    return compareLeadQuality(sa, sb);
  });
}

export function scoreBandLabel(band: LeadScoreBand): string {
  switch (band) {
    case "hot":
      return "Hot";
    case "warm":
      return "Warm";
    case "cold":
      return "Cold";
    case "parked":
      return "Parked";
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}
