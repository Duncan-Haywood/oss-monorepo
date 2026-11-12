/**
 * Answer times as a signal outside the answers: can they tell a careless block
 * from a genuine camp? (docs/INFORMATION-GAIN-SELECTOR.md, "Answer times:
 * telling a careless block from a camp").
 *
 * The careless-pattern sweep found that leave-one-out agreement cannot tell
 * people who pick by a shared wrong reason from a camp with a real second
 * taste (both score about the same), and that a careless majority is not
 * detectable from the answers at all. `Trial.msToAnswer` is stored for every
 * answer. This measures two timing signals, under timing assumptions that are
 * swept rather than trusted, and the pool schemes they would allow.
 *
 * Panels and patterns are the careless-pattern sweep's (common truth uniform on
 * [-1, 1], personal deviation N(0, `--spread`), salience independent of truth,
 * a share `--careless` answering by one pattern on every answer; `dissent` is a
 * camp with a second taste answering honestly).
 *
 * Timing model (milliseconds), all of it an assumption:
 *
 *   each person has a pace: base = 2500 * exp(`--person-sd` * N(0,1))
 *   honest answer   base * (1 + `--gamma` * exp(-|own[a] - own[b]| / 0.25)) * exp(0.35 N)
 *                   (slower on pairs that are close in their own taste; gamma 0
 *                   switches that off)
 *   careless answer base * `--ratio` * (1 + `--careless-gamma` * closeness) * exp(0.35 N)
 *                   closeness under the pattern's own key (salience for
 *                   salience pickers; none for random and first)
 *
 * Signals per person:
 *
 *   pace   their median time over the panel's median of medians
 *   slope  Spearman of their times with how close each pair is in the pool of
 *          everyone else's ratings (-|rating gap|); positive when they slow
 *          down where the panel finds the choice hard
 *
 * Pool schemes (each scored as the paired Spearman difference from shipped):
 *
 *   shipped      equal weights (what ships)
 *   loo-drop     leave out leave-one-out rho < 0.2 (the note's threshold)
 *   pace-drop    leave out pace < `--pace-min`
 *   loo-pace     leave out rho < 0.2 AND pace < `--pace-min`
 *   loo-slope    leave out rho < 0.2 AND slope < `--slope-min`
 *   oracle-drop  leave out the careless (for dissent: the camp; a ceiling only)
 *
 *   npx tsx scripts/answer-time-sweep.ts [--items 15,30] [--per-item 4] [--respondents 20] [--careless 0.25,0.4,0.5] [--patterns salience,random,dissent] [--ratio 1,0.6,0.4] [--gamma 0.6] [--careless-gamma 0] [--person-sd 0.4] [--pace-min 0.6] [--slope-min 0.05] [--surveys 20] [--seed-base 4000] [--selector staged|standard]
 */
import { selectNextPair, selectNextPairHybrid, type PairingInput } from "../src/lib/pairing";
import { DEFAULT_GLICKO_STATE } from "../src/lib/glicko2";
import { simulate, spearman, type Chooser, type Policy } from "../src/lib/infoGainSim";
import { groupRanking, type RatingRow } from "../src/lib/groupRanking";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nums = (s: string) => s.split(",").map(Number);
const itemCounts = nums(opt("--items", "15,30"));
const perItem = nums(opt("--per-item", "4"));
const panels = nums(opt("--respondents", "20"));
const shares = nums(opt("--careless", "0.25,0.4,0.5"));
const patterns = opt("--patterns", "salience,random,dissent").split(",");
const ratios = nums(opt("--ratio", "1,0.6,0.4"));
const gammas = nums(opt("--gamma", "0.6"));
const carelessGamma = Number(opt("--careless-gamma", "0"));
const personSd = Number(opt("--person-sd", "0.4"));
const paceMin = Number(opt("--pace-min", "0.6"));
const slopeMin = Number(opt("--slope-min", "0.05"));
const nSurveys = Number(opt("--surveys", "20"));
const spread = Number(opt("--spread", "0.25"));
const seedBase = Number(opt("--seed-base", "4000"));
const LOO_MIN = 0.2;

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const median = (v: number[]) => {
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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
function normal(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

/** `--selector staged|standard`: which pair selector everyone runs (staged unless named). */
const selectorName = opt("--selector", "staged");
if (selectorName !== "staged" && selectorName !== "standard") throw new Error(`--selector must be staged or standard, got ${selectorName}`);
const choose = selectorName === "standard" ? selectNextPair : selectNextPairHybrid;

/** The chosen selector with the route's slot shuffle (src/app/api/trials/next/route.ts). */
const routeStaged: Policy = (input: PairingInput) => {
  const [a, b] = choose({ ...input, answerAgreement: undefined });
  return (input.rand ?? Math.random)() < 0.5 ? [a, b] : [b, a];
};

type Shown = { a: string; b: string; ms: number };
type Person = { careless: boolean; rows: RatingRow[]; shown: Shown[]; loo: number; pace: number; slope: number };

const answeredRows = (rows: RatingRow[]) => rows.filter((r) => r.rd < DEFAULT_GLICKO_STATE.rd - 1e-9);

function pooled(items: string[], people: { rows: RatingRow[]; keep: boolean }[]) {
  const rows: RatingRow[] = [];
  for (const p of people) if (p.keep) rows.push(...p.rows);
  return groupRanking(items.map((id) => ({ id, label: id })), rows);
}

function score(items: string[], truth: number[], ranked: ReturnType<typeof groupRanking>) {
  const byId = new Map(ranked.map((r) => [r.itemId, r]));
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
  return { rho: spearman(truth, items.map((id) => byId.get(id)!.rating)), clear, wrong };
}

function auc(hi: number[], lo: number[]): number {
  if (!hi.length || !lo.length) return NaN;
  let s = 0;
  for (const h of hi) for (const c of lo) s += h > c ? 1 : h === c ? 0.5 : 0;
  return s / (hi.length * lo.length);
}
const share = (v: boolean[]) => (v.length ? Number((v.filter(Boolean).length / v.length).toFixed(3)) : null);

for (const pattern of patterns) {
  for (const ratio of ratios) {
    for (const gamma of gammas) {
      for (const items of itemCounts) {
        for (const k of perItem) {
          for (const nResp of panels) {
            for (const frac of shares) {
              const budget = items * k;
              const nCareless = Math.round(frac * nResp);
              const acc: Record<string, { rho: number[]; clear: number; wrong: number }> = {};
              const sig = { paceH: [] as number[], paceC: [] as number[], slopeH: [] as number[], slopeC: [] as number[] };
              const flags: Record<string, { h: boolean[]; c: boolean[] }> = {};
              for (let sv = 0; sv < nSurveys; sv++) {
                const svSeed = seedBase + sv * 104729 + items * 31 + k;
                const sr = mulberry32(svSeed);
                const common = Array.from({ length: items }, () => sr() * 2 - 1);
                const salience = Array.from({ length: items }, () => sr() * 2 - 1);
                const camp = Array.from({ length: items }, () => sr() * 2 - 1);
                const target = pattern === "dissent" ? common.map((m, i) => (1 - nCareless / nResp) * m + (nCareless / nResp) * camp[i]) : common;
                const ids = common.map((_, i) => `item-${String(i).padStart(3, "0")}`);
                const idx = new Map(ids.map((id, i) => [id, i]));
                const people: Person[] = [];
                for (let r = 0; r < nResp; r++) {
                  const seed = svSeed + r * 7919;
                  const pr = mulberry32(seed ^ 0x5bd1e995);
                  const tr = mulberry32(seed ^ 0x2545f491); // timing draws only, so answers match the careless-pattern sweep's streams
                  const careless = r < nCareless;
                  const isCareless = careless && pattern !== "dissent";
                  const own = (careless && pattern === "dissent" ? camp : common).map((m) => m + spread * normal(pr));
                  const base = 2500 * Math.exp(personSd * normal(tr));
                  const shown: Shown[] = [];
                  const careChooser: Chooser | undefined = !isCareless
                    ? undefined
                    : pattern === "random"
                      ? (_a, _b, _p, rand) => rand() < 0.5
                      : pattern === "first"
                        ? () => true
                        : (a, b, _p, rand) => rand() < 1 / (1 + Math.exp(-2 * (salience[idx.get(a)!] - salience[idx.get(b)!])));
                  const chooser: Chooser = (a, b, p, rand) => {
                    const ia = idx.get(a)!, ib = idx.get(b)!;
                    let ms: number;
                    if (!isCareless) ms = base * (1 + gamma * Math.exp(-Math.abs(own[ia] - own[ib]) / 0.25));
                    else {
                      const close = pattern === "salience" ? Math.exp(-Math.abs(salience[ia] - salience[ib]) / 0.25) : 0;
                      ms = base * ratio * (1 + carelessGamma * close);
                    }
                    shown.push({ a, b, ms: ms * Math.exp(0.35 * normal(tr)) });
                    return careChooser?.(a, b, p, rand);
                  };
                  const res = simulate(routeStaged, items, budget, seed, 0, 0, 0, false, undefined, 0, undefined, (i) => own[i], chooser);
                  const rows = [...res.states].map(([itemId, s]) => ({ itemId, rating: s.rating, rd: s.rd }));
                  people.push({ careless, rows, shown, loo: NaN, pace: NaN, slope: NaN });
                }
                const medians = people.map((p) => median(p.shown.map((s) => s.ms)));
                const panelPace = median(medians);
                for (let i = 0; i < people.length; i++) {
                  const p = people[i];
                  const others = pooled(ids, people.map((o, j) => ({ rows: o.rows, keep: j !== i })));
                  const oth = new Map(others.map((o) => [o.itemId, o.rating]));
                  const mine = answeredRows(p.rows);
                  p.loo = mine.length >= 3 ? spearman(mine.map((m) => m.rating), mine.map((m) => oth.get(m.itemId)!)) : 0;
                  if (!Number.isFinite(p.loo)) p.loo = 0;
                  p.pace = medians[i] / panelPace;
                  p.slope = spearman(p.shown.map((s) => s.ms), p.shown.map((s) => -Math.abs(oth.get(s.a)! - oth.get(s.b)!)));
                  if (!Number.isFinite(p.slope)) p.slope = 0;
                  (p.careless ? sig.paceC : sig.paceH).push(p.pace);
                  (p.careless ? sig.slopeC : sig.slopeH).push(p.slope);
                }
                const rules: Record<string, (p: Person) => boolean> = {
                  "loo-drop": (p) => p.loo < LOO_MIN,
                  "pace-drop": (p) => p.pace < paceMin,
                  "loo-pace": (p) => p.loo < LOO_MIN && p.pace < paceMin,
                  "loo-slope": (p) => p.loo < LOO_MIN && p.slope < slopeMin,
                  "oracle-drop": (p) => p.careless,
                };
                const add = (name: string, s: { rho: number; clear: number; wrong: number }) => {
                  acc[name] ??= { rho: [], clear: 0, wrong: 0 };
                  acc[name].rho.push(s.rho);
                  acc[name].clear += s.clear;
                  acc[name].wrong += s.wrong;
                };
                add("shipped", score(ids, target, pooled(ids, people.map((p) => ({ rows: p.rows, keep: true })))));
                for (const [name, drop] of Object.entries(rules)) {
                  add(name, score(ids, target, pooled(ids, people.map((p) => ({ rows: p.rows, keep: !drop(p) })))));
                  flags[name] ??= { h: [], c: [] };
                  for (const p of people) (p.careless ? flags[name].c : flags[name].h).push(drop(p));
                }
              }
              const cell: Record<string, unknown> = { pattern, ratio, gamma, carelessGamma, personSd, items, perItem: k, respondents: nResp, careless: frac, surveys: nSurveys };
              const base = acc["shipped"].rho;
              for (const [name, a] of Object.entries(acc)) {
                const d = a.rho.map((x, i) => x - base[i]);
                const md = mean(d);
                const se = d.length > 1 ? Math.sqrt(d.reduce((s2, x) => s2 + (x - md) ** 2, 0) / (d.length - 1) / d.length) : NaN;
                cell[name] = {
                  rho: Number(mean(a.rho).toFixed(4)),
                  vsShipped: Number(md.toFixed(4)),
                  se: Number(se.toFixed(4)),
                  wrongShare: Number((a.clear ? a.wrong / a.clear : 0).toFixed(4)),
                  ...(flags[name] ? { flagHonest: share(flags[name].h), flagCareless: share(flags[name].c) } : {}),
                };
              }
              cell.detect = {
                // Honest (or the majority, for dissent) over careless (or the camp): above 0.5 means the signal separates them.
                paceAuc: Number(auc(sig.paceH, sig.paceC).toFixed(3)),
                slopeAuc: Number(auc(sig.slopeH, sig.slopeC).toFixed(3)),
                paceHonestMedian: Number(median(sig.paceH).toFixed(3)),
                paceCarelessMedian: sig.paceC.length ? Number(median(sig.paceC).toFixed(3)) : null,
                slopeHonestMean: Number(mean(sig.slopeH).toFixed(3)),
                slopeCarelessMean: sig.slopeC.length ? Number(mean(sig.slopeC).toFixed(3)) : null,
              };
              console.log(JSON.stringify(cell));
            }
          }
        }
      }
    }
  }
}
