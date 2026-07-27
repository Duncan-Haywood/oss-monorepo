/**
 * Lead domain model — shared by preview rendering and the operator dashboard.
 * Persisted via Convex when configured, otherwise SQLite fallback (see /docs/process).
 */

export type BusinessCategory =
  | "restaurant"
  | "salon"
  | "trades"
  | "retail"
  | "health"
  | "automotive"
  | "cleaning"
  | "fitness"
  | "legal"
  | "generic";

export type LeadPipelineStage =
  | "discovered"
  | "site_built"
  | "outreach_sent"
  | "discovery_call"
  | "paid"
  | "live"
  /** Terminal — operator stopped pursuing (cold close / not a fit). */
  | "closed";

export interface LeadHours {
  weekday: string;
  weekend: string;
}

/** How far through the 3-email outreach sequence a lead has progressed (0 = none). */
export type OutreachStep = 0 | 1 | 2 | 3;

export interface Lead {
  slug: string;
  businessName: string;
  category: BusinessCategory;
  city: string;
  state: string;
  /** Optional street address for Maps embed pins (city/state used when absent). */
  address?: string;
  tagline: string;
  description: string;
  phone: string;
  email?: string;
  services: string[];
  hours: LeadHours;
  stage: LeadPipelineStage;
  /** Recommended bundle from product recommendation logic — see /docs/product-bundles. */
  recommendedTier: "starter" | "growth" | "complete";
  /**
   * Provenance for compliance ("Document data source per lead" — /docs/compliance).
   * Examples: demo_catalog | manual_entry | csv_import | places_api
   */
  dataSource?: string;
  /**
   * Last outreach email sent in the 1→2→3 sequence (Email 1 on stage=outreach_sent).
   * Undefined/0 means no outreach recorded yet.
   */
  outreachStep?: OutreachStep;
  /** ISO timestamp of the most recent outreach send (Email 1/2/3). */
  lastOutreachAt?: string;
  /**
   * ISO timestamp of the most recent /preview/[slug] open attributed to outreach
   * (or an in-pipeline visit). Used to prioritize follow-ups who engaged.
   */
  lastPreviewOpenAt?: string;
  /**
   * Free-text operator notes (call outcomes, objections, next steps).
   * Not shown on client preview sites — dashboard only. Soft-capped at
   * MAX_OPERATOR_NOTES_LENGTH in src/lib/leads/notes.ts.
   */
  notes?: string;
  /**
   * ISO timestamp until which this lead is parked off Work next.
   * Score history is preserved; rankLeadsForOutreach treats the lead as
   * non-actionable while snoozedUntil > now. See src/lib/leads/snooze.ts.
   */
  snoozedUntil?: string;
  /**
   * Stripe Connect Express account id for this local business, once created
   * by the operator via createStripeConnectAccountAction (dormant behind
   * ALLOW_STRIPE_CONNECT_ONBOARDING — see stripe-connect-gate.ts). Account
   * creation/status-checking only; no payout/transfer wiring reads this yet
   * (commerce-payouts-stripe-connect stays operator/legal-gated for that).
   */
  stripeConnectAccountId?: string;
  /**
   * ISO timestamp when this lead's Connect account was first created/found
   * (set once, at the same time as stripeConnectAccountId — never updated
   * again). Anchors the "how long has onboarding been incomplete" staleness
   * signal (oldestConnectOnboardingIncompleteAgeHours) the same way an
   * order's own createdAt anchors every other due-queue's oldest-age card —
   * Lead itself has no general createdAt/updatedAt field to reuse. See
   * stripe-connect-onboarding-pipeline-health-visibility.
   */
  stripeConnectAccountCreatedAt?: string;
  /**
   * Live Stripe Connect Express onboarding status, cached from the operator's
   * most recent "Check status" click (checkStripeConnectAccountStatusAction) —
   * undefined means never checked. This is a DISPLAY CACHE, not the source of
   * truth (Stripe's own account object is); a stale/never-refreshed value
   * only means the pipeline-health/digest visibility can lag behind an
   * operator completing onboarding out-of-band, never that money moves on a
   * wrong value (this scaffold moves no money at all yet). See
   * stripe-connect-onboarding-pipeline-health-visibility.
   */
  stripeConnectChargesEnabled?: boolean;
  /** See stripeConnectChargesEnabled — same cache-freshness caveat. */
  stripeConnectPayoutsEnabled?: boolean;
  /** See stripeConnectChargesEnabled — same cache-freshness caveat. */
  stripeConnectDetailsSubmitted?: boolean;
  /** ISO timestamp of the most recent successful status check; undefined means never checked. */
  stripeConnectStatusCheckedAt?: string;
  /**
   * Buffer profile ids the operator has chosen to auto-post this lead's
   * generated marketing pack content to, via saveLeadBufferProfilesAction
   * (dormant behind ALLOW_MARKETING_SCHEDULING — see
   * src/lib/marketing/buffer-gate.ts). Empty/absent means Buffer auto-posting
   * is not set up for this lead yet — operator still copy-pastes manually.
   */
  bufferProfileIds?: string[];
  /**
   * Idempotency markers (bufferPostedVariantKey, src/lib/marketing/buffer.ts)
   * for pack variants scheduleMarketingPackToBufferAction has already queued
   * to Buffer this pack — prevents a repeated click within the same month
   * from re-posting the same content to the same profile
   * (buffer-schedule-duplicate-post-guard). Scoped to the pack's own
   * generatedAt, so a mid-month regenerate naturally makes every prior key
   * stale rather than permanently blocking the new content.
   */
  bufferPostedVariantKeys?: string[];
  /**
   * Monotonic count of Starter→Growth/Complete upsell emails sent to this
   * lead via sendStarterUpsellAction — a concurrency guard, not a
   * one-shot "already sent" gate: unlike marketing/voice pack sent-markers,
   * a Starter upsell nudge has no monthly regenerate step to reset
   * eligibility, and an operator may legitimately re-nudge a still
   * Starter-only lead weeks later. recordStarterUpsellSent only rejects a
   * write whose expected count no longer matches the current row (an exact
   * concurrent duplicate — a second tab or a double-click before the
   * button's isPending-disabled state applies), never a later, deliberate
   * resend. Absent/0 means never sent. See starter-upsell-send-race-guard.
   */
  starterUpsellSentCount?: number;
  /** ISO timestamp of the most recent Starter upsell send. */
  lastStarterUpsellSentAt?: string;
}

/**
 * Stable app-owned id for a new SQLite-fallback lead row (see leads-sqlite-id-collision-guard).
 * The prior generator was `lead_${Date.now()}` — millisecond-only, no random
 * component, unlike newCommerceOrderId/newCommerceSkuId/newClientInquiryId.
 * `leads.id` is a SQLite PRIMARY KEY, so two leads created in the same
 * millisecond (a CSV bulk-import loop inserting many fresh rows synchronously,
 * or two near-simultaneous Stripe webhook payment-stub creates) throw a
 * constraint-violation error on INSERT rather than silently colliding —
 * still a real outage on the money/CRM create paths, not just a data bug.
 */
export function newLeadId(): string {
  return `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
