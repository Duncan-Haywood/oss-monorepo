// A calmer wander gate under the count Middle: V (the shipped wander gate, W, with the change chosen from the probe;
// eval/middle-wander-calm.prereg.md) against W and Middle (M). W lost slow falls on calm simulated Search Console
// sites (README "A wandering level under Middle", K3). The sets and bars of eval/middle-wander.mjs on fresh seeds:
//   1  the simulated Search Console sites of eval/gsc-sites.mjs (seeds 5501-5520, cv 0.15 and 0.30), days unaware;
//   2  the eleven cells of eval/gsc-middle-hint.mjs (seeds 7001-7060), fixed arms;
//   3  growing, shrinking and wandering sites (seeds 5701-5740), alerts per 1,000 days.
// The count default (D) is left out to save time (it was reported only).
//   node eval/middle-wander-calm.mjs > eval/middle-wander-calm.out.txt
// SEED_SHIFT=8500 NSEEDS=1 for a smoke run on seeds no bar uses.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { replayWatch, COUNT_MIDDLE } from '../watch-core.mjs';
import { N as GN, AT as GAT, FROM as GFROM, labels as GLABELS, series as gscSeries } from './gsc-sites.mjs';

const SHIFT = Number(process.env.SEED_SHIFT ?? 0);
const LIMIT = process.env.NSEEDS ? Number(process.env.NSEEDS) : Infinity;
const range = (a, b) => Array.from({ length: Math.min(b - a + 1, LIMIT) }, (_, i) => a + SHIFT + i);
import { CANDIDATE } from './middle-wander-calm-candidate.mjs';
const ARMS = { M: { ...COUNT_MIDDLE }, W: { ...COUNT_MIDDLE, wander: 'gated', wanderBefore: false }, V: { ...COUNT_MIDDLE, wander: 'gated', wanderBefore: false, ...CANDIDATE } };
const C = 'V';

// Set 2 generators, as eval/gsc-middle-hint.mjs.
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const gammaS = (u, k, scale) => { const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = normal(u); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale; } };
const nb = (u, mean, f) => poisson(u, gammaS(u, mean / (f - 1), f - 1));
const N2 = 240, HIST = 120, AT2 = 180;
const CELLS2 = [
  { key: 'N1', what: 'Poisson 30', gen: (u, i) => poisson(u, 30) },
  { key: 'N2', what: 'NB 30, var 60', gen: (u, i) => nb(u, 30, 2) },
  { key: 'N3', what: 'Poisson 30, weekends 0.6x', gen: (u, i) => poisson(u, i % 7 >= 5 ? 18 : 30) },
  { key: 'N4', what: 'Poisson 5', gen: (u, i) => poisson(u, 5) },
  { key: 'N5', what: 'NB 30, var 90', gen: (u, i) => nb(u, 30, 3) },
  { key: 'S1', what: '30 -> 15', step: true, gen: (u, i) => poisson(u, i < AT2 ? 30 : 15) },
  { key: 'S2', what: '30 -> 21', step: true, gen: (u, i) => poisson(u, i < AT2 ? 30 : 21) },
  { key: 'S3', what: '30 -> 45', step: true, gen: (u, i) => poisson(u, i < AT2 ? 30 : 45) },
  { key: 'S4', what: '5 -> 2', step: true, gen: (u, i) => poisson(u, i < AT2 ? 5 : 2) },
  { key: 'S5', what: 'NB(2x) 30 -> 18', step: true, gen: (u, i) => nb(u, i < AT2 ? 30 : 18, 2) },
  { key: 'S6', what: 'NB(3x) 30 -> 18', step: true, gen: (u, i) => nb(u, i < AT2 ? 30 : 18, 3) },
];

// Set 3: base 400, weekends at 70%, gamma day multiplier cv 0.15 (as gsc-sites), times a slow trend or a log-mean walk.
const CELLS3 = [
  { key: 'T1', what: 'grows 30% over 240 days', level: (i) => 1 + 0.3 * i / 240 },
  { key: 'T2', what: 'grows 100% over 240 days', level: (i) => 1 + 1.0 * i / 240 },
  { key: 'T3', what: 'falls 30% over 240 days', level: (i) => 1 - 0.3 * i / 240 },
  { key: 'T4', what: 'log-mean walk, sd 0.01 a day', walk: 0.01 },
  { key: 'T5', what: 'log-mean walk, sd 0.02 a day', walk: 0.02 },
  { key: 'T6', what: 'grows 30% over 240 days, falls 20% on day 180', level: (i) => (1 + 0.3 * i / 240) * (i >= GAT ? 0.8 : 1), fall: true },
];
function pois3(u, l) {
  if (l > 500) { const a = u(), b = u(); return Math.max(0, Math.round(l + Math.sqrt(l) * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b))); }
  return poisson(u, l);
}
function series3(c, seed) {
  const u = lcg(seed * 104729 + c.key.charCodeAt(1) * 131), cv = 0.15, k = 1 / cv ** 2;
  let lw = 0;
  return GLABELS.map((d, i) => {
    const w = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (c.walk) lw += c.walk * normal(u);
    const lev = c.walk ? Math.exp(lw) : c.level(i);
    return pois3(u, 400 * (w === 0 || w === 6 ? 0.7 : 1) * lev * gammaS(u, k, 1 / k));
  });
}

function runJob(job) {
  if (job.set === 1) {
    return range(5501, 5520).map((seed) => {
      const v = gscSeries(seed, job.base, job.fall, job.cv), out = {};
      for (const [arm, o] of Object.entries(ARMS)) {
        const r = replayWatch(v, GLABELS, { model: 'poisson', ...o, from: GFROM, step: 1, budget: Infinity });
        let got = null, falseA = 0;
        for (const a of r.alerts) {
          const idx = GLABELS.indexOf(String(a.label));
          if (job.fall && Math.abs(idx - GAT) <= 7 && a.reportedAt >= GAT) { if (got == null) got = a.reportedAt - GAT; }
          else if (!job.fall || a.reportedAt < GAT) falseA++;
        }
        out[arm] = { falseA, watched: job.fall ? GAT - GFROM : GN - GFROM, unaware: job.fall ? (got ?? GN - GAT) : null, heard: got != null };
      }
      return out;
    });
  }
  if (job.set === 2) {
    const c = CELLS2.find((x) => x.key === job.key);
    return range(7001, 7060).map((seed) => {
      const u = lcg(seed * 2654435761 + c.key.charCodeAt(1) * 97);
      const v = Array.from({ length: N2 }, (_, i) => c.gen(u, i)), out = {};
      for (const [arm, o] of Object.entries(ARMS)) {
        const r = replayWatch(v, null, { model: 'poisson', ...o, from: HIST, budget: Infinity });
        const hit = c.step ? r.alerts.find((a) => Math.abs(a.index - AT2) <= 3) : null;
        out[arm] = { alerts: r.alerts.length, checks: N2 - HIST, found: hit ? 1 : 0, delay: hit ? hit.reportedAt - AT2 : null };
      }
      return out;
    });
  }
  const c = CELLS3.find((x) => x.key === job.key);
  return range(5701, 5740).map((seed) => {
    const v = series3(c, seed), out = {};
    for (const [arm, o] of Object.entries(ARMS)) {
      const r = replayWatch(v, GLABELS, { model: 'poisson', ...o, from: GFROM, step: 1, budget: Infinity });
      if (!c.fall) { out[arm] = { alerts: r.alerts.length, watched: GN - GFROM }; continue; }
      let got = null, falseA = 0;
      for (const a of r.alerts) {
        const idx = GLABELS.indexOf(String(a.label));
        if (Math.abs(idx - GAT) <= 7 && a.reportedAt >= GAT) { if (got == null) got = a.reportedAt - GAT; } else if (a.reportedAt < GAT) falseA++;
      }
      out[arm] = { alerts: r.alerts.length, watched: GN - GFROM, falseA, falseWatched: GAT - GFROM, heard: got != null, unaware: got ?? GN - GAT };
    }
    return out;
  });
}

if (!isMainThread) {
  parentPort.postMessage(runJob(workerData));
} else {
  const t0 = Date.now();
  const jobs = [];
  for (const cv of [0.15, 0.3]) for (const base of [50, 400, 3000]) for (const fall of [0, 0.1, 0.2, 0.4]) jobs.push({ set: 1, cv, base, fall, id: `1/${cv}/${base}/${fall}` });
  for (const c of CELLS2) jobs.push({ set: 2, key: c.key, id: `2/${c.key}` });
  for (const c of CELLS3) jobs.push({ set: 3, key: c.key, id: `3/${c.key}` });
  const res = {}, queue = [...jobs].sort((a, b) => (a.set === 2 ? -1 : 0) - (b.set === 2 ? -1 : 0));
  await Promise.all(Array.from({ length: Math.min(availableParallelism(), queue.length) }, async () => {
    while (queue.length) {
      const job = queue.shift();
      res[job.id] = await new Promise((ok, bad) => { const w = new Worker(new URL(import.meta.url), { workerData: job }); w.once('message', ok); w.once('error', bad); });
      process.stderr.write(`${job.id} ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
    }
  }));

  const { writeFileSync } = await import('node:fs');
  if (process.env.RAW) writeFileSync(process.env.RAW, JSON.stringify(res));

  const B = 10000, rng = lcg(20261125);
  const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const boot = (cellRows, stat) => { const out = []; for (let b = 0; b < B; b++) out.push(stat(cellRows.map((rows) => rows.map(() => rows[Math.floor(rng() * rows.length)])))); return out; };
  const mean = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;
  const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  const P = (ok) => (ok ? 'pass' : 'FAIL');
  const AR = Object.keys(ARMS);
  const H = {};

  console.log('Set 1: simulated Search Console sites (eval/gsc-sites.mjs), seeds 5501-5520, watched daily from day 120 to 239, falls on day 180.');
  console.log('Days unaware: days from the fall to the alert that hears it, 60 if none does. Heard (median days) | mean days unaware | false per 1,000 days.');
  for (const cv of [0.15, 0.3]) {
    console.log(`\ncv ${cv}`);
    console.log(`| base | fall | ${AR.map((a) => `${a} heard (median)`).join(' | ')} | ${AR.map((a) => `${a} mean unaware`).join(' | ')} | ${AR.map((a) => `${a} false/1,000`).join(' | ')} |`);
    console.log(`|---|---|${AR.map(() => '---|---|---|').join('')}`);
    const cellsAt = jobs.filter((j) => j.set === 1 && j.cv === cv);
    for (const j of cellsAt) {
      const rows = res[j.id], f = (a) => (1000 * rows.reduce((t, r) => t + r[a].falseA, 0)) / rows.reduce((t, r) => t + r[a].watched, 0);
      const h = (a) => (j.fall ? `${rows.filter((r) => r[a].heard).length}/${rows.length} (${median(rows.filter((r) => r[a].heard).map((r) => r[a].unaware)) ?? '-'})` : '-');
      const mu = (a) => (j.fall ? mean(rows.map((r) => r[a].unaware)).toFixed(1) : '-');
      console.log(`| ${j.base} | ${Math.round(j.fall * 100)}% | ${AR.map(h).join(' | ')} | ${AR.map(mu).join(' | ')} | ${AR.map((a) => f(a).toFixed(2)).join(' | ')} |`);
    }
    const all = cellsAt.map((j) => res[j.id]).flat();
    const pooledFalse = (a) => (1000 * all.reduce((t, r) => t + r[a].falseA, 0)) / all.reduce((t, r) => t + r[a].watched, 0);
    const falls = cellsAt.filter((j) => j.fall).map((j) => res[j.id]), f40 = cellsAt.filter((j) => j.fall === 0.4).map((j) => res[j.id]);
    const un = (cells, a) => mean(cells.flat().map((r) => r[a].unaware));
    const diff = (a, b) => (cells) => un(cells, a) - un(cells, b);
    const ci = (a, b) => { const bs = boot(falls, diff(a, b)); return [q(bs, 0.025), q(bs, 0.975)]; };
    const [lo1, hi1] = ci(C, 'W'), [lo2, hi2] = ci(C, 'M');
    console.log(`pooled false alerts per 1,000 days: ${AR.map((a) => `${a} ${pooledFalse(a).toFixed(2)}`).join(', ')}`);
    console.log(`mean days unaware over the nine fall cells: ${AR.map((a) => `${a} ${un(falls, a).toFixed(2)}`).join(', ')}`);
    console.log(`  V - W ${diff(C, 'W')(falls).toFixed(2)} (${lo1.toFixed(2)} to ${hi1.toFixed(2)}); V - M ${diff(C, 'M')(falls).toFixed(2)} (${lo2.toFixed(2)} to ${hi2.toFixed(2)}); W - M ${diff('W', 'M')(falls).toFixed(2)}`);
    console.log(`mean days unaware on 40% falls: ${AR.map((a) => `${a} ${un(f40, a).toFixed(2)}`).join(', ')}`);
    H[`K3 cv ${cv}`] = hi2 <= 1.0;
    console.log(`  K3 (V - M upper <= 1.0) ${P(H[`K3 cv ${cv}`])}`);
  }

  console.log('\nSet 2: the eleven cells of the count hint round, seeds 7001-7060, fixed arms. Nulls: false alerts per 1,000 checks; steps: found of 200 (median delay).');
  console.log(`| cell | ${AR.join(' | ')} |`);
  console.log(`|---|${AR.map(() => '---|').join('')}`);
  const nulls = CELLS2.filter((c) => !c.step), steps = CELLS2.filter((c) => c.step);
  const per1000 = (rows, a) => (1000 * rows.reduce((t, r) => t + r[a].alerts, 0)) / rows.reduce((t, r) => t + r[a].checks, 0);
  const found = (rows, a) => rows.reduce((t, r) => t + r[a].found, 0);
  for (const c of CELLS2) {
    const rows = res[`2/${c.key}`];
    console.log(`| ${c.key} ${c.what} | ${AR.map((a) => (c.step ? `${found(rows, a)} (${median(rows.map((r) => r[a].delay)) ?? '-'})` : per1000(rows, a).toFixed(2))).join(' | ')} |`);
  }
  const nullRows = nulls.map((c) => res[`2/${c.key}`]), stepRows = steps.map((c) => res[`2/${c.key}`]);
  const pf = (cells, a) => mean(cells.map((rows) => per1000(rows, a))), ps = (cells, a) => cells.reduce((t, rows) => t + found(rows, a), 0);
  console.log(`| pooled false (nulls equal) | ${AR.map((a) => pf(nullRows, a).toFixed(2)).join(' | ')} |`);
  console.log(`| steps found of ${steps.length * res['2/S1'].length} | ${AR.map((a) => ps(stepRows, a)).join(' | ')} |`);
  for (const ref of ['W', 'M']) {
    const fb = boot(nullRows, (cells) => pf(cells, C) - pf(cells, ref)), sb = boot(stepRows, (cells) => ps(cells, C) - ps(cells, ref));
    console.log(`false V - ${ref} ${(pf(nullRows, C) - pf(nullRows, ref)).toFixed(2)} (${q(fb, 0.025).toFixed(2)} to ${q(fb, 0.975).toFixed(2)}); steps V - ${ref} ${ps(stepRows, C) - ps(stepRows, ref)} (${q(sb, 0.025)} to ${q(sb, 0.975)})`);
    if (ref === 'M') { H.K4 = q(fb, 0.975) <= 0.5 && q(sb, 0.025) >= -7; console.log(`  K4 (false upper <= 0.5, steps lower >= -7) ${P(H.K4)}`); }
  }

  console.log('\nSet 3: growing, shrinking and wandering sites (base 400, weekends 70%, cv 0.15), seeds 5701-5740, alerts per 1,000 days watched (days 120-239; no step).');
  console.log(`| cell | ${AR.map((a) => `${a} alerts/1,000`).join(' | ')} | ${AR.map((a) => `${a} series alerted`).join(' | ')} |`);
  console.log(`|---|${AR.map(() => '---|---|').join('')}`);
  for (const c of CELLS3.filter((x) => !x.fall)) {
    const rows = res[`3/${c.key}`], r = (a) => (1000 * rows.reduce((t, x) => t + x[a].alerts, 0)) / rows.reduce((t, x) => t + x[a].watched, 0);
    const any = (a) => `${rows.filter((x) => x[a].alerts > 0).length}/${rows.length}`;
    console.log(`| ${c.key} ${c.what} | ${AR.map((a) => r(a).toFixed(2)).join(' | ')} | ${AR.map(any).join(' | ')} |`);
    if (['T1', 'T2', 'T3'].includes(c.key)) { H[`K5 ${c.key}`] = r(C) <= r('M') + 1.0; console.log(`  K5 (${c.key}: V <= M + 1.0) ${P(H[`K5 ${c.key}`])}`); }
  }
  {
    const tot = (a) => ['T4', 'T5'].reduce((t, k) => t + res[`3/${k}`].reduce((u, x) => u + x[a].alerts, 0), 0);
    H.K1 = tot(C) <= 0.5 * tot('M');
    console.log(`T4 + T5 alerts: ${AR.map((a) => `${a} ${tot(a)}`).join(', ')}; K1 (V <= half of M) ${P(H.K1)}`);
  }

  for (const c of CELLS3.filter((x) => x.fall)) {
    const rows = res[`3/${c.key}`];
    console.log(`${c.key} ${c.what}: ${AR.map((a) => `${a} heard ${rows.filter((x) => x[a].heard).length}/${rows.length}, mean days unaware ${mean(rows.map((x) => x[a].unaware)).toFixed(1)}, false before the fall ${(1000 * rows.reduce((t, x) => t + x[a].falseA, 0) / rows.reduce((t, x) => t + x[a].falseWatched, 0)).toFixed(2)}/1,000 days`).join('; ')}`);
    const heard = (a) => rows.filter((x) => x[a].heard).length;
    H.K2 = heard(C) >= heard('M') - 4; console.log(`  K2 (V heard >= M - 4) ${P(H.K2)}`);
  }

  const okH = Object.values(H).every(Boolean);
  console.log(`\nAgainst Middle (K): ${Object.entries(H).map(([k, v]) => `${k} ${P(v)}`).join(', ')}`);
  console.log(okH ? 'K passes: COUNT_MIDDLE gains the wander gate with V.' : 'K fails: COUNT_MIDDLE stays; --wander gated takes V only by the pre-registered rule.');
  console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
