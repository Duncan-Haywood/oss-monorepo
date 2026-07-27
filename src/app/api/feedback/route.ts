import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

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
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) || null : null;
  if (usefulness === null && enjoyment === null && !note) {
    return NextResponse.json({ error: "nothing to record" }, { status: 400 });
  }

  try {
    const user = await getSessionUser();
    await prisma.insightFeedback.create({
      data: { userId: user?.id ?? null, subject, usefulness, enjoyment, note },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("feedback failed", err);
    return NextResponse.json({ error: "Could not save that" }, { status: 500 });
  }
}
