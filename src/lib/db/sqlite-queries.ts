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
import { buildPaymentStubLeadFields } from "../leads/payment-stub";
import { normalizeOutreachStep } from "../email/outreach-followups";
import { serializeLeadHours, serializeLeadServices } from "../leads/sqlite-row-mapping";
import type { OrderRecord } from "../orders/types";
import { newOrderId } from "../orders/types";
import { mapSqliteOrderRow, type SqliteOrderJoinRow } from "../orders/sqlite-row-mapping";
import type { ClientInquiry } from "../inquiries/types";
import { mapClientInquiryRow, type SqliteClientInquiryRow } from "../inquiries/sqlite-row-mapping";
import type { DeployHandoff } from "../deploy/types";
import { mapDeployHandoffRow, type SqliteDeployHandoffRow } from "../deploy/sqlite-row-mapping";
import { customDomainHostAliases, CustomDomainConflictError } from "../deploy/custom-domain-routing";

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
              o.recurringCanceledAt, o.amountPaid, o.createdAt, o.refundedAt, o.disputedAt,
              o.lifetimeRevenueUsd, o.lastRenewalInvoiceId,
              o.lastBillingNoticeSendFailedAt, o.lastBillingNoticeSendFailedType,
              o.acquisitionSource
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
              o.recurringCanceledAt, o.amountPaid, o.createdAt, o.refundedAt, o.disputedAt,
              o.lifetimeRevenueUsd, o.lastRenewalInvoiceId,
              o.lastBillingNoticeSendFailedAt, o.lastBillingNoticeSendFailedType,
              o.acquisitionSource
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
 * CAS marker for sendStarterUpsellAction, mirroring
 * sqliteRecordCheckoutRecoverySent's expected-count pattern rather than a
 * one-shot "already sent" gate — a Starter upsell nudge has no monthly
 * regenerate step to reset eligibility, so an operator may legitimately
 * re-send it to a still Starter-only lead weeks later. The atomic
 * `AND COALESCE(starterUpsellSentCount, 0) = ?` clause only rejects a write
 * whose expected count no longer matches the current row — an exact
 * concurrent duplicate (a second dashboard tab, or a double-click before the
 * button's isPending-disabled state applies), never a later, deliberate
 * resend. Missing slug is a false no-op (mirrors the caller's own prior
 * getLeadBySlug existence check — this helper is never called for an
 * unknown slug in practice). See starter-upsell-send-race-guard.
 */
export function sqliteRecordStarterUpsellSent(
  db: DatabaseSync,
  slug: string,
  sentAt: string,
  expectedStarterUpsellSentCount: number,
): boolean {
  const result = db
    .prepare(
      "UPDATE leads SET starterUpsellSentCount = ?, lastStarterUpsellSentAt = ?, updatedAt = datetime('now') WHERE slug = ? AND COALESCE(starterUpsellSentCount, 0) = ?",
    )
    .run(
      expectedStarterUpsellSentCount + 1,
      sentAt,
      slug,
      expectedStarterUpsellSentCount,
    );
  return result.changes > 0;
}

/**
 * CAS marker for sendStripeConnectOnboardingLinkToClientAction, mirroring
 * sqliteRecordStarterUpsellSent's expected-count pattern rather than a
 * one-shot "already sent" gate — an operator may legitimately re-send a
 * fresh onboarding link after an earlier one expired unused. The atomic
 * `AND COALESCE(stripeConnectOnboardingLinkSentCount, 0) = ?` clause only
 * rejects a write whose expected count no longer matches the current row —
 * an exact concurrent duplicate (a second dashboard tab, or a double-click
 * before the button's isPending-disabled state applies), never a later,
 * deliberate resend. Missing slug is a false no-op (mirrors the caller's own
 * prior getLeadBySlug existence check). See
 * stripe-connect-onboarding-link-send-race-guard.
 */
export function sqliteRecordStripeConnectOnboardingLinkSent(
  db: DatabaseSync,
  slug: string,
  sentAt: string,
  expectedStripeConnectOnboardingLinkSentCount: number,
): boolean {
  const result = db
    .prepare(
      "UPDATE leads SET stripeConnectOnboardingLinkSentCount = ?, lastStripeConnectOnboardingLinkSentAt = ?, updatedAt = datetime('now') WHERE slug = ? AND COALESCE(stripeConnectOnboardingLinkSentCount, 0) = ?",
    )
    .run(
      expectedStripeConnectOnboardingLinkSentCount + 1,
      sentAt,
      slug,
      expectedStripeConnectOnboardingLinkSentCount,
    );
  return result.changes > 0;
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
 * Returns null when the inquiry is missing, already archived, or
 * expectedReplySentCount no longer matches the row's current count at write
 * time — replyToInquiryAction's inquiryCanReceiveReply gate (and its
 * captured expected count) run against a stale read from moments earlier,
 * and a concurrent archive (inquiry-reply-archive-race-guard) or a
 * concurrent duplicate reply send (inquiry-reply-send-race-guard, mirroring
 * recordStarterUpsellSent's CAS shape — not a one-shot "already replied"
 * gate, since a later, deliberate follow-up reply must still succeed) can
 * land in that window. Split out of src/lib/db.ts's recordClientInquiryReply
 * SQLite-fallback branch — pure code move, no behavior change.
 */
export function sqliteRecordClientInquiryReply(
  db: DatabaseSync,
  inquiryId: string,
  operatorReply: string,
  expectedReplySentCount: number,
): ClientInquiry | null {
  const existing = db
    .prepare("SELECT * FROM client_inquiries WHERE id = ?")
    .get(inquiryId) as SqliteClientInquiryRow | undefined;
  if (!existing || existing.status === "archived") return null;
  if ((existing.replySentCount ?? 0) !== expectedReplySentCount) return null;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE client_inquiries
     SET status = ?, operatorReply = ?, repliedAt = ?, replySentCount = ?, updatedAt = ?
     WHERE id = ?`,
  ).run("replied", operatorReply, now, expectedReplySentCount + 1, now, inquiryId);

  return mapClientInquiryRow({
    ...existing,
    status: "replied",
    operatorReply,
    replySentCount: expectedReplySentCount + 1,
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
 *
 * expectedRecoverySentCount (the caller's own pre-write snapshot — the same
 * value recovery-email-escalating-cadence uses to pick nudge copy) is
 * compared atomically in the same UPDATE's WHERE clause. Without this, two
 * concurrent calls for the same still-open session (two tabs, a fast
 * double-click) would both pass the status check and both increment the
 * count, sending a real duplicate email with identical stale nudge-tier
 * copy. Only the write whose expected count still matches the current row
 * applies; the other returns false so the caller can report a duplicate-send
 * message instead of emailing twice (checkout-recovery-send-race-guard).
 */
export function sqliteRecordCheckoutRecoverySent(
  db: DatabaseSync,
  stripeSessionId: string,
  sentAt: string,
  expectedRecoverySentCount: number,
): boolean {
  const result = db
    .prepare(
      "UPDATE checkout_sessions SET recoverySentAt = ?, recoverySentCount = ? WHERE stripeSessionId = ? AND status = 'open' AND COALESCE(recoverySentCount, 0) = ?",
    )
    .run(sentAt, expectedRecoverySentCount + 1, stripeSessionId, expectedRecoverySentCount);
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

/**
 * Releases a reservation made by sqliteMarkCommerceOrderClientReceiptSent
 * when the send it was guarding failed — used only by
 * resendCommerceClientReceiptAction's reserve-then-send-then-release
 * ordering (see commerce-client-receipt-resend-race-guard-ordering-fix).
 * Only clears when the row still holds the exact value this caller wrote
 * (expectedClientReceiptEmailSentAt), a safe no-op otherwise. Mirrors
 * sqliteClearMarketingPackSentToClient's exact-match CAS release.
 */
export function sqliteClearCommerceOrderClientReceiptSent(
  db: DatabaseSync,
  stripeSessionId: string,
  expectedClientReceiptEmailSentAt: string,
): boolean {
  const result = db
    .prepare(
      "UPDATE commerce_orders SET clientReceiptEmailSentAt = NULL WHERE stripeSessionId = ? AND clientReceiptEmailSentAt = ?",
    )
    .run(stripeSessionId, expectedClientReceiptEmailSentAt);
  return result.changes > 0;
}

/**
 * Durable sent-marker after sendMarketingPackToClientEmail resolves
 * { success: true }. Returns whether the row was actually marked (re-checks
 * sentToClientAt IS NULL atomically with the write, same TOCTOU-safe pattern
 * as sqliteMarkCommerceOrderClientReceiptSent). Split out of
 * src/lib/db.ts's markMarketingPackSentToClient SQLite-fallback branch (see
 * marketing-voice-pack-client-send-visibility).
 */
export function sqliteMarkMarketingPackSentToClient(
  db: DatabaseSync,
  leadSlug: string,
  yearMonth: string,
  sentToClientAt: string,
): boolean {
  const result = db
    .prepare(
      "UPDATE marketing_packs SET sentToClientAt = ? WHERE leadSlug = ? AND yearMonth = ? AND (sentToClientAt IS NULL OR sentToClientAt = '')",
    )
    .run(sentToClientAt, leadSlug, yearMonth);
  return result.changes > 0;
}

/**
 * Durable sent-marker after sendClientVoicePackToClientEmail resolves
 * { success: true }. Same re-check-atomically-with-the-write pattern as
 * sqliteMarkMarketingPackSentToClient (see
 * marketing-voice-pack-client-send-visibility).
 */
export function sqliteMarkClientVoicePackSentToClient(
  db: DatabaseSync,
  leadSlug: string,
  sentToClientAt: string,
): boolean {
  const result = db
    .prepare(
      "UPDATE client_voice_packs SET sentToClientAt = ? WHERE leadSlug = ? AND (sentToClientAt IS NULL OR sentToClientAt = '')",
    )
    .run(sentToClientAt, leadSlug);
  return result.changes > 0;
}

/**
 * Releases a reservation made by sqliteMarkMarketingPackSentToClient when the
 * send it was guarding failed — see
 * marketing-voice-pack-client-send-race-guard-ordering-fix. Only clears when
 * the row still holds the exact value this caller wrote (expectedSentToClientAt),
 * a safe no-op otherwise (e.g. a regenerate already cleared it).
 */
export function sqliteClearMarketingPackSentToClient(
  db: DatabaseSync,
  leadSlug: string,
  yearMonth: string,
  expectedSentToClientAt: string,
): boolean {
  const result = db
    .prepare(
      "UPDATE marketing_packs SET sentToClientAt = NULL WHERE leadSlug = ? AND yearMonth = ? AND sentToClientAt = ?",
    )
    .run(leadSlug, yearMonth, expectedSentToClientAt);
  return result.changes > 0;
}

/**
 * Releases a reservation made by sqliteMarkClientVoicePackSentToClient when
 * the send it was guarding failed. Mirrors
 * sqliteClearMarketingPackSentToClient's exact-match CAS release.
 */
export function sqliteClearClientVoicePackSentToClient(
  db: DatabaseSync,
  leadSlug: string,
  expectedSentToClientAt: string,
): boolean {
  const result = db
    .prepare(
      "UPDATE client_voice_packs SET sentToClientAt = NULL WHERE leadSlug = ? AND sentToClientAt = ?",
    )
    .run(leadSlug, expectedSentToClientAt);
  return result.changes > 0;
}

/**
 * Set (or clear) a lead's custom domain, atomically re-checking ownership
 * (by exact host and its www/apex alias) immediately before the write — the
 * same guard as the Convex twin (convex/deployHandoffs.ts's updateCustomDomain
 * mutation), closing the TOCTOU window where two concurrent Save domain
 * requests for two different leads could both pass the caller-side
 * getLeadSlugByCustomDomain precheck before either write lands
 * (custom-domain-assign-race-guard). Throws CustomDomainConflictError when a
 * different lead already owns the target host or its alias; returns null for
 * an unknown leadSlug. `customDomain` must already be normalized (bare
 * hostname or null) by the caller — src/lib/db.ts's
 * updateDeployHandoffCustomDomain owns that normalization, mirroring how
 * sqliteApplyColdLeadDisposition takes an already-computed patch. Split out
 * of src/lib/db.ts's SQLite-fallback branch (added same-day as the Convex fix
 * but left untested — server-only-lib-cannot-be-vitest-tested-directly is
 * exactly why every sibling in this file was already extracted) — pure code
 * move, no behavior change.
 */
export function sqliteUpdateDeployHandoffCustomDomain(
  db: DatabaseSync,
  leadSlug: string,
  customDomain: string | null,
  updatedAt: string,
): DeployHandoff | null {
  const row = db
    .prepare("SELECT * FROM deploy_handoffs WHERE leadSlug = ?")
    .get(leadSlug) as SqliteDeployHandoffRow | undefined;
  if (!row) return null;

  const existing = mapDeployHandoffRow(row);

  if (customDomain) {
    for (const alias of customDomainHostAliases(customDomain)) {
      const conflictRow = db
        .prepare("SELECT leadSlug FROM deploy_handoffs WHERE customDomain = ?")
        .get(alias) as { leadSlug: string } | undefined;
      if (conflictRow && conflictRow.leadSlug !== leadSlug) {
        throw new CustomDomainConflictError(conflictRow.leadSlug);
      }
    }
  }

  db.prepare(
    "UPDATE deploy_handoffs SET customDomain = ?, updatedAt = ? WHERE leadSlug = ?",
  ).run(customDomain, updatedAt, leadSlug);

  return {
    ...existing,
    customDomain: customDomain || undefined,
    updatedAt,
  };
}

/**
 * Idempotency check for recordLeadPayment's SQLite branch — Stripe redelivers
 * checkout.session.completed on retry/timeout, and the caller must skip the
 * lead/order writes below entirely once a row for this stripeSessionId
 * already exists. Kept as its own sync function (rather than folded into
 * sqliteRecordLeadPayment) so db.ts can check it BEFORE the async
 * getLeadBySlug Convex-first lookup — a redelivered webhook must not pay the
 * cost of that lookup at all, matching the original inline ordering exactly.
 */
export function sqliteOrderAlreadyRecorded(db: DatabaseSync, stripeSessionId: string): boolean {
  const existingOrder = db
    .prepare("SELECT id FROM orders WHERE stripeSessionId = ?")
    .get(stripeSessionId) as { id: string } | undefined;
  return Boolean(existingOrder);
}

/**
 * Records a bundle payment (Starter/Growth/Complete checkout) on the SQLite
 * fallback path — the single highest-stakes write in this codebase on a
 * SQLite-fallback deployment. Caller (db.ts's recordLeadPayment) must call
 * sqliteOrderAlreadyRecorded first and skip this entirely on a redelivery,
 * then resolve `leadExists` via its own async getLeadBySlug(params.slug)
 * lookup (which stays in db.ts since it may itself try Convex first) before
 * calling this. When !leadExists, creates a minimal payment-stub lead
 * (organic/no-CRM buyer — keep field defaults aligned with Convex
 * markLeadPaid's stub, see payment-stub.ts). When leadExists, applies the
 * live-stage-never-downgrades guard (a Starter upsell to Growth/Complete on
 * an already-live lead must not regress it back to "paid") — mirrors
 * convex/leads.ts markLeadPaid's identical guard. The order INSERT always
 * runs, in both branches. Split out of src/lib/db.ts's recordLeadPayment
 * SQLite-fallback branch (flagged but deliberately left untested by
 * sqlite-db-injectable-query-extraction, 2026-07-19 — see
 * sqlite-record-lead-payment-extraction) — pure code move, no behavior
 * change.
 */
export function sqliteRecordLeadPayment(
  db: DatabaseSync,
  params: {
    slug: string;
    stripeSessionId: string;
    tier: string;
    commerceAddon: boolean;
    amountTotal: number;
    stripeCustomerId?: string;
    acquisitionSource?: string;
  },
  leadExists: boolean,
): void {
  if (!leadExists) {
    // Keep field defaults aligned with Convex markLeadPaid stub + payment-stub.ts.
    const stub = buildPaymentStubLeadFields(params.slug);
    const id = newLeadId();

    db.prepare(
      `INSERT INTO leads (id, slug, businessName, category, city, state, phone, tagline, description, recommendedTier, dataSource, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid')`,
    ).run(
      id,
      stub.slug,
      stub.businessName,
      stub.category,
      stub.city,
      stub.state,
      stub.phone,
      stub.tagline,
      stub.description,
      stub.recommendedTier,
      stub.dataSource,
    );
  } else {
    // Mirrors convex/leads.ts markLeadPaid's live-stage guard: never regress
    // an already-live lead back to "paid" on a second purchase (e.g. a
    // Starter upsell to Growth/Complete on a lead whose site is already
    // deployed). The order INSERT below still runs unconditionally either
    // way — only the status patch is guarded.
    db.prepare(
      "UPDATE leads SET status = 'paid', updatedAt = datetime('now') WHERE slug = ? AND status != 'live'",
    ).run(params.slug);
  }

  const leadRow = db.prepare("SELECT id FROM leads WHERE slug = ?").get(params.slug) as {
    id: string;
  };

  const orderId = newOrderId();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO orders (id, leadId, stripeSessionId, stripeCustomerId, tier, commerceAddon, amountPaid, createdAt, acquisitionSource)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    orderId,
    leadRow.id,
    params.stripeSessionId,
    params.stripeCustomerId ?? null,
    params.tier,
    params.commerceAddon ? 1 : 0,
    params.amountTotal,
    createdAt,
    params.acquisitionSource ?? null,
  );
}
