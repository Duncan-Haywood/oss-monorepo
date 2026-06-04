import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = new Set(["/api/health"]);

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="ShootFlow Private Docs"',
    },
  });
}

function isAuthorized(request: NextRequest): boolean {
  const bypass = process.env.DOCS_PROTECTION_BYPASS_SECRET;
  if (bypass && bypass.length > 0) {
    const headerBypass = request.headers.get("x-vercel-protection-bypass");
    const queryBypass = request.nextUrl.searchParams.get("x-vercel-protection-bypass");
    if (headerBypass === bypass || queryBypass === bypass) {
      return true;
    }
  }

  const password = process.env.DOCS_SITE_PASSWORD;
  if (!password || password.length === 0) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return false;
  }

  const encoded = auth.slice("Basic ".length);
  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }

  const colon = decoded.indexOf(":");
  const suppliedPassword = colon >= 0 ? decoded.slice(colon + 1) : decoded;
  return suppliedPassword === password;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
