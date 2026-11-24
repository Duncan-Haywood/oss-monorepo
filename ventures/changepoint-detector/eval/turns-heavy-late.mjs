// A heaviest-is-latest warning for composites of business lines, on a fourth make: a manufacturer's orders,
// shipments, production hours and employees, with the employees line's lag drawn afresh in every draw.
//
// Open item from README "A short-phase rule for composites, third make: an agency's lines" (eval/turns-agency-lines.mjs,
// seed 20261126): the Conference Board weights gave the smooth, late headcount line a mean 70% of the weight; it turns
// 4 months late and the composite inherited the lateness (post hoc: without headcount the P3 composite dated 0.924
// against 0.755). "Next, if this line continues: a pre-registered warning (or a weight cap) for a composite whose
// heaviest column is also its latest, using line-leads.mjs to read each column's lead against the others, on a fourth
// make and fresh seed, with the shop, SaaS and agency draws and NBER's 16 of 16 as guards."
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Nothing here has been run on
// this make before. Known before the run, and said here so nobody reads it as fresh: on the agency make, dropping
// headcount helped on average (post hoc, P3 rule); the warning's own behaviour there, and everything on the new make,
// is unmeasured.
//
// The warning (heavy-late.mjs, heavyLate, defaults minWeight 0.4, minLag 2, far 6): date every column with the
// composite's rule; each column's relative lag is the median offset of its turns from the nearest same-kind turn of
// every other column within 6 months; fire when the heaviest column weighs >= 0.4, its relative lag is >= 2 months and
// no other column's is larger. Written from the data alone, no truth. The remedy when it fires: date the composite of
// the other columns (the line itself when one is left), same rule. This uses line-leads.mjs's pairing idea, but
// against the other columns rather than the composite, because a composite the heavy column dominates follows it and
// would hide its lag.
// Composite rule throughout: the shipped one (monthly, minPhase 6, bigMove 0.05; RULES.shipped of
// eval/turns-saas-lines.mjs), because P3 has not shipped.
//
// Simulation, fourth make, one draw:
//   Latent log activity L over n + 9 months (n = 144 primary). It starts in an expansion at a random point of it;
//   expansions last U{18..48} months, contractions U{5..16}; monthly growth in each expansion U(0.3%, 1.0%), in each
//   contraction -U(0.6%, 2.0%). Its switch months are the true turns, scored at months 6..n-7.
//   Four lines, log line_t = d_i t + b_i L_{t - lag_i} + e_i,t, AR(1) noise e (coefficient phi_i, innovation sd s_i
//   times the noise scale), drift d_i ~ U(-0.2%, +0.3%) per month:
//     orders            lag -2 (leads), b 1.4, s 3.5%, phi 0.3
//     shipments         lag  0,         b 1.0, s 2.0%, phi 0.3
//     production hours  lag +1,         b 0.8, s 1.5%, phi 0.4
//     employees         lag U{-1..5} drawn per draw, b 0.4, s 0.3%, phi 0.85 (smooth; sometimes early, often late)
//   Noise scale 1 carries the bars; 0.5 and 2 are printed, as are n = 96 and 240.
// Scoring as in the earlier rounds (score of eval/turns-business-lines.mjs): a true turn matched by a found turn of its
// kind within 3 months; a found turn is false when no true turn of its kind is within 6; F1. 500 draws, seed 20261127;
// draws with fewer than 2 true turns are redrawn. "Followed" means: the remedy's turns when the warning fires, the full
// composite's otherwise.
//
// Bars (fourth make, n 144, noise x1 unless named):
//   H1  helps when it fires: on the draws where it fires, mean F1 (remedy - full composite) >= +0.03, more wins than
//       losses, two-sided sign test p <= 0.05 (ties |difference| < 0.005 left out);
//   H2  hears a late heavy line: it fires in >= 50% of the draws whose employees lag is >= 3;
//   H3  quiet otherwise: it fires in <= 20% of the draws whose employees lag is <= 1;
//   H4  no loss anywhere: mean F1 of "followed" >= the full composite's on the fourth make and on the shop (seed
//       20261124), SaaS (20261125) and agency (20261126) draws of the earlier rounds, 500 each;
//   H5  NBER: on the FRED composite of eval/turns-composite.mjs arm A the warning does not fire, or, if it fires, the
//       remedy still dates all 16 NBER turns within 3 months with at most 2 false.
// Ships when H1-H5 all pass: `--turns --columns` (monthly) prints a warning naming the column, its weight and relative
// lag, with the dates of the composite without it, and --json carries `composite.heavyLate`; the page shows the same
// line. The main dates stay the full composite's (the user picks). If any bar fails, nothing changes in the CLI or on
// the page.
// Printed, no bar: fire rates by employees lag; misses and false turns; the side scales and lengths; fire rate and
// gain on each guard make; the FRED reading.
//
// usage: node eval/turns-heavy-late.mjs > eval/turns-heavy-late.out.txt
import { fileURLToPath } from 'node:url';
import { compositeIndex } from '../composite-index.mjs';
import { heavyLate } from '../heavy-late.mjs';
import { draw as shopDraw, score } from './turns-business-lines.mjs';
import { draw as saasDraw, RULES, signTestP } from './turns-saas-lines.mjs';
import { draw as agencyDraw } from './turns-agency-lines.mjs';

const SEED = 20261127, DRAWS = 500;
export const LINES = [
  { name: 'orders', lag: -2, b: 1.4, s: 0.035, phi: 0.3 },
  { name: 'shipments', lag: 0, b: 1.0, s: 0.020, phi: 0.3 },
  { name: 'production hours', lag: 1, b: 0.8, s: 0.015, phi: 0.4 },
  { name: 'employees', lag: null, b: 0.4, s: 0.003, phi: 0.85 },
];

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (u) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
const unif = (u, a, b) => a + (b - a) * u();
const uint = (u, a, b) => a + Math.floor(u() * (b - a + 1));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

function latent(u, N) {
  const L = [0], turns = [];
  let up = true, left = uint(u, 1, uint(u, 18, 48)), g = unif(u, 0.003, 0.010);
  for (let t = 1; t < N; t++) {
    if (left === 0) {
      turns.push({ i: t - 1, kind: up ? 'peak' : 'trough' });
      up = !up; left = up ? uint(u, 18, 48) : uint(u, 5, 16); g = up ? unif(u, 0.003, 0.010) : -unif(u, 0.006, 0.020);
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

const RULE = { frequency: 'monthly', bigMove: 0.05 };

// One draw's full composite, warning and remedy.
export function judge(lines, sdWindow) {
  const c = compositeIndex(lines, { sdWindow });
  const full = RULES.shipped(c.index).turns;
  const w = heavyLate(lines, c.weights, { rule: RULE });
  let remedy = null;
  if (w.fires) {
    const rest = w.without.map((i) => lines[i]);
    remedy = RULES.shipped(rest.length >= 2 ? compositeIndex(rest, { sdWindow }).index : rest[0]).turns;
  }
  return { full, remedy, warning: w };
}

const DRAWERS = { maker: draw, shop: shopDraw, saas: saasDraw, agency: agencyDraw };

export function sim({ n = 144, scale = 1, draws = DRAWS, seed = SEED, make = 'maker' } = {}) {
  const u = rng(seed), rows = [];
  for (let k = 0; k < draws; k++) {
    const { truth, lines, empLag = null } = DRAWERS[make](u, n, scale);
    const j = judge(lines);
    const f = score(truth, j.full), r = j.remedy ? score(truth, j.remedy) : null;
    rows.push({
      empLag, fires: j.warning.fires, column: j.warning.column, weight: j.warning.weight, lag: j.warning.lag,
      full: { F: f.F, falses: f.falses, miss: truth.length - f.matched },
      remedy: r && { F: r.F, falses: r.falses, miss: truth.length - r.matched },
      followed: r ? r.F : f.F,
    });
  }
  return rows;
}

export function summarise(rows) {
  const fired = rows.filter((r) => r.fires);
  const d = fired.map((r) => r.remedy.F - r.full.F);
  const wins = d.filter((v) => v >= 0.005).length, losses = d.filter((v) => v <= -0.005).length;
  const rate = (sub) => (sub.length ? sub.filter((r) => r.fires).length / sub.length : NaN);
  const byLag = {};
  for (let l = -1; l <= 5; l++) { const sub = rows.filter((r) => r.empLag === l); if (sub.length) byLag[l] = { draws: sub.length, rate: rate(sub) }; }
  return {
    draws: rows.length, fireRate: rate(rows), fired: fired.length,
    gain: { d: mean(d), wins, losses, p: signTestP(wins, losses) },
    fullOnFired: mean(fired.map((r) => r.full.F)), remedyOnFired: mean(fired.map((r) => r.remedy.F)),
    remedyFalsesOnFired: mean(fired.map((r) => r.remedy.falses)), fullFalsesOnFired: mean(fired.map((r) => r.full.falses)),
    full: mean(rows.map((r) => r.full.F)), followed: mean(rows.map((r) => r.followed)),
    late: rate(rows.filter((r) => r.empLag !== null && r.empLag >= 3)),
    early: rate(rows.filter((r) => r.empLag !== null && r.empLag <= 1)),
    byLag,
  };
}

export async function fredWarning() {
  const { load, ARMS: FA } = await import('./turns-composite.mjs');
  const s = load();
  const lines = FA[0].parts.map((p) => s.values[p]);
  const j = judge(lines, [1, s.sdTo]);
  const count = (turns) => ({
    matched: s.turns.filter((t) => turns.some((f) => f.kind === t.kind && Math.abs(f.i - t.i) <= 3)).length,
    of: s.turns.length,
    falses: turns.filter((f) => !s.turns.some((t) => t.kind === f.kind && Math.abs(f.i - t.i) <= 6)).length,
  });
  return { parts: FA[0].parts, warning: j.warning, full: count(j.full), remedy: j.remedy ? count(j.remedy) : null };
}

export async function run({ draws = DRAWS } = {}) {
  const primary = summarise(sim({ draws }));
  const guards = {
    shop: summarise(sim({ draws, seed: 20261124, make: 'shop' })),
    saas: summarise(sim({ draws, seed: 20261125, make: 'saas' })),
    agency: summarise(sim({ draws, seed: 20261126, make: 'agency' })),
  };
  const fred = await fredWarning();
  const g = primary.gain;
  const verdict = {
    H1: primary.fired > 0 && g.d >= 0.03 && g.wins > g.losses && g.p <= 0.05,
    H2: primary.late >= 0.5,
    H3: primary.early <= 0.2,
    H4: primary.followed >= primary.full && Object.values(guards).every((s) => s.followed >= s.full),
    H5: !fred.warning.fires || (fred.remedy.matched === fred.remedy.of && fred.remedy.falses <= 2),
  };
  const ships = Object.values(verdict).every(Boolean);
  const side = [{ scale: 0.5 }, { scale: 2 }, { n: 96 }, { n: 240 }].map((o) => ({ ...o, ...summarise(sim({ draws, ...o })) }));
  return { primary, guards, fred, verdict, ships, side };
}

const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : 'n/a');
const sg = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}` : 'n/a');
const pc = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(0)}%` : 'n/a');
function describe(s, label) {
  const out = [
    `${label}: ${s.draws} draws; warning fires in ${s.fired} (${pc(s.fireRate)})`,
    `  on fired draws: full composite F1 ${f3(s.fullOnFired)} (false ${f3(s.fullFalsesOnFired)} a draw), without the heavy column ${f3(s.remedyOnFired)} (false ${f3(s.remedyFalsesOnFired)}); remedy - full ${sg(s.gain.d)}, wins ${s.gain.wins}, losses ${s.gain.losses}, p ${Number.isFinite(s.gain.p) ? s.gain.p.toExponential(2) : 'n/a'}`,
    `  all draws: full composite F1 ${f3(s.full)}, followed ${f3(s.followed)} (${sg(s.followed - s.full)})`,
  ];
  if (Object.keys(s.byLag).length) out.push(`  fire rate by employees lag: ${Object.entries(s.byLag).map(([l, v]) => `${l}: ${pc(v.rate)} of ${v.draws}`).join(', ')}; lag >= 3 ${pc(s.late)}, lag <= 1 ${pc(s.early)}`);
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = await run();
  console.log(describe(o.primary, 'Primary, manufacturer make, n 144, noise x1 (bars H1-H4)'));
  console.log('');
  for (const [k, s] of Object.entries(o.guards)) console.log(describe(s, `Guard, ${k} make (H4)`));
  const fw = o.fred.warning;
  console.log(`\nFRED composite arm A (${o.fred.parts.join(', ')}) (H5): heaviest ${o.fred.parts[fw.column]} weight ${fw.weight.toFixed(3)}, relative lags ${fw.lags.map((l) => (l === null ? 'n/a' : l)).join(', ')}; warning ${fw.fires ? 'FIRES' : 'quiet'}; full composite ${o.fred.full.matched}/${o.fred.full.of}, false ${o.fred.full.falses}${o.fred.remedy ? `; remedy ${o.fred.remedy.matched}/${o.fred.remedy.of}, false ${o.fred.remedy.falses}` : ''}`);
  console.log('\nBars:');
  console.log('  ' + Object.entries(o.verdict).map(([k, v]) => `${k} ${v ? 'PASS' : 'FAIL'}`).join(', '));
  console.log(`Decision: ${o.ships ? 'the warning ships on --turns --columns' : 'a bar fails: nothing changes'}.`);
  console.log('\nPrinted, no bar:');
  for (const s of o.side) console.log(describe(s, `Manufacturer make, n ${s.n ?? 144}, noise x${s.scale ?? 1}`));
}
