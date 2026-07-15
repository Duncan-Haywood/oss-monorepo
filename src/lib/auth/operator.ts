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

export function isOperatorAuthConfigured(): boolean {
  const password = process.env.OPERATOR_DASHBOARD_PASSWORD;
  return Boolean(password && password.trim().length > 0);
}

function getPassword(): string | null {
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
  if (!passwordsMatch(providedPassword.trim(), expected)) {
    return null;
  }
  return createOperatorSessionToken(expected);
}
