/**
 * SQLite fallback read/write helpers for the two invariants flagged as
 * highest-value-but-untested by a 2026-07-21 audit (sqlite-db-injectable-
 * query-extraction, see prompt_process.tsx BUSINESS_DECISIONS): newest-first
 * order-list sort parity with the Convex twin, and upsertLead's create-only
 * atomic race guard. Split out of src/lib/db.ts (which imports "server-only"
 * and therefore cannot be exercised by Vitest) so this SQL is exercisable
 * against a real in-memory node:sqlite instance in tests, mirroring the
 * injectable-client pattern in src/lib/commerce/stripe-sync.ts.
 *
 * Pure code move for the read paths (listOrders/listOrdersByLeadSlug) and
 * the SQLite-fallback branch of upsertLead — no behavior change from the
 * inline version these replace. db.ts still owns the Convex-first branch,
 * the DatabaseSync singleton, and every other table's read/write.
 */

import type { DatabaseSync } from "node:sqlite";
import type { Lead } from "../leads/types";
import { newLeadId } from "../leads/types";
import { normalizeOutreachStep } from "../email/outreach-followups";
import { serializeLeadHours, serializeLeadServices } from "../leads/sqlite-row-mapping";
import type { OrderRecord } from "../orders/types";
import { mapSqliteOrderRow, type SqliteOrderJoinRow } from "../orders/sqlite-row-mapping";

/**
 * Newest-first bundle order ledger (digest + dashboard aggregates). Must
 * stay in sync with the Convex twin's sort (see AGENT_PROTOCOL's dual-backend
 * list-query sort-order-parity rule) — ORDER BY o.createdAt DESC is the
 * invariant under test.
 */
export function sqliteListOrders(db: DatabaseSync): OrderRecord[] {
  const rows = db
    .prepare(
      `SELECT o.id, l.slug as leadSlug, o.stripeSessionId, o.stripeCustomerId, o.tier, o.commerceAddon,
              o.recurringCanceledAt, o.amountPaid, o.createdAt, o.refundedAt, o.disputedAt
       FROM orders o
       LEFT JOIN leads l ON l.id = o.leadId
       ORDER BY o.createdAt DESC`,
    )
    .all() as unknown as SqliteOrderJoinRow[];

  return rows.map((row) =>
    mapSqliteOrderRow({
      ...row,
      leadSlug: row.leadSlug || "unknown",
    }),
  );
}

/**
 * Slug-scoped, newest-first orders (preview commerce eligibility, Manage
 * billing, per-lead dashboard sold-capability gates). Must match
 * sqliteListOrders' sort order on the same table.
 */
export function sqliteListOrdersByLeadSlug(db: DatabaseSync, leadSlug: string): OrderRecord[] {
  const rows = db
    .prepare(
      `SELECT o.id, l.slug as leadSlug, o.stripeSessionId, o.stripeCustomerId, o.tier, o.commerceAddon,
              o.recurringCanceledAt, o.amountPaid, o.createdAt, o.refundedAt, o.disputedAt
       FROM orders o
       LEFT JOIN leads l ON l.id = o.leadId
       WHERE l.slug = ?
       ORDER BY o.createdAt DESC`,
    )
    .all(leadSlug) as unknown as SqliteOrderJoinRow[];

  return rows.map((row) =>
    mapSqliteOrderRow({
      ...row,
      leadSlug: row.leadSlug || leadSlug,
    }),
  );
}

/**
 * Create-only lead insert: returns false (no-op, no throw) when a lead with
 * this slug already exists, true after a successful insert. This
 * check-then-insert pair is the atomic race guard under test — a concurrent
 * double-submit (double-click, two tabs, a retried CSV row) must never
 * duplicate a slug.
 */
export function sqliteUpsertLead(db: DatabaseSync, lead: Lead): boolean {
  const check = db.prepare("SELECT id FROM leads WHERE slug = ?").get(lead.slug) as
    | { id: string }
    | undefined;
  if (check) {
    return false;
  }

  const services = serializeLeadServices(lead.services);
  const hoursStr = serializeLeadHours(lead.hours);
  const dataSource = lead.dataSource ?? "manual_entry";
  const outreachStep = normalizeOutreachStep(lead.outreachStep);
  const lastOutreachAt = lead.lastOutreachAt ?? null;
  const lastPreviewOpenAt = lead.lastPreviewOpenAt ?? null;
  const notes = lead.notes ?? null;
  const snoozedUntil = lead.snoozedUntil ?? null;

  const id = newLeadId();
  db.prepare(`
    INSERT INTO leads (id, slug, businessName, category, city, state, address, phone, email, hours, services, tagline, description, recommendedTier, dataSource, status, outreachStep, lastOutreachAt, lastPreviewOpenAt, notes, snoozedUntil)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    lead.slug,
    lead.businessName,
    lead.category,
    lead.city,
    lead.state,
    lead.address ?? null,
    lead.phone,
    lead.email ?? null,
    hoursStr,
    services,
    lead.tagline,
    lead.description,
    lead.recommendedTier,
    dataSource,
    lead.stage,
    outreachStep,
    lastOutreachAt,
    lastPreviewOpenAt,
    notes,
    snoozedUntil,
  );
  return true;
}
