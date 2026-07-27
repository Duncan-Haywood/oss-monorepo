import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refitParticipant } from "@/lib/financialFit";

/**
 * Tinder-style rewind for the most recent answer. For ITEMS surveys the
 * ratings are restored from the before-snapshot stored on the Trial, which
 * is exact — Glicko-2 isn't analytically invertible, so we rely on the
 * snapshot rather than trying to undo the math. Only the newest answer can
 * be undone, so a later trial can never depend on the state we roll back.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const participantId = typeof body?.participantId === "string" ? body.participantId : null;
  const kind = body?.kind === "FINANCIAL" || body?.kind === "CONJOINED" ? "FINANCIAL_LIKE" : "ITEMS";
  if (!participantId) {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }

  try {
    if (kind === "ITEMS") {
      const last = await prisma.trial.findFirst({
        where: { participantId, result: { not: null } },
        orderBy: { answeredAt: "desc" },
      });
      if (!last) return NextResponse.json({ error: "Nothing to undo" }, { status: 404 });

      await prisma.$transaction(async (tx) => {
        if (last.itemARatingBefore !== null && last.itemARdBefore !== null) {
          await tx.participantItemRating.update({
            where: { participantId_itemId: { participantId, itemId: last.itemAId } },
            data: { rating: last.itemARatingBefore, rd: last.itemARdBefore },
          });
        }
        if (last.itemBRatingBefore !== null && last.itemBRdBefore !== null) {
          await tx.participantItemRating.update({
            where: { participantId_itemId: { participantId, itemId: last.itemBId } },
            data: { rating: last.itemBRatingBefore, rd: last.itemBRdBefore },
          });
        }
        // Drop the trial entirely so it doesn't count as an abandoned
        // (shown-but-unanswered) row in the drop-rate metric.
        await tx.trial.delete({ where: { id: last.id } });
      });
    } else {
      const last = await prisma.financialTrial.findFirst({
        where: { participantId, result: { not: null } },
        orderBy: { answeredAt: "desc" },
      });
      if (!last) return NextResponse.json({ error: "Nothing to undo" }, { status: 404 });
      await prisma.financialTrial.delete({ where: { id: last.id } });
      // The conjoint model is fit from scratch off the remaining rows, so a
      // forced refit fully removes the undone answer's influence.
      await refitParticipant(participantId, { force: true });
    }
  } catch (err) {
    console.error("undo failed", err);
    return NextResponse.json({ error: "Could not undo" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
