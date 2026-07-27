import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadRatedItems } from "@/lib/participantRatings";
import { confidenceInterval95 } from "@/lib/glicko2";
import { answersUntilNextLevel, INSIGHTS, levelForAnswers } from "@/lib/insights";
import { RANGES } from "@/lib/financialProfiles";
import { describeDimensions, scoreDimensions } from "@/lib/dimensions";
import { computeTradeOffs, describeTradeOff, HeadToHead } from "@/lib/tradeoffs";

const MAX_ENTRIES = 20;

type RankedItem = {
  label: string;
  category: string | null;
  rating: number;
  rd: number;
  lo: number;
  hi: number;
  dimensions: string[];
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const participants = body?.participants;
  if (!participants || typeof participants !== "object" || Array.isArray(participants)) {
    return NextResponse.json({ error: "participants map is required" }, { status: 400 });
  }
  const entries = Object.entries(participants as Record<string, unknown>)
    .filter(([slug, id]) => typeof slug === "string" && typeof id === "string" && id.length <= 64)
    .slice(0, MAX_ENTRIES) as [string, string][];
  if (entries.length === 0) return NextResponse.json({ error: "no participants" }, { status: 400 });

  try {
    let ranked: RankedItem[] = [];
    let totalAnswers = 0;
    let fitParams: { name: string; value: number; se: number }[] | null = null;
    let fitNTrials = 0;
    const headToHead: HeadToHead[] = [];

    for (const [, participantId] of entries) {
      const participant = await prisma.participant.findUnique({
        where: { id: participantId },
        select: { id: true, surveyId: true, survey: { select: { kind: true } } },
      });
      if (!participant) continue;

      if (participant.survey.kind === "ITEMS") {
        const [items, answered, decided] = await Promise.all([
          loadRatedItems(participantId, participant.surveyId),
          prisma.trial.count({ where: { participantId, result: { not: null } } }),
          prisma.trial.findMany({
            where: { participantId, result: { not: null } },
            select: {
              result: true,
              itemA: { select: { dimensions: true } },
              itemB: { select: { dimensions: true } },
            },
            take: 3000,
          }),
        ]);
        totalAnswers += answered;
        for (const i of items) {
          if (i.rd >= 349) continue; // never actually shown — no signal
          const [lo, hi] = confidenceInterval95(i.rating, i.rd);
          ranked.push({
            label: i.label,
            category: i.category,
            rating: i.rating,
            rd: i.rd,
            lo,
            hi,
            dimensions: i.dimensions ?? [],
          });
        }
        for (const t of decided) {
          headToHead.push({
            aDimensions: t.itemA.dimensions,
            bDimensions: t.itemB.dimensions,
            result: t.result!,
          });
        }
      } else {
        const answered = await prisma.financialTrial.count({
          where: { participantId, result: { not: null } },
        });
        totalAnswers += answered;
        const fit = await prisma.surveyFit.findUnique({ where: { participantId } });
        if (fit && fit.nTrials > fitNTrials) {
          fitParams = fit.params as { name: string; value: number; se: number }[];
          fitNTrials = fit.nTrials;
        }
      }
    }

    // De-duplicate labels (the "combined" survey repeats items from the
    // others), keeping whichever copy is most certain.
    const byLabel = new Map<string, RankedItem>();
    for (const r of ranked) {
      const prev = byLabel.get(r.label);
      if (!prev || r.rd < prev.rd) byLabel.set(r.label, r);
    }
    ranked = [...byLabel.values()].sort((a, b) => b.rating - a.rating);

    // ---------------------------------------------------------------------
    // Everything below is computed unconditionally. An insight appears the
    // moment its OWN data supports it — there is no level gate. Each block
    // carries its own readiness test, so nothing is withheld that the
    // numbers could already answer.
    // ---------------------------------------------------------------------
    const content: Record<string, unknown> = {};

    if (ranked.length >= 2) {
      // A "#1" is only meaningful if the leader is measurably clear of the
      // runner-up; otherwise it's just whichever way the noise fell.
      const [first, second] = ranked;
      if (first.rating - second.rating > 0.5 * first.rd) content["top-pick"] = first;

      const last = ranked[ranked.length - 1];
      const penultimate = ranked[ranked.length - 2];
      if (penultimate.rating - last.rating > 0.5 * last.rd) content["bottom-pick"] = last;
    }

    if (ranked.length >= 5) {
      content["top-three"] = ranked.slice(0, ranked.length >= 12 ? 5 : 3);
    }

    if (ranked.length >= 4) {
      const byCat = new Map<string, { sum: number; n: number }>();
      for (const r of ranked) {
        if (!r.category) continue;
        const c = byCat.get(r.category) ?? { sum: 0, n: 0 };
        c.sum += r.rating;
        c.n += 1;
        byCat.set(r.category, c);
      }
      const cats = [...byCat.entries()]
        .filter(([, v]) => v.n >= 2)
        .map(([name, v]) => ({ name, avg: v.sum / v.n, n: v.n }))
        .sort((a, b) => b.avg - a.avg);
      if (cats.length >= 2) content["category-lean"] = cats;
    }

    if (ranked.length) {
      const scores = scoreDimensions(ranked);
      if (scores.length >= 2) {
        content["value-profile"] = { scores, summary: describeDimensions(scores, totalAnswers) };
      }
    }

    if (headToHead.length) {
      // computeTradeOffs enforces its own minimum observations per pairing.
      const tradeoffs = computeTradeOffs(headToHead);
      if (tradeoffs.length) {
        content["tradeoffs"] = { tradeoffs: tradeoffs.slice(0, 8), summary: describeTradeOff(tradeoffs[0]) };
      }
    }

    if (ranked.length >= 8) {
      // "Still torn on" only means something once things have been narrowed;
      // before that it just lists whatever was asked about least.
      content["confidence-map"] = [...ranked].sort((a, b) => b.rd - a.rd).slice(0, 5);
    }

    if (ranked.length >= 12) content["full-ranking"] = ranked;

    if (fitParams) {
      const get = (n: string) => fitParams!.find((p) => p.name === n);

      const hours = get("weeklyHours");
      const income = get("income");
      // The conversion divides by the income coefficient, so it's only
      // meaningful once that coefficient is distinguishable from zero.
      if (hours && income && income.se > 0 && Math.abs(income.value) > 2 * income.se) {
        const hoursSpan = RANGES.weeklyHours.max - RANGES.weeklyHours.min;
        const incomeLogSpan = Math.log(RANGES.income.max / RANGES.income.min);
        const perHourLogIncome = (-hours.value / income.value) * (incomeLogSpan / hoursSpan);
        content["hours-price"] = {
          pctPerHour: (Math.exp(perHourLogIncome) - 1) * 100,
          hoursCoef: hours.value,
          hoursSe: hours.se,
          incomeCoef: income.value,
        };
      }

      const identity = get("identityWeight");
      if (identity && identity.se > 0 && Math.abs(identity.value) > identity.se) {
        const moneyMag = ["income", "netWorth", "futurePotential"]
          .map((n) => Math.abs(get(n)?.value ?? 0))
          .reduce((a, b) => a + b, 0);
        content["money-vs-identity"] = {
          identity: Math.abs(identity.value),
          identitySe: identity.se,
          money: moneyMag,
        };
      }
    }

    const ready = INSIGHTS.filter((i) => content[i.key]).map((i) => i.key);

    return NextResponse.json({
      level: levelForAnswers(totalAnswers),
      totalAnswers,
      answersUntilNextLevel: answersUntilNextLevel(totalAnswers),
      catalogue: INSIGHTS,
      ready,
      content,
      itemsRated: ranked.length,
    });
  } catch (err) {
    console.error("insights failed", err);
    return NextResponse.json({ error: "Could not build insights" }, { status: 500 });
  }
}
