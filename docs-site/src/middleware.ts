import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  TOKEN_SESSION_COOKIE,
  hasPasswordSession,
  hasProtectionBypass,
  isAuthConfigured,
  isPublicPath,
  tokenSessionCookieOptions,
  unauthorizedResponse,
  validateBasicAuth,
  passwordConfigured,
  tokenConfigured,
  verifyAccessToken,
  verifyTokenSessionValue,
} from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (hasProtectionBypass(request)) {
    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Docs site misconfigured: set DOCS_SITE_PASSWORD and/or DOCS_SITE_TOKEN.",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  if (hasPasswordSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (await verifyTokenSessionValue(request.cookies.get(TOKEN_SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    if (verifyAccessToken(token)) {
      return NextResponse.next();
    }
  }

  if (validateBasicAuth(authHeader)) {
    const response = NextResponse.next();
    const secret = process.env.DOCS_SITE_SESSION_SECRET?.trim();
    if (secret) {
      response.cookies.set(SESSION_COOKIE, secret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
    }
    return response;
  }

  if (tokenConfigured() && !passwordConfigured()) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return unauthorizedResponse();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
