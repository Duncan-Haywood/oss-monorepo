import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { coupleFor, generateInviteCode } from "@/lib/couples";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const coupleInfo = await coupleFor(user.id);
    if (!coupleInfo || !coupleInfo.couple) {
      return NextResponse.json({ error: "You must be in a paired couple to challenge other couples." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const deckId = body.deckId || "core-values";

    // Reuse existing unredeemed challenge link if present
    const existing = await prisma.coupleChallenge.findFirst({
      where: {
        challengerCoupleId: coupleInfo.couple.id,
        challengedCoupleId: null,
        deckId,
      },
    });

    if (existing) {
      return NextResponse.json({
        inviteCode: existing.inviteCode,
        challengeUrl: `/couple/challenge/${existing.inviteCode}`,
        deckId: existing.deckId,
      });
    }

    const challenge = await prisma.coupleChallenge.create({
      data: {
        inviteCode: generateInviteCode(),
        challengerCoupleId: coupleInfo.couple.id,
        deckId,
      },
    });

    return NextResponse.json({
      inviteCode: challenge.inviteCode,
      challengeUrl: `/couple/challenge/${challenge.inviteCode}`,
      deckId: challenge.deckId,
    });
  } catch (err) {
    console.error("couple/challenge POST failed", err);
    return NextResponse.json({ error: "Could not create couple challenge." }, { status: 500 });
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const coupleInfo = await coupleFor(user.id);
    if (!coupleInfo || !coupleInfo.couple) {
      return NextResponse.json({ challengesSent: [], challengesReceived: [] });
    }

    const challengesSent = await prisma.coupleChallenge.findMany({
      where: { challengerCoupleId: coupleInfo.couple.id },
      include: {
        challengedCouple: {
          include: {
            creator: { select: { firstName: true } },
            joiner: { select: { firstName: true } },
          },
        },
      },
    });

    const challengesReceived = await prisma.coupleChallenge.findMany({
      where: { challengedCoupleId: coupleInfo.couple.id },
      include: {
        challengerCouple: {
          include: {
            creator: { select: { firstName: true } },
            joiner: { select: { firstName: true } },
          },
        },
      },
    });

    return NextResponse.json({ challengesSent, challengesReceived });
  } catch (err) {
    console.error("couple/challenge GET failed", err);
    return NextResponse.json({ error: "Could not fetch couple challenges." }, { status: 500 });
  }
}
