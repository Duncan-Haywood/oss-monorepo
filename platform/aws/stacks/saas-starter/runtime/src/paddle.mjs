// Paddle Billing webhook verification and normalisation.
// Signature: header `Paddle-Signature: ts=<unix>;h1=<hex>[;h1=<hex>]` (several h1 while a
// secret rotates), HMAC-SHA256 over `<ts>:<raw body>` with the notification destination's
// secret key. Same scheme as ventures/webhook-relay/verify.mjs, kept dependency-free here.
import { createHmac, timingSafeEqual } from "node:crypto";

export const TOLERANCE_SEC = 300;

function eq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function signPaddle(secret, body, ts) {
  return `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`;
}

/** @returns {{ok: true} | {ok: false, reason: string}} */
export function verifyPaddle({ header, body, secret, nowSec = Math.floor(Date.now() / 1000) }) {
  if (!secret) return { ok: false, reason: "no secret configured" };
  const pairs = String(header || "").split(";").map((p) => p.trim().split("="));
  const ts = (pairs.find((p) => p[0] === "ts") || [])[1];
  const sigs = pairs.filter((p) => p[0] === "h1" && p[1]).map((p) => p[1]);
  if (!ts || !/^\d+$/.test(ts) || !sigs.length) return { ok: false, reason: "missing paddle-signature" };
  if (Math.abs(nowSec - Number(ts)) > TOLERANCE_SEC) return { ok: false, reason: "timestamp outside tolerance" };
  const want = createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex");
  return sigs.some((s) => eq(s, want)) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}

// Statuses that grant access. past_due keeps access while Paddle retries the card (dunning).
export const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Turns a verified Paddle notification into the message the entitlement consumer applies.
 * Returns null for events that do not change entitlements (they are still logged).
 * Checkout must pass customData `{ user_sub, product }` (Paddle copies it onto the subscription).
 */
export function toEntitlementMessage(event) {
  if (!event || typeof event !== "object" || !event.event_id || !event.event_type) {
    throw new Error("not a Paddle notification");
  }
  const base = { event_id: event.event_id, event_type: event.event_type, occurred_at: event.occurred_at, payload: event };
  if (!String(event.event_type).startsWith("subscription.")) return { ...base, entitlement: null };
  const s = event.data || {};
  const cd = s.custom_data || {};
  if (!cd.user_sub || !cd.product) return { ...base, entitlement: null, note: "subscription without customData.user_sub/product" };
  return {
    ...base,
    entitlement: {
      product: String(cd.product),
      user_sub: String(cd.user_sub),
      status: String(s.status || "unknown"),
      plan: s.items?.[0]?.price?.id ?? null,
      subscription_id: String(s.id),
      customer_id: s.customer_id ?? null,
      current_period_end: s.current_billing_period?.ends_at ?? null,
    },
  };
}
