/**
 * Derive a trusted app base URL for links/redirects (outbound email hrefs,
 * Stripe billing-portal return_url) that must never trust a raw,
 * attacker-influenceable value verbatim — mirrors safeNextPath
 * (src/lib/auth/safe-next-path.ts) / isSameOriginReturnUrl
 * (src/app/api/stripe/billing-portal/route.ts).
 *
 * NEXT_PUBLIC_APP_URL is preferred when set. When unset, the fallback derives
 * from x-forwarded-host/host request headers — but those headers are not
 * URL-syntax-constrained the way a browser's own address bar is (a raw HTTP
 * client, or a misconfigured proxy that forwards them unchecked, can set
 * arbitrary header text), so the derived candidate is validated as a
 * well-formed absolute URL before use. Anything unparseable falls back to
 * the documented localhost default rather than being trusted verbatim into
 * outbound email HTML or a third-party API call.
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
  return "http://localhost:3000";
}
