/**
 * Monthly marketing pack — Growth/Complete product promise
 * (8 social/GBP posts + 2 emails/month). See /docs/marketing-automation.
 */

import type { LeadPipelineStage } from "@/lib/leads/types";
import { orderGrantsSoldCapabilityEntitlement } from "@/lib/orders/recurring";
import type { MarketingContentType, MarketingPackageTier } from "./types";

/** Calendar month key in UTC (YYYY-MM) — packs are one per lead per month. */
export function marketingMonthKey(nowMs: number): string {
  if (!Number.isFinite(nowMs)) {
    throw new Error("nowMs must be a finite number");
  }
  const d = new Date(nowMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** Paid tiers that include the AI marketing engine. */
export function isMarketingBundleTier(tier: string): boolean {
  return tier === "growth" || tier === "complete";
}

export function packageTierForOrderTier(tier: string): MarketingPackageTier {
  if (tier === "complete") return "full_marketing";
  if (tier === "growth") return "social_email";
  return "copy_pack";
}

/**
 * 8 social/GBP posts + 2 emails — matches Growth/Complete sold promise.
 * Order is stable so stub/LLM variants stay comparable across regenerations.
 */
export const MONTHLY_MARKETING_PACK_TYPES: readonly MarketingContentType[] = [
  "gbp_post",
  "gbp_post",
  "facebook_caption",
  "facebook_caption",
  "facebook_caption",
  "instagram_caption",
  "instagram_caption",
  "instagram_caption",
  "email_campaign",
  "review_request_email",
] as const;

export function leadStageEligibleForMarketingPack(stage: LeadPipelineStage): boolean {
  return stage === "paid" || stage === "live";
}

const SOCIAL_POST_CONTENT_TYPES: ReadonlySet<MarketingContentType> = new Set([
  "gbp_post",
  "facebook_caption",
  "instagram_caption",
]);
const EMAIL_CONTENT_TYPES: ReadonlySet<MarketingContentType> = new Set([
  "email_campaign",
  "review_request_email",
]);

/**
 * "8 social/GBP posts" — the count of MONTHLY_MARKETING_PACK_TYPES entries
 * that are social/GBP posts rather than emails. Marketing/docs copy
 * (homepage, /docs/product-bundles, /docs/marketing-automation,
 * /docs/business-model, /docs/roadmap, /docs/launch-checklist) hand-typed
 * this number as literal prose for months; derive it here so a future change
 * to the pack composition can't leave that copy silently stale — the same
 * drift class the pricing constants above closed for USD amounts (see
 * homepage-bundle-pricing-single-source-of-truth).
 */
export function monthlyMarketingSocialPostCount(): number {
  return MONTHLY_MARKETING_PACK_TYPES.filter((type) => SOCIAL_POST_CONTENT_TYPES.has(type))
    .length;
}

/** "2 emails" — the email half of the same sold-promise count. */
export function monthlyMarketingEmailCount(): number {
  return MONTHLY_MARKETING_PACK_TYPES.filter((type) => EMAIL_CONTENT_TYPES.has(type)).length;
}

/**
 * Occurrences of a single content type within one monthly pack — backs the
 * per-row counts in /docs/marketing-automation's Content types table so
 * those numbers (2 GBP posts, 3 Facebook captions, etc.) can't drift from
 * the actual generated set either.
 */
export function monthlyMarketingContentTypeCount(type: MarketingContentType): number {
  return MONTHLY_MARKETING_PACK_TYPES.filter((t) => t === type).length;
}

/**
 * Eligible when the lead is paid/live AND has at least one Growth/Complete order
 * that still grants active entitlement (active recurring, never refunded/disputed
 * — see orderGrantsSoldCapabilityEntitlement). Starter + Commerce alone does not
 * unlock the marketing engine (Commerce is checkout add-on).
 */
export function leadEligibleForMarketingPack(
  lead: { stage: LeadPipelineStage },
  orders: ReadonlyArray<{
    tier: string;
    commerceAddon?: boolean;
    recurringCanceledAt?: number | null;
    refundedAt?: string;
    disputedAt?: string;
  }>,
): boolean {
  if (!leadStageEligibleForMarketingPack(lead.stage)) return false;
  return orders.some(
    (o) =>
      isMarketingBundleTier(o.tier) &&
      orderGrantsSoldCapabilityEntitlement({ ...o, commerceAddon: Boolean(o.commerceAddon) }),
  );
}

/**
 * Eligible Growth/Complete lead with no marketing pack row for the given UTC month.
 * Pass yearMonth from marketingMonthKey(nowMs) — never Date.now() inside callers that
 * must stay pure.
 */
const HOUR_MS = 60 * 60 * 1000;

/** UTC epoch ms for the first instant of a "YYYY-MM" month key. */
export function marketingMonthStartMs(yearMonth: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) {
    throw new Error(`marketingMonthStartMs: invalid yearMonth "${yearMonth}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  return Date.UTC(year, month - 1, 1);
}

export function leadNeedsMarketingPackForMonth(
  lead: { slug: string; stage: LeadPipelineStage },
  ordersForLead: ReadonlyArray<{ tier: string; recurringCanceledAt?: number | null }>,
  packsThisMonth: ReadonlyArray<{ leadSlug: string; yearMonth: string }>,
  yearMonth: string,
): boolean {
  if (!leadEligibleForMarketingPack(lead, ordersForLead)) return false;
  return !packsThisMonth.some(
    (pack) => pack.leadSlug === lead.slug && pack.yearMonth === yearMonth,
  );
}

/**
 * Paid/live Growth/Complete leads still missing this month's pack — slug-sorted for
 * stable digest/pipeline lists. Reuses leadEligibleForMarketingPack only.
 */
export function listMarketingPacksDue<
  T extends { slug: string; stage: LeadPipelineStage },
>(
  leads: T[],
  orders: ReadonlyArray<{
    leadSlug: string;
    tier: string;
    recurringCanceledAt?: number | null;
  }>,
  packsThisMonth: ReadonlyArray<{ leadSlug: string; yearMonth: string }>,
  yearMonth: string,
): T[] {
  return leads
    .filter((lead) =>
      leadNeedsMarketingPackForMonth(
        lead,
        orders.filter((o) => o.leadSlug === lead.slug),
        packsThisMonth,
        yearMonth,
      ),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Age in whole hours since the current month's pack first became due for the
 * oldest of `candidates` (as returned by listMarketingPacksDue); null when
 * there are no candidates or none of their qualifying orders parse. "Due
 * since" is the later of the month start and the qualifying order's
 * createdAt — a lead who signed up mid-month isn't shown as having an
 * 800-hour-old debt on day one of the following month, and a long-time
 * subscriber's age resets with the calendar month like the pack itself does
 * (unlike oldestStarterUpsellCandidateAgeHours, whose candidates are
 * evaluated once, not month-keyed). Pass nowMs from the caller — never
 * Date.now() inside list/age helpers.
 *
 * Must gate on orderGrantsSoldCapabilityEntitlement (not a raw
 * recurringCanceledAt check) — see refund-dispute-oldest-age-parity: a lead
 * can carry an older refunded/disputed Growth/Complete order alongside a
 * newer active one, and that refunded order's createdAt must never pull the
 * reported "due since" earlier than the entitlement that actually grants
 * the pack.
 */
export function oldestMarketingPacksDueAgeHours(
  candidates: ReadonlyArray<{ slug: string }>,
  orders: ReadonlyArray<{
    leadSlug: string;
    tier: string;
    commerceAddon?: boolean;
    recurringCanceledAt?: number | null;
    refundedAt?: string;
    disputedAt?: string;
    createdAt?: string;
  }>,
  yearMonth: string,
  nowMs: number,
): number | null {
  const candidateSlugs = new Set(candidates.map((candidate) => candidate.slug));
  const monthStartMs = marketingMonthStartMs(yearMonth);
  let oldestDueSinceMs: number | null = null;
  for (const order of orders) {
    if (!candidateSlugs.has(order.leadSlug)) continue;
    if (!isMarketingBundleTier(order.tier)) continue;
    if (
      !orderGrantsSoldCapabilityEntitlement({
        ...order,
        commerceAddon: Boolean(order.commerceAddon),
      })
    ) {
      continue;
    }
    if (typeof order.createdAt !== "string") continue;
    const createdAtMs = Date.parse(order.createdAt);
    if (Number.isNaN(createdAtMs)) continue;
    const dueSinceMs = Math.max(monthStartMs, createdAtMs);
    if (oldestDueSinceMs === null || dueSinceMs < oldestDueSinceMs) {
      oldestDueSinceMs = dueSinceMs;
    }
  }
  if (oldestDueSinceMs === null) return null;
  if (nowMs < oldestDueSinceMs) return 0;
  return Math.max(0, Math.floor((nowMs - oldestDueSinceMs) / HOUR_MS));
}

/**
 * Prefer Complete over Growth among *active* marketing entitlement rows.
 * Paused/canceled Complete must not outrank an still-active Growth after
 * recurringCanceledAt CRM sync — same predicate as leadEligibleForMarketingPack.
 */
export function bestMarketingOrderTier(
  orders: ReadonlyArray<{
    tier: string;
    commerceAddon?: boolean;
    recurringCanceledAt?: number | null;
    refundedAt?: string;
    disputedAt?: string;
  }>,
): "growth" | "complete" | null {
  let best: "growth" | "complete" | null = null;
  for (const order of orders) {
    if (
      !orderGrantsSoldCapabilityEntitlement({
        ...order,
        commerceAddon: Boolean(order.commerceAddon),
      })
    ) {
      continue;
    }
    if (order.tier === "complete") return "complete";
    if (order.tier === "growth") best = "growth";
  }
  return best;
}

export function contentTypeLabel(contentType: MarketingContentType | string): string {
  switch (contentType) {
    case "gbp_post":
      return "GBP post";
    case "facebook_caption":
      return "Facebook caption";
    case "instagram_caption":
      return "Instagram caption";
    case "email_campaign":
      return "Email campaign";
    case "review_request_email":
      return "Review-request email";
    case "local_seo_meta":
      return "Local SEO meta";
    case "seasonal_promo":
      return "Seasonal promo";
    case "ad_copy":
      return "Ad copy";
    default:
      return String(contentType);
  }
}
