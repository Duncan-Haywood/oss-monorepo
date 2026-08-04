import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { sanitizeRedirectPath } from "@/lib/redirect";

export async function GET(request: NextRequest) {
  const redirectTo = sanitizeRedirectPath(
    request.nextUrl.searchParams.get("redirect"),
  );

  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
