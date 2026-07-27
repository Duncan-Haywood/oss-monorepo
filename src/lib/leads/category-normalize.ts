/**
 * Shared fallback-normalization for a lead's `category` / `recommendedTier`
 * when read back from persistence.
 *
 * schema.ts stores both columns as plain strings on Convex (not enum-enforced
 * at the table level — see convex/leads.ts's own comment on `leadReturn`);
 * only the app's own write-path mutations validate against the literal union
 * (convex/leads.ts's categoryValidator/tierValidator, csv-import.ts's
 * parseCategory). A row that bypassed those validators — a legacy row that
 * predates them, or a value hand-edited directly via the Convex dashboard —
 * can still reach a read path carrying an unrecognized string.
 *
 * `category` is not just cosmetically wrong when that happens: it feeds a
 * direct object-keyed lookup with no fallback downstream —
 * getCategoryTheme's CATEGORY_THEMES[category] (src/lib/previews/themes.ts)
 * returns `undefined` for an unrecognized key, and every caller
 * (category-preview.tsx, lead-preview-image.tsx) immediately dereferences a
 * property off the result. An unrecognized category doesn't degrade — it
 * throws, 500ing the public /preview/[slug] page and its OG-image routes for
 * that lead.
 *
 * mapSqliteRowToLead (sqlite-row-mapping.ts) already normalized defensively
 * before this module existed; convex/leads.ts's mapLeadRow passed the raw
 * stored string straight through, so the exact same corrupt row degraded
 * gracefully to the "generic" theme on SQLite but crashed on Convex — a
 * dual-backend parity gap in read-time value safety, not just row ordering.
 * Both backends now share this one normalizer (leads-category-tier-read-normalize-parity).
 */

import type { BusinessCategory, Lead } from "./types";

export const BUSINESS_CATEGORIES: readonly BusinessCategory[] = [
  "restaurant",
  "salon",
  "trades",
  "retail",
  "generic",
];

export const RECOMMENDED_TIERS: readonly Lead["recommendedTier"][] = [
  "starter",
  "growth",
  "complete",
];

/** Unrecognized/legacy values fall back to "generic" — the safe, theme-having default. */
export function normalizeLeadCategory(raw: string): BusinessCategory {
  return (BUSINESS_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as BusinessCategory)
    : "generic";
}

/**
 * Canonical per-category default tier (trades -> starter, salon -> complete,
 * else growth) — the single source of truth for this mapping. Every other
 * site that needs a category's default recommendedTier (quality-score.ts's
 * scoring baseline, demo-catalog.ts's slug-inferred preview leads,
 * normalizeLeadRecommendedTier below) must call this rather than
 * re-deriving the mapping, so a future product change to one category's
 * default can't silently drift out of sync across call sites the way
 * defaultTagline once did (generic-lead-default-tagline-restaurant-leak).
 */
export function defaultTierForCategory(category: BusinessCategory): Lead["recommendedTier"] {
  if (category === "trades") return "starter";
  if (category === "salon") return "complete";
  return "growth";
}

/**
 * Unrecognized/legacy values fall back to the same per-category default
 * mapSqliteRowToLead has always used — see defaultTierForCategory above.
 */
export function normalizeLeadRecommendedTier(
  raw: string | null | undefined,
  category: BusinessCategory,
): Lead["recommendedTier"] {
  return (RECOMMENDED_TIERS as readonly string[]).includes(raw ?? "")
    ? (raw as Lead["recommendedTier"])
    : defaultTierForCategory(category);
}
