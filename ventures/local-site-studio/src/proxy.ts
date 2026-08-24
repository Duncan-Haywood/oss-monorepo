import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  OPERATOR_SESSION_COOKIE,
  getPassword,
  verifyOperatorSessionToken,
} from "@/lib/auth/operator";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import {
  extractPreviewSubdomainSlug,
  isPlatformHost,
  isPlausibleCustomDomainHost,
  normalizeRequestHost,
} from "@/lib/deploy/custom-domain-routing";
import { productionRootDomain } from "@/lib/deploy/handoff";
import { getLeadBySlug, getLeadSlugByCustomDomain } from "@/lib/db";
import { leadPreviewPath } from "@/lib/leads/slug-path";
import {
  STATIC_SAFE_CONTENT_SECURITY_POLICY,
  buildNonceContentSecurityPolicy,
  generateCspNonce,
  isNonceCspPath,
} from "@/lib/security/content-security-policy";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/security/rate-limit";

type DashboardGate = { kind: "next" } | { kind: "redirect"; url: URL } | null;

function dashboardAuthGate(request: NextRequest, pathname: string): DashboardGate {
  if (pathname === "/dashboard/login" || pathname.startsWith("/dashboard/login/")) {
    return { kind: "next" };
  }

  // Trimmed secret only — login signs with getPassword(); raw env would
  // reject a valid cookie when OPERATOR_DASHBOARD_PASSWORD has surrounding
  // whitespace (operator-auth-proxy-password-trim / sibling 037c dual-claim).
  const password = getPassword();
  if (!password) {
    return { kind: "next" };
  }

  const token = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value;
  if (verifyOperatorSessionToken(token, password)) {
    return { kind: "next" };
  }

  // Bound next= before minting Location (login-next-path twin). Also drop
  // inherited query/hash from the protected URL so a multi-KB probe cannot
  // echo into the redirect (proxy-login-redirect-next-bound).
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/dashboard/login";
  loginUrl.search = "";
  loginUrl.hash = "";
  loginUrl.searchParams.set("next", safeNextPath(pathname));
  return { kind: "redirect", url: loginUrl };
}

/**
 * Content-Security-Policy must land on the REQUEST headers (not just the
 * response) so Next can read the nonce back out during SSR and auto-apply
 * it to its own framework/hydration scripts on the nonce tier — see
 * src/lib/security/content-security-policy.ts's module comment.
 */
function cspRequestHeaders(request: NextRequest, useNonceTier: boolean): { headers: Headers; contentSecurityPolicy: string } {
  const headers = new Headers(request.headers);
  const contentSecurityPolicy = useNonceTier
    ? buildNonceContentSecurityPolicy(generateCspNonce(), process.env.NODE_ENV === "development")
    : STATIC_SAFE_CONTENT_SECURITY_POLICY;
  headers.set("Content-Security-Policy", contentSecurityPolicy);
  return { headers, contentSecurityPolicy };
}

function nextWithCsp(request: NextRequest, useNonceTier: boolean): NextResponse {
  const { headers: requestHeaders, contentSecurityPolicy } = cspRequestHeaders(request, useNonceTier);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

function rewriteWithCsp(request: NextRequest, destination: URL, useNonceTier: boolean): NextResponse {
  const { headers: requestHeaders, contentSecurityPolicy } = cspRequestHeaders(request, useNonceTier);
  const response = NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

/**
 * Next.js 16 proxy (replaces deprecated middleware):
 *  - gate /dashboard/* when OPERATOR_DASHBOARD_PASSWORD is set (server
 *    actions still call requireOperatorAuth() — do not rely on proxy alone).
 *  - serve a lead's preview at the root path on its platform-owned preview
 *    subdomain (`{slug}.{productionRootDomain}`, the `suggestedHost` every
 *    deploy handoff already generates — Starter "Preview subdomain" promise)
 *    once that slug resolves to a real lead.
 *  - serve a lead's preview at the root path when the request Host is a
 *    client's own domain saved via "Save domain" on /dashboard/leads
 *    (Starter "... → custom domain handoff" promise). Only the exact root
 *    path is rewritten in both cases — /api/* and /dashboard/* already
 *    address leads by slug and are unaffected by Host.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const gate = dashboardAuthGate(request, pathname);
    if (gate?.kind === "redirect") {
      // A 3xx has no body to render — the CSP that matters is on the
      // follow-up request the browser makes to loginUrl, which is proxied
      // again from scratch.
      return NextResponse.redirect(gate.url);
    }
    if (gate?.kind === "next") {
      return nextWithCsp(request, true);
    }
  }

  if (pathname === "/") {
    const host = normalizeRequestHost(request.headers.get("host"));
    const root = productionRootDomain();
    // Length gates live in extractPreviewSubdomainSlug (public slug ceiling)
    // and getLeadSlugByCustomDomain (isPlausibleCustomDomainHost) so over-long
    // spoofed Host never burns CRM/Convex (proxy-host-lookup-field-length-cap).
    const previewSlug = extractPreviewSubdomainSlug(host, root);
    const isCustomDomainCandidate =
      !previewSlug && !isPlatformHost(host, root) && isPlausibleCustomDomainHost(host);
    if (previewSlug || isCustomDomainCandidate) {
      // Every Host reaching this point already passed its cheap length/shape
      // gate (extractPreviewSubdomainSlug / isPlausibleCustomDomainHost) but
      // still costs a real Convex/SQLite round trip on both a hit and a
      // miss — no valid slug/domain guess is required to trigger it. This
      // runs on literally every request to "/" (the proxy matcher's front
      // door), keyed purely on the attacker-controlled Host header, so
      // rate-limit BEFORE either DB lookup — same resource-exhaustion class
      // as preview-page-rate-limit / checkout-page-rate-limit, applied to
      // the one surface those sweeps didn't reach (proxy-host-route-rate-
      // limit). A throttled hit falls through to the ordinary marketing
      // homepage rather than erroring.
      const clientIp = clientIpFromHeaders(request.headers);
      const rate = checkRateLimit(`proxy-host-route:${clientIp}`);
      if (rate.allowed) {
        if (previewSlug) {
          const lead = await getLeadBySlug(previewSlug);
          if (lead) {
            // encode-at-use: keep rewrite target a single path segment even
            // if a legacy free-form slug somehow resolves (see
            // slug-path.ts). Rewrite target is always /preview/[slug]
            // regardless of the "/" request pathname, so the nonce tier
            // applies unconditionally here.
            return rewriteWithCsp(request, new URL(leadPreviewPath(previewSlug), request.url), true);
          }
        } else {
          const slug = await getLeadSlugByCustomDomain(host);
          if (slug) {
            return rewriteWithCsp(request, new URL(leadPreviewPath(slug), request.url), true);
          }
        }
      }
    }
  }

  return nextWithCsp(request, isNonceCspPath(pathname));
}

export const config = {
  // Run on every path except static assets/images and metadata files — the
  // custom-domain rewrite only acts on "/", but the matcher must include it
  // alongside /dashboard/:path* (previously the only match).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
