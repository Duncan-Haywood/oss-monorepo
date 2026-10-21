import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/adminAuth";
import { coverage, groupRanking, rankingCsv } from "@/lib/groupRanking";

/** A survey's pooled ranking with 95% intervals and rank ranges. `?format=csv` downloads it. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { slug } = await params;
  try {
    const survey = await prisma.survey.findUnique({
      where: { slug },
      select: {
        title: true,
        items: { select: { id: true, label: true, category: true }, orderBy: { sortOrder: "asc" } },
        _count: { select: { participants: true } },
      },
    });
    if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    const ratings = await prisma.participantItemRating.findMany({
      where: { item: { survey: { slug } } },
      select: { itemId: true, rating: true, rd: true },
      take: 200000,
    });
    const ranked = groupRanking(survey.items, ratings);
    const answered = await prisma.trial.groupBy({
      by: ["participantId"],
      where: { result: { not: null }, participant: { survey: { slug } } },
      _count: { _all: true },
    });
    const perPerson = answered.map((a) => a._count._all).sort((a, b) => a - b);
    const mid = perPerson.length >> 1;
    const medianAnswers = perPerson.length === 0 ? undefined : perPerson.length % 2 ? perPerson[mid] : (perPerson[mid - 1] + perPerson[mid]) / 2;
    if (req.nextUrl.searchParams.get("format") === "csv") {
      return new NextResponse(rankingCsv(ranked), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${slug.replace(/[^a-z0-9-]/g, "")}-ranking.csv"`,
        },
      });
    }
    return NextResponse.json({ title: survey.title, participants: survey._count.participants, ranking: ranked, coverage: coverage(ranked, survey._count.participants, medianAnswers) });
  } catch (err) {
    console.error("admin/surveys ranking failed", err);
    return NextResponse.json({ error: "Could not compute the ranking" }, { status: 500 });
  }
}
