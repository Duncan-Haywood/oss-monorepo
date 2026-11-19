// Pre-registered in eval/poisson-window-margin.prereg.md: bocpd vs bocpd-window for watched daily counts,
// a margin rule on fresh seeds 201-400, paired, with a stratified bootstrap.
//   node eval/poisson-window-margin.mjs > eval/poisson-window-margin.out.txt
// The generator and the cells' streams are those of eval/poisson-window.mjs (seeds 101-120 there), plus N5 and S6.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { replayWatch } from '../watch-core.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const gamma = (u, k, scale) => { const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = normal(u); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale; } };
const nb = (u, mean, f) => poisson(u, gamma(u, mean / (f - 1), f - 1));

const N = 120, FROM = 90, AT = 108, SEEDS = Array.from({ length: 200 }, (_, i) => 201 + i);
const CELLS = [
  { key: 'N1', what: 'Poisson 30', gen: (u, i) => poisson(u, 30) },
  { key: 'N2', what: 'NB 30, var 60', gen: (u, i) => nb(u, 30, 2) },
  { key: 'N3', what: 'Poisson 30, weekends 0.6x', gen: (u, i) => poisson(u, i % 7 >= 5 ? 18 : 30) },
  { key: 'N4', what: 'Poisson 5', gen: (u, i) => poisson(u, 5) },
  { key: 'N5', what: 'NB 30, var 90', gen: (u, i) => nb(u, 30, 3) },
  { key: 'S1', what: '30 -> 15', step: true, gen: (u, i) => poisson(u, i < AT ? 30 : 15) },
  { key: 'S2', what: '30 -> 21', step: true, gen: (u, i) => poisson(u, i < AT ? 30 : 21) },
  { key: 'S3', what: '30 -> 45', step: true, gen: (u, i) => poisson(u, i < AT ? 30 : 45) },
  { key: 'S4', what: '5 -> 2', step: true, gen: (u, i) => poisson(u, i < AT ? 5 : 2) },
  { key: 'S5', what: 'NB(2x) 30 -> 18', step: true, gen: (u, i) => nb(u, i < AT ? 30 : 18, 2) },
  { key: 'S6', what: 'NB(3x) 30 -> 18', step: true, gen: (u, i) => nb(u, i < AT ? 30 : 18, 3) },
];
const DETS = ['bocpd', 'bocpd-window'];

// One cell: per seed, for each detector, { alerts, checks, found, delay }.
function runCell(key) {
  const c = CELLS.find((x) => x.key === key);
  return SEEDS.map((seed) => {
    const u = lcg(seed * 2654435761 + c.key.charCodeAt(1) * 97);
    const v = Array.from({ length: N }, (_, i) => c.gen(u, i));
    const out = {};
    for (const det of DETS) {
      const r = replayWatch(v, null, { model: 'poisson', detector: det, from: FROM, budget: Infinity });
      const hit = c.step ? r.alerts.find((a) => Math.abs(a.index - AT) <= 3) : null;
      out[det] = { alerts: r.alerts.length, checks: r.checks, found: hit ? 1 : 0, delay: hit ? hit.reportedAt - AT : null };
    }
    return out;
  });
}

if (!isMainThread) {
  parentPort.postMessage(runCell(workerData.key));
} else {
  const res = {};
  const queue = CELLS.map((c) => c.key);
  const width = Math.min(availableParallelism(), queue.length);
  await Promise.all(Array.from({ length: width }, async () => {
    while (queue.length) {
      const key = queue.shift();
      res[key] = await new Promise((ok, bad) => { const w = new Worker(new URL(import.meta.url), { workerData: { key } }); w.once('message', ok); w.once('error', bad); });
    }
  }));

  const nulls = CELLS.filter((c) => !c.step), steps = CELLS.filter((c) => c.step);
  const per1000 = (rows, det) => (1000 * rows.reduce((t, r) => t + r[det].alerts, 0)) / rows.reduce((t, r) => t + r[det].checks, 0);
  const found = (rows, det) => rows.reduce((t, r) => t + r[det].found, 0);
  const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  // Pooled statistics on a resample: rows by cell key.
  const falseDiff = (byCell) => nulls.reduce((t, c) => t + per1000(byCell[c.key], 'bocpd-window') - per1000(byCell[c.key], 'bocpd'), 0) / nulls.length;
  const stepDiff = (byCell) => steps.reduce((t, c) => t + found(byCell[c.key], 'bocpd-window') - found(byCell[c.key], 'bocpd'), 0);

  console.log(`replayWatch, model poisson, ${N} points, checks from ${FROM}, seeds ${SEEDS[0]}-${SEEDS.at(-1)} (${SEEDS.length} per cell), paired; steps at ${AT}`);
  console.log('');
  console.log('| cell | bocpd | bocpd-window | window minus bocpd |');
  console.log('|---|---|---|---|');
  for (const c of CELLS) {
    const rows = res[c.key];
    if (c.step) {
      const a = found(rows, 'bocpd'), b = found(rows, 'bocpd-window');
      console.log(`| ${c.key} ${c.what} | ${a}/200 (median delay ${median(rows.map((r) => r.bocpd.delay)) ?? '-'}) | ${b}/200 (median delay ${median(rows.map((r) => r['bocpd-window'].delay)) ?? '-'}) | ${b - a >= 0 ? '+' : ''}${b - a} |`);
    } else {
      const a = per1000(rows, 'bocpd'), b = per1000(rows, 'bocpd-window');
      console.log(`| ${c.key} ${c.what} | ${a.toFixed(2)} per 1,000 | ${b.toFixed(2)} per 1,000 | ${(b - a).toFixed(2)} |`);
    }
  }

  // Stratified bootstrap over seeds: each cell resampled by itself, the same seed indexes for both detectors (paired).
  const B = 10000, rng = lcg(20261119);
  const fd = [], sd = [];
  for (let b = 0; b < B; b++) {
    const byCell = {};
    for (const c of CELLS) { const rows = res[c.key]; byCell[c.key] = rows.map(() => rows[Math.floor(rng() * rows.length)]); }
    fd.push(falseDiff(byCell)); sd.push(stepDiff(byCell));
  }
  const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const fPoint = falseDiff(res), sPoint = stepDiff(res);
  const fLo = q(fd, 0.025), fHi = q(fd, 0.975), sLo = q(sd, 0.025), sHi = q(sd, 0.975);
  const worstNull = Math.max(...nulls.map((c) => per1000(res[c.key], 'bocpd-window') - per1000(res[c.key], 'bocpd')));
  const worstStep = Math.min(...steps.map((c) => found(res[c.key], 'bocpd-window') - found(res[c.key], 'bocpd')));
  console.log('');
  console.log(`pooled false alerts per 1,000 checks (nulls weighted equally): bocpd ${(nulls.reduce((t, c) => t + per1000(res[c.key], 'bocpd'), 0) / nulls.length).toFixed(2)}, bocpd-window ${(nulls.reduce((t, c) => t + per1000(res[c.key], 'bocpd-window'), 0) / nulls.length).toFixed(2)}`);
  console.log(`  difference ${fPoint.toFixed(2)}, 95% interval ${fLo.toFixed(2)} to ${fHi.toFixed(2)} (${B} stratified paired resamples)`);
  console.log(`steps found of ${steps.length * SEEDS.length}: bocpd ${steps.reduce((t, c) => t + found(res[c.key], 'bocpd'), 0)}, bocpd-window ${steps.reduce((t, c) => t + found(res[c.key], 'bocpd-window'), 0)}`);
  console.log(`  difference ${sPoint}, 95% interval ${sLo} to ${sHi}`);
  console.log('');
  const F1 = fHi <= 1.0, F2 = worstNull <= 2.0, D1 = sLo > 0, D2 = worstStep >= -4;
  console.log(`F1 upper end of the false-alert difference <= 1.0: ${fHi.toFixed(2)} -> ${F1 ? 'pass' : 'FAIL'}`);
  console.log(`F2 worst null cell's difference <= 2.0: ${worstNull.toFixed(2)} -> ${F2 ? 'pass' : 'FAIL'}`);
  console.log(`D1 lower end of the steps-found difference > 0: ${sLo} -> ${D1 ? 'pass' : 'FAIL'}`);
  console.log(`D2 worst step cell no more than 4 fewer: ${worstStep} -> ${D2 ? 'pass' : 'FAIL'}`);
  console.log(`decision: ${F1 && F2 && D1 && D2 ? 'switch the --model poisson default to bocpd-window' : 'keep bocpd'}`);
}
