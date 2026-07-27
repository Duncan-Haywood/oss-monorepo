import { prisma } from "@/lib/prisma";
import { fitConjointModel, ChoiceRow, Outcome, FitResult } from "@/lib/conjoint";
import { deltaFeatures, encodeFeatures, FEATURE_NAMES, FinancialProfile } from "@/lib/financialProfiles";
import { ratingToLogit } from "@/lib/glicko2";
import type { Survey } from "@prisma/client";

export function paramNames(survey: Pick<Survey, "kind">): string[] {
  return survey.kind === "CONJOINED" ? ["identityWeight", ...FEATURE_NAMES] : [...FEATURE_NAMES];
}

function profileA(t: {
  incomeA: number; netWorthA: number; futurePotentialA: number; yearsToRealizeA: number; weeklyHoursA: number;
}): FinancialProfile {
  return {
    income: t.incomeA,
    netWorth: t.netWorthA,
    futurePotential: t.futurePotentialA,
    yearsToRealize: t.yearsToRealizeA,
    weeklyHours: t.weeklyHoursA,
  };
}

function profileB(t: {
  incomeB: number; netWorthB: number; futurePotentialB: number; yearsToRealizeB: number; weeklyHoursB: number;
}): FinancialProfile {
  return {
    income: t.incomeB,
    netWorth: t.netWorthB,
    futurePotential: t.futurePotentialB,
    yearsToRealize: t.yearsToRealizeB,
    weeklyHours: t.weeklyHoursB,
  };
}

type AnsweredTrial = Parameters<typeof profileA>[0] &
  Parameters<typeof profileB>[0] & {
    result: string | null;
    identityItemAId: string | null;
    identityItemBId: string | null;
  };

/**
 * Builds the model's feature-delta vector for one trial. For CONJOINED
 * surveys the identity utility comes from the participant's OWN ratings of
 * those items (passed in via `identityRatings`), never a shared pool.
 */
export function trialDeltaX(
  t: AnsweredTrial,
  kind: "ITEMS" | "FINANCIAL" | "CONJOINED",
  identityRatings: Map<string, number>
): number[] {
  const finDelta = deltaFeatures(profileA(t), profileB(t));
  if (kind !== "CONJOINED") return finDelta;
  const idA = t.identityItemAId ? ratingToLogit(identityRatings.get(t.identityItemAId) ?? 1500) : 0;
  const idB = t.identityItemBId ? ratingToLogit(identityRatings.get(t.identityItemBId) ?? 1500) : 0;
  return [idA - idB, ...finDelta];
}

/**
 * Refits one participant's own conjoint model. Only refits every
 * REFIT_EVERY answers (or when explicitly forced) because a full refit is
 * an expensive iterative optimization over their entire history — running
 * it on every single answer makes response latency grow without bound.
 */
const REFIT_EVERY = 5;

export async function refitParticipant(
  participantId: string,
  opts: { force?: boolean } = {}
): Promise<FitResult | null> {
  const participant = await prisma.participant.findUniqueOrThrow({
    where: { id: participantId },
    include: { survey: true },
  });
  const survey = participant.survey;

  const trials = await prisma.financialTrial.findMany({
    where: { participantId, result: { not: null } },
    select: {
      result: true,
      identityItemAId: true, identityItemBId: true,
      incomeA: true, netWorthA: true, futurePotentialA: true, yearsToRealizeA: true, weeklyHoursA: true,
      incomeB: true, netWorthB: true, futurePotentialB: true, yearsToRealizeB: true, weeklyHoursB: true,
    },
  });

  const existing = await prisma.surveyFit.findUnique({ where: { participantId } });
  if (!opts.force && existing && trials.length - existing.nTrials < REFIT_EVERY) {
    return null;
  }

  const identityRatings = new Map<string, number>();
  if (survey.kind === "CONJOINED") {
    const ratings = await prisma.participantItemRating.findMany({
      where: { participantId },
      select: { itemId: true, rating: true },
    });
    for (const r of ratings) identityRatings.set(r.itemId, r.rating);
  }

  const rows: ChoiceRow[] = trials.map((t) => ({
    deltaX: trialDeltaX(t as AnsweredTrial, survey.kind, identityRatings),
    outcome: t.result as Outcome,
  }));

  const names = paramNames(survey);
  const fit = fitConjointModel(rows, names.length);
  const paramsJson = names.map((name, i) => ({ name, value: fit.params[i], se: fit.se[i] }));

  const data = {
    params: paramsJson,
    nu: fit.nu,
    covariance: fit.covariance,
    nTrials: rows.length,
    logLikelihood: fit.logLikelihood,
  };

  await prisma.surveyFit.upsert({
    where: { participantId },
    update: data,
    create: { participantId, surveyId: survey.id, ...data },
  });

  return fit;
}

/** Per-feature coverage counts for a participant's own financial trials (identity excluded). */
export async function financialFeatureCoverage(participantId: string): Promise<number[]> {
  const trials = await prisma.financialTrial.findMany({
    where: { participantId },
    select: {
      incomeA: true, netWorthA: true, futurePotentialA: true, yearsToRealizeA: true, weeklyHoursA: true,
      incomeB: true, netWorthB: true, futurePotentialB: true, yearsToRealizeB: true, weeklyHoursB: true,
    },
  });
  const coverage = [0, 0, 0, 0, 0];
  for (const t of trials) {
    const delta = deltaFeatures(profileA(t), profileB(t));
    delta.forEach((d, i) => {
      if (Math.abs(d) > 0.15) coverage[i]++;
    });
  }
  return coverage;
}

export { encodeFeatures };
