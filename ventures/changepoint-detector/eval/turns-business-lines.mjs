// Several business lines that share a cycle: does the composite date a business's turns better than its best
// single line, and can each line's lead or lag be read off?
//
// Open item from README "Peaks and troughs on the page": `--turns --columns` was shipped on NBER's indicators,
// where a committee's dates exist. A business has no committee. "Next ... a business-shaped check, where no
// committee dates exist (simulated shop or SaaS lines that share a cycle but lag and differ in noise), to measure
// whether the composite dates a business's turns better than its best single line."
//
// Pre-registered 2026-11-24, written and committed before this script was first run. Nothing here has been run
// on simulated business lines before; the only prior result is the FRED round (README "A composite of NBER's
// monthly indicators dates every turn"), which is where the settings below come from.
//
// Simulation, one draw:
//   Latent log activity L over n + 4 months (n = 144, twelve years, primary). It starts in an expansion at a
//   random point of it; expansions last U{24..60} months, contractions U{6..18}; monthly growth in each
//   expansion U(0.4%, 1.2%), in each contraction -U(0.5%, 1.5%). L is piecewise straight, so its switch months
//   are its peaks and troughs: these are the true turns. Scored truth = switches at months 6..n-7 (the rule
//   cannot confirm a turn at the very edge; the FRED rounds also scored only interior turns).
//   Four lines, each log line_t = d_i t + b_i L_{t - lag_i} + e_i,t with AR(1) noise e (coefficient phi_i,
//   innovation sd s_i times the noise scale), and its own drift d_i ~ U(-0.1%, +0.3%) per month:
//     orders           lag -1 (leads), b 1.3, s 2.5%, phi 0.3
//     revenue          lag  0,         b 1.0, s 2.0%, phi 0.3
//     active customers lag +2,         b 0.6, s 0.6%, phi 0.6 (sticky)
//     staff hours      lag +1,         b 0.8, s 1.5%, phi 0.4
//   Noise scale: 1 (typical) carries the bars; 0.5 (calm) and 2 (noisy) are printed.
// Dating: the shipped `--turns` defaults, turningPoints(x, { frequency: 'monthly', bigMove: 0.05 }), on each
// line and on compositeIndex(lines) (the Conference Board method, volatility over every month).
// Scoring, kind-aware as the FRED rounds: a true turn is matched when a found turn of the same kind is within 3
// months; a found turn is false when no true turn of its kind is within 6. Precision = 1 - false/found, recall =
// matched/true, F1 their harmonic mean (0 when either is 0). Draws with fewer than 2 true turns are redrawn.
// 500 draws, seed 20261124.
//
// Bars (typical noise, n = 144):
//   S1 composite against revenue (the line a business would date alone): mean paired F1 difference >= +0.05
//      and more wins than losses by a two-sided sign test at p <= 0.05 (ties, |difference| < 0.005, left out);
//   S2 composite against the line it weighs most (the least volatile, the one a careful analyst would pick
//      without labels): the 95% bootstrap interval of the mean paired F1 difference lies above 0 (2,000 resamples);
//   S3 composite against the best single line chosen with hindsight in each draw: mean F1 no more than 0.03 below.
//   S4 lead/lag readout (lineLeads in ../line-leads.mjs): for each of orders, customers and hours, its lead
//      minus revenue's lead, in the draws where both pair at least 2 turns with the composite, equals the true
//      relative lag (-1, +2, +1) within 1 month in at least 75% of those draws, and those draws are at least 80%
//      of all draws.
// Ships: if S1-S3 pass, the README section and a sentence in `--turns`' "How far to trust it" for composites.
// If S4 passes as well, `--turns --columns` prints each column's own turns and its lead or lag against the
// composite (CLI text, --json and the page). If S4 fails, the readout is not offered. If S1-S3 fail, the
// composite is not recommended for business lines in the text, and the result is written up as it fell.
// Printed, no bar: calm and noisy scales; n = 96 and 240; each line's mean F1; the share of draws where the
// composite matches or beats the hindsight-best line; the composite's median signed timing error against the
// truth (expected late, since the stickiest line weighs most); an equal-weight composite.
//
// usage: node eval/turns-business-lines.mjs > eval/turns-business-lines.out.txt
import { fileURLToPath } from 'node:url';
import { turningPoints } from '../turning-points.mjs';
import { compositeIndex } from '../composite-index.mjs';
import { lineLeads } from '../line-leads.mjs';

const SEED = 20261124, DRAWS = 500, NEAR = 3, FAR = 6, RULE = { frequency: 'monthly', bigMove: 0.05 };
export const LINES = [
  { name: 'orders', lag: -1, b: 1.3, s: 0.025, phi: 0.3 },
  { name: 'revenue', lag: 0, b: 1.0, s: 0.020, phi: 0.3 },
  { name: 'customers', lag: 2, b: 0.6, s: 0.006, phi: 0.6 },
  { name: 'hours', lag: 1, b: 0.8, s: 0.015, phi: 0.4 },
];
const REV = 1;

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (u) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
const unif = (u, a, b) => a + (b - a) * u();
const uint = (u, a, b) => a + Math.floor(u() * (b - a + 1));
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const median = (v) => { const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// latent path over N months with its switch months; month 0 of the lines is latent month 2 (room for lag +2)
export function latent(u, N) {
  const L = [0], turns = [];
  let up = true, left = uint(u, 1, uint(u, 24, 60)), g = unif(u, 0.004, 0.012);
  for (let t = 1; t < N; t++) {
    if (left === 0) {
      turns.push({ i: t - 1, kind: up ? 'peak' : 'trough' });
      up = !up; left = up ? uint(u, 24, 60) : uint(u, 6, 18); g = up ? unif(u, 0.004, 0.012) : -unif(u, 0.005, 0.015);
    }
    L.push(L[t - 1] + g); left--;
  }
  return { L, turns };
}

export function draw(u, n, scale) {
  const OFF = 2, N = n + 4;
  for (;;) {
    const { L, turns } = latent(u, N);
    const truth = turns.map((t) => ({ i: t.i - OFF, kind: t.kind })).filter((t) => t.i >= 6 && t.i <= n - 7);
    const lines = LINES.map((l) => {
      const d = unif(u, -0.001, 0.003);
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

export function score(truth, found) {
  const matched = truth.filter((t) => found.some((f) => f.kind === t.kind && Math.abs(f.i - t.i) <= NEAR)).length;
  const falses = found.filter((f) => !truth.some((t) => t.kind === f.kind && Math.abs(f.i - t.i) <= FAR)).length;
  const P = found.length ? 1 - falses / found.length : 0, R = matched / truth.length;
  return { matched, falses, F: P > 0 && R > 0 ? (2 * P * R) / (P + R) : 0 };
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

function signTestP(w, l) {
  const k = Math.min(w, l), m = w + l;
  if (!m) return 1;
  let p = 0, c = 1;
  for (let j = 0; j <= m; j++) { if (j <= k) p += c; c = (c * (m - j)) / (j + 1); }
  return Math.min(1, (2 * p) / 2 ** m);
}

function bootCI(diffs, u, B = 2000) {
  const ms = [];
  for (let b = 0; b < B; b++) { let s = 0; for (let j = 0; j < diffs.length; j++) s += diffs[Math.floor(u() * diffs.length)]; ms.push(s / diffs.length); }
  ms.sort((a, b) => a - b);
  return [ms[Math.floor(0.025 * B)], ms[Math.floor(0.975 * B) - 1]];
}

export function arm({ n = 144, scale = 1, draws = DRAWS, seed = SEED } = {}) {
  const u = rng(seed);
  const rows = [];
  for (let k = 0; k < draws; k++) {
    const { truth, lines } = draw(u, n, scale);
    const c = compositeIndex(lines);
    const ct = turningPoints(c.index, RULE).turns;
    const own = lines.map((x) => turningPoints(x, RULE).turns);
    const fl = own.map((t) => score(truth, t).F);
    const heavy = c.weights.indexOf(Math.max(...c.weights));
    const eq = (() => { const xs = lines.map((x) => x.map((v) => Math.log(v / x[0]))); return xs[0].map((_, t) => Math.exp(xs.reduce((a, x, i) => a + x[t] / Math.sqrt(mean(xs[i].slice(1).map((v, j) => (v - xs[i][j]) ** 2))), 0) / xs.length)); })();
    const fe = score(truth, turningPoints(eq, RULE).turns).F;
    const leads = lineLeads(lines, ct, { far: FAR, ...RULE });
    rows.push({ truth: truth.length, fc: score(truth, ct).F, fl, heavy, fe, tim: timing(truth, ct), leads, weights: c.weights });
  }
  const fc = rows.map((r) => r.fc);
  const dRev = rows.map((r) => r.fc - r.fl[REV]);
  const wins = dRev.filter((d) => d >= 0.005).length, losses = dRev.filter((d) => d <= -0.005).length;
  const dHeavy = rows.map((r) => r.fc - r.fl[r.heavy]);
  const best = rows.map((r) => Math.max(...r.fl));
  const ci = bootCI(dHeavy, rng(seed + 1));
  const S1 = mean(dRev) >= 0.05 && wins > losses && signTestP(wins, losses) <= 0.05;
  const S2 = ci[0] > 0;
  const S3 = mean(fc) >= mean(best) - 0.03;
  const truthRel = LINES.map((l) => l.lag - LINES[REV].lag);
  const s4 = LINES.map((l, i) => {
    if (i === REV) return null;
    const usable = rows.filter((r) => r.leads[i].paired >= 2 && r.leads[REV].paired >= 2);
    const hit = usable.filter((r) => Math.abs(r.leads[i].lead - r.leads[REV].lead - truthRel[i]) <= 1).length;
    const est = usable.map((r) => r.leads[i].lead - r.leads[REV].lead);
    return { name: l.name, truth: truthRel[i], usable: usable.length, hit, share: usable.length ? hit / usable.length : 0, median: usable.length ? median(est) : null };
  }).filter(Boolean);
  const S4 = s4.every((s) => s.share >= 0.75 && s.usable >= 0.8 * draws);
  const tim = rows.flatMap((r) => r.tim);
  const heavyCount = LINES.map((_, i) => rows.filter((r) => r.heavy === i).length);
  return {
    n, scale, draws, truthMean: mean(rows.map((r) => r.truth)),
    fc: mean(fc), fl: LINES.map((_, i) => mean(rows.map((r) => r.fl[i]))), fe: mean(rows.map((r) => r.fe)),
    best: mean(best), atLeastBest: rows.filter((r) => r.fc >= Math.max(...r.fl) - 1e-12).length / draws,
    dRev: mean(dRev), wins, losses, pSign: signTestP(wins, losses),
    dHeavy: mean(dHeavy), ci, heavyCount,
    timingMedian: tim.length ? median(tim) : null, timingMeanAbs: tim.length ? mean(tim.map(Math.abs)) : null,
    weights: LINES.map((_, i) => mean(rows.map((r) => r.weights[i]))),
    s4, S1, S2, S3, S4,
  };
}

export function run({ draws = DRAWS } = {}) {
  const primary = arm({ draws });
  const side = [
    arm({ scale: 0.5, draws }), arm({ scale: 2, draws }),
    arm({ n: 96, draws }), arm({ n: 240, draws }),
  ];
  const ships = primary.S1 && primary.S2 && primary.S3;
  return { primary, side, ships, readout: ships && primary.S4 };
}

const f3 = (v) => v.toFixed(3);
const sg = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`;
function describe(a) {
  const out = [`n ${a.n}, noise x${a.scale}, ${a.draws} draws, ${a.truthMean.toFixed(2)} true turns a draw on average`];
  out.push(`  mean F1: composite ${f3(a.fc)}; ${LINES.map((l, i) => `${l.name} ${f3(a.fl[i])}`).join(', ')}; equal-weight composite ${f3(a.fe)}`);
  out.push(`  hindsight-best line ${f3(a.best)}; composite at least as good in ${(100 * a.atLeastBest).toFixed(1)}% of draws`);
  out.push(`  composite - revenue ${sg(a.dRev)} (wins ${a.wins}, losses ${a.losses}, sign test p ${a.pSign.toExponential(2)})`);
  out.push(`  composite - heaviest-weight line ${sg(a.dHeavy)} (95% CI ${sg(a.ci[0])} to ${sg(a.ci[1])}); heaviest: ${LINES.map((l, i) => `${l.name} ${a.heavyCount[i]}`).join(', ')}`);
  out.push(`  mean weights: ${LINES.map((l, i) => `${l.name} ${f3(a.weights[i])}`).join(', ')}`);
  out.push(`  composite timing vs truth (matched turns): median ${a.timingMedian}, mean |error| ${a.timingMeanAbs?.toFixed(2)} months`);
  out.push(`  lead/lag vs revenue: ${a.s4.map((s) => `${s.name} true ${s.truth >= 0 ? '+' : ''}${s.truth}, median read ${s.median}, within 1 in ${s.hit}/${s.usable} (${(100 * s.share).toFixed(1)}%)`).join('; ')}`);
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = run();
  const p = o.primary;
  console.log('Primary (bars):');
  console.log(describe(p));
  console.log(`  S1 composite beats revenue by >= 0.05, sign test p <= 0.05: ${p.S1 ? 'PASS' : 'FAIL'}`);
  console.log(`  S2 composite beats the heaviest-weight line, CI above 0: ${p.S2 ? 'PASS' : 'FAIL'}`);
  console.log(`  S3 composite within 0.03 of the hindsight-best line: ${p.S3 ? 'PASS' : 'FAIL'}`);
  console.log(`  S4 lead/lag within 1 month in >= 75% of >= 80% of draws, each line: ${p.S4 ? 'PASS' : 'FAIL'}`);
  console.log(`Decision: ${o.ships ? 'S1-S3 pass: the composite is recommended for business lines' : 'S1-S3 do not all pass: no recommendation'}; readout ${o.readout ? 'ships' : 'not offered'}.`);
  console.log('\nPrinted, no bar:');
  for (const a of o.side) console.log(describe(a));
}
