import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getGoogleClientId,
  getGoogleClientSecret,
  isEmailAllowed,
} from "@/lib/auth";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from "@/lib/auth";
import { createSessionToken } from "@/lib/session";
import { sanitizeRedirectPath } from "@/lib/redirect";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/login?error=oauth_not_configured", request.url),
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const stateParam = request.nextUrl.searchParams.get("state");
  const stateCookie = request.cookies.get("oauth_state")?.value;

  let stateNonce = "";
  let rawRedirect = "/";
  if (stateParam) {
    const colonIndex = stateParam.indexOf(":");
    if (colonIndex !== -1) {
      stateNonce = stateParam.substring(0, colonIndex);
      rawRedirect = stateParam.substring(colonIndex + 1);
    } else {
      rawRedirect = stateParam;
    }
  }
  const redirect = sanitizeRedirectPath(rawRedirect);

  if (error) {
    const res = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, request.url),
    );
    res.cookies.delete("oauth_state");
    return res;
  }

  // Validate CSRF state token against the httpOnly cookie when stateNonce is present
  if (stateNonce && (!stateCookie || stateCookie !== stateNonce)) {
    const res = NextResponse.redirect(
      new URL("/login?error=csrf_mismatch", request.url),
    );
    res.cookies.delete("oauth_state");
    return res;
  }

  if (!code) {
    const res = NextResponse.redirect(new URL("/login?error=no_code", request.url));
    res.cookies.delete("oauth_state");
    return res;
  }

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(
      new URL("/login?error=token_exchange_failed", request.url),
    );
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    return NextResponse.redirect(
      new URL("/login?error=no_access_token", request.url),
    );
  }

  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResponse.ok) {
    return NextResponse.redirect(
      new URL("/login?error=userinfo_failed", request.url),
    );
  }

  const user = (await userResponse.json()) as {
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!isEmailAllowed(user.email)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  const sessionToken = await createSessionToken({
    email: user.email!,
    name: user.name,
    picture: user.picture,
  });

  const response = NextResponse.redirect(
    new URL(redirect, request.nextUrl.origin),
  );
  response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: "/",
  });
  response.cookies.delete("oauth_state");

  return response;
}
