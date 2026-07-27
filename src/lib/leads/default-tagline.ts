/**
 * Shared per-category tagline fallback, used whenever a lead has no explicit
 * tagline of its own. csv-import.ts originally defined this (as a private
 * `defaultTagline` function) with the correct 4-way split; sqlite-row-mapping.ts's
 * mapSqliteRowToLead and payment-stub.ts's buildPaymentStubLeadFields each grew
 * their own copy that collapsed "restaurant" and "generic" into one shared
 * "Local favorites made fresh daily" line — so every category="generic" lead
 * (every organic/no-slug Stripe checkout stub, and any dashboard-added lead
 * left at the default category with a blank tagline) shipped a nonsensical
 * restaurant tagline on its live public /preview/[slug] page. Both call sites
 * now import this one function instead of re-deriving the mapping.
 */

import type { BusinessCategory } from "./types";

export function defaultTagline(category: BusinessCategory): string {
  switch (category) {
    case "salon":
      return "Tailored styling and care";
    case "trades":
      return "Professional services you can count on";
    case "restaurant":
      return "Local favorites made fresh daily";
    case "retail":
      return "Curated goods, picked with care";
    case "health":
      return "Care your patients can count on";
    case "automotive":
      return "Honest repairs, done right the first time";
    case "cleaning":
      return "A spotless space, every visit";
    case "fitness":
      return "Train hard, right in your neighborhood";
    case "legal":
      return "Trusted counsel when it matters most";
    case "generic":
      return "Your neighborhood business, online";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}
