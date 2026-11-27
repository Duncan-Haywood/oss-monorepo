// Security headers + CSRF Origin check (same policy as apps/grants/src/worker/middleware/security.ts).
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  if (!c.res.headers.has("Content-Security-Policy")) c.header("Content-Security-Policy", API_CSP);
  c.header("Cache-Control", c.res.headers.get("Cache-Control") ?? "no-store");
  if (c.env?.APP_ENV === "production" || new URL(c.req.url).protocol === "https:") {
    c.header("Strict-Transport-Security", "max-age=31536000");
  }
});

/** State-changing requests with an Origin header must come from APP_URL or the request's origin. */
export const originCheck = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  const origin = c.req.header("Origin");
  if (!origin) return next();
  const allowed = new Set([new URL(c.req.url).origin, new URL(c.env.APP_URL).origin]);
  if (!allowed.has(origin)) {
    return c.json({ error: { code: "bad_origin", message: "Cross-origin request blocked" } }, 403);
  }
  return next();
});
