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
    orderBy: { createdAt: "desc" },
    select: { id: true, perspective: true, survey: { select: { slug: true, title: true, kind: true } } },
  });

  // Most recent participant per (perspective, survey) wins.
  const bySlug: Record<string, string> = {};
  const domains: { slug: string; title: string; kind: string }[] = [];
  for (const p of participants) {
    if (bySlug[p.survey.slug]) continue;
    bySlug[p.survey.slug] = p.id;
    domains.push({ slug: p.survey.slug, title: p.survey.title, kind: p.survey.kind });
  }

  return NextResponse.json({
    user,
    participants: bySlug,
    surveys: domains,
    perspective: participants[0]?.perspective ?? null,
  });
}
