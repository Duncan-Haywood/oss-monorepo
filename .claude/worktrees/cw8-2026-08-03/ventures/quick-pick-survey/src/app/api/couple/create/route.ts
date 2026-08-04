import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { coupleFor, generateInviteCode } from "@/lib/couples";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const existing = await coupleFor(user.id);
    if (existing) {
      return NextResponse.json({
        inviteCode: existing.couple.inviteCode,
        partner: existing.partner,
      });
    }

    const couple = await prisma.couple.create({
      data: { inviteCode: generateInviteCode(), creatorId: user.id },
    });
    return NextResponse.json({ inviteCode: couple.inviteCode, partner: null });
  } catch (err) {
    console.error("couple/create failed", err);
    return NextResponse.json({ error: "Could not create an invite." }, { status: 500 });
  }
}
