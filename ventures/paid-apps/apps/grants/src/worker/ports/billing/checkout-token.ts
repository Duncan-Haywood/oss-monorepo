// Opaque checkout tokens (the only thing we put in a provider checkout's custom_data).
// Format: `<checkoutId>.<hex HMAC-SHA256(secret, "<checkoutId>|<orgId>")>`. The org is NOT in the
// token: the webhook loads the pending_checkouts row by id and recomputes the MAC with that row's
// orgId, so a token cannot be re-pointed at another org and custom_data never names one.
import { hmacSha256Hex, timingSafeEqual } from "./crypto";

/** custom_data key that carries the token (Paddle copies transaction custom_data to the subscription). */
export const CHECKOUT_TOKEN_KEY = "checkoutToken";

const ID_RE = /^pco_[0-9a-z]{20}$/;
const SIG_RE = /^[0-9a-f]{64}$/;

const macInput = (checkoutId: string, orgId: string) => `${checkoutId}|${orgId}`;

export async function signCheckoutToken(
  secret: string,
  checkoutId: string,
  orgId: string,
): Promise<string> {
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
