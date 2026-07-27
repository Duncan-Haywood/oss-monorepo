import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { surveyConfidence } from "@/lib/pairing";
import { paramNames } from "@/lib/financialFit";
import { loadRatedItems } from "@/lib/participantRatings";

/** Guards against a huge map fanning out into thousands of concurrent queries. */
const MAX_ENTRIES = 20;

/** Read-only per-domain progress, used to seed the scheduler on resume without creating trial rows. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const participants = body?.participants;
  if (!participants || typeof participants !== "object" || Array.isArray(participants)) {
    return NextResponse.json({ error: "participants map is required" }, { status: 400 });
  }

  const entries = Object.entries(participants as Record<string, unknown>)
    .filter(([slug, id]) => typeof slug === "string" && typeof id === "string" && id.length <= 64)
    .slice(0, MAX_ENTRIES) as [string, string][];

  if (entries.length === 0) {
    return NextResponse.json({ status: {} });
  }

  const result: Record<string, { confidence: number; answeredCount: number }> = {};

  try {
    await Promise.all(
      entries.map(async ([slug, participantId]) => {
        const participant = await prisma.participant.findUnique({
          where: { id: participantId },
          select: { id: true, surveyId: true, survey: { select: { id: true, kind: true } } },
        });
        if (!participant) return;
        const survey = participant.survey;

        if (survey.kind === "ITEMS") {
          const [items, answeredCount] = await Promise.all([
            loadRatedItems(participantId, participant.surveyId),
            prisma.trial.count({ where: { participantId, result: { not: null } } }),
          ]);
          result[slug] = { confidence: surveyConfidence(items), answeredCount };
        } else {
          const targetTrials = paramNames(survey).length * 15;
          const answeredCount = await prisma.financialTrial.count({
            where: { participantId, result: { not: null } },
          });
          result[slug] = { confidence: Math.min(1, answeredCount / targetTrials), answeredCount };
        }
      })
    );
  } catch (err) {
    console.error("session/status failed", err);
    return NextResponse.json({ error: "Could not load progress" }, { status: 500 });
  }

  return NextResponse.json({ status: result });
}
