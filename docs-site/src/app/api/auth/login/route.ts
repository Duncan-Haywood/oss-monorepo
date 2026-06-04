import { NextResponse } from "next/server";
import {
  DOCS_SESSION_COOKIE,
  docsPasswordConfigured,
  getDocsPassword,
  sessionTokenForPassword,
} from "@/lib/auth-token";

export async function POST(request: Request) {
  if (!docsPasswordConfigured()) {
    return NextResponse.json(
      { error: "DOCS_SITE_PASSWORD is not configured on the server." },
      { status: 503 },
    );
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const password = body.password?.trim();
  const configured = getDocsPassword();
  if (!password || password !== configured) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const token = await sessionTokenForPassword(configured);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DOCS_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
