import { randomUUID } from "node:crypto";

/**
 * Content-Security-Policy, applied per-request from src/proxy.ts (Next 16
 * Proxy defaults to the Node.js runtime, unlike the old Edge-only
 * Middleware — see node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md#runtime) rather than next.config.ts's static
 * headers(), since the strict tier below needs a fresh nonce every request.
 * SECURITY_HEADERS (src/lib/security/security-headers.ts) deliberately left
 * CSP out of the sitewide static header set for exactly this reason.
 *
 * Two tiers, chosen per request by isNonceCspPath:
 *
 *  - STATIC_SAFE_CONTENT_SECURITY_POLICY: sent on every route NOT in the
 *    nonce tier (marketing/docs pages — statically generated at build time,
 *    per `npm run build`'s ○ routes). A per-request nonce can never reach
 *    pre-rendered HTML, so a nonce'd script-src there would permanently
 *    block Next's own framework hydration script on every static page.
 *    Deliberately omits default-src/script-src/style-src — an unset
 *    directive is unrestricted, matching this app's already-shipped
 *    no-CSP-at-all behavior for scripts, so static pages keep working
 *    unchanged — but still adds real, nonce-independent hardening this app
 *    never had before: object-src/base-uri/form-action/frame-ancestors.
 *  - buildNonceContentSecurityPolicy: the full strict policy (script-src +
 *    style-src scoped to 'nonce-<value>' + 'strict-dynamic', following
 *    Next's own documented pattern) for routes Next already renders
 *    dynamically per request — see isNonceCspPath. Proxy must fold the
 *    resulting header into the outgoing REQUEST's headers (not just the
 *    response) via NextResponse.next/rewrite's `request.headers` override,
 *    since Next reads the nonce back out of the request-side header during
 *    SSR to auto-apply it to its own framework/hydration scripts — setting
 *    it only on the response the browser receives is not enough.
 *
 * This app's only inline <script> tags are both
 * type="application/ld+json" (src/app/layout.tsx,
 * src/app/preview/[slug]/page.tsx, both via safeJsonLdScript). CSP's
 * script-src only governs elements the browser would actually execute as a
 * script — a JSON-LD data block is never executed, so the browser never
 * runs the script-src check against it, on either tier. Neither call site
 * needs the nonce threaded in for that reason (confirmed by grep for every
 * dangerouslySetInnerHTML / <script sink in the app before shipping this).
 *
 * buildNonceContentSecurityPolicy's default-src 'self' also governs
 * frame-src (no separate frame-src falls back to default-src per the CSP
 * spec), which would otherwise block /preview/[slug]'s cross-origin Google
 * Maps embed (src/components/preview/maps-embed.tsx) in a real browser —
 * curl-based verification of header presence alone cannot catch this, since
 * curl never enforces CSP or renders an iframe. An explicit frame-src
 * allowlists exactly that origin rather than leaving frame-src unrestricted.
 */

const SHARED_HARDENING_DIRECTIVES =
  "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

export const STATIC_SAFE_CONTENT_SECURITY_POLICY = SHARED_HARDENING_DIRECTIVES;

export function buildNonceContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const scriptSrc = `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`;
  const styleSrc = `style-src 'self' 'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // /preview/[slug]'s Google Maps embed (src/components/preview/maps-embed.tsx)
    // is a cross-origin iframe; with no frame-src, default-src 'self' blocks it.
    // maps.google.com 302s to www.google.com/maps for the embed response, so both
    // origins are allowlisted rather than relying on one redirect target.
    "frame-src 'self' https://www.google.com https://maps.google.com",
    SHARED_HARDENING_DIRECTIVES,
  ].join("; ");
}

export function generateCspNonce(): string {
  return Buffer.from(randomUUID()).toString("base64");
}

/**
 * Routes Next already renders dynamically per request (ƒ in `npm run
 * build`'s route list) — the only routes where a per-request nonce can
 * actually reach the rendered HTML. /dashboard is this app's most
 * sensitive surface (operator auth + every mutating action); /checkout is
 * the Stripe redirect target; /preview is per-lead HTML with inline
 * JSON-LD (JSON-LD itself doesn't need the nonce — see the module comment
 * — but the page as a whole is real per-request SSR).
 */
const NONCE_CSP_PATH_ROOTS = ["/dashboard", "/checkout", "/preview"] as const;

export function isNonceCspPath(pathname: string): boolean {
  return NONCE_CSP_PATH_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}
