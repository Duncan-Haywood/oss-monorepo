/**
 * Does borrowing another perspective's ratings *for question selection only*
 * buy a person anything?
 *
 * ## The question
 *
 * `docs/CONVERGENCE.md` leaves three ways to make the couple screen reachable
 * inside a session someone will sit through. Two are product decisions. The
 * third — "pool across perspectives for question selection only, which cannot
 * bias an estimate" — is the one nothing in `docs/POOLING.md` refutes, because
 * that document's objection is about what pooling does to an *estimate*, and a
 * pair chosen on prior data leaves the likelihood alone.
 *
 * Unrefuted is not the same as useful. This measures it, and the answer is
 * that it buys nothing — see `docs/decisions/0007`. The feature is not wired
 * into any route; this file is why.
 *
 * ## The setup
 *
 * A person answers the same survey under two perspectives. The second one
 * starts from a flat 1500 for every item, which is exactly when the
 * informativeness term in `selectNextPair` has nothing to work with. The
 * question is whether their first perspective's ratings, blended in by
 * `selectionRating` and used only to pick pairs, make the second perspective's
 * answers worth more.
 *
 * Everything below drives the real `selectNextPair` and the real Glicko-2
 * update, and each seed runs the second perspective twice from the identical
 * starting state — once with the prior and once without — so the difference is
 * the selection policy and nothing else.
 *
 * ## The correlation is the whole story
 *
 * A prior helps in proportion to how much it knows. `docs/POOLING.md` plants
 * SELF against PARTNER_GUESS at 0.37, the weakest of the three pairings and
 * the one this feature would help least. SELF against PARTNER is higher. The
 * sweep covers the range rather than picking the flattering end.
 *
 * It also runs an *oracle* — a prior that knows the truth exactly. That is the
 * run that matters. A null result at rho 0.85 would only say the prior was too
 * noisy; a null result against a perfect prior says the term being improved has
 * no leverage in the first place, which is a fact about `selectNextPair` rather
 * than about perspectives, and it is the one this repo needed to know.
 *
 * @see docs/POOLING.md
 * @see docs/decisions/0007-no-selection-only-cross-perspective-priors.md
 */
import { describe, expect, it } from "vitest";
import { applyComparison, DEFAULT_GLICKO_STATE, type GlickoState } from "@/lib/glicko2";
import { pairKey, selectNextPair, selectionRating, type PairItem, type PriorEstimate } from "@/lib/pairing";

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

function buildItems(): PairItem[] {
  return Array.from({ length: ITEM_COUNT }, (_, i) => ({
    id: `item-${String(i).padStart(3, "0")}`,
    rating: DEFAULT_GLICKO_STATE.rating,
    rd: DEFAULT_GLICKO_STATE.rd,
    category: `category-${i % CATEGORIES}`,
    dimensions: [`dimension-${i % 4}`],
  }));
}

/**
 * Two correlated sets of latent preferences over the same items — one person's
 * two perspectives.
 */
function correlatedTruths(rho: number, rand: () => number) {
  const first = new Map<string, number>();
  const second = new Map<string, number>();
  for (const item of buildItems()) {
    const x = gaussian(rand);
    const y = rho * x + Math.sqrt(1 - rho * rho) * gaussian(rand);
    first.set(item.id, x);
    second.set(item.id, y);
  }
  return { first, second };
}

type Run = { estimates: Map<string, PriorEstimate>; truth: Map<string, number> };

/**
 * One perspective's whole answering session. `priorRatings` is passed straight
 * through to `selectNextPair`; when it is undefined this is the pre-change
 * behaviour exactly.
 */
function runPerspective(
  truth: Map<string, number>,
  budget: number,
  seed: number,
  priorRatings?: Map<string, PriorEstimate>
): Map<string, PriorEstimate> {
  const rand = mulberry32(seed);
  const items = buildItems();
  const state = new Map<string, GlickoState>();
  const timesShown = new Map<string, number>();
  for (const item of items) state.set(item.id, { ...DEFAULT_GLICKO_STATE });

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
      priorRatings,
      rand,
    });

    // Bradley-Terry against the latent truth. The respondent answers
    // probabilistically; a deterministic one would flatter the whole loop.
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

function under(estimates: Map<string, PriorEstimate>, threshold: number): number {
  return [...estimates.values()].filter((e) => e.rd < threshold).length;
}

/** Spearman correlation between the recovered ranking and the latent truth. */
function rankAccuracy(estimates: Map<string, PriorEstimate>, truth: Map<string, number>): number {
  const ids = [...estimates.keys()];
  const rankOf = (score: (id: string) => number) => {
    const sorted = ids.slice().sort((x, y) => score(y) - score(x));
    return new Map(sorted.map((id, i) => [id, i + 1]));
  };
  const re = rankOf((id) => estimates.get(id)!.rating);
  const rt = rankOf((id) => truth.get(id)!);
  const n = ids.length;
  let sumD2 = 0;
  for (const id of ids) {
    const d = re.get(id)! - rt.get(id)!;
    sumD2 += d * d;
  }
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const SEEDS = Array.from({ length: 15 }, (_, i) => 1 + i * 7);

/** Answers per perspective. 90 is what two real accounts actually produced. */
const REALISTIC = 90;
const LONG = 300;

type Paired = { withPrior: number[]; without: number[] };
type PairedRuns = { withPrior: Run[]; without: Run[] };

/**
 * Runs both arms across every seed. The first perspective is answered once per
 * seed and its estimates become the prior; the second is then answered twice
 * from the same starting state, differing only in whether it gets that prior.
 *
 * This returns the runs rather than a number so that several metrics can be
 * read off one set of sessions. Everything here is seeded, so re-simulating
 * per metric produced identical answers at three times the cost — enough to
 * push the reporting test past the suite's five-second timeout.
 */
function sweep(rho: number, budget: number): PairedRuns {
  const withPrior: Run[] = [];
  const without: Run[] = [];
  for (const seed of SEEDS) {
    const { first, second } = correlatedTruths(rho, mulberry32(seed));
    const prior = runPerspective(first, budget, seed);
    withPrior.push({ estimates: runPerspective(second, budget, seed + 1, prior), truth: second });
    without.push({ estimates: runPerspective(second, budget, seed + 1), truth: second });
  }
  return { withPrior, without };
}

/** Reads one metric off both arms of a sweep. */
function measure(runs: PairedRuns, metric: (r: Run) => number): Paired {
  return { withPrior: runs.withPrior.map(metric), without: runs.without.map(metric) };
}

const itemsUnder = (threshold: number) => (r: Run) => under(r.estimates, threshold);
const accuracy = (r: Run) => rankAccuracy(r.estimates, r.truth);

describe("selectionRating", () => {
  const item = (rd: number): PairItem => ({ id: "i", rating: 1500, rd });

  it("returns the item's own rating when there is no prior", () => {
    expect(selectionRating(item(350))).toBe(1500);
    expect(selectionRating(item(350), new Map())).toBe(1500);
  });

  it("leans on the prior while this perspective knows nothing", () => {
    const prior = new Map([["i", { rating: 1900, rd: 100 }]]);
    // rd 350 against a prior at rd 100 (+150 between-perspective spread)
    // gives the prior about 79% of the weight.
    expect(selectionRating(item(350), prior)).toBeCloseTo(1500 + 0.79 * 400, -1);
  });

  it("fades out on its own as real answers arrive", () => {
    const prior = new Map([["i", { rating: 1900, rd: 100 }]]);
    const early = selectionRating(item(350), prior);
    const later = selectionRating(item(100), prior);
    expect(later).toBeLessThan(early);
    // By rd 100 the item's own rating carries about three quarters.
    expect(later).toBeCloseTo(1500 + 0.24 * 400, -1);
  });

  it("never moves an item further than the prior itself", () => {
    const prior = new Map([["i", { rating: 1900, rd: 100 }]]);
    for (const rd of [350, 250, 150, 100, 60]) {
      const blended = selectionRating(item(rd), prior);
      expect(blended).toBeGreaterThanOrEqual(1500);
      expect(blended).toBeLessThanOrEqual(1900);
    }
  });

  it("discounts a prior that is itself uncertain", () => {
    const precise = new Map([["i", { rating: 1900, rd: 50 }]]);
    const vague = new Map([["i", { rating: 1900, rd: 300 }]]);
    expect(selectionRating(item(350), vague)).toBeLessThan(selectionRating(item(350), precise));
  });
});

describe("what a selection-only prior buys", () => {
  it("does not change the estimator — only which pair is shown", () => {
    // The guard that makes the ignorability argument checkable rather than
    // asserted: a prior so wrong it inverts every item still cannot push the
    // recovered ranking away from the truth by more than sampling noise,
    // because it never enters the likelihood.
    const hostile = (r: Run) => accuracy(r);
    const inverted: Paired = { withPrior: [], without: [] };
    for (const seed of SEEDS.slice(0, 9)) {
      const { second } = correlatedTruths(0.37, mulberry32(seed));
      const wrong = new Map(
        [...second].map(([id, t]) => [id, { rating: 1500 - t * 200, rd: 80 }] as const)
      );
      inverted.withPrior.push(hostile({ estimates: runPerspective(second, REALISTIC, seed + 1, wrong), truth: second }));
      inverted.without.push(hostile({ estimates: runPerspective(second, REALISTIC, seed + 1), truth: second }));
    }
    // Deliberately adversarial and still no worse than a rank correlation of
    // 0.1 apart: an actively misleading prior costs information, not validity.
    expect(median(inverted.withPrior)).toBeGreaterThan(median(inverted.without) - 0.1);
  });

  it("buys nothing even when the prior knows the truth exactly", () => {
    // The load-bearing run. If a perfect prior moved the numbers, the null at
    // realistic correlations would mean "too noisy to help" and the idea would
    // be worth revisiting with a better estimator. It does not move them, so
    // the closeness term simply has no leverage over how fast deviation falls
    // — deviation is driven by how many comparisons an item gets, and that is
    // the coverage term's and `activeSetSize`'s decision, not this one.
    const rows: string[] = [];
    const gains: number[] = [];
    for (const budget of [REALISTIC, LONG]) {
      const withOracle: number[] = [];
      const without: number[] = [];
      for (const seed of SEEDS) {
        const rand = mulberry32(seed);
        const truth = new Map(buildItems().map((i) => [i.id, gaussian(rand)] as const));
        const oracle = new Map(
          [...truth].map(([id, t]) => [id, { rating: 1500 + t * 200, rd: 20 }] as const)
        );
        withOracle.push(under(runPerspective(truth, budget, seed + 1, oracle), 150));
        without.push(under(runPerspective(truth, budget, seed + 1), 150));
      }
      gains.push(median(withOracle) - median(without));
      rows.push(`budget ${budget} | rd<150 ${median(without)} -> ${median(withOracle)}`);
    }
    console.log("\noracle: " + rows.join(" ; "));
    // A perfect prior is the ceiling on what any prior could deliver, and the
    // ceiling is two items out of 41 — under 5%, in both directions across
    // budgets. Progressive broadening, the change this one was meant to
    // follow, moved the same measure from 0 to 34. That gap is the finding.
    for (const gain of gains) expect(Math.abs(gain)).toBeLessThanOrEqual(2);
  });

  it("reports the numbers the decision record is written from", () => {
    const rows: string[] = [];
    for (const rho of [0.37, 0.6, 0.85]) {
      for (const budget of [REALISTIC, LONG]) {
        const runs = sweep(rho, budget);
        const rd150 = measure(runs, itemsUnder(150));
        const rd200 = measure(runs, itemsUnder(200));
        const acc = measure(runs, accuracy);
        rows.push(
          [
            `rho ${rho.toFixed(2)}`,
            `budget ${budget}`,
            `rd<200 ${median(rd200.without)} -> ${median(rd200.withPrior)}`,
            `rd<150 ${median(rd150.without)} -> ${median(rd150.withPrior)}`,
            `acc ${median(acc.without).toFixed(3)} -> ${median(acc.withPrior).toFixed(3)}`,
          ].join(" | ")
        );
      }
    }
    // Printed rather than asserted: this is the measurement the docs quote,
    // and pinning medians to exact values would make every future pairing
    // change fail here instead of where it belongs.
    console.log("\n" + rows.join("\n") + "\n");
    expect(rows).toHaveLength(6);
  });
});
