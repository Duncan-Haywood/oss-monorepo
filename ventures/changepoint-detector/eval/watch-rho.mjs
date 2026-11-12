// Why the AR(1) watch (bocpd-ar1-window, the default since round 3) reaches fewer marked TCPD changes than the plain
// Bayesian pass (29 of 52 against 38), and whether a different rho fixes it.
//
//   node eval/watch-rho.mjs tcpd-data --why      > eval/watch-rho-why.out.txt      # diagnostic, decides nothing
//   node eval/watch-rho.mjs tcpd-data --round4   > eval/watch-replay-round4.out.txt
//
// --why: replays the 31 univariate TCPD series as eval/watch-replay.mjs part B does (watched from 20% of their
// length, one check per new point, --confirm 5) for 'bocpd-window' and 'bocpd-ar1-window', and prints per series
// the rho the AR(1) pass used at the baseline, at the end, and at the check where each lost marked change would
// have been confirmed, with the 31 series' level of smoothness (median |first difference| over robust sd).
//
// Round 4 (pre-registered 2026-11-12, after --why and before any --round4 run). What --why found
// (eval/watch-rho-why.out.txt): of the 17 majority-marked changes the plain windowed pass reaches and the AR(1) pass
// does not, 15 were confirmed at a check where the estimated rho sat at the engine's 0.95 clip (median 0.95); the 29
// the AR(1) pass reaches had median rho 0.48. 20 of the 30 watchable series are at the clip at the baseline already,
// all of them smooth or wandering (oil price, CO2, inventories, fertility): at rho 0.95 the conditional AR(1)
// likelihood reads any move as persistence. A rho frozen at the baseline cannot help there (it is 0.95 too), so it is
// dropped. Candidates, each with the probability summed over 5 neighbours and --confirm 5, against the default
// 'ar1-window' (rho as estimated): 'ar1-cap0.8-window' (rho capped at 0.8) and 'ar1-cap0.5-window' (capped at 0.5).
// Part A, synthetic: round 3's nine cells on fresh seeds 31-40, plus 'null ar1 0.95' (the clip itself), which is
// reported and decides nothing: it is the cost a cap must pay on noise that really is that sticky.
// Part B: the 31 TCPD series. Unlike rounds 1-3, TCPD counts here, because the defect only shows on real series.
// Rule: a candidate becomes the default only if
//   (a) its mean false alerts per 1,000 checks over the four round-3 nulls (iid, AR(1) 0.5, t3, AR(1) 0.8) is at most
//       1.0 above the default's, and
//   (b) it finds at least as many steps as the default over the five step cells, and
//   (c) on TCPD it reaches more majority-marked changes than the default, with the share of its alerts at a marked
//       change at most 5 points below the default's.
// If both pass, the one reaching more TCPD marks (then fewer TCPD alerts). A candidate passing (c) but not (a) or (b)
// is offered as an option (--rho-cap), with the cost stated; none passing (c) means the cap is not offered.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { detectBoth, advance, emptyState } from '../watch.mjs';
import { ar1Rho } from '../engine.mjs';

const TOL = 5, CONFIRM = 5;
const WHY = process.argv.includes('--why');
const ROUND4 = process.argv.includes('--round4');

// Candidates: name -> how the rho handed to the engine's AR(1) pass is chosen at each check, from the window's own
// estimate r and the estimate b frozen at the baseline check (the first check, before any alert can be made).
export const RHO_RULES = {
  'bocpd-window': () => 0,                        // no AR(1) term (round 2's option); --why only
  'ar1-window': (r) => r,                         // the default since round 3
  'ar1-cap0.8-window': (r) => Math.min(r, 0.8),
  'ar1-cap0.5-window': (r) => Math.min(r, 0.5),
};
const CANDS = WHY ? ['bocpd-window', 'ar1-window'] : ['ar1-window', 'ar1-cap0.8-window', 'ar1-cap0.5-window'];

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return { u, g };
}

// The changes each candidate finds at every prefix n = start..N (window 1,000, as watch.mjs), with the rho it used.
function trace(values, start) {
  const labels = values.map((_, i) => String(i + 1));
  const out = {};
  for (const c of CANDS) out[c] = [];
  let base = null;
  for (let n = start; n <= values.length; n++) {
    const off = Math.max(0, n - 1000);
    const r = ar1Rho(values.slice(off, n));
    if (base === null) base = r;
    const cache = new Map();
    for (const c of CANDS) {
      const rho = RHO_RULES[c](r, base);
      const key = rho.toFixed(6);
      if (!cache.has(key)) {
        const d = rho > 0
          ? detectBoth(values.slice(0, n), labels.slice(0, n), { model: 'mean', detector: 'bocpd-ar1-window', ar1Rho: rho, rhoCap: null })['bocpd-ar1-window']
          : detectBoth(values.slice(0, n), labels.slice(0, n), { model: 'mean', detector: 'bocpd' })['bocpd-window'];
        cache.set(key, d);
      }
      out[c].push({ n, rho, changes: cache.get(key) });
    }
  }
  return { labels, out };
}

if (!isMainThread) parentPort.on('message', ({ id, values, start }) => parentPort.postMessage({ id, ...trace(values, start) }));

async function traceAll(jobs) {
  const results = new Array(jobs.length);
  const k = Math.max(1, Math.min(jobs.length, availableParallelism()));
  let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    for (let w = 0; w < k; w++) {
      const worker = new Worker(new URL(import.meta.url), { argv: process.argv.slice(2) });
      const feed = () => { if (next < jobs.length) { const id = next++; worker.postMessage({ id, values: jobs[id].values, start: jobs[id].start }); } else worker.terminate(); };
      worker.on('message', (m) => { results[m.id] = m; done++; if (jobs[m.id].tag) process.stderr.write(`${jobs[m.id].tag} done\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

function replay(steps, labels) {
  let state = emptyState();
  const alerts = [];
  for (const { n, changes } of steps) {
    const r = advance(state, changes, n, labels.slice(0, n), { confirm: CONFIRM, tolerance: TOL });
    for (const a of r.alerts) alerts.push({ index: a.index, at: n });
    state = r.state;
  }
  return { alerts, checks: steps.length - 1 };
}

function loadTcpd(dir) {
  const ann = JSON.parse(readFileSync(join(dir, 'annotations.json'), 'utf8'));
  const series = [];
  for (const d of Object.keys(ann).sort()) {
    const f = join(dir, 'ds', `${d}.json`);
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    if (j.n_dim !== 1) continue;
    let last = null;
    const values = j.series[0].raw.map((v) => { if (v == null || !Number.isFinite(Number(v))) return last; last = Number(v); return last; });
    const n = values.length, start = Math.max(20, Math.floor(0.2 * n));
    const a = Object.values(ann[d]), K = a.length, anyMark = [...new Set(a.flat())], majority = [];
    for (const l of [...anyMark].sort((x, y) => x - y)) {
      if (l < start) continue;
      if (a.filter((locs) => locs.some((m) => Math.abs(m - l) <= TOL)).length * 2 <= K) continue;
      if (majority.some((p) => Math.abs(p - l) <= TOL)) continue;
      majority.push(l);
    }
    series.push({ name: d, values, start, anyMark, majority });
  }
  return series;
}

const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
// Smoothness: median |first difference| over the series' robust spread (MAD of the values). White noise gives about 1.35;
// a smooth yearly curve (population, GDP) much less, because each step is small next to the range the level covers.
function smooth(v) {
  const d = v.slice(1).map((x, i) => Math.abs(x - v[i])), m = med(v), mad = med(v.map((x) => Math.abs(x - m))) / 0.6745;
  return mad > 0 ? med(d) / mad : null;
}

function scoreTcpd(series, traces) {
  const tot = {};
  for (const c of CANDS) tot[c] = { alerts: 0, marked: 0, checks: 0, maj: 0, reached: 0, per: [] };
  series.forEach((s, si) => {
    const { labels, out } = traces[si];
    for (const c of CANDS) {
      const { alerts, checks } = replay(out[c], labels);
      const t = tot[c];
      const marked = alerts.filter((al) => s.anyMark.some((m) => Math.abs(m - al.index) <= TOL)).length;
      const reached = s.majority.filter((p) => alerts.some((x) => Math.abs(x.index - p) <= TOL));
      t.alerts += alerts.length; t.marked += marked; t.checks += checks; t.maj += s.majority.length; t.reached += reached.length;
      t.per.push({ name: s.name, alerts: alerts.length, marked, reached });
    }
  });
  return tot;
}

function printTcpd(tot) {
  console.log('  candidate              alerts  marked (share)  per 1000 checks  majority-marked changes reached');
  for (const c of CANDS) {
    const t = tot[c];
    console.log(`  ${c.padEnd(22)} ${String(t.alerts).padStart(6)}  ${String(t.marked).padStart(6)} (${t.alerts ? Math.round((100 * t.marked) / t.alerts) : 0}%)   ${((1000 * t.alerts) / t.checks).toFixed(1).padStart(8)}         ${t.reached}/${t.maj}`);
  }
}

// ---------------------------------------------------------------- --why
if (isMainThread && WHY) {
  const dir = process.argv[2];
  const series = loadTcpd(dir);
  const cache = join(dir, 'watch-rho-why-traces.json');
  const traces = existsSync(cache) ? JSON.parse(readFileSync(cache, 'utf8')) : await traceAll(series.map((s) => ({ values: s.values, start: s.start, tag: `TCPD ${s.name}` })));
  writeFileSync(cache, JSON.stringify(traces));
  console.log(`Why the AR(1) watch loses marked TCPD changes. ${series.length} univariate TCPD series, each watched from 20% of its length, one check per new point, --confirm ${CONFIRM}; a majority-marked change is reached when an alert lies within ${TOL} points of it. Both candidates sum the Bayesian probability over 5 neighbouring points; 'ar1-window' (the default) adds the AR(1) term with rho estimated from the window at each check. Smoothness: median |first difference| over the robust sd of the values (white noise about 1.35).\n`);
  const tot = scoreTcpd(series, traces);
  printTcpd(tot);
  console.log('\n  series               n     smooth  rho base  rho end  majority  reached plain / ar1  lost by ar1 (rho at confirm)            alerts plain / ar1');
  const lostRho = [], keptRho = [];
  series.forEach((s, si) => {
    const pl = tot['bocpd-window'].per[si], ar = tot['ar1-window'].per[si];
    const steps = traces[si].out['ar1-window'];
    if (!steps.length) { console.log(`  ${s.name.padEnd(20)} ${String(s.values.length).padStart(4)}  too short to watch`); return; }
    const rhoAt = (n) => steps.find((x) => x.n === n)?.rho ?? steps[steps.length - 1].rho;
    const lost = pl.reached.filter((p) => !ar.reached.includes(p));
    for (const p of lost) lostRho.push(rhoAt(p + CONFIRM + 1));
    for (const p of ar.reached) keptRho.push(rhoAt(p + CONFIRM + 1));
    const sm = smooth(s.values);
    console.log(`  ${s.name.padEnd(20)} ${String(s.values.length).padStart(4)}  ${(sm ?? NaN).toFixed(2).padStart(6)}  ${steps[0].rho.toFixed(2).padStart(8)}  ${steps[steps.length - 1].rho.toFixed(2).padStart(7)}  ${String(s.majority.length).padStart(8)}  ${String(pl.reached.length).padStart(7)} / ${ar.reached.length}${' '.repeat(10)}${(lost.map((p) => `${p} (${rhoAt(p + CONFIRM + 1).toFixed(2)})`).join(', ') || '-').padEnd(40)} ${pl.alerts} / ${ar.alerts}`);
  });
  const q = (a) => a.length ? `median ${med(a).toFixed(2)}, range ${Math.min(...a).toFixed(2)}-${Math.max(...a).toFixed(2)}` : '-';
  console.log(`\nrho at the confirming check: the ${lostRho.length} changes the plain pass reaches and ar1 does not: ${q(lostRho)}; the ${keptRho.length} ar1 reaches: ${q(keptRho)}.`);
}

// ---------------------------------------------------------------- --round4
if (isMainThread && ROUND4) {
  const N = 500, START = 100, STEP_AT = 300, SEEDS = 10, SEED0 = 30;
  const ar = (rho, sdInn, step = 0) => (r) => { let e = 0; return Array.from({ length: N }, (_, i) => (i >= STEP_AT ? step : 0) + (e = rho * e + sdInn * r.g())); };
  const SCEN = {
    'null iid': (r) => Array.from({ length: N }, r.g),
    'null ar1 0.5': ar(0.5, Math.sqrt(0.75)),
    'null t3': (r) => Array.from({ length: N }, () => { const z = r.g(); const c = r.g() ** 2 + r.g() ** 2 + r.g() ** 2; return z / Math.sqrt(c / 3) / Math.sqrt(3); }),
    'null ar1 0.8': ar(0.8, 0.6),
    'null ar1 0.95': ar(0.95, Math.sqrt(1 - 0.95 ** 2)),
    'step 1sd iid': (r) => Array.from({ length: N }, (_, i) => (i >= STEP_AT ? 1 : 0) + r.g()),
    'step 2sd iid': (r) => Array.from({ length: N }, (_, i) => (i >= STEP_AT ? 2 : 0) + r.g()),
    'step 3sd iid': (r) => Array.from({ length: N }, (_, i) => (i >= STEP_AT ? 3 : 0) + r.g()),
    'step 2sd ar1 0.5': ar(0.5, Math.sqrt(0.75), 2),
    'step 4sd ar1 0.8': ar(0.8, 0.6, 4),
  };
  const RULE_NULLS = ['null iid', 'null ar1 0.5', 'null t3', 'null ar1 0.8'];
  const STEPS = Object.keys(SCEN).filter((x) => x.startsWith('step'));
  const t0 = Date.now();
  const jobs = [];
  for (const [sname, gen] of Object.entries(SCEN)) for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ sname, values: gen(rng((seed + SEED0) * 7919 + sname.length)), start: START, tag: seed === SEEDS ? `${sname} (last seed)` : null });
  const dir = process.argv[2];
  const series = loadTcpd(dir);
  const all = await traceAll([...jobs, ...series.map((s) => ({ values: s.values, start: s.start, tag: `TCPD ${s.name}` }))]);
  process.stderr.write(`traced in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  const A = {};
  for (const c of CANDS) { A[c] = {}; for (const sn of Object.keys(SCEN)) A[c][sn] = { found: 0, total: 0, fa: 0, checks: 0, delays: [] }; }
  jobs.forEach((job, j) => {
    const truth = job.sname.startsWith('step') ? STEP_AT : null;
    for (const c of CANDS) {
      const { alerts, checks } = replay(all[j].out[c], all[j].labels);
      const cell = A[c][job.sname];
      const hit = truth === null ? null : alerts.find((a) => Math.abs(a.index - truth) <= TOL);
      cell.total += truth === null ? 0 : 1; if (hit) { cell.found++; cell.delays.push(hit.at - truth); }
      cell.fa += alerts.filter((a) => truth === null || Math.abs(a.index - truth) > TOL).length; cell.checks += checks;
    }
  });
  console.log(`Round 4: a cap on the AR(1) watch's rho. Rule and reasons: header of eval/watch-rho.mjs. Part A: ${SEEDS} fresh seeds (31-40) per cell, ${N} points, baseline check at ${START}, then one check per point; a step at point ${STEP_AT + 1}, reported when an alert lies within ${TOL} points. False alerts per 1,000 checks, then steps found.\n`);
  const nulls = Object.keys(SCEN).filter((x) => x.startsWith('null'));
  console.log(`  candidate             ${nulls.map((x) => x.padEnd(14)).join('')}${STEPS.map((x) => x.padEnd(18)).join('')}`);
  for (const c of CANDS) console.log(`  ${c.padEnd(21)} ${nulls.map((x) => ((1000 * A[c][x].fa) / A[c][x].checks).toFixed(2).padEnd(14)).join('')}${STEPS.map((x) => `${A[c][x].found}/${A[c][x].total}`.padEnd(18)).join('')}`);
  const meanFa = (c) => RULE_NULLS.reduce((t, x) => t + (1000 * A[c][x].fa) / A[c][x].checks, 0) / RULE_NULLS.length;
  const steps = (c) => STEPS.reduce((t, x) => t + A[c][x].found, 0);
  console.log(`\nPart B: ${series.length} univariate TCPD series, watched from 20% of their length.\n`);
  const tot = scoreTcpd(series, all.slice(jobs.length));
  printTcpd(tot);
  const share = (c) => (tot[c].alerts ? (100 * tot[c].marked) / tot[c].alerts : 0);
  const D = 'ar1-window';
  console.log(`\nRule, against ${D} (mean null false alerts ${meanFa(D).toFixed(2)} per 1,000; ${steps(D)} steps; TCPD ${tot[D].reached} of ${tot[D].maj} marks, ${share(D).toFixed(1)}% of alerts at a mark):`);
  const res = CANDS.filter((c) => c !== D).map((c) => ({ c, a: meanFa(c) <= meanFa(D) + 1.0, b: steps(c) >= steps(D), cc: tot[c].reached > tot[D].reached && share(c) >= share(D) - 5 }));
  for (const r of res) console.log(`  ${r.c}: (a) mean null false alerts ${meanFa(r.c).toFixed(2)}: ${r.a ? 'pass' : 'fail'}; (b) steps ${steps(r.c)}: ${r.b ? 'pass' : 'fail'}; (c) TCPD ${tot[r.c].reached} marks, ${share(r.c).toFixed(1)}% at a mark: ${r.cc ? 'pass' : 'fail'}.`);
  const win = res.filter((r) => r.a && r.b && r.cc).sort((x, y) => tot[y.c].reached - tot[x.c].reached || tot[x.c].alerts - tot[y.c].alerts)[0];
  const opt = res.filter((r) => r.cc && !(r.a && r.b)).map((r) => r.c);
  console.log(win ? `Adopted: ${win.c} becomes the default.` : `Not adopted: ${D} stays the default.${opt.length ? ` Offered as an option (--rho-cap): ${opt.join(', ')}.` : ' No cap is offered.'}`);
}
