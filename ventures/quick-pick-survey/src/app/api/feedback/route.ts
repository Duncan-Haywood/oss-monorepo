import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getClientIp, isWriteRateLimited, recordWrite } from "@/lib/rateLimit";
import { parsePerspective } from "@/lib/perspective";

/**
 * This route does not require an account, and should not: the feedback
 * widget is shown to someone answering signed out, which is exactly the
 * person whose opinion of the survey is worth having. `docs/ROUTES.md`
 * described it as account-only for several branches, which is how it kept
 * its place below the admin routes on the list of things to bound.
 *
 * So it needs the same per-IP limit every other anonymous write has. A
 * thousand characters of free text per row, unbounded, is both a way to
 * fill the database and — because `note` is exported to CSV and opened in
 * a spreadsheet — a way to put text in front of the account owner.
 *
 * Generous: rating an insight and leaving a note is two rows, and someone
 * working through a survey may do that many times in a sitting.
 */
const MAX_FEEDBACK_PER_IP = 60;
const REASONS = new Set(["too_obvious", "not_true", "too_vague", "not_actionable", "need_more_context"]);

function clampRating(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(1, Math.min(5, Math.round(v)));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject.slice(0, 60) : null;
  if (!subject) return NextResponse.json({ error: "subject is required" }, { status: 400 });

  const usefulness = clampRating(body?.usefulness);
  const enjoyment = clampRating(body?.enjoyment);
  const reason = typeof body?.reason === "string" && REASONS.has(body.reason) ? body.reason : null;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) || null : null;
  const answerCount = Number.isInteger(body?.answerCount) && body.answerCount >= 0 && body.answerCount <= 100_000
    ? body.answerCount
    : null;
  const perspective = parsePerspective(body?.perspective);
  const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 300) : null;
  if (usefulness === null && enjoyment === null && !note) {
    return NextResponse.json({ error: "nothing to record" }, { status: 400 });
  }

  try {
    const user = await getSessionUser();

    // Accounts are exempt: they are rate-limited at signup, and abuse from
    // one is attributable and revocable in a way an IP is not.
    if (!user) {
      const ip = getClientIp(req.headers);
      if (await isWriteRateLimited(ip, "feedback", MAX_FEEDBACK_PER_IP)) {
        return NextResponse.json({ error: "Thanks — that's plenty for now." }, { status: 429 });
      }
      await recordWrite(ip, "feedback");
    }

    await prisma.insightFeedback.create({
      data: { userId: user?.id ?? null, subject, usefulness, enjoyment, reason, note, answerCount, perspective, path },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("feedback failed", err);
    return NextResponse.json({ error: "Could not save that" }, { status: 500 });
  }
}
