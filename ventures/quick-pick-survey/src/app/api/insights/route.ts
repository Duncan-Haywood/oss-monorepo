import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadRatedItems } from "@/lib/participantRatings";
import { confidenceInterval95, GLICKO_SCALE } from "@/lib/glicko2";
import { differenceSd, refitRatings, REFIT_MAX_ITEMS, type RefitResult } from "@/lib/btRefit";
import { clearPick } from "@/lib/clearPick";
import { answersUntilNextLevel, INSIGHTS, levelForAnswers } from "@/lib/insights";
import { RANGES } from "@/lib/financialProfiles";
import { describeDimensions, scoreDimensions } from "@/lib/dimensions";
import { computeTradeOffs, describeTradeOff, HeadToHead } from "@/lib/tradeoffs";
import { accessibleParticipantIds } from "@/lib/participantAccess";

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
    // Which refit (one per participant) an entry's rating came from, so two
    // items from the same person's answers are compared with the covariance
    // of their difference, not as if independent (lib/btRefit.ts).
    const fitOf = new WeakMap<RankedItem, { fit: RefitResult; itemId: string }>();

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
              itemAId: true,
              itemBId: true,
              itemA: { select: { dimensions: true } },
              itemB: { select: { dimensions: true } },
            },
            take: 3000,
          }),
        ]);
        totalAnswers += answered;
        // Ratings and rds from a Bradley-Terry refit of every answer at once
        // (lib/btRefit.ts): the stored one-game-at-a-time Glicko rds are too
        // narrow under the information selector (95% intervals held for about
        // 90% of pairs against 95% for the refit at the same width;
        // docs/INFORMATION-GAIN-SELECTOR.md, "Per-person intervals from a
        // refit"). The stored states stay what the pair selector reads; this
        // screen only reports. Past REFIT_MAX_ITEMS answered items the dense
        // refit gets slow, so the stored states are used as before.
        const answeredIds = new Set(decided.flatMap((t) => [t.itemAId, t.itemBId]));
        const valid = decided.filter((t) => t.result === "A" || t.result === "B" || t.result === "EQUAL");
        const fit =
          valid.length > 0 && answeredIds.size <= REFIT_MAX_ITEMS
            ? refitRatings(
                [...answeredIds],
                valid.map((t) =>
                  t.result === "B"
                    ? { winner: t.itemBId, loser: t.itemAId }
                    : { winner: t.itemAId, loser: t.itemBId, tie: t.result === "EQUAL" }
                )
              )
            : undefined;
        for (const i of items) {
          const fromFit = fit?.rating.has(i.id);
          const rating = fromFit ? fit!.rating.get(i.id)! : i.rating;
          const rd = fromFit ? fit!.rd.get(i.id)! : i.rd;
          if (rd >= 349) continue; // never actually shown — no signal
          const [lo, hi] = confidenceInterval95(rating, rd);
          const entry: RankedItem = {
            label: i.label,
            category: i.category,
            rating,
            rd,
            lo,
            hi,
            dimensions: i.dimensions ?? [],
          };
          if (fromFit) fitOf.set(entry, { fit: fit!, itemId: i.id });
          ranked.push(entry);
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
      // of every other item: ahead by more than 1.645 sd of the difference
      // (one-sided 95%, lib/clearPick.ts). The rule before 2026-11-12, "ahead
      // of the runner-up by half the leader's rd", fired for about three
      // respondents in four and named the wrong item in more than half of
      // those (docs/INFORMATION-GAIN-SELECTOR.md, "The clear-top-pick claim").
      // When it isn't clear, say who it's between rather than going silent —
      // the ordering is visible in the top-few card anyway, so refusing to
      // comment here just reads as a broken card.
      const sd = (a: RankedItem, b: RankedItem) => {
        const fa = fitOf.get(a), fb = fitOf.get(b);
        return fa && fb && fa.fit === fb.fit ? GLICKO_SCALE * differenceSd(fa.fit, fa.itemId, fb.itemId) : Math.hypot(a.rd, b.rd);
      };
      const top = clearPick(ranked, sd)!;
      content["top-pick"] = top.clear
        ? { ...top.leader, contested: false }
        : { ...top.leader, contested: true, rivals: ranked.slice(0, 3).map((r) => r.label) };

      const bottom = clearPick(ranked, sd, { bottom: true })!;
      content["bottom-pick"] = bottom.clear
        ? { ...bottom.leader, contested: false }
        : { ...bottom.leader, contested: true, rivals: ranked.slice(-3).map((r) => r.label) };
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
