import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  OPERATOR_AUTH_LOCKED_OUT_MESSAGE,
  OPERATOR_SESSION_COOKIE,
  operatorAuthMode,
  verifyOperatorSessionToken,
} from "@/lib/auth/operator";
import {
  extractPreviewSubdomainSlug,
  isPlatformHost,
  normalizeRequestHost,
} from "@/lib/deploy/custom-domain-routing";
import { productionRootDomain } from "@/lib/deploy/handoff";
import { getLeadBySlug, getLeadSlugByCustomDomain } from "@/lib/db";

function dashboardAuthGate(request: NextRequest, pathname: string): NextResponse | null {
  const mode = operatorAuthMode();

  // Locked-out: a production build with no usable password. Deny the whole
  // dashboard, login included — /dashboard/login cannot mint a session without
  // a password, so letting it through would only redirect-loop. 503 with the
  // remedy is the honest answer.
  if (mode === "locked-out") {
    return new NextResponse(OPERATOR_AUTH_LOCKED_OUT_MESSAGE, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  if (pathname === "/dashboard/login" || pathname.startsWith("/dashboard/login/")) {
    return NextResponse.next();
  }

  if (mode === "open-demo") {
    return NextResponse.next();
  }

  const password = process.env.OPERATOR_DASHBOARD_PASSWORD as string;
  const token = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value;
  if (verifyOperatorSessionToken(token, password)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/dashboard/login";
  loginUrl.searchParams.set("next", pathname);
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
    const previewSlug = extractPreviewSubdomainSlug(host, root);
    if (previewSlug) {
      const lead = await getLeadBySlug(previewSlug);
      if (lead) {
        return NextResponse.rewrite(new URL(`/preview/${previewSlug}`, request.url));
      }
    } else if (!isPlatformHost(host, root)) {
      const slug = await getLeadSlugByCustomDomain(host);
      if (slug) {
        return NextResponse.rewrite(new URL(`/preview/${slug}`, request.url));
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
