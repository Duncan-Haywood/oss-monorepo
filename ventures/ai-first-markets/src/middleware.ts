import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  getCloudflareAccessAudience,
  getCloudflareAccessTeamDomain,
  isCloudflareAccessEnabled,
} from "@/lib/auth";
import { verifyCloudflareAccessJwt, verifySessionToken } from "@/lib/session";
import { sanitizeRedirectPath } from "@/lib/redirect";

// `"/"` matches the landing page only — the rule below is exact-or-prefix and
// the prefix form of `"/"` is `"//"`, which is not a path this app serves. It
// is public because it is the page `src/app/sitemap.ts` advertises at priority
// 1 and the page carrying the newsletter signup: while it was guarded, every
// prospective subscriber and every crawler was redirected to a login they
// could not pass. The research itself — /reports, /ideas, /market-map and the
// detail pages beneath them — stays guarded.
const PUBLIC_PATHS = ["/", "/login", "/api/auth", "/unauthorized", "/subscribe", "/api/subscribe"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Layer 1: Cloudflare Access JWT (when deployed behind Access)
  if (isCloudflareAccessEnabled()) {
    const cfJwt = request.headers.get("cf-access-jwt-assertion");
    const teamDomain = getCloudflareAccessTeamDomain();
    const audience = getCloudflareAccessAudience();

    if (cfJwt && teamDomain && audience) {
      const accessUser = await verifyCloudflareAccessJwt(
        cfJwt,
        teamDomain,
        audience,
      );
      if (accessUser) {
        return NextResponse.next();
      }
    }
  }

  // Layer 2: App session cookie (Google OAuth fallback for local dev)
  const sessionToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (sessionToken) {
    const session = await verifySessionToken(sessionToken);
    if (session) {
      return NextResponse.next();
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", sanitizeRedirectPath(pathname));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
