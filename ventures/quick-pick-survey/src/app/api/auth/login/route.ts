import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  getClientIp,
  isLoginRateLimited,
  normalizeEmail,
  recordLoginAttempt,
  unknownAccountHash,
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
    // The stand-in hash is derived from the same cost factor real passwords
    // are hashed at (see `unknownAccountHash`); a literal written down here
    // drifts from that factor and reopens the oracle it is closing.
    const ok = await verifyPassword(password, user?.passwordHash ?? (await unknownAccountHash()));

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
