import { softCapPackVariantFields } from "@/lib/packs/variant-fields";
import type { ClientVoicePack } from "./pack";
import type { ClientVoiceScriptVariant } from "./types";

/**
 * Pure SQLite <-> ClientVoicePack row mapping, split out of src/lib/db.ts
 * (which imports "server-only" and therefore cannot be imported directly by
 * Vitest — see AGENT_PROTOCOL's server-only testability rule). Mirrors
 * src/lib/leads/sqlite-row-mapping.ts's extraction pattern.
 */

// Mirrors the `client_voice_packs` SQLite table columns db.ts reads via `SELECT *`.
export interface SqliteClientVoicePackRow {
  id: string;
  leadSlug: string;
  variantsJson: string;
  generatedAt: string;
  generator: string;
}

/** Inverse of `JSON.stringify(pack.variants)`; malformed/absent JSON or non-array/non-well-shaped elements degrade to []. Soft-caps title/body/cta so pre-cap persisted rows cannot bypass generate-time caps on read. */
export function parseClientVoiceVariants(json: string): ClientVoiceScriptVariant[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ClientVoiceScriptVariant => {
        if (!item || typeof item !== "object") return false;
        const row = item as Record<string, unknown>;
        return (
          typeof row.scriptType === "string" &&
          typeof row.title === "string" &&
          typeof row.body === "string"
        );
      })
      .map((variant) => softCapPackVariantFields(variant));
  } catch {
    return [];
  }
}

/** Soft-cap variants on a pack already loaded from Convex (bypasses parseClientVoiceVariants). */
export function softCapClientVoicePack(pack: ClientVoicePack): ClientVoicePack {
  return {
    ...pack,
    variants: pack.variants.map((variant) => softCapPackVariantFields(variant)),
  };
}

/** Map a SQLite `client_voice_packs` row back into the app-wide ClientVoicePack shape (fallback-read path). */
export function mapClientVoicePackRow(row: SqliteClientVoicePackRow): ClientVoicePack {
  const generator =
    row.generator === "anthropic" || row.generator === "stub" ? row.generator : "stub";
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    variants: parseClientVoiceVariants(row.variantsJson),
    generatedAt: row.generatedAt,
    generator,
  };
}
