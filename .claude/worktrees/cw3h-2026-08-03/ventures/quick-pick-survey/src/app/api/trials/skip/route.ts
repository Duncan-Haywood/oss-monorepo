import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mayAccessOwnedParticipant } from "@/lib/participantAccess";

const MAX_CLIENT_MS = 120_000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const trialId = typeof body?.trialId === "string" ? body.trialId : null;
  const kind = body?.kind === "ITEMS" || body?.kind === "FINANCIAL" ? body.kind : null;
  const clientMsToAnswer =
    Number.isInteger(body?.clientMsToAnswer) &&
    body.clientMsToAnswer >= 0 &&
    body.clientMsToAnswer <= MAX_CLIENT_MS
      ? body.clientMsToAnswer
      : null;

  if (!trialId || !kind) {
    return NextResponse.json({ error: "trialId and kind are required" }, { status: 400 });
  }

  try {
    const trial =
      kind === "ITEMS"
        ? await prisma.trial.findUnique({
            where: { id: trialId },
            select: { participant: { select: { userId: true } } },
          })
        : await prisma.financialTrial.findUnique({
            where: { id: trialId },
            select: { participant: { select: { userId: true } } },
          });
    if (!trial || !(await mayAccessOwnedParticipant(trial.participant.userId))) {
      return NextResponse.json({ error: "Trial not found" }, { status: 404 });
    }

    const data = { interactionMethod: "skip", clientMsToAnswer };
    const claimed =
      kind === "ITEMS"
        ? await prisma.trial.updateMany({
            where: { id: trialId, result: null, interactionMethod: null },
            data,
          })
        : await prisma.financialTrial.updateMany({
            where: { id: trialId, result: null, interactionMethod: null },
            data,
          });

    return NextResponse.json({ ok: true, alreadyHandled: claimed.count === 0 });
  } catch (err) {
    console.error("trials/skip failed", err);
    return NextResponse.json({ error: "Could not record that skip" }, { status: 500 });
  }
}
