/**
 * Derive a trusted app base URL for links/redirects that must never trust a
 * raw, attacker-influenceable value verbatim — mirrors safeNextPath
 * (src/app/dashboard/login/actions.ts) / isSameOriginReturnUrl
 * (src/app/api/stripe/billing-portal/route.ts).
 *
 * Two resolvers, two threat models:
 *
 * - `resolveTrustedAppUrl` — operator-facing links (digest email hrefs) where
 *   NEXT_PUBLIC_APP_URL is preferred, and a well-formed header-derived Host
 *   is acceptable when unset. Rejects malformed / injection Host values.
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
  if (host) {
    const candidate = `${proto}://${host}`;
    try {
      new URL(candidate);
      return candidate;
    } catch {
      // Malformed header value — fall through to the safe default.
    }
  }
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
