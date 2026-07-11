/**
 * Lead domain model — shared by preview rendering and the operator dashboard.
 * Persistence will move to Convex (see business decision in prompt_process.tsx);
 * until then, demo/catalog data lives in TypeScript modules.
 */

export type BusinessCategory = "restaurant" | "salon" | "trades" | "generic";

export type LeadPipelineStage =
  | "discovered"
  | "site_built"
  | "outreach_sent"
  | "discovery_call"
  | "paid"
  | "live";

export interface LeadHours {
  weekday: string;
  weekend: string;
}

export interface Lead {
  slug: string;
  businessName: string;
  category: BusinessCategory;
  city: string;
  state: string;
  tagline: string;
  description: string;
  phone: string;
  services: string[];
  hours: LeadHours;
  stage: LeadPipelineStage;
  /** Recommended bundle from product recommendation logic — see /docs/product-bundles. */
  recommendedTier: "starter" | "growth" | "complete";
}
