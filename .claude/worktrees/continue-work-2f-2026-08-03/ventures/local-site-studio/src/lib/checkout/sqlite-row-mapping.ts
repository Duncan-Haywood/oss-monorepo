import type { CheckoutSessionRecord } from "./types";

/**
 * Pure SQLite <-> CheckoutSessionRecord row mapping, split out of
 * src/lib/db.ts (which imports "server-only" and therefore cannot be
 * imported directly by Vitest — see AGENT_PROTOCOL's server-only
 * testability rule). Mirrors src/lib/leads/sqlite-row-mapping.ts's
 * extraction pattern.
 */

// Mirrors the `checkout_sessions` SQLite table columns db.ts reads via `SELECT *`.
export interface SqliteCheckoutSessionRow {
  id: string;
  leadSlug: string;
  stripeSessionId: string;
  tier: string;
  commerceAddon: number;
  customerEmail: string | null;
  status: string;
  createdAt: string;
  recoverySentAt: string | null;
  kind: string | null;
  skuId: string | null;
}

/** Map a SQLite `checkout_sessions` row back into the app-wide CheckoutSessionRecord shape (fallback-read path). */
export function mapCheckoutSessionRow(row: SqliteCheckoutSessionRow): CheckoutSessionRecord {
  const kind = row.kind === "commerce_sku" ? ("commerce_sku" as const) : ("bundle" as const);
  return {
    stripeSessionId: row.stripeSessionId,
    leadSlug: row.leadSlug,
    tier: row.tier,
    commerceAddon: row.commerceAddon === 1,
    customerEmail: row.customerEmail || undefined,
    status: row.status === "complete" ? "complete" : "open",
    createdAt: row.createdAt,
    recoverySentAt: row.recoverySentAt || undefined,
    kind,
    skuId: row.skuId || undefined,
  };
}
