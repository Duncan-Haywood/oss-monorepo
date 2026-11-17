import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/adminAuth";
import { agreementSummary, coverage, fastAnswerCutMs, fastAnswerers, fastBlockStarts, ratingsWithoutAnswers, groupRanking, paceSummary, parseDrop, rankingCsv, respondentAgreement, isFastAnswer, respondentPace, slotBlockAdvice, slotClickerAdvice, looseFastTurns, slotBlocksBackToTurns, slotFlags, slotRunsAtTurns } from "@/lib/groupRanking";
import { CHECKOUT_URL, VALIDATE_URL } from "@/lib/checkout";
import { reportGate } from "@/lib/reportAccess";
import { resultsReportHtml } from "@/lib/resultsReport";

/**
 * A survey's pooled ranking with 95% intervals and rank ranges. `?format=csv` downloads it.
 * `?drop=fast` leaves out respondents who answered in under half the typical time per pick, for comparison.
 * `?drop=fast-answers` keeps everyone and leaves out each answer given in under half the typical time,
 * rebuilding each person's ratings from the answers kept (groupRanking.ts, ratingsWithoutFastAnswers).
 * `?drop=fast-blocks` keeps everyone and leaves out what each person answered after turning quick
 * partway through, read against the panel's time at the same point in the session (groupRanking.ts, fastBlockStarts).
 * Always, whatever `drop` says: a respondent who started clicking one screen position partway through keeps the answers
 * before that run and loses the run (groupRanking.ts, slotBlockStarts); one who clicked a position all session without
 * such a run is left out whole (slotClickers).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const store = await cookies();
  if (!verifySessionToken(store.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { slug } = await params;
  const drop = parseDrop(req.nextUrl.searchParams.get("drop"));
  if (!drop.ok) return NextResponse.json({ error: 'drop must be "fast", "fast-answers", "fast-blocks" or absent' }, { status: 400 });
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
    // Time per pick: a note beside agreement (groupRanking.ts, paceSummary), and the ranking without the fast answerers on ?drop=fast.
    // In answer order, so ?drop=fast-answers can replay each person's ratings exactly as the answer route built them.
    const times = await prisma.trial.findMany({
      where: { result: { in: ["A", "B", "EQUAL"] }, participant: { survey: { slug } } },
      select: { participantId: true, msToAnswer: true, itemAId: true, itemBId: true, result: true },
      orderBy: [{ answeredAt: "asc" }, { id: "asc" }],
      take: 200000,
    });
    // A run of one-position clicks that starts partway: the answers before it count, the run does not (slotBlockStarts).
    // Whole-session clickers without such a run are left out whole, as before.
    const { whole: clickers, from: slotBlocks } = slotFlags(times.map((t) => ({ participantId: t.participantId, result: t.result! })), [...bySlot.values()]);
    const unclicked = clickers.size ? ratings.filter((r) => !clickers.has(r.participantId)) : ratings;
    const paces = respondentPace(times.filter((t) => !clickers.has(t.participantId)).map((t) => ({ participantId: t.participantId, ms: t.msToAnswer })));
    const fast = fastAnswerers(paces);
    const agreements = respondentAgreement(unclicked);
    const pace = paceSummary(paces, agreements);
    const cut = drop.fastAnswers ? fastAnswerCutMs(paces) : null;
    const inOrder = () => times.filter((t) => !clickers.has(t.participantId)).map((t) => ({ participantId: t.participantId, itemAId: t.itemAId, itemBId: t.itemBId, result: t.result!, ms: t.msToAnswer }));
    // Where someone turned quick (fastBlockStarts), their slots from that point on are tested as one named candidate
    // (slotRunsAtTurns): a lean there joins the slot blocks in the default ranking, cut from the turn. Honest slots are a
    // fair coin whatever the times say, so this adds at most SLOT_BLOCK_ALPHA honest flags however often the turn is wrong.
    // A slot run that starts after a turn (read without the wander bar, looseFastTurns) is cut from the turn instead
    // (slotBlocksBackToTurns): the coin-flip answers between the two go too, and nobody is flagged who was not already.
    const turns = fastBlockStarts(inOrder());
    const atTurns = slotRunsAtTurns(inOrder(), turns);
    const movedBack = slotBlocksBackToTurns(slotBlocks, looseFastTurns(inOrder()));
    for (const [id, at] of [...atTurns, ...movedBack]) slotBlocks.set(id, Math.min(at, slotBlocks.get(id) ?? Infinity));
    const blocks = drop.fastBlocks ? turns : null;
    const inSlotBlock = (a: { participantId: string }, i: number) => i >= (slotBlocks.get(a.participantId) ?? Infinity);
    const slotOnly = slotBlocks.size ? ratingsWithoutAnswers(inOrder(), inSlotBlock) : null;
    const slotDropped = slotOnly ? slotOnly.dropped : 0;
    const timeCut: ((a: { participantId: string; ms: number | null }, i: number) => boolean) | null = cut !== null
      ? (a) => isFastAnswer(a, cut)
      : blocks && blocks.size
        ? (a, i) => i >= (blocks.get(a.participantId) ?? Infinity)
        : null;
    const fastReplay = timeCut ? ratingsWithoutAnswers(inOrder(), timeCut) : null;
    // With slot blocks too, the time cut is replayed on top of them; `dropped` then counts only what the time cut added.
    const replayed = fastReplay && slotBlocks.size
      ? { ...ratingsWithoutAnswers(inOrder(), (a, i) => inSlotBlock(a, i) || timeCut!(a, i)), people: fastReplay.people }
      : fastReplay;
    if (replayed && replayed !== fastReplay) replayed.dropped -= slotDropped;
    // Everyone else keeps the ratings the answer route stored; only the people with a slot block are replayed.
    const base = slotOnly ? [...unclicked.filter((r) => !slotBlocks.has(r.participantId)), ...slotOnly.rows.filter((r) => slotBlocks.has(r.participantId))] : unclicked;
    const kept = replayed ? replayed.rows : drop.fast && fast.size ? base.filter((r) => !fast.has(r.participantId)) : base;
    const ranked = groupRanking(survey.items, kept);
    const leftOut = {
      slotClickers: clickers.size,
      slotBlocks: slotBlocks.size,
      slotBlockAnswers: slotDropped,
      slotBlocksAtTurns: atTurns.size,
      slotBlocksMovedBack: movedBack.size,
      fast: drop.fast ? fast.size : 0,
      fastAnswers: cut !== null && replayed ? replayed.dropped : 0,
      fastBlocks: blocks ? blocks.size : 0,
      advice: [
        slotClickerAdvice(clickers.size, survey._count.participants),
        slotBlockAdvice(slotBlocks.size, slotDropped),
        drop.fast && fast.size ? `${fast.size} fast ${fast.size === 1 ? "answerer is" : "answerers are"} left out of this ranking, as asked.` : "",
        cut !== null && replayed && replayed.dropped
          ? `${replayed.dropped} ${replayed.dropped === 1 ? "answer" : "answers"} given in under ${Math.round(cut! / 100) / 10} s (half the typical time per pick), from ${replayed.people} ${replayed.people === 1 ? "respondent" : "respondents"}, ${replayed.dropped === 1 ? "is" : "are"} left out of this ranking, as asked; everyone's other answers count.`
          : drop.fastAnswers && cut === null ? "Too few respondents have timed answers to judge a typical time per pick, so no answers are left out." : "",
        blocks && replayed && cut === null
          ? `${blocks.size} ${blocks.size === 1 ? "respondent" : "respondents"} answered at a normal pace and then turned much quicker than everyone else at the same point in the survey; the ${replayed.dropped} ${replayed.dropped === 1 ? "answer" : "answers"} they gave from then on ${replayed.dropped === 1 ? "is" : "are"} left out of this ranking, as asked, and their earlier answers count.`
          : drop.fastBlocks && blocks && blocks.size === 0 ? "Nobody turned unusually quick partway through (or too few respondents have enough timed answers to tell), so no answers are left out." : "",
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
