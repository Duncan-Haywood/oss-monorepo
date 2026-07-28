/**
 * Seasonal promo + ad copy — fulfills the Complete tier's sold "Full
 * marketing — seasonal promos, A/B variants" bullet (src/lib/pricing/bundles.ts).
 * Ad-hoc, non-persisted generation (see /docs/marketing-automation): unlike
 * the monthly pack, there is no fixed monthly cadence or DB row — the
 * operator generates on demand from the dashboard and copies the result to
 * post/paste themselves. Growth-tier leads are not eligible; this is
 * specifically the feature that differentiates Complete from Growth.
 */

import type { Lead, LeadPipelineStage } from "@/lib/leads/types";
import { softCapLeadField } from "@/lib/leads/create-fields";
import { businessContextFromLead } from "./build-request";
import { MAX_CAMPAIGN_CONTEXT_LENGTH } from "./generate-limits";
import {
  bestMarketingOrderTier,
  leadStageEligibleForMarketingPack,
} from "./monthly-pack";
import type { GenerateMarketingRequest, MarketingContentType } from "./types";

/** Two seasonal-promo A/B variants plus one ad-copy piece per generation. */
export const SEASONAL_PROMO_CONTENT_TYPES: readonly MarketingContentType[] = [
  "seasonal_promo",
  "seasonal_promo",
  "ad_copy",
];

/**
 * Complete-tier only (not Growth) — this is the specific bullet that
 * differentiates Complete's "Full marketing" from Growth's fixed monthly
 * pack. Reuses bestMarketingOrderTier's entitlement check (active recurring,
 * never refunded/disputed) rather than a raw tier string compare.
 */
export function leadEligibleForSeasonalPromo(
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
  return bestMarketingOrderTier(orders) === "complete";
}

/**
 * Never infer "season" from month alone (winter in July is wrong for half
 * the world's businesses) — anchor the default to the concrete current
 * month instead, in UTC so behavior doesn't depend on the runtime's
 * timezone.
 */
export function defaultSeasonalPromoOccasion(nowMs: number): string {
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(nowMs));
  return `${monthName} promotion`;
}

/** Soft-caps and falls back to defaultSeasonalPromoOccasion when blank. */
export function resolveSeasonalPromoOccasion(
  occasion: string | undefined,
  nowMs: number,
): string {
  const trimmed = occasion?.trim();
  if (!trimmed) return defaultSeasonalPromoOccasion(nowMs);
  return softCapLeadField(trimmed, MAX_CAMPAIGN_CONTEXT_LENGTH);
}

export function seasonalPromoRequestForLead(
  lead: Lead,
  occasion: string | undefined,
  nowMs: number,
): GenerateMarketingRequest {
  return {
    leadId: lead.slug,
    contentTypes: [...SEASONAL_PROMO_CONTENT_TYPES],
    automationLevel: "generate_only",
    approvalMode: "optional",
    business: {
      ...businessContextFromLead(lead),
      campaignContext: resolveSeasonalPromoOccasion(occasion, nowMs),
    },
  };
}
