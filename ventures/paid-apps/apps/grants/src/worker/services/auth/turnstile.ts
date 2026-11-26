// Cloudflare Turnstile (bot protection on the auth forms). The SPA renders the widget
// (components/auth/turnstile.tsx) and sends its token; middleware/turnstile.ts verifies it here
// before Better Auth handles sign-up, sign-in, password reset and verification-email requests.
//
// Siteverify: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
// Tokens are single-use, valid for 300 s and at most 2048 characters. Only the backend may call
// siteverify (the secret never reaches the browser).
import type { Env } from "../../env";

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_TOKEN_MAX_LENGTH = 2048;
/** Give up on siteverify after this long (the request then fails closed). */
export const TURNSTILE_TIMEOUT_MS = 5_000;

export interface TurnstileResult {
  success: boolean;
  /** Siteverify `error-codes`, plus our own: `missing-input-response`, `hostname-mismatch`,
   * `action-mismatch`, `siteverify-unavailable`. */
  errorCodes: string[];
  hostname?: string;
  action?: string;
}

export interface VerifyTurnstileOptions {
  /** Reject a token solved on another hostname (recommended by Cloudflare). */
  expectedHostname?: string;
  /** Reject a token issued for another form (when the widget set an action). */
  expectedAction?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface SiteverifyResponse {
  success?: unknown;
  "error-codes"?: unknown;
  hostname?: unknown;
  action?: unknown;
}

/** Turnstile is enforced when a secret is configured, except in worker tests (APP_ENV=test). */
export function turnstileEnabled(env: Pick<Env, "APP_ENV" | "TURNSTILE_SECRET_KEY">): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY?.trim()) && env.APP_ENV !== "test";
}

const fail = (...errorCodes: string[]): TurnstileResult => ({ success: false, errorCodes });

/**
 * Verifies a Turnstile token with siteverify. Never throws: network errors, timeouts and malformed
 * answers come back as `success: false` (fail closed). Without a configured secret it fails with
 * `missing-input-secret`; callers decide whether Turnstile applies (see turnstileEnabled).
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string | null | undefined,
  env: Pick<Env, "TURNSTILE_SECRET_KEY">,
  opts: VerifyTurnstileOptions = {},
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return fail("missing-input-secret");
  const response = token?.trim();
  if (!response) return fail("missing-input-response");
  if (response.length > TURNSTILE_TOKEN_MAX_LENGTH) return fail("invalid-input-response");

  const body = new URLSearchParams({ secret, response });
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  let data: SiteverifyResponse;
  try {
    const res = await (opts.fetch ?? fetch)(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? TURNSTILE_TIMEOUT_MS),
    });
    if (!res.ok) return fail("siteverify-unavailable");
    data = (await res.json()) as SiteverifyResponse;
  } catch {
    return fail("siteverify-unavailable");
  }

  const errorCodes = Array.isArray(data["error-codes"])
    ? data["error-codes"].filter((c): c is string => typeof c === "string")
    : [];
  const hostname = typeof data.hostname === "string" ? data.hostname : undefined;
  const action = typeof data.action === "string" ? data.action : undefined;
  if (data.success !== true) {
    return { success: false, errorCodes: errorCodes.length ? errorCodes : ["unknown"], hostname };
  }
  if (opts.expectedHostname && hostname && hostname !== opts.expectedHostname) {
    return { success: false, errorCodes: ["hostname-mismatch"], hostname, action };
  }
  if (opts.expectedAction && action && action !== opts.expectedAction) {
    return { success: false, errorCodes: ["action-mismatch"], hostname, action };
  }
  return { success: true, errorCodes: [], hostname, action };
}
