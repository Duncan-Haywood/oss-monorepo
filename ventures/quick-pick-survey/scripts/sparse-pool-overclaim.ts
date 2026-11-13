/**
 * Why the pooled ranking overclaims on sparse long lists, and what fixes it
 * (docs/INFORMATION-GAIN-SELECTOR.md, "Sparse long lists: where the pooled
 * overclaim comes from").
 *
 * The long-list pooled run found that 5.4 to 14.3% of the item pairs the
 * pooled ranking calls "clearly above" (95% intervals that do not overlap) are
 * the wrong way round on 150 items at half to one answer per item per person,
 * against 0.5% on 15 to 30 items. Two suspects were named:
 *
 *   scale   per-person Glicko ratings from one or two answers per item are not
 *           on a common scale, or the one-game-at-a-time update under the
 *           adaptive selector biases them (an honest person's own 95% Glicko
 *           intervals hold only ~90%, "Per-person intervals from a refit")
 *   thin    the DerSimonian-Laird spread estimated from one or two people per item
 *
 * Honest panels only (no careless people), so every wrong call is the
 * estimator's. Estimators compared on the same simulated answers:
 *
 *   shipped     groupRanking over each person's Glicko-2 states (what ships)
 *   refit-dl    the same DerSimonian-Laird pool over each person's own
 *               Bradley-Terry refit (btRefit.ts): tests the Glicko update
 *   thin-off    shipped, but pairs with an item under THIN_RESPONDENTS raters
 *               are never called clear: tests the thin suspect
 *   joint       one Bradley-Terry fit of everyone's answers at once (one
 *               common scale by construction), model-based Hessian se
 *   joint-rob   the joint fit with a respondent-clustered (sandwich) se, which
 *               widens for people who disagree with each other
 *   sweep-cap   shipped, fed rows the way careless-pattern-sweep.ts's pooled()
 *               fed them before 2026-11-13 (rd capped at 349, so every
 *               never-answered row, rating 1500 and rd 350, counts as a rater):
 *               reproduces the reported overclaim
 *
 * Scores per estimator: clear pairs per survey, the wrong-way share among
 * them, the share of all ordered pairs called clear, Spearman with the common
 * truth, and the wrong-way share split by the smaller rater count of the pair.
 *
 *   npx tsx scripts/sparse-pool-overclaim.ts [--items 150] [--per-item 0.5,1] [--respondents 20,60] [--surveys 10] [--spread 0.25] [--selector staged|standard] [--seed-base 2000]
 */
import { selectNextPair, selectNextPairHybrid, type PairingInput } from "../src/lib/pairing";
import { simulate, spearman, type Policy } from "../src/lib/infoGainSim";
import { groupRanking, THIN_RESPONDENTS, type RatingRow, type RankedItem } from "../src/lib/groupRanking";
import { refitRatings, type RefitAnswer } from "../src/lib/btRefit";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nums = (s: string) => s.split(",").map(Number);
const itemCounts = nums(opt("--items", "150"));
const perItem = nums(opt("--per-item", "0.5,1"));
const panels = nums(opt("--respondents", "20,60"));
const nSurveys = Number(opt("--surveys", "10"));
const spread = Number(opt("--spread", "0.25"));
const seedBase = Number(opt("--seed-base", "2000"));
const selectorName = opt("--selector", "staged");
if (selectorName !== "staged" && selectorName !== "standard") throw new Error(`--selector must be staged or standard, got ${selectorName}`);
const choose = selectorName === "standard" ? selectNextPair : (i: PairingInput) => selectNextPairHybrid(i, {});
const policy: Policy = (input: PairingInput) => {
  const [a, b] = choose({ ...input, answerAgreement: undefined });
  return (input.rand ?? Math.random)() < 0.5 ? [a, b] : [b, a];
};

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = (rand: () => number) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

const SCALE = 173.7178;
type Est = { itemId: string; rating: number; low: number; high: number; respondents: number };

/** One Bradley-Terry fit of every answer, with model and respondent-clustered intervals. */
function jointFit(ids: string[], people: RefitAnswer[][]): { model: Est[]; robust: Est[] } {
  const all = people.flat();
  const fit = refitRatings(ids, all);
  const n = ids.length;
  const index = new Map(ids.map((id, i) => [id, i]));
  // Bread: the posterior covariance (inverse negative Hessian, prior included).
  const bread = fit.cov;
  // Meat: sum over people of their score vector's outer product (likelihood only).
  const meat = new Float64Array(n * n);
  const raters = new Array<number>(n).fill(0);
  for (const answers of people) {
    const g = new Map<number, number>();
    const seen = new Set<number>();
    for (const { winner, loser } of answers) {
      const w = index.get(winner)!, l = index.get(loser)!;
      const p = 1 / (1 + Math.exp(-(fit.mu[w] - fit.mu[l])));
      g.set(w, (g.get(w) ?? 0) + (1 - p));
      g.set(l, (g.get(l) ?? 0) - (1 - p));
      seen.add(w); seen.add(l);
    }
    for (const i of seen) raters[i]++;
    const entries = [...g];
    for (const [i, gi] of entries) for (const [j, gj] of entries) meat[i * n + j] += gi * gj;
  }
  // Small-sample correction G/(G-1) for G clusters.
  const G = people.length;
  const c = G > 1 ? G / (G - 1) : 1;
  const tmp = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
    const b = bread[i * n + k];
    if (b === 0) continue;
    for (let j = 0; j < n; j++) tmp[i * n + j] += b * meat[k * n + j];
  }
  const robust = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += tmp[i * n + k] * bread[k * n + j];
    robust[i * n + j] = c * s;
  }
  // Only differences are identified: report each item against the list's mean
  // (the covariance of mu_i - mean(mu)), or every interval carries the prior's
  // uncertainty about where the whole scale sits.
  const centred = (m: Float64Array) => {
    const row = new Array<number>(n).fill(0);
    let all = 0;
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) row[i] += m[i * n + j]; row[i] /= n; all += row[i]; }
    all /= n;
    return row.map((r, i) => Math.max(m[i * n + i] - 2 * r + all, 0));
  };
  const vm = centred(bread), vr = centred(robust);
  const mean = fit.mu.reduce((a, b) => a + b, 0) / n;
  const model: Est[] = [], robustEst: Est[] = [];
  ids.forEach((id, i) => {
    const r = 1500 + SCALE * (fit.mu[i] - mean);
    const sm = SCALE * Math.sqrt(vm[i]);
    // Never narrower than the model: the sandwich can undershoot on a thin item.
    const sr = Math.max(sm, SCALE * Math.sqrt(vr[i]));
    model.push({ itemId: id, rating: r, low: r - 1.96 * sm, high: r + 1.96 * sm, respondents: raters[i] });
    robustEst.push({ itemId: id, rating: r, low: r - 1.96 * sr, high: r + 1.96 * sr, respondents: raters[i] });
  });
  return { model, robust: robustEst };
}

type Score = { clear: number; wrong: number; pairs: number; rho: number; byThin: Record<string, [number, number]> };
function score(ids: string[], truth: number[], est: Est[], skipThin = false): Score {
  const by = new Map(est.map((e) => [e.itemId, e]));
  let clear = 0, wrong = 0, pairs = 0;
  const byThin: Record<string, [number, number]> = {};
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) {
    if (i === j) continue;
    pairs++;
    const a = by.get(ids[i])!, b = by.get(ids[j])!;
    if (!(a.low > b.high)) continue;
    const m = Math.min(a.respondents, b.respondents);
    if (skipThin && m < THIN_RESPONDENTS) continue;
    clear++;
    const bad = truth[i] < truth[j];
    if (bad) wrong++;
    const key = m < 3 ? "<3" : m < 6 ? "3-5" : m < 11 ? "6-10" : m < 21 ? "11-20" : ">20";
    byThin[key] ??= [0, 0];
    byThin[key][0]++;
    if (bad) byThin[key][1]++;
  }
  return { clear, wrong, pairs, rho: spearman(truth, ids.map((id) => by.get(id)!.rating)), byThin };
}

const fromRanked = (r: RankedItem[]): Est[] => r.map((x) => ({ itemId: x.itemId, rating: x.rating, low: x.low, high: x.high, respondents: x.respondents }));

for (const items of itemCounts) for (const k of perItem) for (const nResp of panels) {
  const budget = Math.max(1, Math.round(items * k));
  const acc: Record<string, Score[]> = {};
  let ratersSum = 0, ratersN = 0;
  for (let sv = 0; sv < nSurveys; sv++) {
    const svSeed = seedBase + sv * 104729 + items * 31 + Math.round(k * 10);
    const sr = mulberry32(svSeed);
    const common = Array.from({ length: items }, () => sr() * 2 - 1);
    const ids = common.map((_, i) => `item-${String(i).padStart(3, "0")}`);
    const glicko: RatingRow[] = [], refit: RatingRow[] = [];
    const answersBy: RefitAnswer[][] = [];
    for (let r = 0; r < nResp; r++) {
      const seed = svSeed + r * 7919;
      const pr = mulberry32(seed ^ 0x5bd1e995);
      const own = common.map((m) => m + spread * normal(pr));
      const res = simulate(policy, items, budget, seed, 0, 0, 0, false, undefined, 0, undefined, (i) => own[i]);
      for (const [itemId, s] of res.states) glicko.push({ itemId, rating: s.rating, rd: s.rd });
      const answers = res.history.map((h) => ({ winner: h.picked, loser: h.other }));
      answersBy.push(answers);
      const seen = [...new Set(answers.flatMap((a) => [a.winner, a.loser]))];
      const f = refitRatings(seen, answers);
      for (const id of seen) refit.push({ itemId: id, rating: f.rating.get(id)!, rd: f.rd.get(id)! });
    }
    const meta = ids.map((id) => ({ id, label: id }));
    const shipped = fromRanked(groupRanking(meta, glicko));
    for (const e of shipped) { ratersSum += e.respondents; ratersN++; }
    const add = (name: string, s: Score) => (acc[name] ??= []).push(s);
    add("shipped", score(ids, common, shipped));
    add("thin-off", score(ids, common, shipped, true));
    // careless-pattern-sweep.ts's pooled() with every weight 1: rd capped at 349, so never-answered rows (rd 350) count.
    add("sweep-cap", score(ids, common, fromRanked(groupRanking(meta, glicko.map((r) => ({ ...r, rd: Math.min(r.rd, 349) }))))));
    add("refit-dl", score(ids, common, fromRanked(groupRanking(meta, refit))));
    const j = jointFit(ids, answersBy);
    add("joint", score(ids, common, j.model));
    add("joint-rob", score(ids, common, j.robust));
  }
  const cell: Record<string, unknown> = { items, perItem: k, respondents: nResp, selector: selectorName, surveys: nSurveys, meanRaters: Number((ratersSum / ratersN).toFixed(1)) };
  for (const [name, ss] of Object.entries(acc)) {
    const clear = ss.reduce((a, s) => a + s.clear, 0), wrong = ss.reduce((a, s) => a + s.wrong, 0), pairs = ss.reduce((a, s) => a + s.pairs, 0);
    const byThin: Record<string, string> = {};
    for (const s of ss) for (const [key, [c, w]] of Object.entries(s.byThin)) {
      const [w0, c0] = (byThin[key] ?? "0/0").split("/").map(Number);
      byThin[key] = `${w0 + w}/${c0 + c}`;
    }
    cell[name] = {
      clearPerSurvey: Number((clear / ss.length).toFixed(1)),
      clearShare: Number((clear / pairs).toFixed(4)),
      wrongShare: Number((clear ? wrong / clear : 0).toFixed(4)),
      rho: Number((ss.reduce((a, s) => a + s.rho, 0) / ss.length).toFixed(4)),
      wrongByMinRaters: byThin,
    };
  }
  console.log(JSON.stringify(cell));
}
