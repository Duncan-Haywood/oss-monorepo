import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

/**
 * CSP for Worker responses. The API serves JSON and downloads, never pages, so nothing may load or run
 * in them. Routes that serve stored files set a stricter policy themselves (the document download adds
 * `sandbox`); that header is kept.
 */
export const API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/**
 * Headers shared with static assets. Keep these identical to public/_headers, which covers the SPA
 * shell and /assets/* (the Worker only runs for /api/*, or <BASE_PATH>/api/* in a prefixed build, see
 * `run_worker_first` in wrangler.jsonc and vite.config.ts; src/worker/http.ts also answers redirects).
 */
export const SHARED_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), geolocation=(), microphone=(self), payment=(), usb=(), browsing-topics=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

// No includeSubDomains: this app shares marisstella.app with the catalogue, whose policy is
// max-age=31536000 alone; a header sent from the apex would bind every subdomain.
export const HSTS = "max-age=31536000";

/**
 * Security headers for API responses. No CORS headers are ever sent: /api is same-origin only.
 * HSTS goes out in production and on any https request (browsers ignore it over plain http).
 */
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
 * CSRF defence for cookie-authenticated, state-changing requests: require the Origin header to
 * match APP_URL (or the request's own origin). Webhooks are mounted outside this middleware.
 */
export const originCheck = createMiddleware<AppEnv>(async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  const origin = c.req.header("Origin");
  if (!origin) return next(); // non-browser clients (no ambient cookies sent cross-site by browsers)
  const allowed = new Set([new URL(c.req.url).origin, new URL(c.env.APP_URL).origin]);
  if (!allowed.has(origin)) {
    return c.json({ error: { code: "bad_origin", message: "Cross-origin request blocked" } }, 403);
  }
  return next();
});
