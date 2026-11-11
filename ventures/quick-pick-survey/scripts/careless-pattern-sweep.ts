/**
 * Careless answering that is not random, scored on the survey's pooled ranking
 * (docs/INFORMATION-GAIN-SELECTOR.md, "Careless patterns that are not random").
 *
 * The anchor-weight sweep found the pool needs no protection from people who
 * answer at random some of the time: their ratings are a compressed, noisier
 * copy of their preferences. It named the gap: a careless pattern that is not
 * random could bias the pool instead. This measures three such patterns beside
 * the random one, and four ways a report could defend against them.
 *
 * Each survey has one common truth per item (uniform on [-1, 1]) and an
 * independent "salience" per item (uniform on [-1, 1]: a trait such as a
 * familiar name or a short label that has nothing to do with the question).
 * `--respondents` people each see the common truth plus their own N(0,
 * `--spread`) deviation. A share `--careless` of them (rounded) answer with one
 * pattern a share `--q` of the time:
 *
 *   random      a coin flip (the case already measured)
 *   first       the option in the first slot (slots are shuffled per pair, as
 *               /api/trials/next does)
 *   favourite   one item of their own, drawn at random, whenever it is shown
 *   salience    by salience instead of preference, as consistently as honest
 *               people answer by preference (same logistic slope); every
 *               careless person shares the same salience, so this is the
 *               pattern that can move the pool
 *
 * Everyone runs the staged selector (what ships) with the route's slot shuffle;
 * the first-option share reaches the selector as in the route. Pool schemes:
 *
 *   shipped     groupRanking (DerSimonian-Laird), equal weights
 *   first-flag  leave out people whose first-option share is >= 0.7 over 30+
 *               answers (the selector's own fallback rule, pairing.ts)
 *   loo-w       weight max(0, rho)^2, rho = Spearman of the person's ratings
 *               with the pool of everyone else (leave one out)
 *   loo-drop    leave out people whose leave-one-out rho is below `--loo-min`
 *   median      per item, the median of the people's ratings (no DL weights)
 *   oracle-drop leave out the careless people (the ceiling for any flag)
 *
 * Scores per scheme, averaged over surveys: Spearman with the common truth,
 * its paired difference from shipped with a standard error over surveys, the
 * pool's Spearman with salience (a leak), and the wrong-way share among pairs
 * the rank ranges call clear. Detection: the AUC of leave-one-out rho for
 * honest over careless people, and the first-flag rates.
 *
 *   npx tsx scripts/careless-pattern-sweep.ts [--items 15,30] [--per-item 4] [--respondents 20,60] [--careless 0.1,0.25,0.4] [--patterns random,first,favourite,salience] [--q 1] [--surveys 20] [--spread 0.25] [--loo-min 0.2] [--seed-base 2000]
 */
import { selectNextPairHybrid, type PairingInput } from "../src/lib/pairing";
import { DEFAULT_GLICKO_STATE } from "../src/lib/glicko2";
import { simulate, spearman, type Chooser, type Policy } from "../src/lib/infoGainSim";
import { groupRanking, type RatingRow } from "../src/lib/groupRanking";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nums = (s: string) => s.split(",").map(Number);
const itemCounts = nums(opt("--items", "15,30"));
const perItem = nums(opt("--per-item", "4"));
const panels = nums(opt("--respondents", "20,60"));
const shares = nums(opt("--careless", "0.1,0.25,0.4"));
const patterns = opt("--patterns", "random,first,favourite,salience").split(",");
const qs = nums(opt("--q", "1"));
const nSurveys = Number(opt("--surveys", "20"));
const spread = Number(opt("--spread", "0.25"));
const looMin = Number(opt("--loo-min", "0.2"));
const seedBase = Number(opt("--seed-base", "2000"));
const FLAG_SHARE = 0.7, FLAG_MIN = 30;

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

/** The staged selector with the route's slot shuffle (src/app/api/trials/next/route.ts). */
const routeStaged: Policy = (input: PairingInput) => {
  const [a, b] = selectNextPairHybrid({ ...input, answerAgreement: undefined });
  return (input.rand ?? Math.random)() < 0.5 ? [a, b] : [b, a];
};

type Person = { careless: boolean; rows: RatingRow[]; firstShare: number; answered: number; loo: number };

const answeredRows = (rows: RatingRow[]) => rows.filter((r) => r.rd < DEFAULT_GLICKO_STATE.rd - 1e-9);

function pooled(items: string[], people: { rows: RatingRow[]; w: number }[]) {
  const rows: RatingRow[] = [];
  for (const p of people) {
    if (p.w <= 0) continue;
    const scale = 1 / Math.sqrt(Math.max(p.w, 0.05));
    for (const r of p.rows) rows.push({ ...r, rd: Math.min(r.rd * scale, 349) });
  }
  return groupRanking(items.map((id) => ({ id, label: id })), rows);
}

function score(items: string[], truth: number[], salience: number[], ranked: ReturnType<typeof groupRanking>) {
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
  return { rho: spearman(truth, est), leak: spearman(salience, est), clear, wrong };
}

function medianScore(items: string[], truth: number[], salience: number[], people: Person[]) {
  const by = new Map<string, number[]>();
  for (const p of people) for (const r of answeredRows(p.rows)) (by.get(r.itemId) ?? by.set(r.itemId, []).get(r.itemId)!).push(r.rating);
  const est = items.map((id) => {
    const v = (by.get(id) ?? [DEFAULT_GLICKO_STATE.rating]).slice().sort((a, b) => a - b);
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  });
  return { rho: spearman(truth, est), leak: spearman(salience, est), clear: 0, wrong: 0 };
}

/** Area under the curve: chance a random honest person's rho beats a random careless person's. */
function auc(honest: number[], careless: number[]): number {
  if (!honest.length || !careless.length) return NaN;
  let s = 0;
  for (const h of honest) for (const c of careless) s += h > c ? 1 : h === c ? 0.5 : 0;
  return s / (honest.length * careless.length);
}

for (const pattern of patterns) {
  for (const q of qs) {
    for (const items of itemCounts) {
      for (const k of perItem) {
        for (const nResp of panels) {
          for (const share of shares) {
            const budget = items * k;
            const nCareless = Math.round(share * nResp);
            const acc: Record<string, { rho: number[]; leak: number[]; clear: number[]; wrong: number[] }> = {};
            const add = (name: string, s: { rho: number; leak: number; clear: number; wrong: number }) => {
              acc[name] ??= { rho: [], leak: [], clear: [], wrong: [] };
              acc[name].rho.push(s.rho);
              acc[name].leak.push(s.leak);
              acc[name].clear.push(s.clear);
              acc[name].wrong.push(s.wrong);
            };
            const looH: number[] = [], looC: number[] = [];
            let flagH = 0, flagC = 0, nH = 0, nC = 0;
            for (let sv = 0; sv < nSurveys; sv++) {
              const svSeed = seedBase + sv * 104729 + items * 31 + k;
              const sr = mulberry32(svSeed);
              const common = Array.from({ length: items }, () => sr() * 2 - 1);
              const salience = Array.from({ length: items }, () => sr() * 2 - 1);
              const ids = common.map((_, i) => `item-${String(i).padStart(3, "0")}`);
              const idx = new Map(ids.map((id, i) => [id, i]));
              const people: Person[] = [];
              for (let r = 0; r < nResp; r++) {
                const seed = svSeed + r * 7919;
                const pr = mulberry32(seed ^ 0x5bd1e995);
                const careless = r < nCareless;
                const own = common.map((m) => m + spread * normal(pr));
                const fav = ids[Math.floor(pr() * items)];
                const slots: string[] = [];
                const careChooser: Chooser | undefined = !careless
                  ? undefined
                  : pattern === "random"
                    ? (_a, _b, _p, rand) => (rand() < q ? rand() < 0.5 : undefined)
                    : pattern === "first"
                      ? (_a, _b, _p, rand) => (rand() < q ? true : undefined)
                      : pattern === "favourite"
                        ? (a, b, _p, rand) => (a === fav || b === fav ? (rand() < q ? a === fav : undefined) : undefined)
                        : (a, b, _p, rand) => (rand() < q ? rand() < 1 / (1 + Math.exp(-2 * (salience[idx.get(a)!] - salience[idx.get(b)!]))) : undefined);
                const chooser: Chooser = (a, b, p, rand) => {
                  slots.push(a);
                  return careChooser?.(a, b, p, rand);
                };
                const res = simulate(routeStaged, items, budget, seed, 0, 0, 0, false, undefined, 0, undefined, (i) => own[i], chooser);
                const firsts = res.history.filter((h, i) => h.picked === slots[i]).length;
                const rows = [...res.states].map(([itemId, s]) => ({ itemId, rating: s.rating, rd: s.rd }));
                people.push({ careless, rows, firstShare: firsts / res.history.length, answered: res.history.length, loo: NaN });
              }
              // Leave-one-out agreement with everyone else's pool.
              for (let i = 0; i < people.length; i++) {
                const p = people[i];
                const others = pooled(ids, people.filter((_, j) => j !== i).map((o) => ({ rows: o.rows, w: 1 })));
                const oth = new Map(others.map((o) => [o.itemId, o.rating]));
                const mine = answeredRows(p.rows);
                p.loo = mine.length >= 3 ? spearman(mine.map((m) => m.rating), mine.map((m) => oth.get(m.itemId)!)) : 0;
                if (!Number.isFinite(p.loo)) p.loo = 0;
                const flagged = p.answered >= FLAG_MIN && (p.firstShare >= FLAG_SHARE || p.firstShare <= 1 - FLAG_SHARE);
                if (p.careless) { looC.push(p.loo); nC++; if (flagged) flagC++; }
                else { looH.push(p.loo); nH++; if (flagged) flagH++; }
              }
              const flag = (p: Person) => p.answered >= FLAG_MIN && (p.firstShare >= FLAG_SHARE || p.firstShare <= 1 - FLAG_SHARE);
              add("shipped", score(ids, common, salience, pooled(ids, people.map((p) => ({ rows: p.rows, w: 1 })))));
              add("first-flag", score(ids, common, salience, pooled(ids, people.map((p) => ({ rows: p.rows, w: flag(p) ? 0 : 1 })))));
              add("loo-w", score(ids, common, salience, pooled(ids, people.map((p) => ({ rows: p.rows, w: Math.max(0, p.loo) ** 2 })))));
              add("loo-drop", score(ids, common, salience, pooled(ids, people.map((p) => ({ rows: p.rows, w: p.loo < looMin ? 0 : 1 })))));
              add("median", medianScore(ids, common, salience, people));
              add("oracle-drop", score(ids, common, salience, pooled(ids, people.map((p) => ({ rows: p.rows, w: p.careless ? 0 : 1 })))));
            }
            const cell: Record<string, unknown> = { pattern, q, items, perItem: k, respondents: nResp, careless: share, surveys: nSurveys };
            for (const [name, a] of Object.entries(acc)) {
              const clear = a.clear.reduce((x, y) => x + y, 0);
              const wrong = a.wrong.reduce((x, y) => x + y, 0);
              const base = acc["shipped"].rho;
              const d = a.rho.map((x, i) => x - base[i]);
              const md = mean(d);
              const se = d.length > 1 ? Math.sqrt(d.reduce((s2, x) => s2 + (x - md) ** 2, 0) / (d.length - 1) / d.length) : NaN;
              cell[name] = {
                rho: Number(mean(a.rho).toFixed(4)),
                vsShipped: Number(md.toFixed(4)),
                se: Number(se.toFixed(4)),
                leak: Number(mean(a.leak).toFixed(4)),
                clearPerSurvey: Number((clear / nSurveys).toFixed(1)),
                wrongShare: Number((clear ? wrong / clear : 0).toFixed(4)),
              };
            }
            cell.detect = {
              looAuc: Number(auc(looH, looC).toFixed(3)),
              looHonestMean: Number(mean(looH).toFixed(3)),
              looCarelessMean: Number(mean(looC).toFixed(3)),
              looHonestBelowMin: Number((looH.filter((x) => x < looMin).length / Math.max(looH.length, 1)).toFixed(3)),
              looCarelessBelowMin: Number((looC.filter((x) => x < looMin).length / Math.max(looC.length, 1)).toFixed(3)),
              firstFlagHonest: Number((flagH / Math.max(nH, 1)).toFixed(3)),
              firstFlagCareless: Number((flagC / Math.max(nC, 1)).toFixed(3)),
            };
            console.log(JSON.stringify(cell));
          }
        }
      }
    }
  }
}
