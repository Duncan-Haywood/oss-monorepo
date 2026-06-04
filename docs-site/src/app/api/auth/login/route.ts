import { NextResponse } from "next/server";
import {
  TOKEN_SESSION_COOKIE,
  tokenSessionCookieOptions,
  signTokenSessionValue,
  verifyAccessToken,
} from "@/lib/auth";

export async function POST(request: Request) {
  const tokenEnv = process.env.DOCS_SITE_TOKEN?.trim();
  if (!tokenEnv) {
    return NextResponse.json(
      { error: "DOCS_SITE_TOKEN is not configured." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim() ?? "";
  if (!verifyAccessToken(token)) {
    return NextResponse.json({ error: "Invalid access token." }, { status: 401 });
  }

  const session = await signTokenSessionValue();
  if (!session) {
    return NextResponse.json({ error: "Unable to create session." }, { status: 500 });
  }

  const secure = request.url.startsWith("https://");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(TOKEN_SESSION_COOKIE, session, tokenSessionCookieOptions(secure));
  return response;
}
