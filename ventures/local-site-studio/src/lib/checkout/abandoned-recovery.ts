/**
 * Pure logic for the checkout-abandoned-recovery backlog item — mirrors the
 * shape of src/lib/email/outreach-followups.ts so the two due-queues read
 * the same way on the dashboard.
 *
 * Bundle vs commerce_sku sessions share timing helpers but must never share
 * recovery emails or Work next cart boosts — see checkoutSessionKind.
 */

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
 * Commerce Buy now abandoned sessions due for recovery, oldest first.
 * Separate from listAbandonedCheckoutsDue — recovery links to preview#catalog,
 * not /checkout?tier=.
 */
export function listCommerceAbandonedCheckoutsDue(
  sessions: CheckoutSessionRecord[],
  nowMs: number,
): CheckoutSessionRecord[] {
  return sessions
    .filter(isCommerceSkuCheckoutSession)
    .filter((session) => isRecoveryDue(session, nowMs))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
