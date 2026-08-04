import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { coupleFor } from "@/lib/couples";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = typeof body?.inviteCode === "string" ? body.inviteCode.trim().toUpperCase() : "";
  if (!code || code.length > 20) {
    return NextResponse.json({ error: "Enter the invite code." }, { status: 400 });
  }

  try {
    const existing = await coupleFor(user.id);
    if (existing?.partner) {
      return NextResponse.json({ error: "You're already linked with someone." }, { status: 409 });
    }

    const couple = await prisma.couple.findUnique({ where: { inviteCode: code } });
    if (!couple) return NextResponse.json({ error: "That code doesn't exist." }, { status: 404 });
    if (couple.creatorId === user.id) {
      return NextResponse.json({ error: "That's your own invite code." }, { status: 400 });
    }
    if (couple.joinerId) {
      return NextResponse.json({ error: "That invite has already been used." }, { status: 409 });
    }

    // Conditional update so two people racing the same code can't both join.
    const claimed = await prisma.couple.updateMany({
      where: { id: couple.id, joinerId: null },
      data: { joinerId: user.id, joinedAt: new Date() },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ error: "That invite has already been used." }, { status: 409 });
    }

    const partner = await prisma.user.findUnique({
      where: { id: couple.creatorId },
      select: { id: true, firstName: true },
    });
    return NextResponse.json({ ok: true, partner });
  } catch (err) {
    console.error("couple/join failed", err);
    return NextResponse.json({ error: "Could not join." }, { status: 500 });
  }
}
