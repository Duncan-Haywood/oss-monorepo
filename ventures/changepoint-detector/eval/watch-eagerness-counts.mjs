// Pre-registered in eval/watch-eagerness-counts.prereg.md: round 6's "How eager" hint rerun for counts, with the
// 2026-11-20 count default (bocpd-window + NB cost, threshold 0.3) as Quiet, against today's count ladder (bocpd, pelt).
//   node eval/watch-eagerness-counts.mjs > eval/watch-eagerness-counts.out.txt
// Each series: 240 daily points. The hint reads the first 120 (the history) by eagernessReplay at round 6's budget of
// 2 alerts per 100 checks; the picked setting is then replayed as a watch over the last 120 (from 120), scored there.
// Generator and cells: those of eval/poisson-window-threshold.mjs (a step at 180 here, found by an alert within 3 points).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { replayWatch, eagernessReplay, COUNT_DEFAULTS } from '../watch-core.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const gamma = (u, k, scale) => { const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = normal(u); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale; } };
const nb = (u, mean, f) => poisson(u, gamma(u, mean / (f - 1), f - 1));

const N = 240, HIST = 120, AT = 180;
const SEED0 = Number(process.env.SEED0 ?? 1001), NSEEDS = Number(process.env.NSEEDS ?? 200);
const SEEDS = Array.from({ length: NSEEDS }, (_, i) => SEED0 + i);
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
const CD = { detector: COUNT_DEFAULTS.detector, overdispersion: COUNT_DEFAULTS.overdispersion, threshold: COUNT_DEFAULTS.threshold };
const SETTING = { bocpd: { detector: 'bocpd' }, cd: CD, pelt: { detector: 'pelt' } };
// Hint arms: a ladder (quietest first) the hint picks from. Fixed arms: one setting, no hint.
const ARMS = {
  'old hint (bocpd, pelt)': { ladder: [['quiet', 'bocpd'], ['eager', 'pelt']] },
  'new hint (default, pelt)': { ladder: [['quiet', 'cd'], ['eager', 'pelt']] },
  'hint (default, bocpd, pelt)': { ladder: [['quiet', 'cd'], ['middle', 'bocpd'], ['eager', 'pelt']] },
  'fixed default': { fixed: 'cd' },
  'fixed bocpd': { fixed: 'bocpd' },
};
const BASE = 'old hint (bocpd, pelt)', CAND = 'new hint (default, pelt)';
const DETS = Object.keys(ARMS);

function runCell(key) {
  const c = CELLS.find((x) => x.key === key);
  return SEEDS.map((seed) => {
    const u = lcg(seed * 2654435761 + c.key.charCodeAt(1) * 97);
    const v = Array.from({ length: N }, (_, i) => c.gen(u, i));
    const hist = v.slice(0, HIST);
    const future = {};
    const score = (name) => {
      if (future[name]) return future[name];
      const r = replayWatch(v, null, { model: 'poisson', ...SETTING[name], from: HIST, budget: Infinity });
      const hit = c.step ? r.alerts.find((a) => Math.abs(a.index - AT) <= 3) : null;
      return (future[name] = { alerts: r.alerts.length, checks: N - HIST, found: hit ? 1 : 0, delay: hit ? hit.reportedAt - AT : null });
    };
    const out = {};
    for (const arm of DETS) {
      const a = ARMS[arm];
      let pick = a.fixed;
      if (!pick) {
        const ladder = a.ladder.map(([k, s]) => ({ key: k, ...SETTING[s], name: s }));
        const r = eagernessReplay(hist, null, { model: 'poisson', ladder });
        pick = ladder.find((x) => x.key === r.suggest).name;
      }
      out[arm] = { ...score(pick), pick };
    }
    return out;
  });
}

if (!isMainThread) {
  parentPort.postMessage(runCell(workerData.key));
} else {
  const t0 = Date.now();
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
  const per1000 = (rows, d) => (1000 * rows.reduce((t, r) => t + r[d].alerts, 0)) / rows.reduce((t, r) => t + r[d].checks, 0);
  const found = (rows, d) => rows.reduce((t, r) => t + r[d].found, 0);
  const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const pooledFalse = (byCell, d) => nulls.reduce((t, c) => t + per1000(byCell[c.key], d), 0) / nulls.length;
  const pooledFound = (byCell, d) => steps.reduce((t, c) => t + found(byCell[c.key], d), 0);
  const picks = (rows, d) => { const m = {}; for (const r of rows) m[r[d].pick] = (m[r[d].pick] ?? 0) + 1; return Object.entries(m).map(([k, n]) => `${k === 'cd' ? 'default' : k} ${n}`).join(', '); };

  console.log(`model poisson, ${N} daily points, hint on the first ${HIST} (budget 2 per 100 checks), watch scored on the last ${N - HIST}; seeds ${SEEDS[0]}-${SEEDS.at(-1)} (${SEEDS.length} per cell), paired; steps at ${AT}`);
  console.log('Nulls: false alerts per 1,000 checks. Steps: found of ' + SEEDS.length + ' (median delay in checks).');
  console.log('');
  console.log(`| cell | ${DETS.join(' | ')} |`);
  console.log(`|---|${DETS.map(() => '---').join('|')}|`);
  for (const c of CELLS) {
    const rows = res[c.key];
    console.log(`| ${c.key} ${c.what} | ${DETS.map((d) => c.step ? `${found(rows, d)} (${median(rows.map((r) => r[d].delay)) ?? '-'})` : per1000(rows, d).toFixed(2)).join(' | ')} |`);
  }
  console.log(`| pooled false (nulls equal) | ${DETS.map((d) => pooledFalse(res, d).toFixed(2)).join(' | ')} |`);
  console.log(`| steps found of ${steps.length * SEEDS.length} | ${DETS.map((d) => pooledFound(res, d)).join(' | ')} |`);
  console.log('');
  console.log('Picks per cell (hint arms):');
  for (const c of CELLS) console.log(`  ${c.key}: ${DETS.filter((d) => ARMS[d].ladder).map((d) => `${d}: ${picks(res[c.key], d)}`).join('; ')}`);

  const B = 10000, rng = lcg(20261120);
  const others = DETS.filter((d) => d !== BASE);
  const fd = Object.fromEntries(others.map((d) => [d, []])), sd = Object.fromEntries(others.map((d) => [d, []]));
  for (let b = 0; b < B; b++) {
    const byCell = {};
    for (const c of CELLS) { const rows = res[c.key]; byCell[c.key] = rows.map(() => rows[Math.floor(rng() * rows.length)]); }
    const f0 = pooledFalse(byCell, BASE), s0 = pooledFound(byCell, BASE);
    for (const d of others) { fd[d].push(pooledFalse(byCell, d) - f0); sd[d].push(pooledFound(byCell, d) - s0); }
  }
  const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  console.log('');
  console.log(`Against ${BASE} (${B} stratified paired resamples, 95% percentile intervals):`);
  let verdict = null;
  for (const d of others) {
    const fPoint = pooledFalse(res, d) - pooledFalse(res, BASE), sPoint = pooledFound(res, d) - pooledFound(res, BASE);
    const fHi = q(fd[d], 0.975), fLo = q(fd[d], 0.025), sLo = q(sd[d], 0.025), sHi = q(sd[d], 0.975);
    const worstNull = Math.max(...nulls.map((c) => per1000(res[c.key], d) - per1000(res[c.key], BASE)));
    const worstStep = Math.min(...steps.map((c) => found(res[c.key], d) - found(res[c.key], BASE)));
    const F1 = fHi <= 1.0, F2 = worstNull <= 2.0, D1 = sLo > 0, D2 = worstStep >= -4;
    if (d === CAND) verdict = F1 && F2 && D1 && D2;
    console.log(`${d}${d === CAND ? '' : ' (reported only)'}: false ${fPoint >= 0 ? '+' : ''}${fPoint.toFixed(2)} (${fLo.toFixed(2)} to ${fHi.toFixed(2)}); steps ${sPoint >= 0 ? '+' : ''}${sPoint} (${sLo} to ${sHi}); worst null ${worstNull.toFixed(2)}; worst step cell ${worstStep}`);
    console.log(`  F1 ${F1 ? 'pass' : 'FAIL'}, F2 ${F2 ? 'pass' : 'FAIL'}, D1 ${D1 ? 'pass' : 'FAIL'}, D2 ${D2 ? 'pass' : 'FAIL'}${d === CAND ? ` -> ${verdict ? 'passes' : 'fails'}` : ''}`);
  }
  console.log('');
  console.log(verdict ? 'passes: for counts, --suggest and --detector auto pick from (count default, pelt)' : 'fails: the count ladder stays (bocpd, pelt)');
  console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
