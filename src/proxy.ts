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

function dashboardAuthGate(request: NextRequest, pathname: string): NextResponse | null {
  if (pathname === "/dashboard/login" || pathname.startsWith("/dashboard/login/")) {
    return NextResponse.next();
  }

  // Trimmed secret only — login signs with getPassword(); raw env would
  // reject a valid cookie when OPERATOR_DASHBOARD_PASSWORD has surrounding
  // whitespace (operator-auth-proxy-password-trim / sibling 037c dual-claim).
  const password = getPassword();
  if (!password) {
    return NextResponse.next();
  }

  const token = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value;
  if (verifyOperatorSessionToken(token, password)) {
    return NextResponse.next();
  }

  // Bound next= before minting Location (login-next-path twin). Also drop
  // inherited query/hash from the protected URL so a multi-KB probe cannot
  // echo into the redirect (proxy-login-redirect-next-bound).
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/dashboard/login";
  loginUrl.search = "";
  loginUrl.hash = "";
  loginUrl.searchParams.set("next", safeNextPath(pathname));
  return NextResponse.redirect(loginUrl);
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
    if (gate) return gate;
  }

  if (pathname === "/") {
    const host = normalizeRequestHost(request.headers.get("host"));
    const root = productionRootDomain();
    // Length gates live in extractPreviewSubdomainSlug (public slug ceiling)
    // and getLeadSlugByCustomDomain (isPlausibleCustomDomainHost) so over-long
    // spoofed Host never burns CRM/Convex (proxy-host-lookup-field-length-cap).
    const previewSlug = extractPreviewSubdomainSlug(host, root);
    if (previewSlug) {
      const lead = await getLeadBySlug(previewSlug);
      if (lead) {
        // encode-at-use: keep rewrite target a single path segment even if a
        // legacy free-form slug somehow resolves (see slug-path.ts).
        return NextResponse.rewrite(new URL(leadPreviewPath(previewSlug), request.url));
      }
    } else if (!isPlatformHost(host, root) && isPlausibleCustomDomainHost(host)) {
      // Plausible-host gate before DB (length ≤253 + label shape) — twin of
      // Save domain write validation; getLeadSlugByCustomDomain also checks.
      const slug = await getLeadSlugByCustomDomain(host);
      if (slug) {
        return NextResponse.rewrite(new URL(leadPreviewPath(slug), request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on every path except static assets/images and metadata files — the
  // custom-domain rewrite only acts on "/", but the matcher must include it
  // alongside /dashboard/:path* (previously the only match).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
