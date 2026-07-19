/**
 * Pure logic for the checkout-abandoned-recovery backlog item — mirrors the
 * shape of src/lib/email/outreach-followups.ts so the two due-queues read
 * the same way on the dashboard.
 *
 * Bundle vs commerce_sku sessions share timing helpers but must never share
 * recovery emails or Work next cart boosts — see checkoutSessionKind.
 */

import { leadEligibleForCommerceCatalog } from "@/lib/commerce/catalog";
import type { LeadPipelineStage } from "@/lib/leads/types";
import type { CheckoutSessionKind, CheckoutSessionRecord } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Hours an "open" session sits with no completed order before we call it abandoned. */
export const ABANDONED_AFTER_HOURS = 2;
/** Days between recovery nudges so the same abandoned session isn't re-emailed daily. */
export const RECOVERY_COOLDOWN_DAYS = 2;

/** Legacy rows without kind are bundle checkouts (pre-commerce tracking). */
export function checkoutSessionKind(session: CheckoutSessionRecord): CheckoutSessionKind {
  return session.kind ?? "bundle";
}

export function isBundleCheckoutSession(session: CheckoutSessionRecord): boolean {
  return checkoutSessionKind(session) === "bundle";
}

export function isCommerceSkuCheckoutSession(session: CheckoutSessionRecord): boolean {
  return checkoutSessionKind(session) === "commerce_sku";
}

export function isAbandonedCheckout(session: CheckoutSessionRecord, nowMs: number): boolean {
  if (session.status !== "open") return false;
  const createdAtMs = Date.parse(session.createdAt);
  if (Number.isNaN(createdAtMs)) return false;
  return nowMs - createdAtMs >= ABANDONED_AFTER_HOURS * HOUR_MS;
}

/**
 * Due for a recovery nudge: abandoned, and either never nudged or the cooldown
 * has elapsed since the last nudge.
 */
export function isRecoveryDue(session: CheckoutSessionRecord, nowMs: number): boolean {
  if (!isAbandonedCheckout(session, nowMs)) return false;
  if (!session.recoverySentAt) return true;
  const sentAtMs = Date.parse(session.recoverySentAt);
  if (Number.isNaN(sentAtMs)) return true;
  return nowMs - sentAtMs >= RECOVERY_COOLDOWN_DAYS * DAY_MS;
}

/**
 * Open bundle checkout_sessions for a lead that should be closed after a
 * later Session for that lead pays. Excludes the paid stripeSessionId and
 * never includes commerce_sku rows (end-customer multi-shopper carts).
 *
 * This is the canonical spec for that closing rule, not a shared runtime
 * dependency: db.ts's SQLite fallback (a raw UPDATE ... WHERE) and
 * convex/checkoutSessions.ts's markCompleteOpenBundleForLead (an in-memory
 * filter inside a mutation) each hand-implement the same allowlist rather
 * than importing this function, since one runs as SQL and the other inside
 * a Convex handler. Any change to this filter must be mirrored in both, and
 * both must allowlist (kind is undefined/""/"bundle") rather than blocklist
 * (kind !== "commerce_sku") — checkoutSessions.kind is a loose
 * v.optional(v.string()) at the schema level (see convex/schema.ts), not
 * the closed CheckoutSessionKind union, so a stray/future third kind value
 * must fall through untouched on both backends. Exercised directly by this
 * file's own Vitest only.
 */
export function openBundleCheckoutSessionsToClose(
  sessions: readonly CheckoutSessionRecord[],
  opts: { leadSlug: string; exceptStripeSessionId: string },
): CheckoutSessionRecord[] {
  const leadSlug = opts.leadSlug.trim();
  const exceptId = opts.exceptStripeSessionId.trim();
  if (!leadSlug || !exceptId) return [];
  return sessions.filter(
    (session) =>
      session.leadSlug === leadSlug &&
      session.status === "open" &&
      session.stripeSessionId !== exceptId &&
      isBundleCheckoutSession(session),
  );
}

/**
 * Normalize checkout customerEmail for orphan-cart matching (trim + lower).
 * Empty / whitespace-only → "" (caller must skip cleanup when blank).
 */
export function normalizeCheckoutCustomerEmailForMatch(email: string | undefined | null): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Open commerce_sku checkout_sessions for the same lead + SKU + shopper email
 * that should be closed after a later Buy now Session pays. Excludes the paid
 * stripeSessionId. Never matches when customerEmail is blank on either side
 * (multi-shopper carts must not close by leadSlug+skuId alone).
 *
 * Canonical spec only, same caveat as openBundleCheckoutSessionsToClose above:
 * db.ts's SQLite fallback and convex/checkoutSessions.ts's
 * markCompleteOpenCommerceForLeadSkuCustomer each hand-implement this filter
 * rather than importing it. Exercised directly by this file's own Vitest only.
 */
export function openCommerceCheckoutSessionsToClose(
  sessions: readonly CheckoutSessionRecord[],
  opts: {
    leadSlug: string;
    skuId: string;
    customerEmail: string;
    exceptStripeSessionId: string;
  },
): CheckoutSessionRecord[] {
  const leadSlug = opts.leadSlug.trim();
  const skuId = opts.skuId.trim();
  const email = normalizeCheckoutCustomerEmailForMatch(opts.customerEmail);
  const exceptId = opts.exceptStripeSessionId.trim();
  if (!leadSlug || !skuId || !email || !exceptId) return [];
  return sessions.filter((session) => {
    if (session.leadSlug !== leadSlug) return false;
    if (session.status !== "open") return false;
    if (session.stripeSessionId === exceptId) return false;
    if (!isCommerceSkuCheckoutSession(session)) return false;
    if ((session.skuId ?? "").trim() !== skuId) return false;
    return normalizeCheckoutCustomerEmailForMatch(session.customerEmail) === email;
  });
}

/** Bundle (Local Site Studio plan) abandoned sessions due for recovery, oldest first. */
export function listAbandonedCheckoutsDue(
  sessions: CheckoutSessionRecord[],
  nowMs: number,
): CheckoutSessionRecord[] {
  return sessions
    .filter(isBundleCheckoutSession)
    .filter((session) => isRecoveryDue(session, nowMs))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/**
 * Lead slugs that may receive Commerce Buy now abandoned-cart recovery.
 * Reuses leadEligibleForCommerceCatalog so paused/canceled Commerce
 * subscribers (recurringCanceledAt) drop out of due queues the same way
 * create/sync/webhook already fail closed (#348–#350).
 */
export function leadSlugsEligibleForCommerceAbandonedRecovery(
  leads: ReadonlyArray<{ slug: string; stage: LeadPipelineStage }>,
  orders: ReadonlyArray<{
    leadSlug: string;
    commerceAddon: boolean;
    recurringCanceledAt?: number | null;
  }>,
): Set<string> {
  const ordersBySlug = new Map<
    string,
    Array<{
      commerceAddon: boolean;
      recurringCanceledAt?: number | null;
    }>
  >();
  for (const order of orders) {
    const list = ordersBySlug.get(order.leadSlug);
    if (list) {
      list.push(order);
    } else {
      ordersBySlug.set(order.leadSlug, [order]);
    }
  }
  const eligible = new Set<string>();
  for (const lead of leads) {
    if (leadEligibleForCommerceCatalog(lead, ordersBySlug.get(lead.slug) ?? [])) {
      eligible.add(lead.slug);
    }
  }
  return eligible;
}

/**
 * Commerce Buy now abandoned sessions due for recovery, oldest first.
 * Separate from listAbandonedCheckoutsDue — recovery links to preview#catalog,
 * not /checkout?tier=.
 *
 * `eligibleLeadSlugs` is required (build via leadSlugsEligibleForCommerceAbandonedRecovery)
 * — omit→allow-all would silently reopen paused/canceled Commerce recovery debt
 * while create-path 403s and the webhook skips (#352 twin harden).
 */
export function listCommerceAbandonedCheckoutsDue(
  sessions: CheckoutSessionRecord[],
  nowMs: number,
  eligibleLeadSlugs: ReadonlySet<string>,
): CheckoutSessionRecord[] {
  return sessions
    .filter(isCommerceSkuCheckoutSession)
    .filter((session) => isRecoveryDue(session, nowMs))
    .filter((session) => eligibleLeadSlugs.has(session.leadSlug))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/**
 * Oldest age in hours across a set of checkout sessions by createdAt, or
 * null if empty. Order-agnostic (safe on either an unsorted or
 * oldest-first list) and set-agnostic — pipeline-health.ts calls this with
 * the full abandoned set while the daily digest and dashboard panel call it
 * with the narrower recovery-due subset; pass whichever set that call site
 * already filters to rather than assuming this recomputes the filter.
 * Was duplicated as an inline loop/IIFE in pipeline-health.ts (x2) and
 * daily-digest.ts (x2) before being extracted here (abandoned-checkout-panels-staleness-signal).
 */
export function oldestCheckoutSessionAgeHours(
  sessions: ReadonlyArray<{ createdAt: string }>,
  nowMs: number,
): number | null {
  let oldestMs: number | null = null;
  for (const session of sessions) {
    const createdAtMs = Date.parse(session.createdAt);
    if (Number.isNaN(createdAtMs)) continue;
    if (oldestMs === null || createdAtMs < oldestMs) oldestMs = createdAtMs;
  }
  return oldestMs === null ? null : Math.max(0, Math.floor((nowMs - oldestMs) / HOUR_MS));
}
