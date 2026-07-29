import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyComparison, DEFAULT_GLICKO_STATE } from "@/lib/glicko2";
import { mayAccessOwnedParticipant } from "@/lib/participantAccess";

const VALID_RESULTS = new Set(["A", "B", "EQUAL"]);
const VALID_INTERACTIONS = new Set(["swipe", "card_tap", "button", "tie"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const trialId = typeof body?.trialId === "string" ? body.trialId : null;
  const result = typeof body?.result === "string" ? body.result : null;
  const interactionMethod =
    typeof body?.interactionMethod === "string" && VALID_INTERACTIONS.has(body.interactionMethod)
      ? body.interactionMethod
      : null;
  const clientMsToAnswer =
    Number.isInteger(body?.clientMsToAnswer) && body.clientMsToAnswer >= 0 && body.clientMsToAnswer <= 120_000
      ? body.clientMsToAnswer
      : null;

  if (!trialId || !result || !VALID_RESULTS.has(result)) {
    return NextResponse.json({ error: "trialId and a valid result are required" }, { status: 400 });
  }

  const trial = await prisma.trial.findUnique({
    where: { id: trialId },
    select: {
      id: true,
      participantId: true,
      itemAId: true,
      itemBId: true,
      shownAt: true,
      result: true,
      participant: { select: { userId: true } },
    },
  });
  if (!trial) {
    return NextResponse.json({ error: "Trial not found" }, { status: 404 });
  }
  if (!(await mayAccessOwnedParticipant(trial.participant.userId))) {
    return NextResponse.json({ error: "Trial not found" }, { status: 404 });
  }
  if (trial.result) {
    // Already recorded — treat as success so a retry after a flaky connection
    // doesn't wedge the client in a permanent 409 loop.
    return NextResponse.json({ ok: true, alreadyAnswered: true });
  }

  const now = new Date();
  const msToAnswer = now.getTime() - trial.shownAt.getTime();

  const prevAnswered = await prisma.trial.findFirst({
    where: { participantId: trial.participantId, result: { not: null } },
    orderBy: { answeredAt: "desc" },
    select: { answeredAt: true },
  });
  const msSincePrevAnswer = prevAnswered?.answeredAt
    ? now.getTime() - prevAnswered.answeredAt.getTime()
    : null;

  try {
    await prisma.$transaction(async (tx) => {
      // Claim the trial first. If another in-flight request already answered
      // it, count is 0 and we bail without touching any ratings — this is what
      // stops one answer being applied to the ratings twice.
      const claimed = await tx.trial.updateMany({
        where: { id: trialId, result: null },
        data: { result, answeredAt: now, msToAnswer, msSincePrevAnswer, interactionMethod, clientMsToAnswer },
      });
      if (claimed.count === 0) throw new AlreadyAnswered();

      // Read ratings inside the transaction so a concurrent answer on the same
      // item can't be silently overwritten by a stale read.
      const existing = await tx.participantItemRating.findMany({
        where: { participantId: trial.participantId, itemId: { in: [trial.itemAId, trial.itemBId] } },
      });
      const stateFor = (itemId: string) => {
        const r = existing.find((e) => e.itemId === itemId);
        return r ? { rating: r.rating, rd: r.rd, volatility: r.volatility } : DEFAULT_GLICKO_STATE;
      };
      const before = { a: stateFor(trial.itemAId), b: stateFor(trial.itemBId) };
      const after = applyComparison(before.a, before.b, result as "A" | "B" | "EQUAL");

      await tx.participantItemRating.upsert({
        where: { participantId_itemId: { participantId: trial.participantId, itemId: trial.itemAId } },
        update: after.a,
        create: { participantId: trial.participantId, itemId: trial.itemAId, ...after.a },
      });
      await tx.participantItemRating.upsert({
        where: { participantId_itemId: { participantId: trial.participantId, itemId: trial.itemBId } },
        update: after.b,
        create: { participantId: trial.participantId, itemId: trial.itemBId, ...after.b },
      });

      await tx.trial.update({
        where: { id: trialId },
        data: {
          itemARatingBefore: before.a.rating,
          itemBRatingBefore: before.b.rating,
          itemARdBefore: before.a.rd,
          itemBRdBefore: before.b.rd,
          itemARatingAfter: after.a.rating,
          itemBRatingAfter: after.b.rating,
          itemARdAfter: after.a.rd,
          itemBRdAfter: after.b.rd,
        },
      });

      await tx.participant.update({
        where: { id: trial.participantId },
        data: { lastSeenAt: now },
      });
    });
  } catch (err) {
    if (err instanceof AlreadyAnswered) {
      return NextResponse.json({ ok: true, alreadyAnswered: true });
    }
    console.error("trials/answer failed", err);
    return NextResponse.json({ error: "Could not save that answer" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

class AlreadyAnswered extends Error {}
