import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  getClientIp,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordProblem,
  recordLoginAttempt,
} from "@/lib/auth";
import { isWriteRateLimited, recordWrite } from "@/lib/rateLimit";

const MAX_SIGNUPS_PER_IP = 8;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim().slice(0, 60) : "";

  if (!firstName) return NextResponse.json({ error: "What should we call you?" }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  const pwProblem = passwordProblem(password);
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });

  try {
    const ip = getClientIp(req.headers);
    if (await isWriteRateLimited(ip, "auth/signup", MAX_SIGNUPS_PER_IP)) {
      return NextResponse.json({ error: "Too many accounts created. Try again later." }, { status: 429 });
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: { email, firstName, passwordHash: await hashPassword(password) },
      select: { id: true, email: true, firstName: true },
    });

    await recordWrite(ip, "auth/signup");

    await recordLoginAttempt(email, ip, true);
    await createSession(user.id);

    return NextResponse.json({ user });
  } catch (err) {
    console.error("signup failed", err);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
