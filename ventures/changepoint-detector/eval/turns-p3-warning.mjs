// P3 and the heaviest-is-latest warning together, on a fifth make: a freight carrier's load tenders, loaded miles,
// invoiced revenue and drivers employed, with the drivers line's lag drawn afresh in every draw.
//
// Open item from README "A heaviest-is-latest warning" (eval/turns-heavy-late.mjs, seed 20261127): "Next, if this line
// continues: ... or P3 and the warning together on a fifth make, pre-registered." P3 (minimum phase 3 months instead
// of 6, bigMove 0.05 kept) beat the shipped composite rule on three makes (SaaS +0.082, shop +0.042, agency +0.047;
// README "A short-phase rule for composites", "third make") but did not ship, because it missed a hindsight bar and
// then an advance-pick bar. The heavy-late warning shipped on the shipped rule. This round asks whether the two
// together beat what ships now (the shipped rule with the warning followed), so that P3 can become the default for
// monthly composites.
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Known before the run, and said
// here so nobody reads it as fresh: P3 alone beats the shipped rule on the shop, SaaS and agency draws, and on FRED
// arm A P3 alone dates 16 of 16 NBER turns with 2 false (2002-11 and 2003-04). Unmeasured: the warning computed under
// P3 (it dates each column with the composite's rule, so P3 changes what it reads), the remedy dated with P3, the
// two together against the shipped rule followed, on any make, and everything on the fifth make.
//
// Arms (every arm uses compositeIndex weights; "followed" = the remedy's turns when the warning fires, else the full
// composite's; the warning is heavyLate of heavy-late.mjs at its shipped defaults minWeight 0.4, minLag 2, far 6):
//   SW  what ships now: shipped rule (monthly, minPhase 6, bigMove 0.05) for the columns, composite and remedy;
//   PW  the candidate: P3 rule (monthly, minPhase 3, bigMove 0.05) for the columns, composite and remedy.
// Printed, no bar: shipped alone, P3 alone, the hindsight-best single line and the advance pick of
// eval/turns-agency-lines.mjs (each line dated with the shipped rule, as there).
//
// Simulation, fifth make, one draw:
//   Latent log activity L over n + 9 months (n = 144 primary). It starts in an expansion at a random point of it;
//   expansions last U{15..42} months, contractions U{4..12}; monthly growth in each expansion U(0.25%, 0.9%), in each
//   contraction -U(0.8%, 2.5%). Its switch months are the true turns, scored at months 6..n-7.
//   Four lines, log line_t = d_i t + b_i L_{t - lag_i} + e_i,t, AR(1) noise e (coefficient phi_i, innovation sd s_i
//   times the noise scale), drift d_i ~ U(-0.2%, +0.3%) per month:
//     load tenders      lag -2 (leads), b 1.5, s 4.0%, phi 0.2
//     loaded miles      lag  0,         b 1.0, s 2.2%, phi 0.35
//     invoiced revenue  lag +1,         b 1.1, s 2.0%, phi 0.4
//     drivers employed  lag U{-1..5} drawn per draw, b 0.35, s 0.25%, phi 0.9 (smooth, weight-heavy)
//   Noise scale 1 carries the bars; 0.5 and 2 are printed, as are n = 96 and 240.
// Scoring as in the earlier rounds (score of eval/turns-business-lines.mjs): a true turn matched by a found turn of its
// kind within 3 months; a found turn is false when no true turn of its kind is within 6; F1. 500 draws, seed 20261128;
// draws with fewer than 2 true turns are redrawn.
//
// Bars (fifth make, n 144, noise x1 unless named):
//   J1  PW beats SW: mean F1 (PW followed - SW followed) >= +0.02, more wins than losses, two-sided sign test
//       p <= 0.05 (ties |difference| < 0.005 left out);
//   J2  false turns: PW followed's mean false turns a draw <= SW followed's + 0.10;
//   J3  no loss on the guards: PW followed's mean F1 >= SW followed's on the manufacturer (seed 20261127), shop
//       (20261124), SaaS (20261125) and agency (20261126) draws of the earlier rounds, 500 each;
//   J4  NBER: on the FRED composite of eval/turns-composite.mjs arm A, PW followed dates all 16 NBER turns within
//       3 months with at most 2 false;
//   J5  the warning under P3 still reads the late line: it fires in >= 50% of draws whose drivers lag is >= 3 and
//       in <= 20% of draws whose drivers lag is <= 1.
// Ships when J1-J5 all pass: monthly `--turns --columns` uses minimum phase 3 by default (the warning, its remedy and
// the main dates with it), a new `--min-phase N` sets it (6 restores the old composite rule), and the page's
// composite card does the same. One-column monthly dating keeps 6 (P3 was never tested on a single line), and
// quarterly keeps BBQ's own. If any bar fails, nothing changes in the CLI or on the page.
//
// usage: node eval/turns-p3-warning.mjs > eval/turns-p3-warning.out.txt
import { fileURLToPath } from 'node:url';
import { compositeIndex } from '../composite-index.mjs';
import { heavyLate } from '../heavy-late.mjs';
import { turningPoints } from '../turning-points.mjs';
import { draw as shopDraw, score } from './turns-business-lines.mjs';
import { draw as saasDraw, signTestP } from './turns-saas-lines.mjs';
import { draw as agencyDraw, advancePick } from './turns-agency-lines.mjs';
import { draw as makerDraw } from './turns-heavy-late.mjs';

const SEED = 20261128, DRAWS = 500;
export const LINES = [
  { name: 'load tenders', lag: -2, b: 1.5, s: 0.040, phi: 0.2 },
  { name: 'loaded miles', lag: 0, b: 1.0, s: 0.022, phi: 0.35 },
  { name: 'invoiced revenue', lag: 1, b: 1.1, s: 0.020, phi: 0.4 },
  { name: 'drivers employed', lag: null, b: 0.35, s: 0.0025, phi: 0.9 },
];
export const RULE = {
  SW: { frequency: 'monthly', bigMove: 0.05, minPhase: 6 },
  PW: { frequency: 'monthly', bigMove: 0.05, minPhase: 3 },
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (u) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
const unif = (u, a, b) => a + (b - a) * u();
const uint = (u, a, b) => a + Math.floor(u() * (b - a + 1));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

function latent(u, N) {
  const L = [0], turns = [];
  let up = true, left = uint(u, 1, uint(u, 15, 42)), g = unif(u, 0.0025, 0.009);
  for (let t = 1; t < N; t++) {
    if (left === 0) {
      turns.push({ i: t - 1, kind: up ? 'peak' : 'trough' });
      up = !up; left = up ? uint(u, 15, 42) : uint(u, 4, 12); g = up ? unif(u, 0.0025, 0.009) : -unif(u, 0.008, 0.025);
    }
    L.push(L[t - 1] + g); left--;
  }
  return { L, turns };
}

export function draw(u, n, scale) {
  const OFF = 6, N = n + 9;
  for (;;) {
    const { L, turns } = latent(u, N);
    const truth = turns.map((t) => ({ i: t.i - OFF, kind: t.kind })).filter((t) => t.i >= 6 && t.i <= n - 7);
    const empLag = uint(u, -1, 5);
    const lines = LINES.map((l) => {
      const lag = l.lag ?? empLag;
      const d = unif(u, -0.002, 0.003);
      let e = gauss(u) * l.s * scale / Math.sqrt(1 - l.phi * l.phi);
      const out = [];
      for (let t = 0; t < n; t++) {
        if (t) e = l.phi * e + gauss(u) * l.s * scale;
        out.push(Math.exp(4 + d * t + l.b * L[t + OFF - lag] + e));
      }
      return out;
    });
    if (truth.length >= 2) return { truth, lines, empLag };
  }
}

// One arm on one draw: full composite, warning, remedy and the followed turns, all with the arm's rule.
export function arm(lines, rule, sdWindow) {
  const c = compositeIndex(lines, { sdWindow });
  const full = turningPoints(c.index, rule).turns;
  const w = heavyLate(lines, c.weights, { rule });
  let remedy = null;
  if (w.fires) {
    const rest = w.without.map((i) => lines[i]);
    remedy = turningPoints(rest.length >= 2 ? compositeIndex(rest, { sdWindow }).index : rest[0], rule).turns;
  }
  return { full, remedy, followed: remedy ?? full, warning: w };
}

const DRAWERS = { freight: draw, maker: makerDraw, shop: shopDraw, saas: saasDraw, agency: agencyDraw };

export function sim({ n = 144, scale = 1, draws = DRAWS, seed = SEED, make = 'freight' } = {}) {
  const u = rng(seed), rows = [];
  for (let k = 0; k < draws; k++) {
    const { truth, lines, empLag = null } = DRAWERS[make](u, n, scale);
    const row = { empLag, truth: truth.length };
    for (const [name, rule] of Object.entries(RULE)) {
      const a = arm(lines, rule);
      const f = score(truth, a.followed), full = score(truth, a.full);
      row[name] = { F: f.F, falses: f.falses, miss: truth.length - f.matched, fullF: full.F, fires: a.warning.fires };
    }
    const lt = lines.map((x) => turningPoints(x, RULE.SW).turns);
    const fl = lt.map((t) => score(truth, t).F);
    row.best = Math.max(...fl);
    row.pick = fl[advancePick(lt)];
    rows.push(row);
  }
  return rows;
}

export function summarise(rows) {
  const d = rows.map((r) => r.PW.F - r.SW.F);
  const wins = d.filter((v) => v >= 0.005).length, losses = d.filter((v) => v <= -0.005).length;
  const rate = (sub) => (sub.length ? sub.filter((r) => r.PW.fires).length / sub.length : NaN);
  const byLag = {};
  for (let l = -1; l <= 5; l++) { const sub = rows.filter((r) => r.empLag === l); if (sub.length) byLag[l] = { draws: sub.length, PW: rate(sub), SW: sub.filter((r) => r.SW.fires).length / sub.length }; }
  const arms = {};
  for (const name of Object.keys(RULE)) {
    arms[name] = {
      F: mean(rows.map((r) => r[name].F)), fullF: mean(rows.map((r) => r[name].fullF)),
      falses: mean(rows.map((r) => r[name].falses)), miss: mean(rows.map((r) => r[name].miss)),
      fireRate: rows.filter((r) => r[name].fires).length / rows.length,
    };
  }
  return {
    draws: rows.length, arms, gain: { d: mean(d), wins, losses, p: signTestP(wins, losses) },
    best: mean(rows.map((r) => r.best)), pick: mean(rows.map((r) => r.pick)),
    late: rate(rows.filter((r) => r.empLag !== null && r.empLag >= 3)),
    early: rate(rows.filter((r) => r.empLag !== null && r.empLag <= 1)),
    byLag,
  };
}

export async function fredCheck() {
  const { load, ARMS: FA } = await import('./turns-composite.mjs');
  const s = load();
  const lines = FA[0].parts.map((p) => s.values[p]);
  const out = { parts: FA[0].parts };
  for (const [name, rule] of Object.entries(RULE)) {
    const a = arm(lines, rule, [1, s.sdTo]);
    out[name] = {
      fires: a.warning.fires, column: a.warning.column, weight: a.warning.weight, lags: a.warning.lags,
      matched: s.turns.filter((t) => a.followed.some((f) => f.kind === t.kind && Math.abs(f.i - t.i) <= 3)).length,
      of: s.turns.length,
      falses: a.followed.filter((f) => !s.turns.some((t) => t.kind === f.kind && Math.abs(f.i - t.i) <= 6)).length,
      extra: a.followed.filter((f) => !s.turns.some((t) => t.kind === f.kind && Math.abs(f.i - t.i) <= 6)).map((f) => `${f.kind} ${s.label[f.i]}`),
    };
  }
  return out;
}

export async function run({ draws = DRAWS } = {}) {
  const primary = summarise(sim({ draws }));
  const guards = {
    maker: summarise(sim({ draws, seed: 20261127, make: 'maker' })),
    shop: summarise(sim({ draws, seed: 20261124, make: 'shop' })),
    saas: summarise(sim({ draws, seed: 20261125, make: 'saas' })),
    agency: summarise(sim({ draws, seed: 20261126, make: 'agency' })),
  };
  const fred = await fredCheck();
  const g = primary.gain, A = primary.arms;
  const verdict = {
    J1: g.d >= 0.02 && g.wins > g.losses && g.p <= 0.05,
    J2: A.PW.falses <= A.SW.falses + 0.10,
    J3: Object.values(guards).every((s) => s.arms.PW.F >= s.arms.SW.F),
    J4: fred.PW.matched === fred.PW.of && fred.PW.falses <= 2,
    J5: primary.late >= 0.5 && primary.early <= 0.2,
  };
  const ships = Object.values(verdict).every(Boolean);
  const side = [{ scale: 0.5 }, { scale: 2 }, { n: 96 }, { n: 240 }].map((o) => ({ ...o, ...summarise(sim({ draws, ...o })) }));
  return { primary, guards, fred, verdict, ships, side };
}

const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : 'n/a');
const sg = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}` : 'n/a');
const pc = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(0)}%` : 'n/a');
function describe(s, label) {
  const { SW, PW } = s.arms;
  const out = [
    `${label}: ${s.draws} draws`,
    `  SW (shipped rule, warning followed): F1 ${f3(SW.F)} (composite alone ${f3(SW.fullF)}), misses ${f3(SW.miss)}, false ${f3(SW.falses)} a draw, warning fires ${pc(SW.fireRate)}`,
    `  PW (P3 rule, warning followed):      F1 ${f3(PW.F)} (composite alone ${f3(PW.fullF)}), misses ${f3(PW.miss)}, false ${f3(PW.falses)} a draw, warning fires ${pc(PW.fireRate)}`,
    `  PW - SW ${sg(s.gain.d)}, wins ${s.gain.wins}, losses ${s.gain.losses}, p ${Number.isFinite(s.gain.p) ? s.gain.p.toExponential(2) : 'n/a'}; hindsight-best line ${f3(s.best)}, advance pick ${f3(s.pick)}`,
  ];
  if (Object.keys(s.byLag).length) out.push(`  PW fire rate by heavy-line lag: ${Object.entries(s.byLag).map(([l, v]) => `${l}: ${pc(v.PW)} (SW ${pc(v.SW)}) of ${v.draws}`).join(', ')}; lag >= 3 ${pc(s.late)}, lag <= 1 ${pc(s.early)}`);
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = await run();
  console.log(describe(o.primary, 'Primary, freight make, n 144, noise x1 (bars J1, J2, J5)'));
  console.log('');
  for (const [k, s] of Object.entries(o.guards)) console.log(describe(s, `Guard, ${k} make (J3)`));
  console.log(`\nFRED composite arm A (${o.fred.parts.join(', ')}) (J4):`);
  for (const name of Object.keys(RULE)) {
    const f = o.fred[name];
    console.log(`  ${name}: heaviest ${o.fred.parts[f.column]} weight ${f.weight.toFixed(3)}, relative lags ${f.lags.map((l) => (l === null ? 'n/a' : l)).join(', ')}; warning ${f.fires ? 'FIRES' : 'quiet'}; followed ${f.matched}/${f.of}, false ${f.falses}${f.extra.length ? ` (${f.extra.join(', ')})` : ''}`);
  }
  console.log('\nBars:');
  console.log('  ' + Object.entries(o.verdict).map(([k, v]) => `${k} ${v ? 'PASS' : 'FAIL'}`).join(', '));
  console.log(`Decision: ${o.ships ? 'P3 becomes the monthly composite default, with the warning dated under it' : 'a bar fails: nothing changes'}.`);
  console.log('\nPrinted, no bar:');
  for (const s of o.side) console.log(describe(s, `Freight make, n ${s.n ?? 144}, noise x${s.scale ?? 1}`));
}
