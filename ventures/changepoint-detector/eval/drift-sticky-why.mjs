// Why a 5-sd step goes missing in a sticky walk under repeats 'missing' (drift-level.mjs), and whether
// the power rule that declined it compared the two models at the same false-alarm rate.
//
// Background (README "Sticky series: exact repeats"): on cell G (a random walk, step sd 1, noise 0.1,
// 40% of points a stale repeat of the one before, a 5-unit level step at t = 150) the shipped
// `--model drift` finds the step 60 of 60 times with 35 cuts a series; repeats 'missing' finds it 46
// of 60 with 2.25 cuts. The rule asked for at most 6 fewer than shipped, so 'missing' was declined.
// That rule compared two models at very different false-alarm rates (35 cuts against 1.3 on the same
// walk with no change, cell F). This file asks two questions, on a fresh seed (20261113):
//
// 1. Why. Under 'missing', the step is seen only at the first new (non-repeated) value at or after
//    t = 150, and the jump there carries k steps of wander, k the number of steps since the last new
//    value before 150 (k = 1: no repeat around the step). So its standardised size is about
//    5 / sqrt(k omega^2 + 2 sigma^2), a chi-square of about 25 / k against a penalty of
//    2 log 300 = 11.4 (plus the price of restarting the level). Predictions, written before the run:
//    (P1) the found share falls with k: at least 90% at k = 1, at most 60% at k >= 3;
//    (P2) at least three quarters of the misses have k >= 2;
//    (P3) the fitted omega on G is within 15% of the true 1 (median), so the misses are not an
//         inflated wander absorbing the step (the Nile failure in the one-column model).
//    If (P1)-(P3) hold, the missed steps are hidden by the repeats themselves: the data no longer
//    says when the step happened inside the gap, and no model of the repeats gets it back.
//
//    Corollary, not tested here (algebra): a zero-inflated observation in which each point repeats
//    the previous one with a stale probability p shared by the whole series adds
//    -2 [r log p + (n - 1 - r) log (1 - p)] to every partition's cost, r the number of repeats, so it
//    picks exactly the partition of 'missing'. The flagship's next item (a shared stale probability)
//    cannot change cell G; only a stale probability per segment (a change in stickiness) could.
//
// 2. The operating point. Penalty multipliers m in {0.5, 1, 2, 4, 8, 16, 32} times the default
//    2 log n for the shipped model (repeats 'keep') and for 'missing', ML wander, on F and G at 40%
//    repeats and on F20 and G20 at 20% repeats (the warning's threshold). 120 series a cell.
//    Rule: for every shipped multiplier m_s, some 'missing' multiplier with F cuts no more than
//    shipped's at m_s must find the step at least as often as shipped at m_s, less 3 of 120 (Monte
//    Carlo slack), on both the 40% and the 20% pair. If it holds, 'missing' is offered as an opt-in
//    (`--drift-repeats missing`; its TCPD guard passed on 2026-11-11, eval/tcpd-drift-missing.out.txt:
//    0.693 / 0.583 against shipped 0.694 / 0.527) and the sticky-series warning points to it. If not,
//    nothing changes for users. The default never changes on this evidence.
//
// Written 2026-11-12 before any cell was run with this seed.
// usage: node eval/drift-sticky-why.mjs > eval/drift-sticky-why.out.txt
import { driftLevelChanges } from '../drift-level.mjs';

let seed = 20261113;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const N = 300, REPS = 120, AT = 150, BASE = 2 * Math.log(N);
const MULTS = [0.5, 1, 2, 4, 8, 16, 32];
const walk = (step) => { let m = 0; return Array.from({ length: N }, (_, t) => (m += t ? gauss() : 0) + (t >= AT ? step : 0) + 0.1 * gauss()); };
const sticky = (x, p) => { const y = x.slice(); for (let t = 1; t < N; t++) if (rnd() < p) y[t] = y[t - 1]; return y; };
// k: steps between the last new value before AT and the first new value at or after AT.
const revealGap = (y) => {
  let after = AT; while (after < N && y[after] === y[after - 1]) after++;
  let before = AT - 1; while (before > 0 && y[before] === y[before - 1]) before--;
  return after - before;
};
const found = (cps) => cps.some((c) => Math.abs(c - AT) <= 5);
const MODELS = { shipped: {}, missing: { repeats: 'missing' } };

const t0 = Date.now();
const sweep = {};
const why = { byK: new Map(), omegaG: [], omegaF: [] };
for (const p of [0.4, 0.2]) {
  for (const [cell, step] of [['F', 0], ['G', 5]]) {
    const name = `${cell}${p === 0.2 ? '20' : ''}`;
    const acc = (sweep[name] = {});
    for (const k of Object.keys(MODELS)) for (const m of MULTS) acc[`${k} ${m}`] = { cuts: 0, found: 0 };
    for (let r = 0; r < REPS; r++) {
      const y = sticky(walk(step), p);
      for (const [k, o] of Object.entries(MODELS)) {
        for (const m of MULTS) {
          const fit = driftLevelChanges(y, { noise: 'ml', penalty: m * BASE, ...o });
          const a = acc[`${k} ${m}`];
          a.cuts += fit.changepoints.length; a.found += found(fit.changepoints) ? 1 : 0;
          if (p === 0.4 && k === 'missing' && m === 1) {
            if (cell === 'G') {
              const g = revealGap(y), key = g >= 4 ? 4 : g;
              const b = why.byK.get(key) ?? { n: 0, found: 0, z2: [] };
              let after = AT; while (after < N && y[after] === y[after - 1]) after++;
              const before = after - g;
              const z2 = (y[after] - y[before]) ** 2 / (g * fit.omega ** 2 + 2 * fit.sigma ** 2);
              b.n++; b.found += found(fit.changepoints) ? 1 : 0; b.z2.push(z2);
              why.byK.set(key, b);
              why.omegaG.push(fit.omega);
            } else why.omegaF.push(fit.omega);
          }
        }
      }
    }
  }
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

console.log(`n ${N}, ${REPS} series a cell, ML wander, walk step sd 1, noise sd 0.1. found: a change within 5 of t = ${AT}. Penalty = m x 2 log n (${BASE.toFixed(2)}).`);
console.log(`\n1. Why the step goes missing under repeats 'missing' (m = 1, G, 40% repeats), by the reveal gap k`);
console.log('  k     series  found   share  median z^2 of the revealed jump');
let missesK1 = 0, misses = 0;
for (const key of [...why.byK.keys()].sort((a, b) => a - b)) {
  const b = why.byK.get(key);
  if (key === 1) missesK1 += b.n - b.found;
  misses += b.n - b.found;
  console.log(`  ${(key === 4 ? '>=4' : String(key)).padEnd(5)} ${String(b.n).padStart(6)}  ${String(b.found).padStart(5)}  ${(b.found / b.n).toFixed(2).padStart(6)}  ${med(b.z2).toFixed(1).padStart(8)}`);
}
const k3 = [...why.byK.entries()].filter(([k]) => k >= 3).reduce((s, [, b]) => ({ n: s.n + b.n, f: s.f + b.found }), { n: 0, f: 0 });
const k1 = why.byK.get(1);
console.log(`  (P1) found share at k = 1: ${(k1.found / k1.n).toFixed(2)} (>= 0.90 predicted); at k >= 3: ${k3.n ? (k3.f / k3.n).toFixed(2) : 'n/a'} (<= 0.60 predicted): ${k1.found / k1.n >= 0.9 && (!k3.n || k3.f / k3.n <= 0.6) ? 'holds' : 'fails'}`);
console.log(`  (P2) misses with k >= 2: ${misses - missesK1} of ${misses} (>= 3/4 predicted): ${misses === 0 || (misses - missesK1) / misses >= 0.75 ? 'holds' : 'fails'}`);
console.log(`  (P3) median fitted omega: G ${med(why.omegaG).toFixed(3)}, F ${med(why.omegaF).toFixed(3)} (true 1; within 15% predicted on G): ${Math.abs(med(why.omegaG) - 1) <= 0.15 ? 'holds' : 'fails'}`);

console.log('\n2. Operating points: mean cuts on the walk with no change (F) and steps found on G, by penalty multiplier m');
let rule = true;
for (const [Fc, Gc] of [['F', 'G'], ['F20', 'G20']]) {
  console.log(`\n  ${Fc === 'F' ? '40%' : '20%'} repeats   m:  ${MULTS.map((m) => String(m).padStart(13)).join('')}`);
  for (const k of Object.keys(MODELS)) {
    console.log(`  ${k.padEnd(8)} F cuts      ${MULTS.map((m) => (sweep[Fc][`${k} ${m}`].cuts / REPS).toFixed(2).padStart(13)).join('')}`);
    console.log(`  ${''.padEnd(8)} G found     ${MULTS.map((m) => `${sweep[Gc][`${k} ${m}`].found}/${REPS}`.padStart(13)).join('')}`);
  }
  for (const ms of MULTS) {
    const s = { F: sweep[Fc][`shipped ${ms}`].cuts, G: sweep[Gc][`shipped ${ms}`].found };
    const ok = MULTS.filter((mm) => sweep[Fc][`missing ${mm}`].cuts <= s.F);
    const bestG = ok.length ? Math.max(...ok.map((mm) => sweep[Gc][`missing ${mm}`].found)) : -1;
    const pass = bestG >= s.G - 3;
    rule = rule && pass;
    console.log(`    shipped m ${String(ms).padEnd(4)} F cuts ${(s.F / REPS).toFixed(2).padStart(6)}, G ${s.G}/${REPS}; missing at no more F cuts finds at best ${bestG < 0 ? 'none qualify' : `${bestG}/${REPS}`}: ${pass ? 'ok' : 'FAILS'}`);
  }
}
console.log(`\nRule (missing at least as powerful at no more false cuts, every shipped m, both repeat shares): ${rule ? 'HOLDS -> offer --drift-repeats missing as an opt-in' : 'FAILS -> nothing changes for users'}`);
console.error(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
