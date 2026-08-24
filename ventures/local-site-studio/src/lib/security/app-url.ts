/**
 * Derive a trusted app base URL for links/redirects that must never trust a
 * raw, attacker-influenceable value verbatim — mirrors safeNextPath
 * (src/lib/auth/safe-next-path.ts) / isSameOriginReturnUrl
 * (src/app/api/stripe/billing-portal/route.ts).
 *
 * Two resolvers, two threat models:
 *
 * - `resolveTrustedAppUrl` — operator-facing links (digest email hrefs) where
 *   NEXT_PUBLIC_APP_URL is preferred, and a well-formed header-derived Host
 *   is acceptable when unset. Rejects malformed / injection Host values and
 *   non-http(s) x-forwarded-proto values (a bare `new URL()` success is not
 *   enough — `javascript:` and host-with-path candidates parse cleanly).
 *
 * - `resolveStripeRedirectAppUrl` — unauthenticated money redirects
 *   (Checkout success_url / cancel_url, Billing Portal return_url). Never
 *   trusts request Host / origin: when APP_URL is unset, an attacker who can
 *   influence Host (or the request URL) could mint a real Stripe session
 *   whose post-payment redirect lands on their origin, and could bypass
 *   billing-portal's same-origin returnUrl guard by making the comparison
 *   origin itself attacker-controlled. Precedence matches siteUrl()
 *   (src/lib/seo.ts): NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost — no
 *   header / request.url origin trust.
 */

const DEFAULT_APP_URL = "http://localhost:3000";

/**
 * Build an http(s) origin from header-derived proto + host, or null when the
 * pair is not a plain host-only http(s) URL. Rejects:
 * - non-http(s) schemes (javascript:, data:, …) even though `new URL` accepts them
 * - userinfo (`user@host`, `user:pass@host`)
 * - path / query / hash smuggled into the Host header (`evil.com/phish`)
 * - whitespace, control chars, backslashes
 *
 * Returns `url.origin` (scheme + host + non-default port only) so a sneaky
 * trailing path can never leak into digest hrefs.
 */
export function tryHeaderDerivedAppOrigin(
  protoRaw: string | null | undefined,
  hostRaw: string | null | undefined,
): string | null {
  if (hostRaw == null) return null;
  const host = hostRaw.trim();
  if (!host) return null;
  // Fast reject for characters that never belong in a Host header value and
  // that enable path/userinfo/injection smuggling when concatenated.
  if (/[\u0000-\u001f\u007f\s/@?#\\]/.test(host)) return null;

  const proto = (protoRaw ?? "http").trim().toLowerCase();
  if (proto !== "http" && proto !== "https") return null;

  let url: URL;
  try {
    url = new URL(`${proto}://${host}`);
  } catch {
    return null;
  }

  if (url.protocol !== `${proto}:`) return null;
  if (url.username || url.password) return null;
  // Host-only: any path beyond "/" means the "host" carried a path component.
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;

  return url.origin;
}

/**
 * Operator-facing base URL. Env wins; otherwise a well-formed
 * x-forwarded-host/host candidate; otherwise localhost.
 */
export function resolveTrustedAppUrl(
  headerStore: { get(name: string): string | null },
  envAppUrl: string | undefined,
): string {
  if (envAppUrl) return envAppUrl;

  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const origin = tryHeaderDerivedAppOrigin(proto, host);
  if (origin) return origin;
  return DEFAULT_APP_URL;
}

/**
 * Stripe redirect base URL for public Checkout / Billing Portal routes (and
 * the auth-gated openBillingPortalAction twin). Never reads request headers
 * or request.url — only env. Optional env bag keeps the helper unit-testable
 * without mutating process.env in every case.
 */
export function resolveStripeRedirectAppUrl(
  env: {
    NEXT_PUBLIC_APP_URL?: string;
    VERCEL_URL?: string;
  } = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  },
): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const vercelUrl = env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const host = vercelUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (host) return `https://${host}`;
  }

  return DEFAULT_APP_URL;
}
