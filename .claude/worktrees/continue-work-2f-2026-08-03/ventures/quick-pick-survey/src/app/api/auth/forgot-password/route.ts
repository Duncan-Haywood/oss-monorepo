import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getClientIp, hashToken, isValidEmail, normalizeEmail } from "@/lib/auth";
import { isWriteRateLimited, recordWrite } from "@/lib/rateLimit";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    if (await isWriteRateLimited(ip, "forgot-password", 10)) {
      return NextResponse.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email || "");

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    await recordWrite(ip, "forgot-password");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ ok: true, message: "If an account exists with that email, a password reset link has been generated." });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Only the newest link remains valid. This bounds stored tokens and makes
    // requesting a new link a reliable way to invalidate a misplaced one.
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { email } }),
      prisma.passwordResetToken.create({ data: { tokenHash, email, expiresAt } }),
    ]);

    const origin = process.env.APP_ORIGIN ?? "https://pairwise.marisstella.dev";
    const resetUrl = `${origin}/reset-password?token=${token}`;

    await sendPasswordResetEmail(email, resetUrl);

    return NextResponse.json({
      ok: true,
      message: "If an account exists with that email, a password reset link has been sent.",
      ...(process.env.NODE_ENV === "development" ? { resetUrl } : {}),
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return NextResponse.json({ error: "Couldn't process password reset." }, { status: 500 });
  }
}
