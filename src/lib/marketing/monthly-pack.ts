/**
 * Monthly marketing pack — Growth/Complete product promise
 * (8 social/GBP posts + 2 emails/month). See /docs/marketing-automation.
 */

import type { LeadPipelineStage } from "@/lib/leads/types";
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

/**
 * Eligible when the lead is paid/live AND has at least one Growth/Complete order.
 * Starter + Commerce alone does not unlock the marketing engine (Commerce is checkout add-on).
 */
export function leadEligibleForMarketingPack(
  lead: { stage: LeadPipelineStage },
  orders: ReadonlyArray<{ tier: string; recurringCanceledAt?: number | null }>,
): boolean {
  if (!leadStageEligibleForMarketingPack(lead.stage)) return false;
  return orders.some(
    (o) =>
      isMarketingBundleTier(o.tier) &&
      !(
        typeof o.recurringCanceledAt === "number" &&
        Number.isFinite(o.recurringCanceledAt) &&
        o.recurringCanceledAt > 0
      ),
  );
}

/**
 * Eligible Growth/Complete lead with no marketing pack row for the given UTC month.
 * Pass yearMonth from marketingMonthKey(nowMs) — never Date.now() inside callers that
 * must stay pure.
 */
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

/** Prefer Complete over Growth when both exist (newest-first lists still work). */
export function bestMarketingOrderTier(
  orders: ReadonlyArray<{ tier: string }>,
): "growth" | "complete" | null {
  let best: "growth" | "complete" | null = null;
  for (const order of orders) {
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
