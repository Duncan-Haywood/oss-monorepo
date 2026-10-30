import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pairKey, selectNextPair, selectNextPairHybrid, surveyConfidence } from "@/lib/pairing";
import { loadRatedItems } from "@/lib/participantRatings";

const RECENT_TRIALS_TO_AVOID = 10;
/** Decided answers before a first-option share means anything (30 coin flips: sd 0.09). */
const FIRST_OPTION_MIN_DECIDED = 30;

/**
 * How long a shown-but-unanswered question stays the *same* question.
 *
 * A Trial row is created when a pair is shown and filled in when it is
 * answered, so unanswered rows are the abandonment metric. That only measures
 * abandonment if one row means one question someone actually saw and walked
 * away from — and this endpoint used to create a row on every call, so a
 * refresh, a back-button, or a crawler each added an "abandoned" question
 * nobody ever declined to answer.
 *
 * Within this window the pending question is handed back as-is: reloading the
 * page returns the pair already on screen instead of minting a new row. Past
 * it, the old row is left alone — someone who closed the tab and came back the
 * next day genuinely did abandon that question — and a fresh pair is chosen.
 */
const PENDING_REUSE_MS = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const participantId = typeof body?.participantId === "string" ? body.participantId : null;
  if (!participantId) {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }

  try {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      select: { id: true, surveyId: true, survey: { select: { pairSelector: true } } },
    });
    if (!participant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }

    const items = await loadRatedItems(participantId, participant.surveyId);
    if (items.length < 2) {
      return NextResponse.json({ error: "Survey needs at least 2 items" }, { status: 400 });
    }

    const answeredCountForPending = await prisma.trial.count({
      where: { participantId, result: { not: null } },
    });
    const pending = await prisma.trial.findFirst({
      where: {
        participantId,
        result: null,
        shownAt: { gte: new Date(Date.now() - PENDING_REUSE_MS) },
      },
      orderBy: { shownAt: "desc" },
      select: { id: true, itemAId: true, itemBId: true },
    });
    if (pending) {
      const a = items.find((i) => i.id === pending.itemAId);
      const b = items.find((i) => i.id === pending.itemBId);
      // Both should be present; if the survey's content changed under the
      // pending row, fall through and pick a fresh pair rather than 500.
      if (a && b) {
        return NextResponse.json({
          trialId: pending.id,
          itemA: { id: a.id, label: a.label, category: a.category, slug: a.slug },
          itemB: { id: b.id, label: b.label, category: b.category, slug: b.slug },
          answeredCount: answeredCountForPending,
          confidence: surveyConfidence(items),
          pending: true,
        });
      }
    }

    const answeredCount = answeredCountForPending;
    const [shownCounts, recentTrials, resultCounts] = await Promise.all([
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
      prisma.trial.groupBy({
        by: ["result"],
        where: { participantId, result: { in: ["A", "B"] } },
        _count: { _all: true },
      }),
    ]);
    const decided = resultCounts.reduce((n, r) => n + r._count._all, 0);
    const firstOptionShare = decided >= FIRST_OPTION_MIN_DECIDED
      ? (resultCounts.find((r) => r.result === "A")?._count._all ?? 0) / decided
      : undefined;

    const timesShown = new Map<string, number>();
    for (const row of shownCounts) {
      const n = row._count._all;
      timesShown.set(row.itemAId, (timesShown.get(row.itemAId) ?? 0) + n);
      timesShown.set(row.itemBId, (timesShown.get(row.itemBId) ?? 0) + n);
    }

    const recentPairKeys = new Set(recentTrials.map((t) => pairKey(t.itemAId, t.itemBId)));

    // "staged": shipped selector for the first 120 answers, then the
    // information score (docs/INFORMATION-GAIN-SELECTOR.md). The survey's own
    // setting wins; unset follows PAIR_SELECTOR. Off by default.
    const selector = participant.survey.pairSelector ?? process.env.PAIR_SELECTOR;
    const choosePair = selector === "staged" ? selectNextPairHybrid : selectNextPair;
    const [pickedA, pickedB] = choosePair({
      items: items.map((i) => ({ id: i.id, rating: i.rating, rd: i.rd, category: i.category, dimensions: i.dimensions })),
      timesShown,
      recentPairKeys,
      answeredCount,
      firstOptionShare,
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
  } catch (err) {
    console.error("trials/next failed", err);
    return NextResponse.json({ error: "Could not load the next question" }, { status: 500 });
  }
}
