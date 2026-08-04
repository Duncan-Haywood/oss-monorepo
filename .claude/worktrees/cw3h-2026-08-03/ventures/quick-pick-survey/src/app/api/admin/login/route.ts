import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  createSessionToken,
  getClientIp,
  isRateLimited,
  recordLoginAttempt,
  verifyAdminKey,
} from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key : "";
  const ip = getClientIp(req.headers);

  try {
    if (await isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });
    }

    if (!verifyAdminKey(key)) {
      await recordLoginAttempt(ip, false);
      return NextResponse.json({ error: "Wrong key." }, { status: 401 });
    }

    await recordLoginAttempt(ip, true);

    const store = await cookies();
    store.set(ADMIN_COOKIE_NAME, createSessionToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 12 * 60 * 60,
      priority: "high",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin login failed", err);
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  }
}
