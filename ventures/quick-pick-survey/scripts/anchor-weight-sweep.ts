/**
 * Per-respondent weights from the anchor-pair lapse estimate, scored on the
 * survey's pooled ranking (docs/INFORMATION-GAIN-SELECTOR.md, "Anchor weights
 * in the pooled ranking").
 *
 * The anchor measurement (scripts/anchor-lapse-sweep.ts) found that under the
 * staged selector one easy "anchor" pair in every five or ten answers ranks
 * respondents by carelessness (AUC 0.80 to 0.99) but reads honest people at
 * 0.15 to 0.30, so the useful form is a flag or a down-weight in the pooled
 * report, not an e fed to the Glicko update. This measures that form.
 *
 * Each survey has one common truth per item (uniform on [-1, 1], the scale
 * src/lib/infoGainSim.ts uses) and `--respondents` people, each seeing the
 * common truth plus their own N(0, `--spread`) deviation per item and
 * answering at random a share e of the time, e drawn from `--mix`. Each
 * person runs the staged selector with an anchor every `--every` answers;
 * their lapse estimate is read from the anchor answers only (prequential,
 * uniform prior, or the survey's pooled prior fitted by EM). Their final
 * Glicko ratings are then combined by groupRanking's random-effects pool
 * (DerSimonian-Laird) under each scheme:
 *
 *   no-anchors   the same people with no anchors asked, equal weights (what ships)
 *   equal        anchors asked, equal weights (prices the anchor answers)
 *   w-flat       weight (1 - e_hat)^2, e_hat from a uniform prior
 *   w-pooled     weight (1 - e_hat)^2, e_hat from the survey's pooled prior
 *   drop-T       anchors asked, respondents with e_hat (uniform prior) > T left out
 *   oracle-w     weight (1 - e)^2 with the true e (the ceiling for weights)
 *   oracle-drop  true e >= 0.2 left out (the ceiling for a flag)
 *
 * A weight w enters the pool as that person's rd divided by sqrt(w), so their
 * answers count as fewer answers; (1 - e)^2 is roughly how much a lapse share
 * e shrinks the information in one answer about a preference. Floor 0.05.
 *
 * Scores per scheme, averaged over surveys: Spearman of the pooled ratings
 * against the common truth, and its paired difference from no-anchors (same
 * people, same seeds) with a standard error over surveys; "clear" pairs (the ranking's rank ranges call one
 * item clearly above the other, the default overlap rule) and the share of
 * them that are the wrong way round. Flag rates per threshold: share of
 * honest (e = 0), e = 0.1 and lapsing (e >= 0.2) respondents whose e_hat is
 * above it.
 *
 *   npx tsx scripts/anchor-weight-sweep.ts [--items 15,30] [--per-item 4,8] [--respondents 20,60] [--surveys 10] [--every 5] [--spread 0.25] [--mix 0:0.6,0.1:0.15,0.2:0.1,0.5:0.15] [--thresholds 0.3,0.4,0.5] [--seed-base 1000]
 */
import { selectNextPairHybrid, pairKey, type PairingInput } from "../src/lib/pairing";
import { DEFAULT_GLICKO_STATE } from "../src/lib/glicko2";
import { simulate, spearman, type Policy } from "../src/lib/infoGainSim";
import { LAPSE_GRID, pickProbability, pooledLapsePrior, posteriorMean, type LapseAnswer } from "../src/lib/lapseEstimate";
import { groupRanking, type RatingRow } from "../src/lib/groupRanking";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nums = (s: string) => s.split(",").map(Number);
const itemCounts = nums(opt("--items", "15,30"));
const perItem = nums(opt("--per-item", "4,8"));
const panels = nums(opt("--respondents", "20,60"));
const nSurveys = Number(opt("--surveys", "10"));
const every = Number(opt("--every", "5"));
const spread = Number(opt("--spread", "0.25"));
const thresholds = nums(opt("--thresholds", "0.3,0.4,0.5"));
const seedBase = Number(opt("--seed-base", "1000"));
const minShown = 2;
const mix = opt("--mix", "0:0.6,0.1:0.15,0.2:0.1,0.5:0.15")
  .split(",")
  .map((s) => s.split(":").map(Number) as [number, number]);

const staged: Policy = (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined });
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}
function drawLapse(u: number): number {
  let acc = 0;
  for (const [e, w] of mix) {
    acc += w;
    if (u < acc) return e;
  }
  return mix[mix.length - 1][0];
}

/** As scripts/anchor-lapse-sweep.ts: every `every`-th answer is the most lopsided eligible pair. */
function withAnchors(base: Policy, n: number, anchors: Set<number>): Policy {
  return (input: PairingInput) => {
    const k = input.answeredCount ?? 0;
    if (n > 0 && k > 0 && k % n === 0) {
      const pool = input.items.filter((it) => (input.timesShown.get(it.id) ?? 0) >= minShown);
      let best: [string, string] | null = null;
      let bestGap = -1;
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          if (input.recentPairKeys.has(pairKey(pool[i].id, pool[j].id))) continue;
          const p = pickProbability({ ...DEFAULT_GLICKO_STATE, ...pool[i] }, { ...DEFAULT_GLICKO_STATE, ...pool[j] });
          const gap = Math.abs(p - 0.5);
          if (gap > bestGap) {
            bestGap = gap;
            best = (input.rand ?? Math.random)() < 0.5 ? [pool[i].id, pool[j].id] : [pool[j].id, pool[i].id];
          }
        }
      }
      if (best) {
        anchors.add(k);
        return best;
      }
    }
    return base(input);
  };
}

function logLik(answers: readonly LapseAnswer[]): number[] {
  return LAPSE_GRID.map((e) => answers.reduce((s, a) => s + Math.log(e / 2 + (1 - e) * (a.p ?? 0.5)), 0));
}
const uniform = LAPSE_GRID.map(() => 0);

type Person = { e: number; ll: number[]; eFlat: number; ePooled: number; rows: RatingRow[]; rowsNoAnchor: RatingRow[] };

function rowsOf(states: ReadonlyMap<string, { rating: number; rd: number }>): RatingRow[] {
  return [...states].map(([itemId, s]) => ({ itemId, rating: s.rating, rd: s.rd }));
}

function score(items: string[], truth: number[], people: { rows: RatingRow[]; w: number }[]) {
  const rows: RatingRow[] = [];
  for (const p of people) {
    if (p.w <= 0) continue;
    const scale = 1 / Math.sqrt(Math.max(p.w, 0.05));
    for (const r of p.rows) rows.push({ ...r, rd: Math.min(r.rd * scale, 349) });
  }
  const ranked = groupRanking(items.map((id) => ({ id, label: id })), rows);
  const byId = new Map(ranked.map((r) => [r.itemId, r]));
  const est = items.map((id) => byId.get(id)!.rating);
  let clear = 0, wrong = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const a = byId.get(items[i])!, b = byId.get(items[j])!;
      if (a.low > b.high) {
        clear++;
        if (truth[i] < truth[j]) wrong++;
      }
    }
  }
  return { rho: spearman(truth, est), clear, wrong };
}

for (const items of itemCounts) {
  for (const k of perItem) {
    for (const nResp of panels) {
      const budget = items * k;
      const acc: Record<string, { rho: number[]; clear: number[]; wrong: number[] }> = {};
      const flags: { e: number; eFlat: number }[] = [];
      const add = (name: string, s: { rho: number; clear: number; wrong: number }) => {
        acc[name] ??= { rho: [], clear: [], wrong: [] };
        acc[name].rho.push(s.rho);
        acc[name].clear.push(s.clear);
        acc[name].wrong.push(s.wrong);
      };
      for (let sv = 0; sv < nSurveys; sv++) {
        const svSeed = seedBase + sv * 104729 + items * 31 + k;
        const sr = mulberry32(svSeed);
        const common = Array.from({ length: items }, () => sr() * 2 - 1);
        const ids = common.map((_, i) => `item-${String(i).padStart(3, "0")}`);
        const people: Person[] = [];
        for (let r = 0; r < nResp; r++) {
          const seed = svSeed + r * 7919;
          const pr = mulberry32(seed ^ 0x5bd1e995);
          const e = drawLapse(pr());
          const own = common.map((m) => m + spread * normal(pr));
          const truthFor = (i: number) => own[i];
          const anchors = new Set<number>();
          const res = simulate(withAnchors(staged, every, anchors), items, budget, seed, e, 0, 0, false, undefined, 0, undefined, truthFor);
          const noA = simulate(staged, items, budget, seed, e, 0, 0, false, undefined, 0, undefined, truthFor);
          const ll = logLik(res.history.filter((_, i) => anchors.has(i)));
          people.push({ e, eFlat: posteriorMean(ll, uniform), ePooled: NaN, rows: rowsOf(res.states), rowsNoAnchor: rowsOf(noA.states), ll });
        }
        const prior = pooledLapsePrior(people.map((p) => p.ll)).map(Math.log);
        for (const p of people) p.ePooled = posteriorMean(p.ll, prior);
        for (const p of people) flags.push({ e: p.e, eFlat: p.eFlat });

        add("no-anchors", score(ids, common, people.map((p) => ({ rows: p.rowsNoAnchor, w: 1 }))));
        add("equal", score(ids, common, people.map((p) => ({ rows: p.rows, w: 1 }))));
        add("w-flat", score(ids, common, people.map((p) => ({ rows: p.rows, w: (1 - p.eFlat) ** 2 }))));
        add("w-pooled", score(ids, common, people.map((p) => ({ rows: p.rows, w: (1 - p.ePooled) ** 2 }))));
        for (const t of thresholds) add(`drop-${t}`, score(ids, common, people.map((p) => ({ rows: p.rows, w: p.eFlat > t ? 0 : 1 }))));
        add("oracle-w", score(ids, common, people.map((p) => ({ rows: p.rows, w: (1 - p.e) ** 2 }))));
        add("oracle-drop", score(ids, common, people.map((p) => ({ rows: p.rows, w: p.e >= 0.2 ? 0 : 1 }))));
      }
      const cell: Record<string, unknown> = { items, perItem: k, respondents: nResp, surveys: nSurveys, every, spread };
      for (const [name, a] of Object.entries(acc)) {
        const clear = a.clear.reduce((x, y) => x + y, 0);
        const wrong = a.wrong.reduce((x, y) => x + y, 0);
        const base = acc["no-anchors"].rho;
        const d = a.rho.map((x, i) => x - base[i]);
        const md = mean(d);
        const se = d.length > 1 ? Math.sqrt(d.reduce((s2, x) => s2 + (x - md) ** 2, 0) / (d.length - 1) / d.length) : NaN;
        cell[name] = { rho: Number(mean(a.rho).toFixed(4)), vsShipped: Number(md.toFixed(4)), se: Number(se.toFixed(4)), clearPerSurvey: Number((clear / nSurveys).toFixed(1)), wrongShare: Number((clear ? wrong / clear : 0).toFixed(4)) };
      }
      const share = (pred: (x: { e: number }) => boolean, t: number) => {
        const g = flags.filter(pred);
        return Number((g.filter((x) => x.eFlat > t).length / Math.max(g.length, 1)).toFixed(3));
      };
      cell.flags = Object.fromEntries(
        thresholds.map((t) => [t, { honest: share((x) => x.e === 0, t), e01: share((x) => x.e === 0.1, t), lapsers: share((x) => x.e >= 0.2, t) }]),
      );
      console.log(JSON.stringify(cell));
    }
  }
}
