import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadRatedItems } from "@/lib/participantRatings";
import { confidenceInterval95 } from "@/lib/glicko2";
import { levelForAnswers, unlockedInsights, nextInsight, swipesUntilNextInsight, INSIGHTS } from "@/lib/insights";
import { RANGES } from "@/lib/financialProfiles";

const MAX_ENTRIES = 20;

type RankedItem = { label: string; category: string | null; rating: number; rd: number; lo: number; hi: number };

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
    // Rank items across every ITEMS survey this person has answered.
    let ranked: RankedItem[] = [];
    let totalAnswers = 0;
    let fitParams: { name: string; value: number; se: number }[] | null = null;
    let fitNTrials = 0;

    for (const [, participantId] of entries) {
      const participant = await prisma.participant.findUnique({
        where: { id: participantId },
        select: { id: true, surveyId: true, survey: { select: { kind: true } } },
      });
      if (!participant) continue;

      if (participant.survey.kind === "ITEMS") {
        const [items, answered] = await Promise.all([
          loadRatedItems(participantId, participant.surveyId),
          prisma.trial.count({ where: { participantId, result: { not: null } } }),
        ]);
        totalAnswers += answered;
        // Only items this person has actually been shown carry signal.
        for (const i of items) {
          if (i.rd >= 349) continue;
          const [lo, hi] = confidenceInterval95(i.rating, i.rd);
          ranked.push({ label: i.label, category: i.category, rating: i.rating, rd: i.rd, lo, hi });
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

    // De-duplicate labels (the "combined" survey repeats items from the others),
    // keeping whichever copy is most certain.
    const byLabel = new Map<string, RankedItem>();
    for (const r of ranked) {
      const prev = byLabel.get(r.label);
      if (!prev || r.rd < prev.rd) byLabel.set(r.label, r);
    }
    ranked = [...byLabel.values()].sort((a, b) => b.rating - a.rating);

    const level = levelForAnswers(totalAnswers);
    const unlocked = new Set(unlockedInsights(level).map((i) => i.key));
    const content: Record<string, unknown> = {};

    if (unlocked.has("top-pick") && ranked.length) content["top-pick"] = ranked[0];
    if (unlocked.has("bottom-pick") && ranked.length) content["bottom-pick"] = ranked[ranked.length - 1];
    if (unlocked.has("top-three") && ranked.length) {
      content["top-three"] = ranked.slice(0, level >= 16 ? 5 : 3);
    }
    if (unlocked.has("category-lean") && ranked.length) {
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
      if (cats.length) content["category-lean"] = cats;
    }
    if (unlocked.has("confidence-map") && ranked.length) {
      content["confidence-map"] = [...ranked].sort((a, b) => b.rd - a.rd).slice(0, 5);
    }
    if (unlocked.has("full-ranking") && ranked.length) content["full-ranking"] = ranked;

    if (fitParams) {
      const get = (n: string) => fitParams!.find((p) => p.name === n);
      if (unlocked.has("hours-price")) {
        const hours = get("weeklyHours");
        const income = get("income");
        if (hours && income && Math.abs(income.value) > 0.05) {
          // Both features are normalised 0-1 over their range, so the ratio of
          // coefficients converts one full hours-range into income-range units.
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
      }
      if (unlocked.has("money-vs-identity")) {
        const identity = get("identityWeight");
        if (identity) {
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
    }

    return NextResponse.json({
      level,
      totalAnswers,
      swipesUntilNext: swipesUntilNextInsight(totalAnswers),
      next: nextInsight(level),
      catalogue: INSIGHTS,
      unlocked: [...unlocked],
      content,
      itemsRated: ranked.length,
    });
  } catch (err) {
    console.error("insights failed", err);
    return NextResponse.json({ error: "Could not build insights" }, { status: 500 });
  }
}
