/**
 * Persisted monthly marketing pack for a paid Growth/Complete lead.
 */

import type { MarketingContentVariant, MarketingPackageTier } from "./types";

export type MarketingPackGeneratorKind = "stub" | "anthropic";

export interface MarketingPack {
  id: string;
  leadSlug: string;
  /** UTC calendar month YYYY-MM */
  yearMonth: string;
  variants: MarketingContentVariant[];
  generatedAt: string;
  generator: MarketingPackGeneratorKind;
  packageTier?: MarketingPackageTier;
  /**
   * Set once sendMarketingPackToClientEmail resolved { success: true } for
   * this pack — regenerating the pack (upsertMarketingPack) always clears it,
   * since a new pack's content has not yet been sent. Distinct from
   * generatedAt: closes the "generated but never emailed" gap the same way
   * commerceOrders.clientReceiptEmailSentAt does for Commerce Buy now (see
   * marketing-voice-pack-client-send-visibility).
   */
  sentToClientAt?: string;
}

export interface UpsertMarketingPackInput {
  leadSlug: string;
  yearMonth: string;
  variants: MarketingContentVariant[];
  generatedAt: string;
  generator: MarketingPackGeneratorKind;
  packageTier?: MarketingPackageTier;
}
