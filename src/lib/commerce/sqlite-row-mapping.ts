import type { CommerceOrderRecord } from "./orders";
import type { CommerceCatalog, CommerceSku } from "./types";

/**
 * Pure SQLite <-> Commerce catalog/order row mapping, split out of
 * src/lib/db.ts (which imports "server-only" and therefore cannot be
 * imported directly by Vitest — see AGENT_PROTOCOL's server-only
 * testability rule). Mirrors src/lib/leads/sqlite-row-mapping.ts's
 * extraction pattern.
 */

// Mirrors the `commerce_catalogs` SQLite table columns db.ts reads via `SELECT *`.
export interface SqliteCommerceCatalogRow {
  leadSlug: string;
  itemsJson: string;
  updatedAt: string;
}

/** Inverse of `JSON.stringify(catalog.items)`; malformed/absent JSON or non-array/non-well-shaped elements degrade to []. */
export function parseCommerceItems(json: string): CommerceSku[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CommerceSku => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return (
        typeof row.id === "string" &&
        typeof row.name === "string" &&
        typeof row.priceCents === "number"
      );
    });
  } catch {
    return [];
  }
}

/** Map a SQLite `commerce_catalogs` row back into the app-wide CommerceCatalog shape (fallback-read path). */
export function mapCommerceCatalogRow(row: SqliteCommerceCatalogRow): CommerceCatalog {
  return {
    leadSlug: row.leadSlug,
    items: parseCommerceItems(row.itemsJson),
    updatedAt: row.updatedAt,
  };
}

// Mirrors the `commerce_orders` SQLite table columns db.ts reads via `SELECT *`.
export interface SqliteCommerceOrderRow {
  id: string;
  leadSlug: string;
  skuId: string;
  skuName: string;
  amountPaidUsd: number;
  stripeSessionId: string;
  createdAt: string;
  paidOutAt: string | null;
  clientReceiptEmailSentAt: string | null;
}

/** Map a SQLite `commerce_orders` row back into the app-wide CommerceOrderRecord shape (fallback-read path). */
export function mapCommerceOrderRow(row: SqliteCommerceOrderRow): CommerceOrderRecord {
  return {
    id: row.id,
    leadSlug: row.leadSlug,
    skuId: row.skuId,
    skuName: row.skuName,
    amountPaidUsd: row.amountPaidUsd,
    stripeSessionId: row.stripeSessionId,
    createdAt: row.createdAt,
    // Empty string must stay unpaid (matches SQLite listUnpaid + isCommerceOrderPaidOut).
    paidOutAt: row.paidOutAt || undefined,
    clientReceiptEmailSentAt: row.clientReceiptEmailSentAt || undefined,
  };
}
