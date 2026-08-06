import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getGoogleClientId, getGoogleClientSecret } from "@/lib/auth";
import { sanitizeRedirectPath } from "@/lib/redirect";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/login?error=oauth_not_configured", request.url),
    );
  }

  const rawRedirect = request.nextUrl.searchParams.get("redirect");
  const redirect = sanitizeRedirectPath(rawRedirect);
  const nonce = crypto.randomUUID();
  const state = `${nonce}:${redirect}`;

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const response = NextResponse.redirect(googleAuthUrl);
  response.cookies.set("oauth_state", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
