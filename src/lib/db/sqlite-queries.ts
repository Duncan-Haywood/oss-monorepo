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
import type { Lead, LeadPipelineStage, OutreachStep } from "../leads/types";
import { newLeadId } from "../leads/types";
import { normalizeOutreachStep } from "../email/outreach-followups";
import { serializeLeadHours, serializeLeadServices } from "../leads/sqlite-row-mapping";
import type { OrderRecord } from "../orders/types";
import { mapSqliteOrderRow, type SqliteOrderJoinRow } from "../orders/sqlite-row-mapping";
import type { ClientInquiry } from "../inquiries/types";
import { mapClientInquiryRow, type SqliteClientInquiryRow } from "../inquiries/sqlite-row-mapping";

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

/**
 * Update a lead's pipeline stage. Throws `Lead with slug ${slug} not found`
 * on an unknown slug (parity with convex/leads.ts's updateStage — see
 * db-convex-sqlite-not-found-parity). Returns false (no write) when the
 * lead is already paid/live and the target stage is not itself paid/live —
 * a stale dashboard dropdown snapshot racing a concurrent Stripe checkout
 * must never revert an already-converted lead to an earlier stage
 * (update-lead-stage-action-paid-live-revert-guard). Split out of
 * src/lib/db.ts's updateLeadStage SQLite-fallback branch — pure code move,
 * no behavior change.
 */
export function sqliteUpdateLeadStage(
  db: DatabaseSync,
  slug: string,
  stage: LeadPipelineStage,
): boolean {
  const existing = db.prepare("SELECT slug, status FROM leads WHERE slug = ?").get(slug) as
    | { slug: string; status: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  if (
    (existing.status === "paid" || existing.status === "live") &&
    stage !== "paid" &&
    stage !== "live"
  ) {
    return false;
  }
  db.prepare("UPDATE leads SET status = ?, updatedAt = datetime('now') WHERE slug = ?").run(
    stage,
    slug,
  );
  return true;
}

/**
 * Persist outreach sequence progress after Email 1/2/3 sends successfully.
 * Throws on an unknown slug (db-convex-sqlite-not-found-parity). Returns
 * false when the lead has already converted/closed (never send a real
 * follow-up email to a lead that just paid or closed —
 * sendfollowup-action-paid-live-closed-race-guard) or when the target step
 * does not advance outreachStep (two concurrent calls computing the same
 * target step must not both send the real email —
 * outreach-step-duplicate-send-guard). Split out of src/lib/db.ts's
 * recordLeadOutreach SQLite-fallback branch — pure code move, no behavior
 * change. Caller (db.ts) still validates outreachStep is 1-3 before calling.
 */
export function sqliteRecordLeadOutreach(
  db: DatabaseSync,
  slug: string,
  outreachStep: OutreachStep,
  lastOutreachAt: string,
): boolean {
  const existing = db
    .prepare("SELECT slug, status, outreachStep FROM leads WHERE slug = ?")
    .get(slug) as { slug: string; status: string; outreachStep: number | null } | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  if (existing.status === "paid" || existing.status === "live" || existing.status === "closed") {
    return false;
  }
  if ((existing.outreachStep ?? 0) >= outreachStep) {
    return false;
  }
  db.prepare(
    `UPDATE leads
     SET outreachStep = ?, lastOutreachAt = ?, updatedAt = datetime('now')
     WHERE slug = ?`,
  ).run(outreachStep, lastOutreachAt, slug);
  return true;
}

/**
 * Persist a cold-lead disposition patch (re-engage or close) in one write.
 * Throws on an unknown slug (db-convex-sqlite-not-found-parity). Returns
 * false when the lead has already moved to paid/live by write time — the
 * caller's own paid/live guard only saw an earlier snapshot read, and a
 * concurrent Stripe checkout completing in that window must not have its
 * stage silently reverted back to closed/discovered (same TOCTOU class as
 * commerce-order-paid-out-refund-race-guard). Split out of src/lib/db.ts's
 * applyColdLeadDisposition SQLite-fallback branch — pure code move, no
 * behavior change.
 */
export function sqliteApplyColdLeadDisposition(
  db: DatabaseSync,
  slug: string,
  patch: {
    stage: LeadPipelineStage;
    outreachStep: OutreachStep;
    lastOutreachAt: string | undefined;
    snoozedUntil: string | undefined;
  },
): boolean {
  const existing = db.prepare("SELECT slug, status FROM leads WHERE slug = ?").get(slug) as
    | { slug: string; status: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  if (existing.status === "paid" || existing.status === "live") {
    return false;
  }
  db.prepare(
    `UPDATE leads
     SET status = ?, outreachStep = ?, lastOutreachAt = ?, snoozedUntil = ?, updatedAt = datetime('now')
     WHERE slug = ?`,
  ).run(
    patch.stage,
    patch.outreachStep,
    patch.lastOutreachAt ?? null,
    patch.snoozedUntil ?? null,
    slug,
  );
  return true;
}

/**
 * Persist a successful operator reply: status=replied + body + repliedAt.
 * Returns null when the inquiry is missing or already archived at write
 * time — replyToInquiryAction's inquiryCanReceiveReply gate runs against a
 * stale read from moments earlier, and a concurrent archive can land in
 * that window (inquiry-reply-archive-race-guard). Split out of
 * src/lib/db.ts's recordClientInquiryReply SQLite-fallback branch — pure
 * code move, no behavior change.
 */
export function sqliteRecordClientInquiryReply(
  db: DatabaseSync,
  inquiryId: string,
  operatorReply: string,
): ClientInquiry | null {
  const existing = db
    .prepare("SELECT * FROM client_inquiries WHERE id = ?")
    .get(inquiryId) as SqliteClientInquiryRow | undefined;
  if (!existing || existing.status === "archived") return null;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE client_inquiries
     SET status = ?, operatorReply = ?, repliedAt = ?, updatedAt = ?
     WHERE id = ?`,
  ).run("replied", operatorReply, now, now, inquiryId);

  return mapClientInquiryRow({
    ...existing,
    status: "replied",
    operatorReply,
    repliedAt: now,
    updatedAt: now,
  });
}

/**
 * Records that an operator sent an abandoned-checkout recovery email for
 * this session. Returns false (no write) when the session is missing or is
 * no longer "open" at write time — never trusts the caller's earlier
 * listOpenCheckoutSessions() snapshot alone, since a concurrent Stripe
 * webhook can complete the same session (a real payment landing) in that
 * window (checkout-session-recovery-race-guard). Split out of
 * src/lib/db.ts's recordCheckoutRecoverySent SQLite-fallback branch — pure
 * code move, no behavior change.
 */
export function sqliteRecordCheckoutRecoverySent(
  db: DatabaseSync,
  stripeSessionId: string,
  sentAt: string,
): boolean {
  const result = db
    .prepare(
      "UPDATE checkout_sessions SET recoverySentAt = ? WHERE stripeSessionId = ? AND status = 'open'",
    )
    .run(sentAt, stripeSessionId);
  return result.changes > 0;
}

/**
 * Marks a commerce order as manually paid out to the client. Returns
 * whether the row was actually marked paid out — the WHERE clause
 * re-verifies refundedAt/disputedAt/paidOutAt atomically with the write
 * itself, so an independent Stripe webhook (charge.refunded /
 * charge.dispute.created) recording a refund or dispute in the window
 * between the caller's earlier read and this write can never leave an
 * order both paid out AND refunded/disputed
 * (commerce-order-paid-out-refund-race-guard). Split out of
 * src/lib/db.ts's markCommerceOrderPaidOut SQLite-fallback branch — pure
 * code move, no behavior change.
 */
export function sqliteMarkCommerceOrderPaidOut(
  db: DatabaseSync,
  stripeSessionId: string,
  paidOutAt: string,
): boolean {
  const result = db
    .prepare(
      "UPDATE commerce_orders SET paidOutAt = ? WHERE stripeSessionId = ? AND (paidOutAt IS NULL OR paidOutAt = '') AND (refundedAt IS NULL OR refundedAt = '') AND (disputedAt IS NULL OR disputedAt = '')",
    )
    .run(paidOutAt, stripeSessionId);
  return result.changes > 0;
}

/**
 * Durable client-receipt sent-marker after sendCommerceBuyNowClientReceipt
 * resolves { success: true }. Returns whether the row was actually marked
 * (re-checks clientReceiptEmailSentAt IS NULL atomically with the write,
 * matching sqliteMarkCommerceOrderPaidOut's refunded/disputed/paidOutAt
 * re-check — commerce-client-receipt-marker-race-guard). Split out of
 * src/lib/db.ts's markCommerceOrderClientReceiptSent SQLite-fallback
 * branch — pure code move, no behavior change.
 */
export function sqliteMarkCommerceOrderClientReceiptSent(
  db: DatabaseSync,
  stripeSessionId: string,
  clientReceiptEmailSentAt: string,
): boolean {
  const result = db
    .prepare(
      "UPDATE commerce_orders SET clientReceiptEmailSentAt = ? WHERE stripeSessionId = ? AND (clientReceiptEmailSentAt IS NULL OR clientReceiptEmailSentAt = '')",
    )
    .run(clientReceiptEmailSentAt, stripeSessionId);
  return result.changes > 0;
}
