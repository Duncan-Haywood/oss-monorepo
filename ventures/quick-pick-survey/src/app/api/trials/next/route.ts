import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pairKey, selectNextPair, surveyConfidence } from "@/lib/pairing";
import { loadRatedItems } from "@/lib/participantRatings";
import { mayAccessOwnedParticipant } from "@/lib/participantAccess";
import { metadataForCard } from "@/lib/cardMetadata";

const RECENT_TRIALS_TO_AVOID = 10;

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

function cardPayload(item: {
  id: string; label: string; category: string | null; slug: string; dimensions: string[];
}) {
  const metadata = metadataForCard(item);
  return {
    id: item.id,
    label: item.label,
    category: item.category,
    slug: item.slug,
    meaning: {
      mayReflect: metadata.meaning.mayReflect,
      tradeoffs: metadata.meaning.tradeoffs,
      caveat: metadata.meaning.notNecessarily,
    },
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const participantId = typeof body?.participantId === "string" ? body.participantId : null;
  /**
   * The trial whose answer is in flight right now, if any.
   *
   * The client prefetches the next pair at the moment it accepts a tap, and
   * saves that tap in the background — so both requests are on the wire at
   * once and this one usually wins. Without this exclusion the pending-reuse
   * below matched the row being answered (still `result: null` for another
   * few milliseconds), handed the identical pair back, and the person answered
   * it a second time. `trials/answer` then replied `alreadyAnswered` with a
   * 200 and dropped that second answer on the floor. Every other vote was
   * discarded, silently, and the ratings were built from half the taps.
   */
  const answeringTrialId = typeof body?.answeringTrialId === "string" ? body.answeringTrialId : null;
  if (!participantId) {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }

  try {
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      select: { id: true, surveyId: true, userId: true },
    });
    if (!participant) {
      return NextResponse.json({ error: "Participant not found" }, { status: 404 });
    }
    if (!(await mayAccessOwnedParticipant(participant.userId))) {
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
        interactionMethod: null,
        shownAt: { gte: new Date(Date.now() - PENDING_REUSE_MS) },
        ...(answeringTrialId ? { id: { not: answeringTrialId } } : {}),
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
          itemA: cardPayload(a),
          itemB: cardPayload(b),
          answeredCount: answeredCountForPending,
          confidence: surveyConfidence(items),
          pending: true,
        });
      }
    }

    const answeredCount = answeredCountForPending;
    const [shownCounts, recentTrials] = await Promise.all([
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
    ]);

    const timesShown = new Map<string, number>();
    for (const row of shownCounts) {
      const n = row._count._all;
      timesShown.set(row.itemAId, (timesShown.get(row.itemAId) ?? 0) + n);
      timesShown.set(row.itemBId, (timesShown.get(row.itemBId) ?? 0) + n);
    }

    const recentPairKeys = new Set(recentTrials.map((t) => pairKey(t.itemAId, t.itemBId)));

    const [pickedA, pickedB] = selectNextPair({
      items: items.map((i) => ({
        id: i.id,
        rating: i.rating,
        rd: i.rd,
        category: i.category,
        dimensions: i.dimensions,
        sortOrder: i.sortOrder,
      })),
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
      itemA: cardPayload(itemA),
      itemB: cardPayload(itemB),
      answeredCount,
      confidence: surveyConfidence(items),
    });
  } catch (err) {
    console.error("trials/next failed", err);
    return NextResponse.json({ error: "Could not load the next question" }, { status: 500 });
  }
}
