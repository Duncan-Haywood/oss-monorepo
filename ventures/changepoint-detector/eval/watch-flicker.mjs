// Round 5 of the watch: two guards against flicker, the alerts a watch sends about history it had just called quiet.
//
//   node eval/watch-flicker.mjs tcpd-data > eval/watch-flicker.out.txt
//   node eval/watch-flicker.mjs tcpd-data --detector pelt  > eval/watch-flicker-pelt.out.txt   # after the round, reported only
//   node eval/watch-flicker.mjs tcpd-data --detector bocpd > eval/watch-flicker-bocpd.out.txt  # after the round, reported only
//
// Why (README "Replaying the watch on your own history"): on `ausair` (47 points) the baseline check at 20 points
// sees no change; at 21 points the engine reads changes at rows 9 and 15 and the watch alerts on both, about history
// it had just called quiet; at 22 they are gone. Two guards, both in watch-core.mjs `advance`:
//   hold     (holdHistory): after the baseline, a change dated where the baseline check could already have confirmed
//            it (index <= baselineN - confirm) is recorded as history and not alerted.
//   persist2 (persist: 2): a change is alerted only if the previous check also found a change within the tolerance.
//   both:    hold and persist2.
// against 'none' (the round-4 default: bocpd-ar1-window, rho cap 0.8, --confirm 5, --tolerance 5). The detector's
// changes at every prefix are traced once; the four candidates differ only in `advance`, so they see the same engine.
//
// Pre-registered 2026-11-12, committed before any run of this script.
// Part A, synthetic: round 4's ten cells (500 points, baseline at 100, one check per point, step at point 301) on
//   fresh seeds 41-50. Part B: the 31 univariate TCPD series (watched from 20% of their length). Both count.
// Part C, reported, deciding nothing: the 7 univariate held-out TCPD series (tcpd-data/heldout), never used by a watch
//   round, and the real series in data/ with 40 to 800 points: alerts in total and alerts dated before the baseline.
// Rule: a candidate replaces 'none' only if
//   (a) its mean false alerts per 1,000 checks over the four rule nulls (iid, AR(1) 0.5, t3, AR(1) 0.8) is at most
//       'none''s, and
//   (b) it finds at least as many synthetic steps over the five step cells, with a median delay at most 1 point longer,
//       and
//   (c) on TCPD (Part B) it sends fewer alerts, reaches at least as many majority-marked changes minus one, and the
//       share of its alerts at an annotated change is at least 'none''s.
// Among those passing, the fewest TCPD alerts, then the shorter median synthetic delay. A guard passing (c) only is
// offered as an option with its cost stated; one passing nothing is not offered.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { detectChanges, advance, emptyState } from '../watch-core.mjs';
import { parseSeries } from '../engine.mjs';

const TOL = 5, CONFIRM = 5;
const DI = process.argv.indexOf('--detector'), DET = DI > 0 ? process.argv[DI + 1] : null;
// Explicit on every candidate: since round 5 adopted 'both', the defaults are the guards, so 'none' must turn them off.
const CANDS = { none: { holdHistory: false, persist: 1 }, hold: { holdHistory: true, persist: 1 }, persist2: { holdHistory: false, persist: 2 }, both: { holdHistory: true, persist: 2 } };

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return { u, g };
}

// The default detector's changes at every prefix n = start..N.
function trace(values, start) {
  const labels = values.map((_, i) => String(i + 1));
  const steps = [];
  for (let n = start; n <= values.length; n++) steps.push({ n, changes: detectChanges(values.slice(0, n), labels.slice(0, n), DET ? { detector: DET } : {}).map((c) => ({ index: c.index, label: c.label })) });
  return { labels, steps };
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
      worker.on('message', (m) => { results[m.id] = m; done++; if (done % 25 === 0) process.stderr.write(`${done}/${jobs.length}\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

function replay(steps, labels, opts) {
  let state = emptyState();
  const alerts = [];
  for (const { n, changes } of steps) {
    const r = advance(state, changes, n, labels.slice(0, n), { confirm: CONFIRM, tolerance: TOL, ...opts });
    for (const a of r.alerts) alerts.push({ index: a.index, at: n });
    state = r.state;
  }
  return { alerts, checks: steps.length - 1, start: steps.length ? steps[0].n : 0 };
}

function loadTcpd(dir, heldout) {
  const ann = JSON.parse(readFileSync(join(dir, 'annotations.json'), 'utf8'));
  const series = [];
  for (const d of Object.keys(ann).sort()) {
    const f = join(dir, heldout ? 'heldout' : 'ds', `${d}.json`);
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

function scoreTcpd(series, traces) {
  const tot = {};
  for (const c of Object.keys(CANDS)) tot[c] = { alerts: 0, marked: 0, checks: 0, maj: 0, reached: 0, early: 0 };
  series.forEach((s, si) => {
    for (const [c, o] of Object.entries(CANDS)) {
      const { alerts, checks, start } = replay(traces[si].steps, traces[si].labels, o);
      const t = tot[c];
      t.alerts += alerts.length; t.checks += checks; t.maj += s.majority.length;
      t.marked += alerts.filter((al) => s.anyMark.some((m) => Math.abs(m - al.index) <= TOL)).length;
      t.reached += s.majority.filter((p) => alerts.some((x) => Math.abs(x.index - p) <= TOL)).length;
      t.early += alerts.filter((al) => al.index <= start - CONFIRM).length;
    }
  });
  return tot;
}

const pct = (a, b) => (b ? (100 * a) / b : 0);
function printTcpd(tot) {
  console.log('  candidate  alerts  at a mark (share)  per 1000 checks  majority-marked reached  alerts dated before the baseline');
  for (const c of Object.keys(CANDS)) {
    const t = tot[c];
    console.log(`  ${c.padEnd(9)} ${String(t.alerts).padStart(6)}  ${String(t.marked).padStart(6)} (${pct(t.marked, t.alerts).toFixed(0)}%)       ${((1000 * t.alerts) / t.checks).toFixed(1).padStart(8)}        ${String(t.reached).padStart(3)}/${t.maj}                  ${t.early}`);
  }
}

if (isMainThread) {
  const dir = process.argv[2] || 'tcpd-data';
  if (DET) {
    // Reported after round 5, deciding nothing: the guards with the page's other two settings (Middle, Eager).
    const tcpd = loadTcpd(dir, false), held = loadTcpd(dir, true);
    const tr = await traceAll([...tcpd, ...held].map((j) => ({ values: j.values, start: j.start })));
    console.log(`The round-5 guards with --detector ${DET} (reported after the round, deciding nothing). ${tcpd.length} univariate TCPD series:\n`);
    printTcpd(scoreTcpd(tcpd, tr.slice(0, tcpd.length)));
    console.log(`\n${held.length} held-out univariate TCPD series:\n`);
    printTcpd(scoreTcpd(held, tr.slice(tcpd.length)));
    process.exit(0);
  }
  const N = 500, START = 100, STEP_AT = 300, SEEDS = 10, SEED0 = 40;
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
  const NULLS = Object.keys(SCEN).filter((x) => x.startsWith('null'));
  const jobs = [];
  for (const [sname, gen] of Object.entries(SCEN)) for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ sname, values: gen(rng((seed + SEED0) * 7919 + sname.length)), start: START });
  const tcpd = loadTcpd(dir, false), held = loadTcpd(dir, true);
  const dataDir = new URL('../data/', import.meta.url), local = [];
  for (const f of readdirSync(dataDir).filter((x) => x.endsWith('.csv')).sort()) {
    let p; try { p = parseSeries(readFileSync(new URL(f, dataDir), 'utf8'), null, null); } catch { continue; }
    if (p.values.length < 40 || p.values.length > 800) continue;
    local.push({ name: f.replace('.csv', ''), values: p.values, start: Math.max(20, Math.floor(0.2 * p.values.length)) });
  }
  const t0 = Date.now();
  const all = await traceAll([...jobs, ...tcpd, ...held, ...local].map((j) => ({ values: j.values, start: j.start })));
  process.stderr.write(`traced in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  const A = {};
  for (const c of Object.keys(CANDS)) { A[c] = {}; for (const sn of Object.keys(SCEN)) A[c][sn] = { found: 0, total: 0, fa: 0, checks: 0, delays: [] }; }
  jobs.forEach((job, j) => {
    const truth = job.sname.startsWith('step') ? STEP_AT : null;
    for (const [c, o] of Object.entries(CANDS)) {
      const { alerts, checks } = replay(all[j].steps, all[j].labels, o);
      const cell = A[c][job.sname];
      const hit = truth === null ? null : alerts.find((a) => Math.abs(a.index - truth) <= TOL);
      cell.total += truth === null ? 0 : 1; if (hit) { cell.found++; cell.delays.push(hit.at - truth); }
      cell.fa += alerts.filter((a) => truth === null || Math.abs(a.index - truth) > TOL).length; cell.checks += checks;
    }
  });
  console.log(`Round 5: flicker guards for the watch. Rule and reasons: header of eval/watch-flicker.mjs. Detector: the round-4 default (bocpd-ar1-window, rho cap 0.8, --confirm ${CONFIRM}, --tolerance ${TOL}).`);
  console.log(`\nPart A: ${SEEDS} fresh seeds (41-50) per cell, ${N} points, baseline check at ${START}, then one check per point; a step at point ${STEP_AT + 1}. False alerts per 1,000 checks, then steps found (median delay in points).\n`);
  console.log(`  candidate ${NULLS.map((x) => x.padEnd(14)).join('')}${STEPS.map((x) => x.padEnd(18)).join('')}`);
  for (const c of Object.keys(CANDS)) console.log(`  ${c.padEnd(9)} ${NULLS.map((x) => ((1000 * A[c][x].fa) / A[c][x].checks).toFixed(2).padEnd(14)).join('')}${STEPS.map((x) => `${A[c][x].found}/${A[c][x].total} (${med(A[c][x].delays) ?? '-'})`.padEnd(18)).join('')}`);
  const meanFa = (c) => RULE_NULLS.reduce((t, x) => t + (1000 * A[c][x].fa) / A[c][x].checks, 0) / RULE_NULLS.length;
  const steps = (c) => STEPS.reduce((t, x) => t + A[c][x].found, 0);
  const delay = (c) => med(STEPS.flatMap((x) => A[c][x].delays));
  console.log(`\nPart B: ${tcpd.length} univariate TCPD series, watched from 20% of their length, one check per point.\n`);
  const totB = scoreTcpd(tcpd, all.slice(jobs.length, jobs.length + tcpd.length));
  printTcpd(totB);
  console.log(`\nPart C (reported, deciding nothing): ${held.length} held-out univariate TCPD series (${held.map((s) => s.name).join(', ')}).\n`);
  printTcpd(scoreTcpd(held, all.slice(jobs.length + tcpd.length, jobs.length + tcpd.length + held.length)));
  console.log(`\nPart C, the ${local.length} real series in data/ with 40 to 800 points (no labels): alerts, and alerts about a change dated where the baseline check could already have confirmed it.\n`);
  const lt = all.slice(jobs.length + tcpd.length + held.length);
  const perLocal = Object.keys(CANDS).map((c) => {
    let alerts = 0, early = 0;
    local.forEach((s, i) => { const r = replay(lt[i].steps, lt[i].labels, CANDS[c]); alerts += r.alerts.length; early += r.alerts.filter((a) => a.index <= r.start - CONFIRM).length; });
    return { c, alerts, early };
  });
  for (const r of perLocal) console.log(`  ${r.c.padEnd(9)} ${String(r.alerts).padStart(5)} alerts, ${r.early} dated before the baseline`);
  const D = 'none', sh = (c) => pct(totB[c].marked, totB[c].alerts);
  console.log(`\nRule, against ${D} (mean null false alerts ${meanFa(D).toFixed(2)} per 1,000; ${steps(D)} steps, median delay ${delay(D)}; TCPD ${totB[D].alerts} alerts, ${totB[D].reached} of ${totB[D].maj} marks, ${sh(D).toFixed(1)}% at a mark):`);
  const res = Object.keys(CANDS).filter((c) => c !== D).map((c) => ({
    c,
    a: meanFa(c) <= meanFa(D) + 1e-9,
    b: steps(c) >= steps(D) && delay(c) <= delay(D) + 1,
    cc: totB[c].alerts < totB[D].alerts && totB[c].reached >= totB[D].reached - 1 && sh(c) >= sh(D) - 1e-9,
  }));
  for (const r of res) console.log(`  ${r.c}: (a) ${meanFa(r.c).toFixed(2)}: ${r.a ? 'pass' : 'fail'}; (b) ${steps(r.c)} steps, delay ${delay(r.c)}: ${r.b ? 'pass' : 'fail'}; (c) TCPD ${totB[r.c].alerts} alerts, ${totB[r.c].reached} marks, ${sh(r.c).toFixed(1)}% at a mark: ${r.cc ? 'pass' : 'fail'}.`);
  const win = res.filter((r) => r.a && r.b && r.cc).sort((x, y) => totB[x.c].alerts - totB[y.c].alerts || delay(x.c) - delay(y.c))[0];
  const opt = res.filter((r) => r.cc && !(r.a && r.b)).map((r) => r.c);
  console.log(win ? `Adopted: ${win.c} becomes the default.` : `Not adopted: ${D} stays the default.${opt.length ? ` Offered as an option: ${opt.join(', ')}.` : ''}`);
}
