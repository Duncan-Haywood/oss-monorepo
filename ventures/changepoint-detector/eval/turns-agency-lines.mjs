// A short-phase rule for composites of business lines, third make: an agency's pipeline, billable hours, invoices
// and headcount. P3 alone, with an advance-pick comparator in place of hindsight as the shipping bar.
//
// Open item from README "A short-phase rule for composites, on SaaS lines" (eval/turns-saas-lines.mjs, seed
// 20261125): P3 (minimum phase 3 months, bigMove 0.05) beat the shipped composite rule by +0.082 F1 (wins 168,
// losses 3), kept NBER's 16 of 16 with 2 false turns (the 2002-03 soft patch) and reached 0.974 on the shop round's
// draws, but stayed 0.045 short of the hindsight-best single line, so nothing shipped. "Next, if this line
// continues: a third make with a fresh seed (an agency's billable hours, pipeline, invoices and headcount), with P3
// alone and the same K1-K5. A fair replacement for K2 would be a selection rule that can be used in advance (such as
// each line's own sticky/noisy diagnostics). It cannot be added after seeing these numbers, so it would be tested as
// a separate, pre-registered arm."
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Nothing here has been run on
// this make before. Known before the run, and said here so nobody reads them as fresh: P3's K4 (FRED, 16 of 16, 2
// false) and K5 (shop draws, 0.974 vs 0.932) are deterministic and already passed in the SaaS round; they are kept
// as bars so a code change that breaks them fails here too. The fresh evidence is K1, K2, K2a and K3 on this make.
//
// Simulation, one draw:
//   Latent log activity L over n + 8 months (n = 144 primary). It starts in an expansion at a random point of it;
//   expansions last U{18..48} months, contractions U{4..14}; monthly growth in each expansion U(0.4%, 1.2%), in each
//   contraction -U(0.8%, 2.5%) (agencies lose work fast and win it back slowly). Its switch months are the true
//   turns, scored at months 6..n-7.
//   Four lines, log line_t = d_i t + b_i L_{t - lag_i} + e_i,t, AR(1) noise e (coefficient phi_i, innovation sd
//   s_i times the noise scale), drift d_i ~ U(-0.2%, +0.4%) per month:
//     pipeline        lag -3 (leads), b 1.8, s 5.0%,  phi 0.3 (proposals out: early and lumpy)
//     billable hours  lag  0,         b 1.0, s 1.5%,  phi 0.4
//     invoices        lag +2,         b 1.0, s 3.0%,  phi 0.1 (billed after the work, lumpy by month)
//     headcount       lag +4,         b 0.4, s 0.25%, phi 0.9 (hired and let go late; smooth)
//   Noise scale 1 carries the bars; 0.5 and 2 are printed, as are n = 96 and 240.
// Composite: compositeIndex(lines) (Conference Board method, volatility over every month), as `--turns --columns`.
// Rules on the composite (monthly: window 5, cycles 15): shipped (minPhase 6, bigMove 0.05) and P3 (minPhase 3,
// bigMove 0.05), the same functions as eval/turns-saas-lines.mjs. Single lines are dated with the shipped rule.
// Advance pick (SEL), usable without knowing the truth: date every line with the shipped rule; for each line, its
// mean F1 against each other line's dated turns taken as the reference (same scoring as below); pick the line that
// agrees most with the others (ties: the first in the list order above). SEL's score is that line's F1 against the
// truth. It is a comparator, not a candidate to ship.
// Scoring as before: a true turn matched by a found turn of its kind within 3 months; a found turn is false when no
// true turn of its kind is within 6; F1 from precision and recall. 500 draws, seed 20261126; draws with fewer than 2
// true turns are redrawn.
//
// Bars for P3 (one arm, so the sign tests are at 0.05):
//   K1  better than shipped on this make: mean paired F1 difference (P3 - shipped, composite) >= +0.02, more wins than
//       losses, two-sided sign test p <= 0.05 (ties |difference| < 0.005 left out);
//   K2  within 0.03 of the hindsight-best single line (each draw's best of the four): mean F1. Scored and reported as
//       in the last two rounds, but no longer a gate (below);
//   K2a no worse than the advance pick: mean F1 of the P3 composite >= SEL's mean F1, and the paired sign test
//       (P3 composite vs SEL) does not favour SEL at p <= 0.05;
//   K3  mean false turns a draw on the composite at most shipped's + 0.10;
//   K4  on the FRED composite of eval/turns-composite.mjs arm A, all 16 NBER turns within 3 months, at most 2 false;
//   K5  on the shop round's 500 draws (seed 20261124), mean composite F1 at least shipped's.
// Ships: P3 becomes the monthly default for `--turns --columns` (composites only; one column and quarterly keep their
// rules) when K1, K2a, K3, K4 and K5 pass, with the CLI text, --json and the page's note updated, including "How far
// to trust it" (the FRED figure becomes 16 of 16 with 2 false turns). This changes the ship rule of the last two
// rounds, which also required K2: hindsight cannot be had by any user, the SaaS round's write-up named an advance
// pick as the fair replacement, and the change is written here before this make has been run. If any of K1, K2a,
// K3, K4, K5 fails, nothing changes.
// Printed, no bar: each line's mean F1; SEL's pick shares; misses and false turns a draw; timing; SEL on the SaaS and
// shop draws; the side scales and lengths.
//
// usage: node eval/turns-agency-lines.mjs > eval/turns-agency-lines.out.txt
import { fileURLToPath } from 'node:url';
import { compositeIndex } from '../composite-index.mjs';
import { draw as shopDraw, score } from './turns-business-lines.mjs';
import { draw as saasDraw, RULES, signTestP, fredCheck } from './turns-saas-lines.mjs';

const SEED = 20261126, DRAWS = 500;
export const LINES = [
  { name: 'pipeline', lag: -3, b: 1.8, s: 0.050, phi: 0.3 },
  { name: 'billable hours', lag: 0, b: 1.0, s: 0.015, phi: 0.4 },
  { name: 'invoices', lag: 2, b: 1.0, s: 0.030, phi: 0.1 },
  { name: 'headcount', lag: 4, b: 0.4, s: 0.0025, phi: 0.9 },
];

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (u) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
const unif = (u, a, b) => a + (b - a) * u();
const uint = (u, a, b) => a + Math.floor(u() * (b - a + 1));
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const median = (v) => { const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function latent(u, N) {
  const L = [0], turns = [];
  let up = true, left = uint(u, 1, uint(u, 18, 48)), g = unif(u, 0.004, 0.012);
  for (let t = 1; t < N; t++) {
    if (left === 0) {
      turns.push({ i: t - 1, kind: up ? 'peak' : 'trough' });
      up = !up; left = up ? uint(u, 18, 48) : uint(u, 4, 14); g = up ? unif(u, 0.004, 0.012) : -unif(u, 0.008, 0.025);
    }
    L.push(L[t - 1] + g); left--;
  }
  return { L, turns };
}

export function draw(u, n, scale) {
  const OFF = 4, N = n + 8;
  for (;;) {
    const { L, turns } = latent(u, N);
    const truth = turns.map((t) => ({ i: t.i - OFF, kind: t.kind })).filter((t) => t.i >= 6 && t.i <= n - 7);
    const lines = LINES.map((l) => {
      const d = unif(u, -0.002, 0.004);
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

// The advance pick: the line whose dated turns agree most with the other lines' dated turns.
export function advancePick(lineTurns) {
  let best = 0, bestScore = -1;
  lineTurns.forEach((ti, i) => {
    const s = mean(lineTurns.filter((_, j) => j !== i).map((tj) => score(tj, ti).F));
    if (s > bestScore + 1e-12) { best = i; bestScore = s; }
  });
  return best;
}

const DRAWERS = { agency: draw, saas: saasDraw, shop: shopDraw };

export function sim({ n = 144, scale = 1, draws = DRAWS, seed = SEED, make = 'agency' } = {}) {
  const u = rng(seed), rows = [];
  for (let k = 0; k < draws; k++) {
    const { truth, lines } = DRAWERS[make](u, n, scale);
    const c = compositeIndex(lines).index;
    const comp = {};
    for (const name of ['shipped', 'P3']) {
      const s = score(truth, RULES[name](c).turns);
      comp[name] = { F: s.F, falses: s.falses, miss: truth.length - s.matched };
    }
    const lt = lines.map((x) => RULES.shipped(x).turns);
    const fl = lt.map((t) => score(truth, t).F);
    const pick = advancePick(lt);
    rows.push({ truth: truth.length, comp, fl, pick, sel: fl[pick] });
  }
  return rows;
}

export function summarise(rows, nLines = 4) {
  const paired = (a, b) => {
    const d = rows.map((r) => a(r) - b(r));
    const wins = d.filter((v) => v >= 0.005).length, losses = d.filter((v) => v <= -0.005).length;
    return { d: mean(d), wins, losses, p: signTestP(wins, losses) };
  };
  return {
    draws: rows.length, truthMean: mean(rows.map((r) => r.truth)),
    fl: Array.from({ length: nLines }, (_, i) => mean(rows.map((r) => r.fl[i]))),
    best: mean(rows.map((r) => Math.max(...r.fl))),
    sel: mean(rows.map((r) => r.sel)),
    pickShare: Array.from({ length: nLines }, (_, i) => rows.filter((r) => r.pick === i).length / rows.length),
    shipped: { F: mean(rows.map((r) => r.comp.shipped.F)), falses: mean(rows.map((r) => r.comp.shipped.falses)), miss: mean(rows.map((r) => r.comp.shipped.miss)) },
    P3: { F: mean(rows.map((r) => r.comp.P3.F)), falses: mean(rows.map((r) => r.comp.P3.falses)), miss: mean(rows.map((r) => r.comp.P3.miss)) },
    p3VsShipped: paired((r) => r.comp.P3.F, (r) => r.comp.shipped.F),
    p3VsSel: paired((r) => r.comp.P3.F, (r) => r.sel),
  };
}

export async function run({ draws = DRAWS } = {}) {
  const primary = summarise(sim({ draws }));
  const shop = summarise(sim({ draws, seed: 20261124, make: 'shop' }));
  const saas = summarise(sim({ draws, seed: 20261125, make: 'saas' }));
  const fred = await fredCheck();
  const a = primary.p3VsShipped, b = primary.p3VsSel;
  const verdict = {
    K1: a.d >= 0.02 && a.wins > a.losses && a.p <= 0.05,
    K2: primary.P3.F >= primary.best - 0.03,
    K2a: primary.P3.F >= primary.sel && !(b.losses > b.wins && b.p <= 0.05),
    K3: primary.P3.falses <= primary.shipped.falses + 0.10,
    K4: fred.P3.matched === fred.P3.of && fred.P3.falses <= 2,
    K5: shop.P3.F >= shop.shipped.F,
  };
  const ships = verdict.K1 && verdict.K2a && verdict.K3 && verdict.K4 && verdict.K5;
  const side = [{ scale: 0.5 }, { scale: 2 }, { n: 96 }, { n: 240 }].map((o) => ({ ...o, ...summarise(sim({ draws, ...o })) }));
  return { primary, shop, saas, fred, verdict, ships, side };
}

const f3 = (v) => v.toFixed(3);
const sg = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`;
const pr = (x) => `${sg(x.d)}, wins ${x.wins}, losses ${x.losses}, p ${x.p.toExponential(2)}`;
function describe(s, label, names = LINES.map((l) => l.name)) {
  return [
    `${label}: ${s.draws} draws, ${s.truthMean.toFixed(2)} true turns a draw`,
    `  single lines (shipped rule), mean F1: ${names.map((nm, i) => `${nm} ${f3(s.fl[i])}`).join(', ')}; hindsight-best ${f3(s.best)}`,
    `  advance pick (most agreeing line) ${f3(s.sel)}; picked: ${names.map((nm, i) => `${nm} ${(100 * s.pickShare[i]).toFixed(0)}%`).join(', ')}`,
    `  composite shipped F1 ${f3(s.shipped.F)}; misses ${s.shipped.miss.toFixed(2)}, false ${s.shipped.falses.toFixed(2)} a draw`,
    `  composite P3      F1 ${f3(s.P3.F)}; misses ${s.P3.miss.toFixed(2)}, false ${s.P3.falses.toFixed(2)} a draw`,
    `  P3 vs shipped ${pr(s.p3VsShipped)}`,
    `  P3 vs advance pick ${pr(s.p3VsSel)}`,
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = await run();
  console.log(describe(o.primary, 'Primary, agency make, n 144, noise x1 (bars K1-K3)'));
  console.log(`\nFRED composite arm A vs NBER (K4): P3 matched ${o.fred.P3.matched}/${o.fred.P3.of}, false ${o.fred.P3.falses}; shipped matched ${o.fred.shipped.matched}/${o.fred.shipped.of}, false ${o.fred.shipped.falses}`);
  console.log('');
  console.log(describe(o.shop, 'Shop make, seed 20261124 (K5)', ['orders', 'revenue', 'customers', 'hours']));
  console.log('');
  console.log(describe(o.saas, 'SaaS make, seed 20261125 (printed, no bar)', ['sign-ups', 'active users', 'MRR', 'paid invoices']));
  console.log('\nBars for P3:');
  console.log('  ' + Object.entries(o.verdict).map(([k, v]) => `${k} ${v ? 'PASS' : 'FAIL'}${k === 'K2' ? ' (reported, not a gate)' : ''}`).join(', '));
  console.log(`Decision: ${o.ships ? 'P3 ships as the monthly default for --turns --columns' : 'a gate fails: nothing changes'}.`);
  console.log('\nPrinted, no bar:');
  for (const s of o.side) console.log(describe(s, `Agency make, n ${s.n ?? 144}, noise x${s.scale ?? 1}`));
}
