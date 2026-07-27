/**
 * Synthetic financial-scenario generation and encoding for the FINANCIAL and
 * CONJOINED surveys. Ranges deliberately span a wide, realistic band so any
 * one real number stays interior, not identifiable as an edge case.
 *
 * Every generated trial is a genuine trade-off, not a dense multi-attribute
 * profile: exactly two "slots" move, one side better on the first and worse
 * on the second, guaranteeing neither side dominates (no "same but one is
 * just better" comparisons). Only those two slots are shown — a direct
 * "X instead of Y, but A instead of B" framing, matching how people actually
 * reason about trade-offs, and far less to read per card.
 */

export type FinancialProfile = {
  income: number; // annual, $
  netWorth: number; // current, $
  futurePotential: number; // additional possible future wealth, $ (0 = none)
  yearsToRealize: number; // time horizon for futurePotential, years (0 if no potential)
  weeklyHours: number; // hours/week required
};

export const FEATURE_NAMES = ["income", "netWorth", "futurePotential", "yearsToRealize", "weeklyHours"] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

export const RANGES = {
  income: { min: 80_000, max: 2_000_000 },
  netWorth: { min: 200_000, max: 25_000_000 },
  futurePotential: { min: 250_000, max: 20_000_000 },
  yearsToRealize: { min: 1, max: 20 },
  weeklyHours: { min: 5, max: 70 },
};

/** A fixed, unremarkable starting point. Only the active trade-off slots move away from this. */
const BASELINE: FinancialProfile = {
  income: 300_000,
  netWorth: 1_500_000,
  futurePotential: 0,
  yearsToRealize: 0,
  weeklyHours: 40,
};

function logUniform(min: number, max: number, rand: () => number): number {
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  return Math.exp(logMin + rand() * (logMax - logMin));
}

function linUniform(min: number, max: number, rand: () => number): number {
  return min + rand() * (max - min);
}

function roundNice(value: number): number {
  if (value < 100_000) return Math.round(value / 5_000) * 5_000;
  if (value < 1_000_000) return Math.round(value / 25_000) * 25_000;
  if (value < 5_000_000) return Math.round(value / 100_000) * 100_000;
  return Math.round(value / 500_000) * 500_000;
}

function normLog(value: number, min: number, max: number): number {
  const v = Math.max(min, Math.min(max, value));
  return (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

function normLin(value: number, min: number, max: number): number {
  const v = Math.max(min, Math.min(max, value));
  return (v - min) / (max - min);
}

/** Encodes a profile into the 5-feature vector the conjoint model fits on. */
export function encodeFeatures(p: FinancialProfile): number[] {
  const income_n = normLog(p.income, RANGES.income.min, RANGES.income.max);
  const netWorth_n = normLog(p.netWorth, RANGES.netWorth.min, RANGES.netWorth.max);
  const hasPotential = p.futurePotential > 0;
  const potential_n = hasPotential
    ? 0.3 + 0.7 * normLog(p.futurePotential, RANGES.futurePotential.min, RANGES.futurePotential.max)
    : 0;
  const years_n = hasPotential ? normLin(p.yearsToRealize, RANGES.yearsToRealize.min, RANGES.yearsToRealize.max) : 0;
  const hours_n = normLin(p.weeklyHours, RANGES.weeklyHours.min, RANGES.weeklyHours.max);
  return [income_n, netWorth_n, potential_n, years_n, hours_n];
}

export function deltaFeatures(a: FinancialProfile, b: FinancialProfile): number[] {
  const fa = encodeFeatures(a);
  const fb = encodeFeatures(b);
  return fa.map((v, i) => v - fb[i]);
}

export function formatMoney(value: number): string {
  if (value <= 0) return "$0";
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `$${k.toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export type TradeSlot = "income" | "netWorth" | "hours" | "upside" | "timing";
export const TRADE_SLOTS: TradeSlot[] = ["income", "netWorth", "hours", "upside", "timing"];

export type SlotLine = { icon: "money" | "bank" | "clock" | "rocket"; text: string };

/**
 * Samples a low/high pair strictly inside [min, max], with the high value at
 * least `gap`x the low one. The low value is drawn from a restricted upper
 * bound so the high value always has room — otherwise a low value near the
 * ceiling would push the high one out of range.
 */
function sampleLowHigh(min: number, max: number, gap: number, rand: () => number): { lo: number; hi: number } {
  const lo = logUniform(min, max / gap, rand);
  const hi = logUniform(lo * gap, max, rand);
  return { lo: roundNice(lo), hi: roundNice(hi) };
}

/**
 * One slot's pair of (worse, better) values, applied to a baseline profile.
 * Exactly ONE quantity moves per slot — the "upside" slot varies its dollar
 * amount at a fixed horizon, and "timing" is its own separate slot, so a
 * trial never turns into a three-way comparison.
 */
function sampleSlot(slot: TradeSlot, rand: () => number): { worse: Partial<FinancialProfile>; better: Partial<FinancialProfile>; line: (p: FinancialProfile) => SlotLine } {
  switch (slot) {
    case "income": {
      const { lo, hi } = sampleLowHigh(RANGES.income.min, RANGES.income.max, 1.5, rand);
      return {
        worse: { income: lo },
        better: { income: hi },
        line: (p) => ({ icon: "money", text: `${formatMoney(p.income)}/yr income` }),
      };
    }
    case "netWorth": {
      const { lo, hi } = sampleLowHigh(RANGES.netWorth.min, RANGES.netWorth.max, 1.5, rand);
      return {
        worse: { netWorth: lo },
        better: { netWorth: hi },
        line: (p) => ({ icon: "bank", text: `${formatMoney(p.netWorth)} net worth` }),
      };
    }
    case "hours": {
      const hi = Math.round(linUniform(40, RANGES.weeklyHours.max, rand) / 5) * 5; // worse = more hours
      const lo = Math.round(linUniform(RANGES.weeklyHours.min, hi - 15, rand) / 5) * 5; // better = fewer hours
      return {
        worse: { weeklyHours: hi },
        better: { weeklyHours: lo },
        line: (p) => ({ icon: "clock", text: `${p.weeklyHours} hrs/week` }),
      };
    }
    case "upside": {
      // Amount only; the horizon is held fixed on both sides of this slot.
      const { lo, hi } = sampleLowHigh(RANGES.futurePotential.min, RANGES.futurePotential.max, 1.6, rand);
      const years = Math.round(linUniform(RANGES.yearsToRealize.min, RANGES.yearsToRealize.max, rand));
      return {
        worse: { futurePotential: lo, yearsToRealize: years },
        better: { futurePotential: hi, yearsToRealize: years },
        line: (p) => ({
          icon: "rocket",
          text: `${formatMoney(p.futurePotential)} upside in ${p.yearsToRealize} yr${p.yearsToRealize === 1 ? "" : "s"}`,
        }),
      };
    }
    case "timing": {
      // Horizon only; the amount is held fixed on both sides of this slot.
      const amount = roundNice(logUniform(RANGES.futurePotential.min, RANGES.futurePotential.max, rand));
      const later = Math.round(linUniform(10, RANGES.yearsToRealize.max, rand));
      const sooner = Math.round(linUniform(RANGES.yearsToRealize.min, later - 5, rand));
      return {
        worse: { futurePotential: amount, yearsToRealize: later },
        better: { futurePotential: amount, yearsToRealize: sooner },
        line: (p) => ({
          icon: "rocket",
          text: `${formatMoney(p.futurePotential)} upside in ${p.yearsToRealize} yr${p.yearsToRealize === 1 ? "" : "s"}`,
        }),
      };
    }
  }
}

function weightedPick<T>(items: T[], weight: (item: T) => number, rand: () => number): T {
  const weights = items.map((i) => Math.max(weight(i), 0.0001));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export type TradeOffPair = {
  a: FinancialProfile;
  b: FinancialProfile;
  linesA: SlotLine[];
  linesB: SlotLine[];
};

function slotCoverageWeight(slot: TradeSlot, featureCoverage: number[]): number {
  // featureCoverage indices: 0 income, 1 netWorth, 2 potential, 3 years, 4 hours
  const idx =
    slot === "income" ? 0 : slot === "netWorth" ? 1 : slot === "hours" ? 4 : slot === "timing" ? 3 : 2;
  return 1 / (1 + featureCoverage[idx]);
}

/** Builds one guaranteed non-dominated two-slot trade-off. */
function generateTradeOffPair(featureCoverage: number[], rand: () => number): TradeOffPair {
  const slot1 = weightedPick(TRADE_SLOTS, (s) => slotCoverageWeight(s, featureCoverage), rand);
  // "upside" and "timing" both describe the same future-payout line, so they
  // can't both move in one trial — the card would show one line claiming two
  // different things.
  const conflicts: Record<string, string> = { upside: "timing", timing: "upside" };
  const remaining = TRADE_SLOTS.filter((s) => s !== slot1 && s !== conflicts[slot1]);
  const slot2 = weightedPick(remaining, (s) => slotCoverageWeight(s, featureCoverage), rand);

  const s1 = sampleSlot(slot1, rand);
  const s2 = sampleSlot(slot2, rand);

  // Side A: better on slot1, worse on slot2. Side B: the reverse. Randomize
  // which physical side (a/b) gets which, later — the generator itself just
  // needs internal consistency here.
  const a: FinancialProfile = { ...BASELINE, ...s1.better, ...s2.worse };
  const b: FinancialProfile = { ...BASELINE, ...s1.worse, ...s2.better };

  return {
    a,
    b,
    linesA: [s1.line(a), s2.line(a)],
    linesB: [s1.line(b), s2.line(b)],
  };
}

export type FinancialFitLike = {
  params: number[]; // financial betas only, in FEATURE_NAMES order
  nu: number;
} | null;

/**
 * Picks the next financial trade-off. `featureCoverage` counts, per feature
 * index, how many prior trials for this participant actually varied that
 * feature (|deltaX| > 0.15) - used to spread signal evenly across all
 * attributes rather than over-sampling whichever one keeps getting rolled
 * first. When a fit already exists, candidates are scored by how close to
 * a toss-up the current model predicts them to be (most informative).
 */
export function selectFinancialPair(featureCoverage: number[], fit: FinancialFitLike, rand: () => number = Math.random): TradeOffPair {
  const candidates = Array.from({ length: 6 }, () => generateTradeOffPair(featureCoverage, rand));

  if (!fit || fit.params.every((p) => p === 0)) {
    return candidates[Math.floor(rand() * candidates.length)];
  }

  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const delta = deltaFeatures(c.a, c.b);
    let d = 0;
    for (let i = 0; i < delta.length; i++) d += fit.params[i] * delta[i];
    const eA = Math.exp(Math.max(-15, Math.min(15, d)));
    const eB = 1;
    const eTie = fit.nu * Math.exp(Math.max(-15, Math.min(15, d / 2)));
    const denom = eA + eB + eTie;
    const maxP = Math.max(eA, eB, eTie) / denom;
    const infoScore = 1 - maxP; // higher = closer to a toss-up = more informative
    if (infoScore > bestScore) {
      bestScore = infoScore;
      best = c;
    }
  }
  return best;
}
