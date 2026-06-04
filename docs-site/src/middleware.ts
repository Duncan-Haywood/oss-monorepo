import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isAuthConfigured,
  unauthorizedResponse,
  validateBasicAuth,
} from "@/lib/auth";

export function middleware(request: NextRequest) {
  if (!isAuthConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Docs site misconfigured: set DOCS_SITE_PASSWORD in production.",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const session = request.cookies.get("docs_session")?.value;
  if (session === process.env.DOCS_SITE_SESSION_SECRET) {
    return NextResponse.next();
  }

  if (validateBasicAuth(request.headers.get("authorization"))) {
    const response = NextResponse.next();
    const secret = process.env.DOCS_SITE_SESSION_SECRET;
    if (secret) {
      response.cookies.set("docs_session", secret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
    }
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/api/health")) {
    return NextResponse.next();
  }

  return unauthorizedResponse();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
