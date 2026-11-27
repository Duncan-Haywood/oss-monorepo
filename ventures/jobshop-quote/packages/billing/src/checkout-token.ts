// Opaque checkout tokens (the only thing an app puts in a provider checkout's custom_data).
// Format: `<checkoutId>.<hex HMAC-SHA256(secret, "<checkoutId>|<orgId>")>`. The org is NOT in the
// token: the webhook loads the pending-checkout row by id and recomputes the MAC with that row's
// orgId, so a token cannot be re-pointed at another org and custom_data never names one.
import { hmacSha256Hex, timingSafeEqual } from "./crypto.ts";

/** custom_data key that carries the token (Paddle copies transaction custom_data to the subscription). */
export const CHECKOUT_TOKEN_KEY = "checkoutToken";

/** A checkout token is accepted for this long after the checkout was created. */
export const CHECKOUT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const ID_RE = /^pco_[0-9a-z]{20}$/;
const SIG_RE = /^[0-9a-f]{64}$/;
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

const macInput = (checkoutId: string, orgId: string) => `${checkoutId}|${orgId}`;

/** New random checkout id: `pco_` + 20 lowercase base-36 characters (CSPRNG). */
export function newCheckoutId(): string {
  let id = "pco_";
  while (id.length < 24) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      // 252 = 7 × 36: rejecting bytes ≥ 252 keeps every character uniform.
      if (b < 252 && id.length < 24) id += ALPHABET[b % 36];
    }
  }
  return id;
}

export const isCheckoutId = (id: string) => ID_RE.test(id);

export async function signCheckoutToken(
  secret: string,
  checkoutId: string,
  orgId: string,
): Promise<string> {
  if (!isCheckoutId(checkoutId)) throw new Error("checkout id must match pco_[0-9a-z]{20}");
  return `${checkoutId}.${await hmacSha256Hex(secret, macInput(checkoutId, orgId))}`;
}

/** Splits a well-formed token; null for anything else (never throws on attacker input). */
export function parseCheckoutToken(token: unknown): { checkoutId: string; sig: string } | null {
  if (typeof token !== "string" || token.length > 128) return null;
  const [checkoutId, sig, ...rest] = token.split(".");
  if (rest.length || !checkoutId || !sig || !ID_RE.test(checkoutId) || !SIG_RE.test(sig)) {
    return null;
  }
  return { checkoutId, sig };
}

/** True when `token` is a MAC over (its checkout id, `orgId`) under `secret`. */
export async function verifyCheckoutToken(
  secret: string,
  token: string,
  orgId: string,
): Promise<boolean> {
  const parsed = parseCheckoutToken(token);
  if (!parsed) return false;
  const expected = await hmacSha256Hex(secret, macInput(parsed.checkoutId, orgId));
  return timingSafeEqual(parsed.sig, expected);
}

/** The app's stored pending-checkout row, as far as token resolution needs it. */
export interface PendingCheckoutRow {
  id: string;
  orgId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  /** Subscription that consumed the checkout (set together with consumedAt). */
  providerSubscriptionId: string | null;
}

export type TokenResolution =
  | { ok: true; orgId: string; checkoutId: string }
  | {
      ok: false;
      reason: "invalid checkout token" | "expired checkout token" | "checkout token replay";
    };

/**
 * Decides whether `token` binds `providerSubscriptionId` to an org. The app looks the row up by
 * `parseCheckoutToken(token)?.checkoutId` (tenant-agnostic: it is the token that names the row) and
 * passes it here. Accepts an unconsumed, unexpired token, or one this same subscription already
 * consumed (a retried delivery). Does not consume: the app must then mark the row consumed
 * atomically (`WHERE id = ? AND (consumed_at IS NULL OR provider_subscription_id = ?)`) and ignore
 * the event as "checkout token replay" when that update matches no row.
 */
export async function resolveCheckoutToken(
  secret: string,
  token: string,
  row: PendingCheckoutRow | null | undefined,
  providerSubscriptionId: string,
  now: Date,
): Promise<TokenResolution> {
  const parsed = parseCheckoutToken(token);
  if (!parsed || !row || row.id !== parsed.checkoutId) {
    return { ok: false, reason: "invalid checkout token" };
  }
  if (!(await verifyCheckoutToken(secret, token, row.orgId))) {
    return { ok: false, reason: "invalid checkout token" };
  }
  if (row.consumedAt) {
    return row.providerSubscriptionId === providerSubscriptionId
      ? { ok: true, orgId: row.orgId, checkoutId: row.id }
      : { ok: false, reason: "checkout token replay" };
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired checkout token" };
  }
  return { ok: true, orgId: row.orgId, checkoutId: row.id };
}
