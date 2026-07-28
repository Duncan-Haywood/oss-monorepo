import type { MarketingPack } from "./pack";
import type { MarketingContentVariant } from "./types";

/**
 * Pure SQLite <-> MarketingPack row mapping, split out of src/lib/db.ts
 * (which imports "server-only" and therefore cannot be imported directly by
 * Vitest — see AGENT_PROTOCOL's server-only testability rule). Mirrors
 * src/lib/leads/sqlite-row-mapping.ts's extraction pattern.
 */

// Mirrors the `marketing_packs` SQLite table columns db.ts reads via `SELECT *`.
export interface SqliteMarketingPackRow {
  id: string;
  leadSlug: string;
  yearMonth: string;
  variantsJson: string;
  generatedAt: string;
  generator: string;
  packageTier: string | null;
}

/** Inverse of `JSON.stringify(pack.variants)`; malformed/absent JSON or non-array/non-well-shaped elements degrade to []. */
export function parsePackVariants(json: string): MarketingContentVariant[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MarketingContentVariant => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return typeof row.contentType === "string" && typeof row.body === "string";
    });
  } catch {
    return [];
  }
}

const PACKAGE_TIERS = ["copy_pack", "social_email", "full_marketing"] as const;

/** Map a SQLite `marketing_packs` row back into the app-wide MarketingPack shape (fallback-read path). */
export function mapMarketingPackRow(row: SqliteMarketingPackRow): MarketingPack {
  const tier = (PACKAGE_TIERS as readonly string[]).includes(row.packageTier ?? "")
    ? (row.packageTier as MarketingPack["packageTier"])
    : undefined;
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    yearMonth: row.yearMonth,
    variants: parsePackVariants(row.variantsJson),
    generatedAt: row.generatedAt,
    generator: row.generator === "anthropic" ? "anthropic" : "stub",
    packageTier: tier,
  };
}
