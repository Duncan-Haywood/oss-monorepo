import { timingSafeEqual } from "node:crypto";

/**
 * Shared CRON_SECRET bearer-token verification for every GET /api/cron/*
 * route — see operator-daily-digest-cron-automation (the first cron route,
 * src/app/api/cron/daily-digest/route.ts) and checkout-recovery-cron-automation
 * (src/app/api/cron/checkout-recovery/route.ts) in BUSINESS_DECISIONS.
 * Extracted so a second cron route can't drift from the first one's
 * constant-time, length-bounded compare.
 *
 * Vercel automatically sends CRON_SECRET as `Authorization: Bearer <secret>`
 * to any route named in vercel.json's "crons" array, when the env var is
 * named exactly CRON_SECRET.
 */

// Hard ceiling before Buffer.from/timingSafeEqual — mirrors
// MAX_OPERATOR_PASSWORD_LENGTH (src/lib/auth/operator.ts): rate-limiting
// blunts attempt count, not per-attempt payload size, and a genuine
// CRON_SECRET is a short generated token.
const MAX_CRON_SECRET_LENGTH = 256;

export function cronSecretMatches(provided: string, expected: string): boolean {
  if (provided.length > MAX_CRON_SECRET_LENGTH) {
    return false;
  }
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    // Still run a compare to reduce trivial timing leaks on length mismatch.
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/** Extracts the bearer token from an Authorization header, or "" if absent/malformed. */
export function extractBearerToken(headers: Headers): string {
  const authHeader = headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
}

/**
 * Verifies the request carries a valid CRON_SECRET bearer token against the
 * given expected secret (already resolved from process.env.CRON_SECRET by
 * the caller, so callers can distinguish "unset" from "wrong" first).
 */
export function verifyCronRequest(headers: Headers, expectedSecret: string): boolean {
  const provided = extractBearerToken(headers);
  return Boolean(provided) && cronSecretMatches(provided, expectedSecret);
}
