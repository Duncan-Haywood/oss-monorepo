import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCookieName, isAuthConfigured, isAuthorizedRequest } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico")
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Docs site is locked: set DOCS_ACCESS_PASSWORD and DOCS_SESSION_SECRET in production.",
        { status: 503 },
      );
    }
    return NextResponse.next();
  }

  const cookieToken = request.cookies.get(getCookieName())?.value;
  const authorized = isAuthorizedRequest(cookieToken, request.headers.get("authorization"));

  if (authorized) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
