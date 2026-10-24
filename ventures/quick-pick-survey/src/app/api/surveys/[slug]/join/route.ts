import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, isWriteRateLimited, recordWrite } from "@/lib/rateLimit";

/** One anonymous Participant row per call, so cap what one address can mint. */
const MAX_JOINS_PER_IP = 40;

/**
 * Starts an anonymous respondent on one admin-made survey (shared at
 * /s/[slug]). `session/start` creates a participant in every survey for the
 * unified flow; a shared link needs exactly one, with no name asked.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const survey = await prisma.survey.findUnique({
      where: { slug },
      select: { id: true, kind: true, _count: { select: { items: true } } },
    });
    if (!survey || survey.kind !== "ITEMS") {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }
    if (survey._count.items < 2) {
      return NextResponse.json({ error: "Survey needs at least 2 items" }, { status: 400 });
    }

    const ip = getClientIp(req.headers);
    if (await isWriteRateLimited(ip, "surveys/join", MAX_JOINS_PER_IP)) {
      return NextResponse.json({ error: "Too many sessions started. Try again shortly." }, { status: 429 });
    }
    await recordWrite(ip, "surveys/join");

    const participant = await prisma.participant.create({
      data: { surveyId: survey.id, firstName: "Anonymous" },
      select: { id: true },
    });
    return NextResponse.json({ participantId: participant.id }, { status: 201 });
  } catch (err) {
    console.error("surveys/[slug]/join failed", err);
    return NextResponse.json({ error: "Could not start the survey" }, { status: 500 });
  }
}
