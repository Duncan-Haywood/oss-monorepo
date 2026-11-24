// A short-phase rule for composites of business lines, on a fresh make: a SaaS company's sign-ups, active users,
// MRR and paid invoices.
//
// Open item from README "Several business lines that share a cycle" (eval/turns-business-lines.mjs, seed 20261124):
// the composite beat revenue alone (0.932 vs 0.869) but fell 0.042 short of the hindsight-best line, and a post-hoc
// look put the misses on short contractions: the composite's swings are small, BBQ's 6-month phase minimum drops a
// short contraction, and bigMove 0.05 does not rescue it. "Next ... a fresh pre-registered round (new seed, a
// different make, such as a SaaS company's sign-ups, active users, MRR and paid invoices) on a short-phase rule for
// composites (minimum phase 3 months, or a short phase kept when it moves a set share of the composite's median
// phase move), with NBER's 16 of 16 on the FRED composite kept as a bar."
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Nothing here has been run on
// this make or with these two rules before. The shop make of the last round is used only as a guard (K5).
//
// Simulation, one draw (a different make from the shop round; the same structure):
//   Latent log activity L over n + 5 months (n = 144 primary). It starts in an expansion at a random point of it;
//   expansions last U{20..50} months, contractions U{5..15}; monthly growth in each expansion U(0.5%, 1.5%), in each
//   contraction -U(0.5%, 2.0%). Its switch months are the true turns, scored at months 6..n-7.
//   Four lines, log line_t = d_i t + b_i L_{t - lag_i} + e_i,t, AR(1) noise e (coefficient phi_i, innovation sd
//   s_i times the noise scale), drift d_i ~ U(-0.1%, +0.5%) per month:
//     sign-ups      lag -2 (leads), b 1.6, s 4.0%, phi 0.2
//     active users  lag +1,         b 0.7, s 0.8%, phi 0.7
//     MRR           lag +3,         b 0.5, s 0.3%, phi 0.85 (subscriptions: smooth and late)
//     paid invoices lag +1,         b 0.9, s 2.5%, phi 0.2
//   Noise scale 1 carries the bars; 0.5 and 2 are printed, as are n = 96 and 240.
// Composite: compositeIndex(lines) (Conference Board method, volatility over every month), as `--turns --columns`.
// Rules on the composite (all monthly: window 5, cycles 15):
//   shipped  the current default: minPhase 6, bigMove 0.05
//   P3       minPhase 3, bigMove 0.05
//   REL      minPhase 6; first date with shipped, take m = the median |log move| of the phases it finds; then date
//            again with bigMove = min(0.05, 0.25 m) (0.05 when the first pass finds fewer than 2 phases). A short phase
//            is kept when it moves a quarter of the composite's own median phase move, so the rule follows the
//            composite's scale instead of a fixed 5%.
// Single lines are always dated with the shipped rule (a short-phase rule for composites is what is tested).
// Scoring as the shop round: a true turn matched by a found turn of its kind within 3 months; a found turn is false
// when no true turn of its kind is within 6; F1 from precision and recall (0 when either is 0). 500 draws, seed
// 20261125; draws with fewer than 2 true turns are redrawn.
//
// Bars, for each of P3 and REL (two arms, so the sign test's level is halved to 0.025):
//   K1 better than shipped on this make: mean paired F1 difference (arm - shipped, on the composite) >= +0.02, more
//      wins than losses, two-sided sign test p <= 0.025 (ties |difference| < 0.005 left out);
//   K2 within 0.03 of the hindsight-best single line (each draw's best of the four, shipped rule): mean F1;
//   K3 no flood of false turns: mean false turns a draw on the composite at most shipped's + 0.10;
//   K4 NBER kept: on the FRED composite of eval/turns-composite.mjs arm A (PAYEMS, W875RX1, INDPRO, CMRMTSPL,
//      1967-01 to 2026-07, volatility to 2019-12), all 16 NBER turns matched within 3 months, at most 2 false;
//   K5 no loss on the shop make: on the last round's 500 draws (seed 20261124, n 144, noise 1), mean composite F1
//      at least shipped's (0.932 there).
// Ships: an arm passing K1-K5 becomes the monthly default for `--turns --columns` (composites only; one column and
// quarterly keep their rules), in the CLI text, --json and the page, with "How far to trust it" updated. If both
// pass, the one with the higher K1 mean difference. If neither passes, nothing changes and the round is written up
// as it fell.
// Printed, no bar: each line's mean F1 and MRR's against the composite; misses and false turns a draw; the
// composite's median timing error; the side scales and lengths; REL's bigMove values.
//
// usage: node eval/turns-saas-lines.mjs > eval/turns-saas-lines.out.txt
import { fileURLToPath } from 'node:url';
import { turningPoints } from '../turning-points.mjs';
import { compositeIndex } from '../composite-index.mjs';
import { draw as shopDraw, score } from './turns-business-lines.mjs';

const SEED = 20261125, DRAWS = 500, NEAR = 3;
export const LINES = [
  { name: 'sign-ups', lag: -2, b: 1.6, s: 0.040, phi: 0.2 },
  { name: 'active users', lag: 1, b: 0.7, s: 0.008, phi: 0.7 },
  { name: 'MRR', lag: 3, b: 0.5, s: 0.003, phi: 0.85 },
  { name: 'paid invoices', lag: 1, b: 0.9, s: 0.025, phi: 0.2 },
];
const MRR = 2;

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (u) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
const unif = (u, a, b) => a + (b - a) * u();
const uint = (u, a, b) => a + Math.floor(u() * (b - a + 1));
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const median = (v) => { const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const SHIPPED = { frequency: 'monthly', bigMove: 0.05 };
export const RULES = {
  shipped: (x) => ({ turns: turningPoints(x, SHIPPED).turns, bigMove: 0.05 }),
  P3: (x) => ({ turns: turningPoints(x, { ...SHIPPED, minPhase: 3 }).turns, bigMove: 0.05 }),
  REL: (x) => {
    const first = turningPoints(x, SHIPPED);
    const moves = first.phases.map((p) => Math.abs(first.dated[p.to] - first.dated[p.from]));
    const bm = moves.length >= 2 ? Math.min(0.05, 0.25 * median(moves)) : 0.05;
    return { turns: turningPoints(x, { ...SHIPPED, bigMove: bm }).turns, bigMove: bm };
  },
};
const ARMS = ['P3', 'REL'];

function latent(u, N) {
  const L = [0], turns = [];
  let up = true, left = uint(u, 1, uint(u, 20, 50)), g = unif(u, 0.005, 0.015);
  for (let t = 1; t < N; t++) {
    if (left === 0) {
      turns.push({ i: t - 1, kind: up ? 'peak' : 'trough' });
      up = !up; left = up ? uint(u, 20, 50) : uint(u, 5, 15); g = up ? unif(u, 0.005, 0.015) : -unif(u, 0.005, 0.020);
    }
    L.push(L[t - 1] + g); left--;
  }
  return { L, turns };
}

export function draw(u, n, scale) {
  const OFF = 3, N = n + 5;
  for (;;) {
    const { L, turns } = latent(u, N);
    const truth = turns.map((t) => ({ i: t.i - OFF, kind: t.kind })).filter((t) => t.i >= 6 && t.i <= n - 7);
    const lines = LINES.map((l) => {
      const d = unif(u, -0.001, 0.005);
      let e = gauss(u) * l.s * scale / Math.sqrt(1 - l.phi * l.phi);
      const out = [];
      for (let t = 0; t < n; t++) {
        if (t) e = l.phi * e + gauss(u) * l.s * scale;
        out.push(Math.exp(4 + d * t + l.b * L[t + OFF - l.lag] + e));
      }
      return out;
    });
    if (truth.length >= 2) return { truth, lines };
  }
}

function timing(truth, found) {
  const d = [];
  for (const t of truth) {
    let best = null;
    for (const f of found) if (f.kind === t.kind && Math.abs(f.i - t.i) <= NEAR && (best === null || Math.abs(f.i - t.i) < Math.abs(best))) best = f.i - t.i;
    if (best !== null) d.push(best);
  }
  return d;
}

export function signTestP(w, l) {
  const k = Math.min(w, l), m = w + l;
  if (!m) return 1;
  let p = 0, c = 1;
  for (let j = 0; j <= m; j++) { if (j <= k) p += c; c = (c * (m - j)) / (j + 1); }
  return Math.min(1, (2 * p) / 2 ** m);
}

// one set of draws; returns per-rule composite scores and per-line scores
export function sim({ n = 144, scale = 1, draws = DRAWS, seed = SEED, make = 'saas' } = {}) {
  const u = rng(seed);
  const rows = [];
  for (let k = 0; k < draws; k++) {
    const { truth, lines } = make === 'saas' ? draw(u, n, scale) : shopDraw(u, n, scale);
    const c = compositeIndex(lines).index;
    const comp = {};
    for (const [name, rule] of Object.entries(RULES)) {
      const r = rule(c);
      comp[name] = { ...score(truth, r.turns), miss: truth.length - score(truth, r.turns).matched, tim: timing(truth, r.turns), bigMove: r.bigMove };
    }
    const fl = lines.map((x) => score(truth, RULES.shipped(x).turns).F);
    rows.push({ truth: truth.length, comp, fl });
  }
  return rows;
}

export function summarise(rows) {
  const out = { draws: rows.length, truthMean: mean(rows.map((r) => r.truth)), best: mean(rows.map((r) => Math.max(...r.fl))), fl: LINES.map((_, i) => mean(rows.map((r) => r.fl[i]))) };
  out.rules = {};
  for (const name of Object.keys(RULES)) {
    const d = rows.map((r) => r.comp[name].F - r.comp.shipped.F);
    const wins = d.filter((v) => v >= 0.005).length, losses = d.filter((v) => v <= -0.005).length;
    const tim = rows.flatMap((r) => r.comp[name].tim);
    out.rules[name] = {
      F: mean(rows.map((r) => r.comp[name].F)), dShipped: mean(d), wins, losses, p: signTestP(wins, losses),
      falses: mean(rows.map((r) => r.comp[name].falses)), miss: mean(rows.map((r) => r.comp[name].miss)),
      timingMedian: tim.length ? median(tim) : null, bigMoveMedian: median(rows.map((r) => r.comp[name].bigMove)),
    };
  }
  return out;
}

export function fredCheck() {
  return import('./turns-composite.mjs').then(({ load, ARMS: FA }) => {
    const s = load();
    const c = compositeIndex(FA[0].parts.map((p) => s.values[p]), { sdWindow: [1, s.sdTo] }).index;
    const res = {};
    for (const [name, rule] of Object.entries(RULES)) {
      const r = rule(c);
      const matched = s.turns.filter((t) => r.turns.some((f) => f.kind === t.kind && Math.abs(f.i - t.i) <= 3)).length;
      const falses = r.turns.filter((f) => !s.turns.some((t) => t.kind === f.kind && Math.abs(f.i - t.i) <= 6)).length;
      res[name] = { matched, of: s.turns.length, falses, bigMove: r.bigMove, turns: r.turns.map((t) => `${s.label[t.i]}${t.kind[0]}`) };
    }
    return res;
  });
}

export async function run({ draws = DRAWS } = {}) {
  const primary = summarise(sim({ draws }));
  const shop = summarise(sim({ draws, seed: 20261124, make: 'shop' }));
  const fred = await fredCheck();
  const verdict = {};
  for (const a of ARMS) {
    const r = primary.rules[a], sh = primary.rules.shipped;
    const K1 = r.dShipped >= 0.02 && r.wins > r.losses && r.p <= 0.025;
    const K2 = r.F >= primary.best - 0.03;
    const K3 = r.falses <= sh.falses + 0.10;
    const K4 = fred[a].matched === fred[a].of && fred[a].falses <= 2;
    const K5 = shop.rules[a].F >= shop.rules.shipped.F;
    verdict[a] = { K1, K2, K3, K4, K5, all: K1 && K2 && K3 && K4 && K5 };
  }
  const passing = ARMS.filter((a) => verdict[a].all).sort((a, b) => primary.rules[b].dShipped - primary.rules[a].dShipped);
  const side = [{ scale: 0.5 }, { scale: 2 }, { n: 96 }, { n: 240 }].map((o) => ({ ...o, ...summarise(sim({ draws, ...o })) }));
  return { primary, shop, fred, verdict, ships: passing[0] ?? null, side };
}

const f3 = (v) => v.toFixed(3);
const sg = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`;
function describe(s, label) {
  const o = [`${label}: ${s.draws} draws, ${s.truthMean.toFixed(2)} true turns a draw`];
  o.push(`  single lines (shipped rule), mean F1: ${LINES.map((l, i) => `${l.name} ${f3(s.fl[i])}`).join(', ')}; hindsight-best ${f3(s.best)}`);
  for (const [name, r] of Object.entries(s.rules)) {
    o.push(`  composite ${name.padEnd(7)} F1 ${f3(r.F)}${name === 'shipped' ? '' : ` (vs shipped ${sg(r.dShipped)}, wins ${r.wins}, losses ${r.losses}, p ${r.p.toExponential(2)})`}; misses ${r.miss.toFixed(2)}, false ${r.falses.toFixed(2)} a draw; timing median ${r.timingMedian}; bigMove median ${r.bigMove ?? f3(r.bigMoveMedian)}`);
  }
  return o.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = await run();
  console.log(describe(o.primary, 'Primary, SaaS make, n 144, noise x1 (bars K1-K3)'));
  console.log(`  MRR alone ${f3(o.primary.fl[MRR])} vs shipped composite ${f3(o.primary.rules.shipped.F)}`);
  console.log('\nFRED composite arm A vs NBER (K4):');
  for (const [name, r] of Object.entries(o.fred)) console.log(`  ${name.padEnd(7)} matched ${r.matched}/${r.of}, false ${r.falses}, bigMove ${f3(r.bigMove)}: ${r.turns.join(' ')}`);
  console.log('');
  console.log(describe(o.shop, 'Shop make of the last round, seed 20261124 (K5)'));
  console.log('\nBars:');
  for (const [a, v] of Object.entries(o.verdict)) console.log(`  ${a.padEnd(4)} ${['K1', 'K2', 'K3', 'K4', 'K5'].map((k) => `${k} ${v[k] ? 'PASS' : 'FAIL'}`).join(', ')}`);
  console.log(`Decision: ${o.ships ? `${o.ships} ships as the monthly default for --turns --columns` : 'no arm passes K1-K5: nothing changes'}.`);
  console.log('\nPrinted, no bar:');
  for (const s of o.side) console.log(describe(s, `SaaS make, n ${s.n ?? 144}, noise x${s.scale ?? 1}`));
}
