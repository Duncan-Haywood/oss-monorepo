import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  isAuthConfigured,
  sessionCookieOptions,
  signSessionValue,
  verifyAccessToken,
} from "@/lib/auth";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "DOCS_SITE_TOKEN is not configured on the server." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim() ?? "";
  if (!verifyAccessToken(token)) {
    return NextResponse.json({ error: "Invalid access token." }, { status: 401 });
  }

  const session = await signSessionValue();
  if (!session) {
    return NextResponse.json({ error: "Unable to create session." }, { status: 500 });
  }

  const secure = request.url.startsWith("https://");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, session, sessionCookieOptions(secure));
  return response;
}
