/**
 * Operator dashboard auth — shared-secret password + signed httpOnly cookie.
 * Used by proxy.ts (route gate) and dashboard server actions (defense in depth).
 *
 * Three modes, decided by operatorAuthMode():
 *   enforced    — a usable OPERATOR_DASHBOARD_PASSWORD is set; a valid signed
 *                 session cookie is required.
 *   open-demo   — no usable password AND not a production build. The dashboard
 *                 is open so `next dev` demos work.
 *   locked-out  — no usable password in a production build. Everything is
 *                 denied. This is the fail-closed case: the alternative used to
 *                 be open-demo, which left all 28 CRM/billing/outreach server
 *                 actions and /api/stripe/bootstrap-prices world-callable on any
 *                 deploy that forgot the variable — the one mistake most likely
 *                 to be made, since .env.example ships it commented out.
 *
 * "Usable" reuses isOperatorAuthPasswordConfigured, so a documented paste
 * placeholder (changeme / password / secret …) counts as unset rather than as
 * protection. That makes the OperatorAuthEnvBanner's claim true of the gate and
 * not just of the banner.
 *
 * There is deliberately no environment variable that re-opens a production
 * deploy. A password is the only way out of locked-out.
 * See /docs/launch-checklist.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  type EnvLike,
  isOperatorAuthPasswordConfigured,
} from "./operator-auth-env-readiness";

export const OPERATOR_SESSION_COOKIE = "lss_operator_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const SESSION_SUBJECT = "operator";

export type OperatorAuthMode = "enforced" | "open-demo" | "locked-out";

/** Message shown wherever locked-out denies a request. Names the fix. */
export const OPERATOR_AUTH_LOCKED_OUT_MESSAGE =
  "Operator dashboard is disabled: set OPERATOR_DASHBOARD_PASSWORD to a real " +
  "secret and redeploy. It is unset or still a placeholder, and this is a " +
  "production build, so the dashboard fails closed rather than open.";

/** True for a production build (`next build` / `next start`), not dev or test. */
function isProductionBuild(env: EnvLike): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Which mode auth is operating in. Pure: pass an env map in tests.
 */
export function operatorAuthMode(env: EnvLike = process.env): OperatorAuthMode {
  if (isOperatorAuthPasswordConfigured(env.OPERATOR_DASHBOARD_PASSWORD)) {
    return "enforced";
  }
  return isProductionBuild(env) ? "locked-out" : "open-demo";
}

export function isOperatorAuthConfigured(env: EnvLike = process.env): boolean {
  return operatorAuthMode(env) === "enforced";
}

/**
 * The HMAC key, or null when no usable password is set. The raw value is the
 * key (login compares the same raw value); only the configured/placeholder
 * decision looks at the trimmed form.
 */
function getPassword(env: EnvLike = process.env): string | null {
  const password = env.OPERATOR_DASHBOARD_PASSWORD;
  if (!isOperatorAuthPasswordConfigured(password)) {
    return null;
  }
  return password as string;
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
 * - open-demo (no password, not a production build), or
 * - valid signed session cookie present.
 * False in locked-out.
 */
export async function isOperatorAuthenticated(): Promise<boolean> {
  const mode = operatorAuthMode();
  if (mode === "open-demo") {
    return true;
  }
  if (mode === "locked-out") {
    return false;
  }

  const password = getPassword() as string;
  const jar = await cookies();
  const token = jar.get(OPERATOR_SESSION_COOKIE)?.value;
  return verifyOperatorSessionToken(token, password);
}

/**
 * For server actions: reject when the session is missing/invalid, and reject
 * unconditionally in locked-out. Every mutating dashboard action funnels
 * through here, so this is the chokepoint that decides whether a misconfigured
 * production deploy is world-writable.
 */
export async function requireOperatorAuth(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const mode = operatorAuthMode();
  if (mode === "open-demo") {
    return { ok: true };
  }
  if (mode === "locked-out") {
    return { ok: false, error: OPERATOR_AUTH_LOCKED_OUT_MESSAGE };
  }

  const password = getPassword() as string;
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
  if (!passwordsMatch(providedPassword, expected)) {
    return null;
  }
  return createOperatorSessionToken(expected);
}
