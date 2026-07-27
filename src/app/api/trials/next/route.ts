import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pairKey, selectNextPair, surveyConfidence } from "@/lib/pairing";
import { loadRatedItems } from "@/lib/participantRatings";

const RECENT_TRIALS_TO_AVOID = 10;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const participantId = typeof body?.participantId === "string" ? body.participantId : null;
  if (!participantId) {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { id: true, surveyId: true },
  });
  if (!participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  const items = await loadRatedItems(participantId, participant.surveyId);
  if (items.length < 2) {
    return NextResponse.json({ error: "Survey needs at least 2 items" }, { status: 400 });
  }

  const [shownCounts, recentTrials, answeredCount] = await Promise.all([
    prisma.trial.groupBy({
      by: ["itemAId", "itemBId"],
      where: { participantId },
      _count: { _all: true },
    }),
    prisma.trial.findMany({
      where: { participantId },
      orderBy: { shownAt: "desc" },
      take: RECENT_TRIALS_TO_AVOID,
      select: { itemAId: true, itemBId: true },
    }),
    prisma.trial.count({ where: { participantId, result: { not: null } } }),
  ]);

  const timesShown = new Map<string, number>();
  for (const row of shownCounts) {
    const n = row._count._all;
    timesShown.set(row.itemAId, (timesShown.get(row.itemAId) ?? 0) + n);
    timesShown.set(row.itemBId, (timesShown.get(row.itemBId) ?? 0) + n);
  }

  const recentPairKeys = new Set(recentTrials.map((t) => pairKey(t.itemAId, t.itemBId)));

  const [pickedA, pickedB] = selectNextPair({
    items: items.map((i) => ({ id: i.id, rating: i.rating, rd: i.rd, category: i.category })),
    timesShown,
    recentPairKeys,
    answeredCount,
  });
  // Randomize which slot (A/B, i.e. top/bottom on screen) each pick lands in,
  // so a real position bias can't creep into the ratings.
  const [aId, bId] = Math.random() < 0.5 ? [pickedA, pickedB] : [pickedB, pickedA];

  const [itemA, itemB] = [items.find((i) => i.id === aId)!, items.find((i) => i.id === bId)!];

  const trial = await prisma.trial.create({
    data: { participantId, itemAId: itemA.id, itemBId: itemB.id },
  });

  return NextResponse.json({
    trialId: trial.id,
    itemA: { id: itemA.id, label: itemA.label, category: itemA.category, slug: itemA.slug },
    itemB: { id: itemB.id, label: itemB.label, category: itemB.category, slug: itemB.slug },
    answeredCount,
    confidence: surveyConfidence(items),
  });
}
