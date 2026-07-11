import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  OPERATOR_SESSION_COOKIE,
  isOperatorAuthConfigured,
  verifyOperatorSessionToken,
} from "@/lib/auth/operator";

/**
 * Next.js 16 proxy (replaces deprecated middleware) — gate /dashboard/*
 * when OPERATOR_DASHBOARD_PASSWORD is set. Login route stays public.
 * Server actions still call requireOperatorAuth() — do not rely on proxy alone.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/dashboard/login" || pathname.startsWith("/dashboard/login/")) {
    return NextResponse.next();
  }

  if (!isOperatorAuthConfigured()) {
    return NextResponse.next();
  }

  const password = process.env.OPERATOR_DASHBOARD_PASSWORD;
  if (!password) {
    return NextResponse.next();
  }

  const token = request.cookies.get(OPERATOR_SESSION_COOKIE)?.value;
  if (verifyOperatorSessionToken(token, password)) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/dashboard/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
