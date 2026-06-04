import { NextResponse } from "next/server";
import {
  getCookieName,
  getExpectedPassword,
  isAuthConfigured,
  sessionTokenForPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Authentication is not configured on this deployment." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password?.trim() ?? "";
  const expected = getExpectedPassword();

  if (!expected || password !== expected) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const token = sessionTokenForPassword(password);
  if (!token) {
    return NextResponse.json(
      { error: "DOCS_SESSION_SECRET must be set for cookie sessions." },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(getCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}
