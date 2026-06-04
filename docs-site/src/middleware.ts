import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  credentialsMatch,
  loadDocsAuthConfig,
  parseBasicAuth,
} from "@/lib/auth";

export function middleware(request: NextRequest) {
  const config = loadDocsAuthConfig();
  if (!config?.enforce) {
    return NextResponse.next();
  }

  const provided = parseBasicAuth(request.headers.get("authorization"));
  if (credentialsMatch(provided, config)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="ShootFlow Private Docs"',
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
