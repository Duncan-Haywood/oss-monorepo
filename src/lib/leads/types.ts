/**
 * Lead domain model — shared by preview rendering and the operator dashboard.
 * Persisted via Convex when configured, otherwise SQLite fallback (see /docs/process).
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
}
