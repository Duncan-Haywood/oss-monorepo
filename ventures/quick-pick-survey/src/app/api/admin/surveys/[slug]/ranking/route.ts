import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/adminAuth";
import { agreementSummary, coverage, fastAnswerers, groupRanking, paceSummary, parseDrop, rankingCsv, respondentAgreement, respondentPace, slotClickerAdvice, slotClickers } from "@/lib/groupRanking";
import { CHECKOUT_URL, VALIDATE_URL } from "@/lib/checkout";
import { reportGate } from "@/lib/reportAccess";
import { resultsReportHtml } from "@/lib/resultsReport";

/**
 * A survey's pooled ranking with 95% intervals and rank ranges. `?format=csv` downloads it.
 * `?drop=fast` leaves out respondents who answered in under half the typical time per pick, for comparison.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { slug } = await params;
  const drop = parseDrop(req.nextUrl.searchParams.get("drop"));
  if (!drop.ok) return NextResponse.json({ error: 'drop must be "fast" or absent' }, { status: 400 });
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
      select: { participantId: true, itemId: true, rating: true, rd: true },
      take: 200000,
    });
    // Respondents who clicked one screen position regardless of the options are left out (groupRanking.ts slotClickers).
    const slots = await prisma.trial.groupBy({
      by: ["participantId", "result"],
      where: { result: { in: ["A", "B"] }, participant: { survey: { slug } } },
      _count: { _all: true },
    });
    const bySlot = new Map<string, { participantId: string; first: number; second: number }>();
    for (const r of slots) {
      const c = bySlot.get(r.participantId) ?? { participantId: r.participantId, first: 0, second: 0 };
      if (r.result === "A") c.first += r._count._all;
      else c.second += r._count._all;
      bySlot.set(r.participantId, c);
    }
    const clickers = slotClickers([...bySlot.values()]);
    const unclicked = clickers.size ? ratings.filter((r) => !clickers.has(r.participantId)) : ratings;
    // Time per pick: a note beside agreement (groupRanking.ts, paceSummary), and the ranking without the fast answerers on ?drop=fast.
    const times = await prisma.trial.findMany({
      where: { result: { not: null }, participant: { survey: { slug } } },
      select: { participantId: true, msToAnswer: true },
      take: 200000,
    });
    const paces = respondentPace(times.filter((t) => !clickers.has(t.participantId)).map((t) => ({ participantId: t.participantId, ms: t.msToAnswer })));
    const fast = fastAnswerers(paces);
    const agreements = respondentAgreement(unclicked);
    const pace = paceSummary(paces, agreements);
    const kept = drop.fast && fast.size ? unclicked.filter((r) => !fast.has(r.participantId)) : unclicked;
    const ranked = groupRanking(survey.items, kept);
    const leftOut = {
      slotClickers: clickers.size,
      fast: drop.fast ? fast.size : 0,
      advice: [
        slotClickerAdvice(clickers.size, survey._count.participants),
        drop.fast && fast.size ? `${fast.size} fast ${fast.size === 1 ? "answerer is" : "answerers are"} left out of this ranking, as asked.` : "",
      ].filter(Boolean).join(" "),
    };
    // A data-quality note only: the ranking above counts everyone else equally (groupRanking.ts, agreementSummary).
    const agreement = agreementSummary(agreements);
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
    if (req.nextUrl.searchParams.get("format") === "report") {
      // Paid, dark until CHECKOUT_URL is set. Branding comes from query parameters the owner types.
      const gate = await reportGate(req.nextUrl.searchParams.get("key"), { checkoutUrl: CHECKOUT_URL, validateUrl: VALIDATE_URL });
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
      const q = req.nextUrl.searchParams;
      const html = resultsReportHtml(survey.title, ranked, coverage(ranked, survey._count.participants, medianAnswers), survey._count.participants, {
        agreement: [leftOut.advice, agreement.advice, pace.advice].filter(Boolean).join(" ") || undefined,
        name: q.get("name") ?? undefined, logo: q.get("logo") ?? undefined, colour: q.get("colour") ?? undefined, note: q.get("note") ?? undefined,
      });
      return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    return NextResponse.json({ title: survey.title, participants: survey._count.participants, ranking: ranked, coverage: coverage(ranked, survey._count.participants, medianAnswers), agreement, pace, leftOut });
  } catch (err) {
    console.error("admin/surveys ranking failed", err);
    return NextResponse.json({ error: "Could not compute the ranking" }, { status: 500 });
  }
}
