import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, hashPassword, hashToken, passwordProblem } from "@/lib/auth";
import { isWriteRateLimited, recordWrite } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    if (await isWriteRateLimited(ip, "reset-password", 10)) {
      return NextResponse.json({ error: "Too many requests. Please wait a few minutes." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const { token, newPassword } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Invalid or missing reset token." }, { status: 400 });
    }

    const problem = passwordProblem(newPassword || "");
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    await recordWrite(ip, "reset-password");

    const tokenHash = hashToken(token);
    const resetRecord = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetRecord || resetRecord.usedAt || resetRecord.expiresAt < new Date()) {
      return NextResponse.json({ error: "Password reset link is invalid or has expired." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: resetRecord.email } });
    if (!user) {
      return NextResponse.json({ error: "Password reset link is invalid or has expired." }, { status: 400 });
    }

    const passwordHash = await hashPassword(newPassword);

    const changed = await prisma.$transaction(async (tx) => {
      // Claim the token atomically. Two concurrent submissions must not both
      // pass the read above and race to set different passwords.
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: resetRecord.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return false;

      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.userSession.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.deleteMany({
        where: { email: resetRecord.email, id: { not: resetRecord.id } },
      });
      return true;
    });

    if (!changed) {
      return NextResponse.json({ error: "Password reset link is invalid or has expired." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: "Password updated successfully. Please sign in." });
  } catch (err) {
    console.error("Reset password error:", err);
    return NextResponse.json({ error: "Couldn't reset password." }, { status: 500 });
  }
}
