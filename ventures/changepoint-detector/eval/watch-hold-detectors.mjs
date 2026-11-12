// Round 5's hold-history guard (the default since round 5, README "Round 5") with the page's two other "How eager"
// settings, which round 5 did not score: Middle (--detector bocpd) and Eager (--detector pelt). The guard applies to
// every detector, so this checks that the page's labels ("about twice the false alerts", "every marked change in our
// test set") still hold with it. Reported after the round, deciding nothing. 'now' turns the guard off.
//
//   node eval/watch-hold-detectors.mjs tcpd-data --detector pelt  > eval/watch-hold-pelt.out.txt
//   node eval/watch-hold-detectors.mjs tcpd-data --detector bocpd > eval/watch-hold-bocpd.out.txt
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { detectChanges, advance, emptyState } from '../watch-core.mjs';
import { parseSeries } from '../engine.mjs';

const TOL = 5, CONFIRM = 5;
const DI = process.argv.indexOf('--detector'), DET = DI > 0 ? process.argv[DI + 1] : null;
const CANDS = { now: { holdHistory: false, persist: 1 }, hold: { holdHistory: true, persist: 1 } };

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
  const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'tcpd-data';
  if (!DET) throw new Error('Give --detector pelt or bocpd.');
  {
    // Reported, deciding nothing.
    const tcpd = loadTcpd(dir, false), held = loadTcpd(dir, true);
    const tr = await traceAll([...tcpd, ...held].map((j) => ({ values: j.values, start: j.start })));
    console.log(`Round 5's hold-history guard with --detector ${DET} (the page's ${DET === 'pelt' ? 'Eager' : 'Middle'} setting; reported, deciding nothing). ${tcpd.length} univariate TCPD series:\n`);
    printTcpd(scoreTcpd(tcpd, tr.slice(0, tcpd.length)));
    console.log(`\n${held.length} held-out univariate TCPD series:\n`);
    printTcpd(scoreTcpd(held, tr.slice(tcpd.length)));
    process.exit(0);
  }
}
