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
}

export interface UpsertMarketingPackInput {
  leadSlug: string;
  yearMonth: string;
  variants: MarketingContentVariant[];
  generatedAt: string;
  generator: MarketingPackGeneratorKind;
  packageTier?: MarketingPackageTier;
}
