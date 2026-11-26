import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/** The API serves JSON and downloads, never pages, so nothing may load or run in its responses. */
export const API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** Keep identical to public/_headers (the SPA shell). */
export const SHARED_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), geolocation=(), microphone=(), payment=(), usb=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export const HSTS = "max-age=31536000";

/** Security headers for API responses. No CORS headers are ever sent: /api is same-origin only. */
export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(SHARED_SECURITY_HEADERS)) c.header(name, value);
  if (!c.res.headers.has("Content-Security-Policy")) c.header("Content-Security-Policy", API_CSP);
  c.header("Cache-Control", c.res.headers.get("Cache-Control") ?? "no-store");
  if (c.env?.APP_ENV === "production" || new URL(c.req.url).protocol === "https:") {
    c.header("Strict-Transport-Security", HSTS);
  }
});

/**
 * CSRF defence for cookie-authenticated, state-changing requests: the Origin header, when present,
 * must match APP_URL or the request's own origin.
 */
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
