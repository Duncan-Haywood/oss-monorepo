// Turnstile gate in front of Better Auth's bot-prone endpoints (mounted in routes/auth.ts, so it runs
// after the Origin check and authLimiter). Off when TURNSTILE_SECRET_KEY is unset and in APP_ENV=test.
//
// The SPA sends the widget token in the `x-turnstile-token` header. Non-SPA clients may put it in the
// body instead (`turnstileToken`, or Turnstile's own `cf-turnstile-response` form field). Failures
// answer in Better Auth's error shape ({ code, message }) so authClient surfaces the message, plus the
// app's usual { error: { code, message } }.
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { isHardened } from "../services/auth/auth";
import { turnstileEnabled, verifyTurnstile } from "../services/auth/turnstile";
import type { AppEnv } from "../types";
import { clientIp } from "./rate-limit";

export const TURNSTILE_TOKEN_HEADER = "x-turnstile-token";
const BODY_FIELDS = ["turnstileToken", "cf-turnstile-response"] as const;

/** Better Auth paths (below /api/auth) that need a token, with the widget action each form sets. */
export const TURNSTILE_PROTECTED_PATHS: Readonly<Record<string, string>> = {
  "/sign-up/email": "signup",
  "/sign-in/email": "login",
  "/forget-password": "forgot-password", // pre-1.4 name of request-password-reset
  "/request-password-reset": "forgot-password",
  "/send-verification-email": "resend-verification",
};

const AUTH_PREFIX = "/api/auth";

/** The protected endpoint this request targets (POST only), or null. */
export function turnstileActionFor(method: string, path: string): string | null {
  if (method !== "POST" || !path.startsWith(AUTH_PREFIX)) return null;
  const sub = path.slice(AUTH_PREFIX.length).replace(/\/+$/, "");
  return TURNSTILE_PROTECTED_PATHS[sub] ?? null;
}

async function tokenFrom(c: Context<AppEnv>): Promise<string | null> {
  const header = c.req.header(TURNSTILE_TOKEN_HEADER)?.trim();
  if (header) return header;
  // Read a clone: Better Auth reads c.req.raw itself afterwards.
  const type = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  try {
    if (type === "application/json") {
      const body: unknown = await c.req.raw.clone().json();
      if (body && typeof body === "object") {
        for (const f of BODY_FIELDS) {
          const v = (body as Record<string, unknown>)[f];
          if (typeof v === "string" && v.trim()) return v.trim();
        }
      }
    } else if (type === "application/x-www-form-urlencoded" || type === "multipart/form-data") {
      const form = await c.req.raw.clone().formData();
      for (const f of BODY_FIELDS) {
        const v = form.get(f);
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
  } catch {
    // Malformed body: no token. Better Auth reports the body error if we let it through (we don't).
  }
  return null;
}

function denied(c: Context<AppEnv>, unavailable: boolean) {
  const code = unavailable ? "TURNSTILE_UNAVAILABLE" : "TURNSTILE_FAILED";
  const message = unavailable
    ? "We couldn't run the security check right now. Please try again in a moment."
    : "The security check didn't pass. Please refresh the page and try again.";
  return c.json(
    { code, message, error: { code: code.toLowerCase(), message } },
    unavailable ? 503 : 403,
  );
}

export const turnstileGuard = createMiddleware<AppEnv>(async (c, next) => {
  const action = turnstileActionFor(c.req.method, c.req.path);
  if (!action || !turnstileEnabled(c.env)) return next();

  const result = await verifyTurnstile(await tokenFrom(c), clientIp(c), c.env, {
    expectedAction: action,
    expectedHostname: isHardened(c.env) ? new URL(c.env.APP_URL).hostname : undefined,
  });
  if (result.success) return next();

  // Never log the token or the IP.
  c.var.ctx?.logger.warn("auth.turnstile_failed", { action, errorCodes: result.errorCodes });
  const unavailable =
    result.errorCodes.includes("siteverify-unavailable") ||
    result.errorCodes.includes("internal-error");
  return denied(c, unavailable);
});
