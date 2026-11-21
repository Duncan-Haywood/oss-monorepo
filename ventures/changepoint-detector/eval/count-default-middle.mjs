// Should Middle (COUNT_MIDDLE, pelt + NB cost) replace the count default (COUNT_DEFAULTS)? Rules and seeds:
// eval/count-default-middle.prereg.md. Three sets, both arms, paired by seed:
//   1  the simulated Search Console sites of eval/gsc-sites.mjs (seeds 501-540, cv 0.15 and 0.30), days unaware;
//   2  the eleven cells of eval/gsc-middle-hint.mjs (seeds 3001-3200), fixed arms;
//   3  growing, shrinking and wandering sites (seeds 701-740), alerts per 1,000 days.
//   node eval/count-default-middle.mjs > eval/count-default-middle.out.txt
// SEED_SHIFT=8500 moves every seed range (for a smoke run on seeds no bar uses).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { replayWatch, COUNT_DEFAULTS, COUNT_MIDDLE } from '../watch-core.mjs';
import { N as GN, AT as GAT, FROM as GFROM, labels as GLABELS, series as gscSeries } from './gsc-sites.mjs';

const SHIFT = Number(process.env.SEED_SHIFT ?? 0);
const LIMIT = process.env.NSEEDS ? Number(process.env.NSEEDS) : Infinity;
const range = (a, b) => Array.from({ length: Math.min(b - a + 1, LIMIT) }, (_, i) => a + SHIFT + i);
const ARMS = { D: { ...COUNT_DEFAULTS }, M: { ...COUNT_MIDDLE } };

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
    return range(501, 540).map((seed) => {
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
    return range(3001, 3200).map((seed) => {
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
  return range(701, 740).map((seed) => {
    const v = series3(c, seed), out = {};
    for (const [arm, o] of Object.entries(ARMS)) {
      const r = replayWatch(v, GLABELS, { model: 'poisson', ...o, from: GFROM, step: 1, budget: Infinity });
      out[arm] = { alerts: r.alerts.length, watched: GN - GFROM };
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

  const B = 10000, rng = lcg(20261121);
  const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const boot = (cellRows, stat) => { const out = []; for (let b = 0; b < B; b++) out.push(stat(cellRows.map((rows) => rows.map(() => rows[Math.floor(rng() * rows.length)])))); return out; };
  const mean = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;
  const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
  const verdict = {};
  const P = (ok) => (ok ? 'pass' : 'FAIL');

  console.log('Set 1: simulated Search Console sites (eval/gsc-sites.mjs), seeds 501-540, watched daily from day 120 to 239, falls on day 180.');
  console.log('Days unaware: days from the fall to the alert that hears it, 60 if none does.');
  for (const cv of [0.15, 0.3]) {
    console.log(`\ncv ${cv}`);
    console.log('| base | fall | D heard | M heard | D median days (heard) | M median days (heard) | D mean days unaware | M mean days unaware | D false/1,000 | M false/1,000 |');
    console.log('|---|---|---|---|---|---|---|---|---|---|');
    const cellsAt = jobs.filter((j) => j.set === 1 && j.cv === cv);
    for (const j of cellsAt) {
      const rows = res[j.id], f = (a) => (1000 * rows.reduce((t, r) => t + r[a].falseA, 0)) / rows.reduce((t, r) => t + r[a].watched, 0);
      const h = (a) => rows.filter((r) => r[a].heard).length, md = (a) => median(rows.filter((r) => r[a].heard).map((r) => r[a].unaware)) ?? '-';
      const mu = (a) => (j.fall ? mean(rows.map((r) => r[a].unaware)).toFixed(1) : '-');
      console.log(`| ${j.base} | ${Math.round(j.fall * 100)}% | ${j.fall ? `${h('D')}/${rows.length}` : '-'} | ${j.fall ? `${h('M')}/${rows.length}` : '-'} | ${j.fall ? md('D') : '-'} | ${j.fall ? md('M') : '-'} | ${mu('D')} | ${mu('M')} | ${f('D').toFixed(2)} | ${f('M').toFixed(2)} |`);
    }
    const all = cellsAt.map((j) => res[j.id]);
    const pooledFalse = (a) => (1000 * all.flat().reduce((t, r) => t + r[a].falseA, 0)) / all.flat().reduce((t, r) => t + r[a].watched, 0);
    const falls = cellsAt.filter((j) => j.fall).map((j) => res[j.id]), f40 = cellsAt.filter((j) => j.fall === 0.4).map((j) => res[j.id]);
    const unawareDiff = (cells) => mean(cells.flat().map((r) => r.M.unaware)) - mean(cells.flat().map((r) => r.D.unaware));
    const g1 = pooledFalse('M') <= 2.0;
    const d = unawareDiff(falls), bs = boot(falls, unawareDiff), hi = q(bs, 0.975), lo = q(bs, 0.025);
    const g2 = hi < 0;
    const u40D = mean(f40.flat().map((r) => r.D.unaware)), u40M = mean(f40.flat().map((r) => r.M.unaware)), g3 = u40M <= u40D + 1.0;
    console.log(`pooled false alerts per 1,000 days: D ${pooledFalse('D').toFixed(2)}, M ${pooledFalse('M').toFixed(2)}  G1 (M <= 2.0) ${P(g1)}`);
    console.log(`mean days unaware over the nine fall cells: D ${mean(falls.flat().map((r) => r.D.unaware)).toFixed(2)}, M ${mean(falls.flat().map((r) => r.M.unaware)).toFixed(2)}; M - D ${d.toFixed(2)} (${lo.toFixed(2)} to ${hi.toFixed(2)})  G2 (upper < 0) ${P(g2)}`);
    console.log(`mean days unaware on 40% falls: D ${u40D.toFixed(2)}, M ${u40M.toFixed(2)}  G3 (M <= D + 1.0) ${P(g3)}`);
    verdict[`G1 cv ${cv}`] = g1; verdict[`G2 cv ${cv}`] = g2; verdict[`G3 cv ${cv}`] = g3;
  }

  console.log('\nSet 2: the eleven cells of the count hint round, seeds 3001-3200, fixed arms. Nulls: false alerts per 1,000 checks; steps: found of 200 (median delay).');
  console.log('| cell | D | M |');
  console.log('|---|---|---|');
  const nulls = CELLS2.filter((c) => !c.step), steps = CELLS2.filter((c) => c.step);
  const per1000 = (rows, a) => (1000 * rows.reduce((t, r) => t + r[a].alerts, 0)) / rows.reduce((t, r) => t + r[a].checks, 0);
  const found = (rows, a) => rows.reduce((t, r) => t + r[a].found, 0);
  for (const c of CELLS2) {
    const rows = res[`2/${c.key}`];
    console.log(`| ${c.key} ${c.what} | ${['D', 'M'].map((a) => (c.step ? `${found(rows, a)} (${median(rows.map((r) => r[a].delay)) ?? '-'})` : per1000(rows, a).toFixed(2))).join(' | ')} |`);
  }
  const nullRows = nulls.map((c) => res[`2/${c.key}`]), stepRows = steps.map((c) => res[`2/${c.key}`]);
  const pf = (cells, a) => mean(cells.map((rows) => per1000(rows, a))), ps = (cells, a) => cells.reduce((t, rows) => t + found(rows, a), 0);
  const fD = pf(nullRows, 'D'), fM = pf(nullRows, 'M'), sD = ps(stepRows, 'D'), sM = ps(stepRows, 'M');
  const fb = boot(nullRows, (cells) => pf(cells, 'M') - pf(cells, 'D')), sb = boot(stepRows, (cells) => ps(cells, 'M') - ps(cells, 'D'));
  const worstNull = Math.max(...nullRows.map((rows) => per1000(rows, 'M') - per1000(rows, 'D')));
  const worstStep = Math.min(...stepRows.map((rows) => found(rows, 'M') - found(rows, 'D')));
  const g4 = q(fb, 0.975) <= 1.0 && worstNull <= 2.0, g5 = q(sb, 0.025) >= 0 && worstStep >= -4;
  console.log(`| pooled false (nulls equal) | ${fD.toFixed(2)} | ${fM.toFixed(2)} |`);
  console.log(`| steps found of ${steps.length * res['2/S1'].length} | ${sD} | ${sM} |`);
  console.log(`false M - D ${(fM - fD).toFixed(2)} (${q(fb, 0.025).toFixed(2)} to ${q(fb, 0.975).toFixed(2)}), worst null cell ${worstNull >= 0 ? '+' : ''}${worstNull.toFixed(2)}  G4 ${P(g4)}`);
  console.log(`steps M - D ${sM - sD >= 0 ? '+' : ''}${sM - sD} (${q(sb, 0.025)} to ${q(sb, 0.975)}), worst step cell ${worstStep}  G5 ${P(g5)}`);
  verdict.G4 = g4; verdict.G5 = g5;

  console.log('\nSet 3: growing, shrinking and wandering sites (base 400, weekends 70%, cv 0.15), seeds 701-740, alerts per 1,000 days watched (days 120-239; no step).');
  console.log('| cell | D alerts/1,000 | M alerts/1,000 | D series with any alert | M series with any alert |');
  console.log('|---|---|---|---|---|');
  for (const c of CELLS3) {
    const rows = res[`3/${c.key}`], r = (a) => (1000 * rows.reduce((t, x) => t + x[a].alerts, 0)) / rows.reduce((t, x) => t + x[a].watched, 0);
    const any = (a) => rows.filter((x) => x[a].alerts > 0).length;
    console.log(`| ${c.key} ${c.what} | ${r('D').toFixed(2)} | ${r('M').toFixed(2)} | ${any('D')}/${rows.length} | ${any('M')}/${rows.length} |`);
    if (c.key === 'T1') { verdict.G6 = r('M') <= r('D') + 3.0; console.log(`  G6 (T1: M <= D + 3.0) ${P(verdict.G6)}`); }
  }

  const ok = Object.values(verdict).every(Boolean);
  console.log(`\nBars: ${Object.entries(verdict).map(([k, v]) => `${k} ${P(v)}`).join(', ')}`);
  console.log(ok ? 'passes: COUNT_DEFAULTS becomes pelt + nb (Middle); the old default stays as Quiet on the ladder' : `fails (${Object.entries(verdict).filter(([, v]) => !v).map(([k]) => k).join(', ')}): the count default stays; Middle stays a named setting and a hint rung`);
  console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
