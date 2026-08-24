/**
 * Operator dashboard auth — shared-secret password + signed httpOnly cookie.
 * Used by proxy.ts (route gate) and dashboard server actions (defense in depth).
 *
 * When OPERATOR_DASHBOARD_PASSWORD is unset, auth is inactive (open dashboard)
 * so local demos work. Production must set the password before real lead data
 * or outbound sends — see /docs/launch-checklist.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const OPERATOR_SESSION_COOKIE = "lss_operator_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const SESSION_SUBJECT = "operator";

/**
 * Hard ceiling for client-supplied login passwords.
 *
 * Soft-cap is wrong (would change the secret). Rate limits blunt attempt
 * count (5/60s) but not per-attempt payload size — without this bound,
 * passwordsMatch allocates Buffer.from(provided) before the length-mismatch
 * short-circuit, so a public caller can force multi-MB allocations per try.
 * Legitimate operator secrets sit far below 256.
 */
export const MAX_OPERATOR_PASSWORD_LENGTH = 256;

/**
 * Hard ceiling for OPERATOR_SESSION_COOKIE values before HMAC / Buffer.from.
 *
 * Genuine tokens are `${expiresAt}.operator.${hmacSha256Base64url}` (~66 chars).
 * Soft-cap/truncate would change the opaque token. Login is rate-limited (5/60s)
 * but src/proxy.ts dashboardAuthGate verifies the cookie on every /dashboard/*
 * with no rate limit — without this bound a client can force multi-KB crypto
 * work per navigation. Mirror unsubscribe-token MAX=128 headroom.
 */
export const MAX_OPERATOR_SESSION_TOKEN_LENGTH = 128;

export function isOperatorAuthConfigured(): boolean {
  return getPassword() !== null;
}

/**
 * Trimmed OPERATOR_DASHBOARD_PASSWORD, or null when unset / whitespace-only.
 * Every verify/sign path (login action, requireOperatorAuth, proxy gate) must
 * use this — never raw process.env — so a secret-manager trailing space cannot
 * desync cookie signing from Host-gate verification.
 */
export function getPassword(): string | null {
  const raw = process.env.OPERATOR_DASHBOARD_PASSWORD;
  if (!raw || raw.length === 0) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function signPayload(payload: string, password: string): string {
  return createHmac("sha256", password).update(payload).digest("base64url");
}

export function createOperatorSessionToken(
  password: string,
  nowMs: number = Date.now(),
): string {
  const expiresAt = String(nowMs + SESSION_TTL_MS);
  const payload = `${expiresAt}.${SESSION_SUBJECT}`;
  const signature = signPayload(payload, password);
  return `${payload}.${signature}`;
}

export function verifyOperatorSessionToken(
  token: string | undefined | null,
  password: string,
  nowMs: number = Date.now(),
): boolean {
  if (!token) {
    return false;
  }

  // Hard-reject over-long cookies before HMAC / Buffer allocation.
  // Genuine createOperatorSessionToken values sit well under this ceiling.
  if (token.length > MAX_OPERATOR_SESSION_TOKEN_LENGTH) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [expiresAt, subject, signature] = parts;
  if (!expiresAt || !subject || !signature) {
    return false;
  }

  if (subject !== SESSION_SUBJECT) {
    return false;
  }

  const expiresMs = Number(expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs < nowMs) {
    return false;
  }

  const payload = `${expiresAt}.${subject}`;
  const expected = signPayload(payload, password);

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function passwordsMatch(provided: string, expected: string): boolean {
  // Bound before Buffer.from — rate limits blunt count, not payload size.
  if (provided.length > MAX_OPERATOR_PASSWORD_LENGTH) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still run a compare to reduce trivial timing leaks on length mismatch.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Cookie options shared by login action and logout. */
export function operatorSessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function sessionMaxAgeSeconds(): number {
  return Math.floor(SESSION_TTL_MS / 1000);
}

/**
 * True when the dashboard may be used:
 * - auth not configured (open demo mode), or
 * - valid signed session cookie present.
 */
export async function isOperatorAuthenticated(): Promise<boolean> {
  const password = getPassword();
  if (!password) {
    return true;
  }

  const jar = await cookies();
  const token = jar.get(OPERATOR_SESSION_COOKIE)?.value;
  return verifyOperatorSessionToken(token, password);
}

/**
 * For server actions: reject when password is configured but session is missing/invalid.
 */
export async function requireOperatorAuth(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const password = getPassword();
  if (!password) {
    return { ok: true };
  }

  const jar = await cookies();
  const token = jar.get(OPERATOR_SESSION_COOKIE)?.value;
  if (!verifyOperatorSessionToken(token, password)) {
    return {
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    };
  }
  return { ok: true };
}

export function tryCreateSessionFromPassword(providedPassword: string): string | null {
  const expected = getPassword();
  if (!expected) {
    return null;
  }
  // Reject over-long raw input before trim allocates a second giant string.
  // Soft-cap would change the secret; treat as wrong password (null token).
  if (providedPassword.length > MAX_OPERATOR_PASSWORD_LENGTH) {
    return null;
  }
  if (!passwordsMatch(providedPassword.trim(), expected)) {
    return null;
  }
  return createOperatorSessionToken(expected);
}
