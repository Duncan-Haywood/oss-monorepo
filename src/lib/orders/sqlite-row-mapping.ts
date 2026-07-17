import type { OrderRecord } from "./types";

/**
 * Pure SQLite <-> OrderRecord row mapping, split out of src/lib/db.ts (which
 * imports "server-only" and therefore cannot be imported directly by Vitest
 * — see AGENT_PROTOCOL's server-only testability rule). Mirrors
 * src/lib/leads/sqlite-row-mapping.ts's extraction pattern.
 */

// Mirrors the SQLite `orders` (joined) row shape db.ts reads.
export interface SqliteOrderJoinRow {
  id: string;
  leadSlug: string;
  stripeSessionId: string | null;
  stripeCustomerId: string | null;
  tier: string;
  commerceAddon: number;
  recurringCanceledAt: number | null;
  amountPaid: number;
  status: string;
  createdAt: string;
}

/** Map a SQLite `orders` row back into the app-wide OrderRecord shape (fallback-read path). */
export function mapSqliteOrderRow(row: SqliteOrderJoinRow): OrderRecord {
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    stripeSessionId: row.stripeSessionId || "",
    stripeCustomerId: row.stripeCustomerId || undefined,
    tier: row.tier,
    commerceAddon: row.commerceAddon === 1,
    recurringCanceledAt:
      typeof row.recurringCanceledAt === "number" &&
      Number.isFinite(row.recurringCanceledAt) &&
      row.recurringCanceledAt > 0
        ? row.recurringCanceledAt
        : undefined,
    amountPaid: row.amountPaid,
    status: row.status,
    createdAt: row.createdAt,
  };
}
