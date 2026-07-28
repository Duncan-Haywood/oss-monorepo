import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Current user plus the participant ids their account owns, so a fresh
 * device can resume without anything in localStorage.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });

  const participants = await prisma.participant.findMany({
    where: { userId: user.id },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, perspective: true, survey: { select: { slug: true, title: true, kind: true } } },
  });

  // The most recently started session decides which perspective is being
  // resumed, and only participants from THAT perspective are handed back.
  // Mixing them would answer "what I want in a partner" in one domain and
  // "what I think they want" in the next, under one progress bar, and the
  // two rankings are supposed to be comparable — never merged.
  const perspective = participants[0]?.perspective ?? null;

  const bySlug: Record<string, string> = {};
  const domains: { slug: string; title: string; kind: string }[] = [];
  for (const p of participants) {
    if (p.perspective !== perspective) continue;
    if (bySlug[p.survey.slug]) continue;
    bySlug[p.survey.slug] = p.id;
    domains.push({ slug: p.survey.slug, title: p.survey.title, kind: p.survey.kind });
  }

  return NextResponse.json({
    user,
    participants: bySlug,
    surveys: domains,
    perspective,
  });
}
