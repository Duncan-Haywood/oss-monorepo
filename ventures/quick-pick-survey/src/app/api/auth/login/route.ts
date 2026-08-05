import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  absentAccountHash,
  createSession,
  getClientIp,
  isLoginRateLimited,
  normalizeEmail,
  recordLoginAttempt,
  verifyPassword,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const ip = getClientIp(req.headers);

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    if (await isLoginRateLimited(email, ip)) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // Always run a comparison so a missing account and a wrong password take
    // the same time — otherwise timing reveals which emails are registered.
    // The stand-in is derived from the same cost `hashPassword` is issuing, so
    // the two sides stay equal if that cost ever moves; a literal written down
    // here drifts from that cost and reopens the oracle it is closing. It is
    // awaited on every path, not only the unknown-account one, so its one-time
    // construction cannot itself become the signal.
    const absent = await absentAccountHash();
    const ok = await verifyPassword(password, user?.passwordHash ?? absent);

    if (!user || !ok) {
      await recordLoginAttempt(email, ip, false);
      return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
    }

    await recordLoginAttempt(email, ip, true);
    await createSession(user.id);

    return NextResponse.json({
      user: { id: user.id, email: user.email, firstName: user.firstName },
    });
  } catch (err) {
    console.error("login failed", err);
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  }
}
