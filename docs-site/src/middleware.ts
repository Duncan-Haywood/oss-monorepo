import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DOCS_SESSION_COOKIE,
  docsPasswordConfigured,
  getDocsPassword,
  isValidSessionToken,
} from "@/lib/auth-token";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/generated/")
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!docsPasswordConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Docs site is not configured for private access.", {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(DOCS_SESSION_COOKIE)?.value;
  const valid = await isValidSessionToken(getDocsPassword(), token);

  if (valid) {
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
