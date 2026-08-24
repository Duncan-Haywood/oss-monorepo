/**
 * Sitewide security response headers, applied via next.config.ts's
 * headers() to every route (marketing pages, /dashboard, /preview/[slug],
 * /api/*). Kept as a plain data module (not inline in next.config.ts) so it
 * has direct Vitest coverage — next.config.ts itself is loaded by Next's own
 * config loader, not this app's module graph, and isn't a place to put
 * logic that wants a test.
 *
 * Deliberately does NOT include Content-Security-Policy: a real CSP needs
 * either 'unsafe-inline' (defeats the point) or a per-request nonce, and
 * nonce-based CSP requires dynamic rendering to reach the page (see Next's
 * CSP guide) — this app's marketing/docs pages are static by default, so a
 * sitewide nonce'd CSP set here via next.config.ts's static headers() would
 * permanently block Next's own framework hydration script on every one of
 * them. CSP is instead set per-request from src/proxy.ts (see
 * src/lib/security/content-security-policy.ts), which can choose the
 * nonce tier only for routes Next actually renders per request
 * (/dashboard, /checkout, /preview) and a nonce-free-but-still-hardened
 * tier everywhere else — see NEXT_STEPS csp-nonce-rollout.
 */
export const SECURITY_HEADERS: Array<{ key: string; value: string }> = [
  // Clickjacking: nothing in this app embeds itself or is meant to be
  // embedded by another origin (the only iframe usage is this app
  // embedding Google Maps on /preview/[slug], not the reverse).
  { key: "X-Frame-Options", value: "DENY" },
  // Stop the browser guessing a Content-Type, e.g. treating an
  // operator-uploaded CSV or a lead-controlled string as executable/HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only origin (not full path/query — checkout/dashboard URLs can
  // carry ids) to a different origin; full URL for same-origin navigation.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Deny powerful browser features this app never uses client-side.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  // HSTS is inert over plain HTTP (e.g. local `next dev`) — safe to send
  // unconditionally; only takes effect once a browser has seen it over
  // HTTPS in production.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];
