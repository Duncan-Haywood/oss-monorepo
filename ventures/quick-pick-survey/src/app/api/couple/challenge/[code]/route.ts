import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { coupleFor } from "@/lib/couples";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const resolvedParams = await params;
  const rawCode = resolvedParams?.code || "";
  const code = rawCode.trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "Invalid challenge code." }, { status: 400 });
  }

  try {
    const challenge = await prisma.coupleChallenge.findUnique({
      where: { inviteCode: code },
      include: {
        challengerCouple: {
          include: {
            creator: { select: { id: true, firstName: true } },
            joiner: { select: { id: true, firstName: true } },
          },
        },
        challengedCouple: {
          include: {
            creator: { select: { id: true, firstName: true } },
            joiner: { select: { id: true, firstName: true } },
          },
        },
      },
    });

    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    }

    const challengerCreator = challenge.challengerCouple?.creator?.firstName || "Friend";
    const challengerJoiner = challenge.challengerCouple?.joiner?.firstName || "Partner";
    const challengerNames = `${challengerCreator} & ${challengerJoiner}`;

    const challengedNames = challenge.challengedCouple
      ? `${challenge.challengedCouple.creator?.firstName || "Friend"} & ${challenge.challengedCouple.joiner?.firstName || "Partner"}`
      : null;

    return NextResponse.json({
      inviteCode: challenge.inviteCode,
      deckId: challenge.deckId,
      createdAt: challenge.createdAt,
      isRedeemed: !!challenge.challengedCoupleId,
      challengerNames,
      challengedNames,
    });
  } catch (err) {
    console.error("GET /api/couple/challenge/[code] failed", err);
    return NextResponse.json({ error: "Could not retrieve challenge." }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const resolvedParams = await params;
  const rawCode = resolvedParams?.code || "";
  const code = rawCode.trim().toUpperCase();

  if (!code) {
    return NextResponse.json({ error: "Invalid challenge code." }, { status: 400 });
  }

  try {
    const userCouple = await coupleFor(user.id);
    if (!userCouple || !userCouple.couple || !userCouple.partner) {
      return NextResponse.json(
        { error: "You must be paired with a partner in a couple to accept a challenge." },
        { status: 400 }
      );
    }

    const challenge = await prisma.coupleChallenge.findUnique({
      where: { inviteCode: code },
    });

    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    }

    if (challenge.challengerCoupleId === userCouple.couple.id) {
      return NextResponse.json({ error: "You cannot accept your own challenge." }, { status: 400 });
    }

    if (challenge.challengedCoupleId && challenge.challengedCoupleId !== userCouple.couple.id) {
      return NextResponse.json(
        { error: "This challenge has already been accepted by another couple." },
        { status: 409 }
      );
    }

    const updated = await prisma.coupleChallenge.update({
      where: { id: challenge.id },
      data: { challengedCoupleId: userCouple.couple.id },
    });

    return NextResponse.json({
      ok: true,
      inviteCode: updated.inviteCode,
      deckId: updated.deckId,
    });
  } catch (err) {
    console.error("POST /api/couple/challenge/[code] failed", err);
    return NextResponse.json({ error: "Could not accept challenge." }, { status: 500 });
  }
}
