import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadRatedItems } from "@/lib/participantRatings";
import { confidenceInterval95 } from "@/lib/glicko2";
import { answersUntilNextLevel, INSIGHTS, levelForAnswers } from "@/lib/insights";
import { RANGES } from "@/lib/financialProfiles";
import { describeDimensions, scoreDimensions, synthesizeArchetype } from "@/lib/dimensions";
import { computeTradeOffs, describeTradeOff, HeadToHead } from "@/lib/tradeoffs";
import { accessibleParticipantIds } from "@/lib/participantAccess";
import { buildDeepProfile } from "@/lib/cardMetadata";
import { getTraitsForItem } from "@/lib/cardTraitsData";
import { computeTraitVectorProfile } from "@/lib/aiTraitTagger";

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

    // Skipped rather than refused, for the same reason as `session/status`:
    // the client sends whatever ids it has, and one that is not the caller's
    // should not turn the insights screen into an error page.
    const allowed = await accessibleParticipantIds(entries.map(([, id]) => id));

    for (const [, participantId] of entries) {
      if (!allowed.has(participantId)) continue;

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
      // A single "#1" is only claimable when the leader is measurably clear
      // of the runner-up. When it isn't, say who it's between rather than
      // going silent — the ordering is visible in the top-few card anyway,
      // so refusing to comment here just reads as a broken card.
      const [first, second] = ranked;
      const leaderIsClear = first.rating - second.rating > 0.5 * first.rd;
      content["top-pick"] = leaderIsClear
        ? { ...first, contested: false }
        : { ...first, contested: true, rivals: ranked.slice(0, 3).map((r) => r.label) };

      const last = ranked[ranked.length - 1];
      const penultimate = ranked[ranked.length - 2];
      const trailerIsClear = penultimate.rating - last.rating > 0.5 * last.rd;
      content["bottom-pick"] = trailerIsClear
        ? { ...last, contested: false }
        : { ...last, contested: true, rivals: ranked.slice(-3).map((r) => r.label) };
    }

    if (ranked.length >= 5) {
      content["top-three"] = ranked.slice(0, ranked.length >= 12 ? 5 : 3);
      content["disfavored-items"] = ranked.slice(-5).reverse();
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
        .map(([name, v]) => ({
          name,
          avg: v.sum / v.n,
          n: v.n,
          strongestItems: ranked.filter((r) => r.category === name).slice(0, 3).map((r) => r.label),
        }))
        .sort((a, b) => b.avg - a.avg);
      if (cats.length >= 2) {
        content["category-lean"] = cats;
        content["disfavored-categories"] = [...cats].reverse();
      }
    }

    if (ranked.length) {
      const scores = scoreDimensions(ranked);
      if (scores.length >= 2) {
        content["value-profile"] = {
          scores,
          summary: describeDimensions(scores, totalAnswers),
          archetype: synthesizeArchetype(scores),
        };
      }

      if (ranked.length >= 3) {
        const enriched = ranked.map((r, index) => ({
          ...r,
          strengthPercentile: Math.round(((ranked.length - 1 - index) / Math.max(1, ranked.length - 1)) * 100),
          traits: getTraitsForItem({ label: r.label, category: r.category, dimensions: r.dimensions }),
        }));
        content["trait-profile"] = computeTraitVectorProfile(enriched, false);
      }
    }

    if (headToHead.length) {
      // computeTradeOffs enforces its own minimum observations per pairing.
      const tradeoffs = computeTradeOffs(headToHead);
      if (tradeoffs.length) {
        content["tradeoffs"] = { tradeoffs: tradeoffs.slice(0, 8), summary: describeTradeOff(tradeoffs[0]) };
      }
    }

    // A couple prompt must come from a relationship-facing topic and must
    // beat the next candidate by more than the uncertainty carried by both.
    // Otherwise a pleasant-sounding question would be promoted merely
    // because its item happened to be asked first.
    const coupleCategories = new Set([
      "Behaviour",
      "Affection",
      "Relationship",
      "Communication",
      "Lifestyle",
      "Intimacy",
      "Future and family",
      "Money and power",
      "Stress and support",
      "Trust and boundaries",
      "Play and growth",
    ]);
    const coupleItems = ranked.filter((item) => item.category && coupleCategories.has(item.category));
    if (coupleItems.length >= 2) {
      const [first, second] = coupleItems;
      const combinedUncertainty = Math.sqrt(first.rd ** 2 + second.rd ** 2);
      if (first.rd < 180 && first.rating - second.rating > combinedUncertainty) {
        content["couple-prompt"] = {
          label: first.label,
          category: first.category,
          contrast: second.label,
        };
      }
      const deepProfile = buildDeepProfile(ranked);
      if (deepProfile) content["deep-profile"] = deepProfile;
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
