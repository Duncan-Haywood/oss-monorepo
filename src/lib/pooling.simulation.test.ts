/**
 * Does pooling a person's three perspectives buy precision, and what does it
 * cost?
 *
 * `docs/CONVERGENCE.md` lists cross-perspective pooling as the largest untaken
 * win: the same items are rated three times and the three sets of answers
 * share nothing, so a hierarchical prior ought to reach a usable deviation for
 * a fraction of the budget. It also flags it as the one most likely to be got
 * subtly wrong.
 *
 * This measures both halves against the real `selectNextPair`, the real
 * Glicko-2 update, and the real `compareRankings` — the same machinery
 * `pairing.simulation.test.ts` is calibrated on. The precision gain is real.
 * The cost is that PARTNER_GUESS gets pulled toward SELF, which is the
 * egocentric bias the blind-spots screen exists to *find*, so the estimator
 * removes the product's sharpest output and reports what is left with tighter
 * error bars. Written up in `docs/POOLING.md`.
 */
import { describe, expect, it } from "vitest";
import { compareRankings, type Ranking } from "@/lib/couples";
import { applyComparison, DEFAULT_GLICKO_STATE, type GlickoState } from "@/lib/glicko2";
import { pairKey, selectNextPair, type PairItem } from "@/lib/pairing";
import {
  alignOn,
  betweenPerspectiveVariance,
  correlation,
  poolAcrossPerspectives,
  type ByPerspective,
  type Estimate,
} from "@/lib/pooling";

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const ITEM_COUNT = 41; // the activities survey, the size the simulation is calibrated on
const CATEGORIES = 6;

function itemIds(): string[] {
  return Array.from({ length: ITEM_COUNT }, (_, i) => `item-${String(i).padStart(3, "0")}`);
}

/**
 * Drives one perspective's whole answering session: the real pair selection
 * and the real rating update against a respondent with the given latent
 * preferences who answers probabilistically (Bradley-Terry).
 */
function runPerspective(truth: Map<string, number>, budget: number, seed: number): Map<string, Estimate> {
  const rand = mulberry32(seed);
  const ids = itemIds();
  const state = new Map<string, GlickoState>();
  const timesShown = new Map<string, number>();
  const items: PairItem[] = ids.map((id, i) => ({
    id,
    rating: DEFAULT_GLICKO_STATE.rating,
    rd: DEFAULT_GLICKO_STATE.rd,
    category: `category-${i % CATEGORIES}`,
    dimensions: [`dimension-${i % 4}`],
  }));
  for (const id of ids) state.set(id, { ...DEFAULT_GLICKO_STATE });

  const recent: string[] = [];
  for (let answered = 0; answered < budget; answered++) {
    const live = items.map((item) => {
      const s = state.get(item.id)!;
      return { ...item, rating: s.rating, rd: s.rd };
    });
    const [aId, bId] = selectNextPair({
      items: live,
      timesShown,
      recentPairKeys: new Set(recent),
      answeredCount: answered,
    });

    const pA = 1 / (1 + Math.exp(-2 * (truth.get(aId)! - truth.get(bId)!)));
    const result = rand() < pA ? "A" : "B";

    const { a, b } = applyComparison(state.get(aId)!, state.get(bId)!, result);
    state.set(aId, a);
    state.set(bId, b);
    timesShown.set(aId, (timesShown.get(aId) ?? 0) + 1);
    timesShown.set(bId, (timesShown.get(bId) ?? 0) + 1);

    recent.push(pairKey(aId, bId));
    if (recent.length > 10) recent.shift();
  }

  return new Map([...state].map(([id, s]) => [id, { rating: s.rating, rd: s.rd }]));
}

type World = {
  /** Person A's three perspectives, as the app would store them. */
  a: ByPerspective;
  /** Person B's own preferences — what A's guess is graded against. */
  bSelf: Map<string, Estimate>;
  /** Items where A is genuinely, badly wrong about B. */
  plantedBlindSpots: string[];
  /** Latent truth, for measuring how much of a correlation is real. */
  truth: { self: Map<string, number>; guess: Map<string, number>; bSelf: Map<string, number> };
};

/** How many items A is confidently wrong about their partner on. */
const BLIND_SPOT_COUNT = 5;

/**
 * Builds one couple.
 *
 * A's three perspectives are correlated the way a real person's are — what
 * you want for yourself, what you want in a partner and what you think your
 * partner wants are not independent draws. Partners are correlated too:
 * people pair up with people who want similar things.
 *
 * On `BLIND_SPOT_COUNT` items, A's guess about B is *inverted* relative to
 * what B actually wants. Those are the blind spots. Everything the couple
 * screen is for lives in those five items.
 */
function buildWorld(budget: number, seed: number): World {
  const rand = mulberry32(seed * 31 + 7);
  const ids = itemIds();

  const self = new Map<string, number>();
  const partnerIdeal = new Map<string, number>();
  const bSelfTruth = new Map<string, number>();
  for (const id of ids) {
    const common = gaussian(rand);
    self.set(id, common + 0.35 * gaussian(rand));
    partnerIdeal.set(id, common + 0.35 * gaussian(rand));
    // B wants similar things to A, but is their own person.
    bSelfTruth.set(id, 0.6 * common + 0.8 * gaussian(rand));
  }

  // A's guess is mostly accurate about B — otherwise there would be nothing
  // to shrink and nothing to detect — and inverted on the planted items.
  const plantedBlindSpots = ids
    .map((id) => ({ id, k: rand() }))
    .sort((x, y) => x.k - y.k)
    .slice(0, BLIND_SPOT_COUNT)
    .map((x) => x.id)
    .sort();
  const planted = new Set(plantedBlindSpots);

  const guess = new Map<string, number>();
  for (const id of ids) {
    const actual = bSelfTruth.get(id)!;
    guess.set(id, planted.has(id) ? -actual : actual + 0.3 * gaussian(rand));
  }

  const a: ByPerspective = new Map([
    ["SELF", runPerspective(self, budget, seed * 3 + 1)],
    ["PARTNER", runPerspective(partnerIdeal, budget, seed * 3 + 2)],
    ["PARTNER_GUESS", runPerspective(guess, budget, seed * 3 + 3)],
  ]);

  return {
    a,
    bSelf: runPerspective(bSelfTruth, budget, seed * 3 + 4),
    plantedBlindSpots,
    truth: { self, guess, bSelf: bSelfTruth },
  };
}

/** Glicko-2's starting deviation; `rankingFor` drops anything at or above it. */
const MAX_RD = 349;

function toRanking(estimates: Map<string, Estimate>): Ranking {
  const ranking: Ranking = new Map();
  let i = 0;
  for (const [id, e] of estimates) {
    if (e.rd < MAX_RD) {
      ranking.set(id, {
        label: id,
        rating: e.rating,
        rd: e.rd,
        category: `category-${i % CATEGORIES}`,
        dimensions: [`dimension-${i % 4}`],
      });
    }
    i++;
  }
  return ranking;
}

function under(estimates: Map<string, Estimate>, threshold: number): number {
  return [...estimates.values()].filter((e) => e.rd < threshold).length;
}

/** How many of the planted blind spots the screen actually reports. */
function blindSpotsFound(guess: Map<string, Estimate>, bSelf: Map<string, Estimate>, planted: string[]): number {
  const { diverged } = compareRankings(toRanking(guess), toRanking(bSelf));
  const shown = new Set(diverged.map((d) => d.label));
  return planted.filter((label) => shown.has(label)).length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * `selectNextPair` draws from `Math.random` internally, so every quantity here
 * is a median over seeds and the assertions below are written as ranges wide
 * enough to survive that, the same way `pairing.simulation.test.ts` is.
 */
const SEEDS = Array.from({ length: 15 }, (_, i) => 1 + i * 7);

type Measurement = {
  under150Before: number;
  under150After: number;
  guessSelfCorrBefore: number;
  guessSelfCorrAfter: number;
  guessSelfCorrTruth: number;
  blindSpotsBefore: number;
  blindSpotsAfter: number;
  tau: number;
};

function measure(budget: number, seed: number): Measurement {
  const world = buildWorld(budget, seed);
  const pooled = poolAcrossPerspectives(world.a);

  const rawGuess = world.a.get("PARTNER_GUESS")!;
  const rawSelf = world.a.get("SELF")!;
  const pooledGuess = pooled.get("PARTNER_GUESS")!;
  const pooledSelf = pooled.get("SELF")!;

  const before = alignOn(rawGuess, rawSelf);
  const after = alignOn(pooledGuess, pooledSelf);
  const truthLabels = [...world.truth.self.keys()].sort();

  return {
    under150Before: under(rawGuess, 150),
    under150After: under(pooledGuess, 150),
    guessSelfCorrBefore: correlation(before.a, before.b),
    guessSelfCorrAfter: correlation(after.a, after.b),
    guessSelfCorrTruth: correlation(
      truthLabels.map((l) => world.truth.guess.get(l)!),
      truthLabels.map((l) => world.truth.self.get(l)!)
    ),
    blindSpotsBefore: blindSpotsFound(rawGuess, world.bSelf, world.plantedBlindSpots),
    blindSpotsAfter: blindSpotsFound(pooledGuess, world.bSelf, world.plantedBlindSpots),
    tau: Math.sqrt(betweenPerspectiveVariance(world.a)),
  };
}

describe("betweenPerspectiveVariance", () => {
  it("is zero when the spread is no wider than measurement error explains", () => {
    const flat: ByPerspective = new Map([
      ["SELF", new Map([["x", { rating: 1500, rd: 100 }], ["y", { rating: 1600, rd: 100 }]])],
      ["PARTNER", new Map([["x", { rating: 1500, rd: 100 }], ["y", { rating: 1600, rd: 100 }]])],
    ]);
    expect(betweenPerspectiveVariance(flat)).toBe(0);
  });

  it("grows with a genuine gap between the perspectives", () => {
    const split: ByPerspective = new Map([
      ["SELF", new Map([["x", { rating: 1200, rd: 50 }], ["y", { rating: 1800, rd: 50 }]])],
      ["PARTNER", new Map([["x", { rating: 1800, rd: 50 }], ["y", { rating: 1200, rd: 50 }]])],
    ]);
    expect(Math.sqrt(betweenPerspectiveVariance(split))).toBeGreaterThan(300);
  });

  it("refuses to borrow when nothing was measured twice", () => {
    const disjoint: ByPerspective = new Map([
      ["SELF", new Map([["x", { rating: 1500, rd: 100 }]])],
      ["PARTNER", new Map([["y", { rating: 1500, rd: 100 }]])],
    ]);
    expect(betweenPerspectiveVariance(disjoint)).toBe(Infinity);
  });
});

describe("poolAcrossPerspectives", () => {
  it("leaves an estimate alone when the perspectives disagree completely", () => {
    // tau is enormous, so the prior is diffuse and the own-answer dominates.
    const split: ByPerspective = new Map([
      ["SELF", new Map([["x", { rating: 1200, rd: 80 }], ["y", { rating: 1800, rd: 80 }]])],
      ["PARTNER", new Map([["x", { rating: 1800, rd: 80 }], ["y", { rating: 1200, rd: 80 }]])],
    ]);
    const pooled = poolAcrossPerspectives(split);
    // It moves a little — the safety valve damps the prior, it does not
    // switch it off — but by a few percent of the 600-point gap, not by half.
    const moved = pooled.get("SELF")!.get("x")!.rating - 1200;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(0.05 * 600);
  });

  it("never reports an estimate less certain than the answers alone gave it", () => {
    const world: ByPerspective = new Map([
      ["SELF", new Map([["x", { rating: 1400, rd: 120 }], ["y", { rating: 1600, rd: 120 }]])],
      ["PARTNER", new Map([["x", { rating: 1450, rd: 120 }], ["y", { rating: 1550, rd: 120 }]])],
    ]);
    const pooled = poolAcrossPerspectives(world);
    for (const [p, m] of pooled) {
      for (const [label, e] of m) {
        expect(e.rd).toBeLessThanOrEqual(world.get(p)!.get(label)!.rd + 1e-9);
      }
    }
  });

  it("passes through an item only one perspective ever saw", () => {
    const world: ByPerspective = new Map([
      ["SELF", new Map([["x", { rating: 1400, rd: 120 }], ["only", { rating: 1700, rd: 90 }]])],
      ["PARTNER", new Map([["x", { rating: 1450, rd: 120 }]])],
    ]);
    const pooled = poolAcrossPerspectives(world);
    expect(pooled.get("SELF")!.get("only")).toEqual({ rating: 1700, rd: 90 });
  });
});

/** A realistic session per perspective, and a long one. */
const REALISTIC = 90;
const LONG = 300;

const atRealistic = SEEDS.map((seed) => measure(REALISTIC, seed));
const atLong = SEEDS.map((seed) => measure(LONG, seed));

describe("what pooling buys", () => {
  it("does buy real precision — that half of the idea was right", () => {
    // Roughly a sevenfold increase in items the couple screen could use, for
    // no extra answers. This is why the idea keeps getting proposed.
    expect(median(atRealistic.map((r) => r.under150After))).toBeGreaterThan(
      3 * median(atRealistic.map((r) => r.under150Before))
    );
  });

  it("buys almost nothing once the answers are there anyway", () => {
    // 40 -> 41 of 41 items. The entire gain is at the low budget, which is
    // the same place the bias below is worst. They are one mechanism.
    const before = median(atLong.map((r) => r.under150Before));
    const after = median(atLong.map((r) => r.under150After));
    expect(after - before).toBeLessThan(3);
  });
});

describe("the safety valve, and why it is not one", () => {
  // The design argument for pooling rests on tau being estimated rather than
  // assumed: a person whose perspectives genuinely differ produces a large
  // tau, a diffuse prior, and negligible shrinkage. That argument is correct
  // and it is load-bearing, so it is worth checking that it holds at the
  // precision the app actually reaches. It does not.

  it("engages when the estimates are precise enough to show disagreement", () => {
    // At 300 answers per perspective, tau is large and the shrinkage is
    // partial: the correlation lands at 0.85 instead of 0.98.
    expect(median(atLong.map((r) => r.tau))).toBeGreaterThan(100);
    expect(median(atLong.map((r) => r.guessSelfCorrAfter))).toBeLessThan(
      median(atRealistic.map((r) => r.guessSelfCorrAfter))
    );
  });

  it("is wide open at the budget a person will actually answer", () => {
    // tau is estimated as the observed spread between perspectives MINUS
    // mean(rd^2). At 90 answers rd is still 200-300, so measurement error
    // swamps the genuine spread and the estimate floors at zero: the data
    // cannot distinguish "these three perspectives agree" from "these three
    // perspectives are barely measured". Zero tau means a maximally
    // confident prior, so shrinkage is at its strongest.
    //
    // The valve is therefore backwards. It is tightest where pooling is
    // harmless because the answers are already there, and fully open where
    // pooling does the most damage. No amount of tuning fixes that; it is a
    // property of estimating a variance component from noisier data than the
    // component itself.
    //
    // Measured as a fraction rather than a value. tau at 90 answers is itself
    // unstable — it lands anywhere between 0 and about 80 across runs, against
    // a steady ~160 at 300 answers. That instability is part of the finding:
    // the quantity the safety of this estimator rests on is not reliably
    // estimable at the budget it would be used at.
    const realistic = median(atRealistic.map((r) => r.tau));
    const long = median(atLong.map((r) => r.tau));
    expect(realistic).toBeLessThan(0.6 * long);
  });
});

describe("what pooling costs", () => {
  it("makes the guess about a partner almost a copy of what the guesser wants", () => {
    // This is the finding. A's guess about B and A's own preferences are
    // correlated 0.38 in the planted truth. The raw estimates recover 0.26 —
    // attenuated by measurement error, the direction of error this codebase
    // already documents. Pooling returns 0.97: the pooled PARTNER_GUESS is
    // very nearly A's SELF with a new label on it.
    //
    // "A person's guess about their partner is pulled toward what they want
    // for themselves" is not a modelling artefact to be traded off against
    // precision. It is the definition of the thing the blind-spots screen
    // exists to measure. The estimator manufactures the bias, then the screen
    // reports it as a finding about the couple.
    const truth = median(atRealistic.map((r) => r.guessSelfCorrTruth));
    const raw = median(atRealistic.map((r) => r.guessSelfCorrBefore));
    const pooled = median(atRealistic.map((r) => r.guessSelfCorrAfter));

    // The raw estimate lands near or below the truth across runs (0.22-0.39
    // against 0.38); the pooled one is pinned just under 1 every time. Only
    // the second is stable enough to assert tightly, and it is the one that
    // matters.
    expect(raw).toBeLessThan(0.55);
    expect(pooled).toBeGreaterThan(0.9);
    expect(pooled - truth).toBeGreaterThan(0.5);
  });

  it("loses blind spots once there are enough answers to find any", () => {
    // At 90 answers per perspective neither version finds anything, so the
    // cost is only visible on a long session — which is also the only place
    // the couple screen currently works at all.
    const before = median(atLong.map((r) => r.blindSpotsBefore));
    const after = median(atLong.map((r) => r.blindSpotsAfter));
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it("reports the numbers docs/POOLING.md is written from", () => {
    const row = (rs: Measurement[]) => ({
      under150: [median(rs.map((r) => r.under150Before)), median(rs.map((r) => r.under150After))],
      guessSelfCorr: [
        Number(median(rs.map((r) => r.guessSelfCorrBefore)).toFixed(3)),
        Number(median(rs.map((r) => r.guessSelfCorrAfter)).toFixed(3)),
        Number(median(rs.map((r) => r.guessSelfCorrTruth)).toFixed(3)),
      ],
      blindSpotsOf5: [median(rs.map((r) => r.blindSpotsBefore)), median(rs.map((r) => r.blindSpotsAfter))],
      tau: Number(median(rs.map((r) => r.tau)).toFixed(1)),
    });
    console.log("POOLING MEASUREMENT", JSON.stringify({ 90: row(atRealistic), 300: row(atLong) }));
    expect(true).toBe(true);
  });
});
