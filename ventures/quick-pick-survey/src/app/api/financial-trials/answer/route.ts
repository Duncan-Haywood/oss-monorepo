import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refitParticipant } from "@/lib/financialFit";
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

  const trial = await prisma.financialTrial.findUnique({
    where: { id: trialId },
    select: {
      id: true,
      participantId: true,
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
    // Already recorded — report success so a retry after a flaky connection
    // doesn't wedge the client in a permanent 409 loop.
    return NextResponse.json({ ok: true, alreadyAnswered: true });
  }

  const now = new Date();
  const msToAnswer = now.getTime() - trial.shownAt.getTime();

  const prevAnswered = await prisma.financialTrial.findFirst({
    where: { participantId: trial.participantId, result: { not: null } },
    orderBy: { answeredAt: "desc" },
    select: { answeredAt: true },
  });
  const msSincePrevAnswer = prevAnswered?.answeredAt ? now.getTime() - prevAnswered.answeredAt.getTime() : null;

  try {
    // Conditional claim: if a concurrent request already answered this trial,
    // count is 0 and we don't double-count it into the fitted model.
    const claimed = await prisma.financialTrial.updateMany({
      where: { id: trialId, result: null },
      data: { result, answeredAt: now, msToAnswer, msSincePrevAnswer, interactionMethod, clientMsToAnswer },
    });
    if (claimed.count === 0) {
      return NextResponse.json({ ok: true, alreadyAnswered: true });
    }

    await prisma.participant.update({
      where: { id: trial.participantId },
      data: { lastSeenAt: now },
    });
  } catch (err) {
    console.error("financial-trials/answer failed", err);
    return NextResponse.json({ error: "Could not save that answer" }, { status: 500 });
  }

  // Refit is throttled internally and must never fail the (already saved)
  // answer — a stale model is recoverable, a lost answer is not.
  try {
    await refitParticipant(trial.participantId);
  } catch (err) {
    console.error("refit after answer failed", err);
  }

  return NextResponse.json({ ok: true });
}
