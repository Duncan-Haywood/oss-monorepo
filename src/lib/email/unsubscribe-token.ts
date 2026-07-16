/**
 * Signed tokens for the public GET /api/unsubscribe link.
 *
 * The link is embedded in plaintext in every outbound email footer
 * (src/lib/email/resend.ts) and the route it points to is unauthenticated
 * by necessity (recipients have no session) — without a signature, anyone
 * who merely knows an address (e.g. scraped from the same public listings
 * this platform's own CSV import targets) could suppress it from ever
 * receiving outreach, receipts, or the post-payment DNS handoff email.
 *
 * Signing key: RESEND_API_KEY when set (already a required production
 * secret for real sends — no new operator setup), else a fixed dev-only
 * fallback. When neither is meaningfully configured, sendEmail() only logs
 * a mock send (see resend.ts) and never reaches a real recipient, so the
 * fallback key never has to protect a link anyone actually receives.
 *
 * Length: HMAC-SHA256 digest as base64url is exactly 43 chars. Public
 * query tokens must hard-reject over MAX_UNSUBSCRIBE_TOKEN_LENGTH before
 * Buffer.from / timing-safe compare — rate limits blunt request count, not
 * per-request payload size. Soft-cap/truncate would break every genuine
 * footer link (opaque signed token, same class as billing-portal sessionId).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const DEV_FALLBACK_SECRET = "local-site-studio-dev-unsubscribe-secret";

/** HMAC-SHA256 base64url is 43 chars; 128 leaves headroom without allowing multi-KB probes. */
export const MAX_UNSUBSCRIBE_TOKEN_LENGTH = 128;

function signingSecret(): string {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey && resendKey.length > 0) {
    return resendKey;
  }
  return DEV_FALLBACK_SECRET;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function signUnsubscribeToken(email: string): string {
  return createHmac("sha256", signingSecret())
    .update(normalize(email))
    .digest("base64url");
}

export function verifyUnsubscribeToken(email: string, token: string | null): boolean {
  if (!token) {
    return false;
  }

  // Hard-reject over-long tokens before Buffer allocation / HMAC work.
  // Genuine footer tokens are always signUnsubscribeToken length (43).
  if (token.length > MAX_UNSUBSCRIBE_TOKEN_LENGTH) {
    return false;
  }

  const expected = signUnsubscribeToken(email);

  try {
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
