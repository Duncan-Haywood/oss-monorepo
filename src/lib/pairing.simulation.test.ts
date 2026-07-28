/**
 * Does a person who answers a realistic number of questions end up with
 * anything the couple screen can use?
 *
 * This drives the real `selectNextPair` and the real Glicko-2 update against
 * a synthetic respondent who has fixed latent preferences and answers
 * probabilistically. It is the only way to check the question-selection
 * policy without a database and without a person: the quantity it measures —
 * how far rating deviation falls for a given answer budget — is a property of
 * the whole loop, not of any function in it.
 *
 * The model is calibrated. Driving two real accounts through the 41-item
 * activities survey against a local Postgres reached a lowest rd of about 170
 * after roughly 90 answers; this simulation reaches 159 under the same
 * conditions, so it is measuring the same thing the app does.
 */
import { describe, expect, it } from "vitest";
import { applyComparison, DEFAULT_GLICKO_STATE, type GlickoState } from "@/lib/glicko2";
import { activeSetSize, admissionOrder, pairKey, selectNextPair, type PairItem } from "@/lib/pairing";

/** Deterministic PRNG, so the respondent's answers don't vary between runs. */
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

type SimResult = {
  /** Items whose deviation fell below the threshold the couple screen needs. */
  under: (threshold: number) => number;
  /** Spearman correlation between the recovered ranking and the truth. */
  rankAccuracy: number;
};

function simulate(itemCount: number, budget: number, seed: number): SimResult {
  const rand = mulberry32(seed);
  const CATEGORIES = 6;

  const truth = new Map<string, number>();
  const state = new Map<string, GlickoState>();
  const timesShown = new Map<string, number>();
  const items: PairItem[] = [];

  for (let i = 0; i < itemCount; i++) {
    const id = `item-${String(i).padStart(3, "0")}`;
    truth.set(id, rand() * 2 - 1);
    state.set(id, { ...DEFAULT_GLICKO_STATE });
    items.push({
      id,
      rating: DEFAULT_GLICKO_STATE.rating,
      rd: DEFAULT_GLICKO_STATE.rd,
      category: `category-${i % CATEGORIES}`,
      dimensions: [`dimension-${i % 4}`],
    });
  }

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
      rand,
    });

    // Bradley-Terry: the stronger latent preference wins more often, but not
    // always — a respondent who answered deterministically would make the
    // system look better than it is.
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

  const rds = [...state.values()].map((s) => s.rd);

  // Rank accuracy is only meaningful over items the app would actually show,
  // so it is measured on the confident ones rather than the whole set.
  const confident = [...state.entries()].filter(([, s]) => s.rd < 200);
  const rankAccuracy = confident.length < 3 ? 0 : spearman(
    confident.map(([id]) => truth.get(id)!),
    confident.map(([, s]) => s.rating)
  );

  return { under: (t) => rds.filter((rd) => rd < t).length, rankAccuracy };
}

function spearman(xs: number[], ys: number[]): number {
  const rank = (values: number[]) => {
    const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const ranks = new Array<number>(values.length);
    order.forEach(([, i], r) => (ranks[i] = r));
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const mean = (n - 1) / 2;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mean) * (ry[i] - mean);
    dx += (rx[i] - mean) ** 2;
    dy += (ry[i] - mean) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

/** Median over seeds — `selectNextPair` draws from Math.random internally. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function repeat<T>(times: number, fn: (seed: number) => T): T[] {
  return Array.from({ length: times }, (_, i) => fn(1000 + i * 7));
}

describe("activeSetSize", () => {
  it("leaves a small survey alone", () => {
    expect(activeSetSize(0, 16)).toBe(16);
    expect(activeSetSize(90, 20)).toBe(20);
  });

  it("stages a large survey, starting at the core and growing with answers", () => {
    expect(activeSetSize(0, 220)).toBe(14);
    expect(activeSetSize(50, 220)).toBe(24);
    expect(activeSetSize(500, 220)).toBe(114);
  });

  it("never exceeds the survey it is drawing from", () => {
    expect(activeSetSize(100_000, 41)).toBe(41);
  });

  it("only ever grows as answers accumulate", () => {
    let previous = 0;
    for (let answered = 0; answered <= 400; answered += 7) {
      const size = activeSetSize(answered, 220);
      expect(size).toBeGreaterThanOrEqual(previous);
      previous = size;
    }
  });
});

describe("admissionOrder", () => {
  it("spreads the early core across categories rather than filling one", () => {
    const items: PairItem[] = Array.from({ length: 60 }, (_, i) => ({
      id: `item-${String(i).padStart(2, "0")}`,
      rating: 1500,
      rd: 350,
      category: `category-${i % 5}`,
    }));

    const core = admissionOrder(items).slice(0, 10);
    expect(new Set(core.map((i) => i.category)).size).toBe(5);
  });

  it("is stable, so a growing set never evicts an item that holds answers", () => {
    const items: PairItem[] = Array.from({ length: 40 }, (_, i) => ({
      id: `item-${String(i).padStart(2, "0")}`,
      rating: 1500,
      rd: 350,
      category: `category-${i % 4}`,
    }));

    const first = admissionOrder(items).map((i) => i.id);
    const shuffled = [...items].reverse();
    expect(admissionOrder(shuffled).map((i) => i.id)).toEqual(first);
  });
});

describe("answer budget vs. usable confidence", () => {
  // The regression this file exists for. Before progressive broadening the
  // 220-item combined survey put ZERO items under rd 200 after 90 answers,
  // and zero under 150 after 300 — the coverage term spread every answer
  // evenly over 220 items, so nothing ever finished. The couple comparison
  // needs rd < 150 before it carries signal, so the screen was unreachable
  // by construction rather than by accident.
  it("gets a realistic session to a usable ranking on the 220-item survey", () => {
    const under200 = median(repeat(5, (seed) => simulate(220, 90, seed).under(200)));
    expect(under200).toBeGreaterThanOrEqual(12);
  });

  it("reaches the couple-screen threshold on a long session", () => {
    const under150 = median(repeat(5, (seed) => simulate(220, 300, seed).under(150)));
    expect(under150).toBeGreaterThanOrEqual(15);
  });

  it("ranks the items it is confident about in roughly the right order", () => {
    const accuracy = median(repeat(5, (seed) => simulate(220, 150, seed).rankAccuracy));
    expect(accuracy).toBeGreaterThan(0.5);
  });

  it("still finishes a small survey outright", () => {
    const under200 = median(repeat(5, (seed) => simulate(16, 90, seed).under(200)));
    expect(under200).toBe(16);
  });
});
