// Round 8 of the watch: the drift model as the watch for a level that wanders.
//
//   sh eval/tcpd-fetch.sh tcpd-data
//   node eval/watch-drift.mjs tcpd-data > eval/watch-drift.out.txt
//
// Why (README "The watch on the page and as an agent tool", "Next"): the level detectors read a level that wanders
// all the time (a price, a stock of inventory, a slowly growing user count) as a run of steps, so a daily watch on such
// a series alerts on the wander itself. `--model drift` (README "Jumps on a drifting level") models the wander as a
// random walk and cuts only jumps the walk does not explain, but the watch could not use it: the watch took the
// level, volatility and count models only. watch-core.mjs now has a detector 'drift' (detectDrift: driftLevel on the
// newest `window` points, noise 'ml', the same settings as `--model drift`).
//
// Pre-registered 2026-11-13, written and committed before any run of this file.
//
// Candidate: detector 'drift'. Measured against: the default detector, 'bocpd-ar1-window' (rho cap 0.8). Both under
// the shipped advance policy (WATCH_DEFAULTS: --confirm 5, --tolerance 5, holdHistory, persist 2), so only the
// detections differ.
//
// Part A, synthetic, fresh generator (seeds 81-90; no earlier round used this generator): 500 points, baseline check
// at 100, then one check per point. Noise sd 1 throughout; the level is a Gaussian random walk with step sd omega.
//   walk 0.1, walk 0.3                          no jump (every alert is false)
//   walk 0.1 + jump 3, walk 0.1 + jump 5,       one jump at point 301 (in noise sd)
//   walk 0.3 + jump 5, walk 0.3 + jump 8
//   Reported, deciding nothing (the cost of choosing 'drift' for a series that does not wander):
//   null iid, null ar1 0.8 (innovation sd 0.6), step 2sd iid.
//
// Rule: 'drift' ships as an opt-in watch setting for a wandering level ("Wandering level" on the page, `--detector
// drift` in the CLI and agent tools) only if both
//   (a) mean false alerts per 1,000 checks over the two walk nulls are at most half the default's, and
//   (b) over the four walk + jump cells, at least as many jumps found (an alert within 5 points of 301) as the
//       default, with a median delay at most 3 points longer.
// It does not replace the default in either case: no part of this run looks at non-wandering series beyond the
// reported cells. If (a) or (b) fails, the detector stays in watch-core.mjs for agents and the README says which part
// failed; the page does not offer it.
//
// Part B, deciding nothing: TCPD's 31 shipped univariate series watched from 20% of their length (as rounds 4-7),
// alerts, share at an annotated change, majority-marked changes reached, per detector, and per series where they
// differ. Prediction written before the run: the default reaches more marks overall (TCPD's marks are mostly steps
// on a flat level, where the drift model can absorb a small step as wander), and 'drift' sends fewer alerts.
//
// Prediction for Part A written before the run: on the walk nulls the default sends several alerts per 1,000 checks
// at omega 0.1 and many more at 0.3; 'drift' sends close to none; on the jump cells both find the 5- and 8-sd jumps
// and 'drift' may miss some 3-sd jumps at omega 0.1, which is where (b) could fail.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { detectChanges, advance, emptyState, WATCH_DEFAULTS } from '../watch-core.mjs';

const TOL = 5, CONFIRM = 5;
const DETS = ['bocpd-ar1-window', 'drift'];
const POLICY = { confirm: CONFIRM, tolerance: TOL, holdHistory: true, persist: 2 };

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return { u, g };
}

function trace(values, start) {
  const labels = values.map((_, i) => String(i + 1));
  const out = Object.fromEntries(DETS.map((d) => [d, []]));
  for (let n = start; n <= values.length; n++) {
    const v = values.slice(0, n), l = labels.slice(0, n);
    for (const d of DETS) out[d].push({ n, changes: detectChanges(v, l, { model: 'mean', detector: d, rhoCap: WATCH_DEFAULTS.rhoCap }).map((c) => ({ index: c.index, label: c.label })) });
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
      const worker = new Worker(new URL(import.meta.url));
      const feed = () => { if (next < jobs.length) { const id = next++; worker.postMessage({ id, values: jobs[id].values, start: jobs[id].start }); } else worker.terminate(); };
      worker.on('message', (m) => { results[m.id] = m; done++; if (jobs[m.id].tag) process.stderr.write(`${jobs[m.id].tag} done (${done}/${jobs.length})\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

export function replay(steps, labels) {
  let state = emptyState();
  const alerts = [];
  for (const { n, changes } of steps) {
    const r = advance(state, changes, n, labels.slice(0, n), POLICY);
    for (const a of r.alerts) alerts.push({ index: a.index, at: n });
    state = r.state;
  }
  return { alerts, checks: steps.length - 1 };
}

const near = (a, b) => Math.abs(a - b) <= TOL;
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const pct = (m, a) => (a ? (100 * m) / a : 0);

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

if (isMainThread) {
  const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'tcpd-data';
  const N = 500, START = 100, STEP_AT = 300, SEEDS = 10, SEED0 = 80;
  const walk = (omega, jump = 0) => (r) => { let lev = 0; return Array.from({ length: N }, (_, i) => { lev += omega * r.g(); return lev + (i >= STEP_AT ? jump : 0) + r.g(); }); };
  const ar = (rho, sdInn) => (r) => { let e = 0; return Array.from({ length: N }, () => (e = rho * e + sdInn * r.g())); };
  const SCEN = {
    'walk 0.1': walk(0.1), 'walk 0.3': walk(0.3),
    'walk 0.1 + jump 3': walk(0.1, 3), 'walk 0.1 + jump 5': walk(0.1, 5), 'walk 0.3 + jump 5': walk(0.3, 5), 'walk 0.3 + jump 8': walk(0.3, 8),
    'null iid': (r) => Array.from({ length: N }, r.g), 'null ar1 0.8': ar(0.8, 0.6),
    'step 2sd iid': (r) => Array.from({ length: N }, (_, i) => (i >= STEP_AT ? 2 : 0) + r.g()),
  };
  const RULE_NULLS = ['walk 0.1', 'walk 0.3'];
  const RULE_JUMPS = ['walk 0.1 + jump 3', 'walk 0.1 + jump 5', 'walk 0.3 + jump 5', 'walk 0.3 + jump 8'];
  const hasJump = (sn) => sn.includes('jump') || sn.startsWith('step');
  const t0 = Date.now();
  const tcpd = loadTcpd(dir);
  const jobs = [];
  for (const s of tcpd) jobs.push({ part: 'B', values: s.values, start: s.start, tag: `TCPD ${s.name}` });
  for (const [sname, gen] of Object.entries(SCEN)) for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ part: 'A', sname, values: gen(rng((seed + SEED0) * 7919 + sname.length * 31)), start: START, tag: seed === SEEDS ? `${sname} (last seed)` : null });
  const all = await traceAll(jobs);
  process.stderr.write(`traced in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);

  const A = {};
  for (const d of DETS) { A[d] = {}; for (const sn of Object.keys(SCEN)) A[d][sn] = { found: 0, total: 0, fa: 0, checks: 0, delays: [] }; }
  jobs.forEach((job, j) => {
    if (job.part !== 'A') return;
    const truth = hasJump(job.sname) ? STEP_AT : null;
    for (const d of DETS) {
      const { alerts, checks } = replay(all[j].out[d], all[j].labels);
      const cell = A[d][job.sname];
      const hit = truth === null ? null : alerts.find((a) => near(a.index, truth));
      cell.total += truth === null ? 0 : 1; if (hit) { cell.found++; cell.delays.push(hit.at - truth); }
      cell.fa += alerts.filter((a) => truth === null || !near(a.index, truth)).length; cell.checks += checks;
    }
  });
  console.log(`Round 8: the drift model as the watch for a wandering level. Rule and reasons: header of eval/watch-drift.mjs. Advance policy: --confirm ${CONFIRM}, --tolerance ${TOL}, holdHistory, persist 2 (the shipped defaults); only the detector differs.\n`);
  console.log(`Part A: ${SEEDS} seeds (${SEED0 + 1}-${SEED0 + SEEDS}) per cell, ${N} points, baseline check at ${START}, one check per point; jumps at point ${STEP_AT + 1}. Each cell: false alerts per 1,000 checks; for jump cells also jumps found and median delay.\n`);
  for (const sn of Object.keys(SCEN)) {
    const row = DETS.map((d) => { const c = A[d][sn]; return `${d}: ${((1000 * c.fa) / c.checks).toFixed(2).padStart(6)}${c.total ? `  found ${c.found}/${c.total} d${med(c.delays) ?? '-'}` : ''}`.padEnd(46); }).join('');
    console.log(`  ${sn.padEnd(20)} ${row}`);
  }
  const meanFa = (d) => RULE_NULLS.reduce((t, x) => t + (1000 * A[d][x].fa) / A[d][x].checks, 0) / RULE_NULLS.length;
  const found = (d) => RULE_JUMPS.reduce((t, x) => t + A[d][x].found, 0);
  const delay = (d) => med(RULE_JUMPS.flatMap((x) => A[d][x].delays));

  console.log(`\nPart B, deciding nothing: ${tcpd.length} univariate TCPD series (shipped), watched from 20% of their length.\n`);
  const tot = Object.fromEntries(DETS.map((d) => [d, { alerts: 0, marked: 0, reached: 0, maj: 0 }]));
  const lines = [];
  tcpd.forEach((s, i) => {
    const j = jobs.findIndex((x) => x.part === 'B' && x.values === s.values);
    const per = {};
    for (const d of DETS) {
      const { alerts } = replay(all[j].out[d], all[j].labels);
      const r = { alerts: alerts.length, marked: alerts.filter((a) => s.anyMark.some((m) => near(m, a.index))).length, reached: s.majority.filter((q) => alerts.some((a) => near(a.index, q))).length, maj: s.majority.length };
      per[d] = r; for (const k of Object.keys(r)) tot[d][k] += r[k];
    }
    const [x, y] = DETS.map((d) => per[d]);
    if (x.alerts !== y.alerts || x.reached !== y.reached) lines.push(`    ${s.name.padEnd(22)} ${DETS.map((d) => `${d} ${per[d].alerts}/${per[d].marked}/${per[d].reached} of ${per[d].maj}`).join('   ')}`);
  });
  console.log('  detector           alerts  at a mark (share)  majority-marked reached');
  for (const d of DETS) console.log(`  ${d.padEnd(18)} ${String(tot[d].alerts).padStart(6)}  ${String(tot[d].marked).padStart(9)} (${pct(tot[d].marked, tot[d].alerts).toFixed(1).padStart(4)}%)  ${String(tot[d].reached).padStart(10)}/${tot[d].maj}`);
  console.log('\n  per series where the two differ (alerts / at a mark / majority reached):');
  for (const l of lines) console.log(l);

  const D = DETS[0], P = DETS[1];
  const a = meanFa(P) <= 0.5 * meanFa(D) + 1e-9, b = found(P) >= found(D) && delay(P) <= delay(D) + 3;
  console.log(`\nRule, '${P}' against '${D}':`);
  console.log(`  (a) mean false alerts per 1,000 checks on the walk nulls ${meanFa(P).toFixed(2)} vs ${meanFa(D).toFixed(2)} (at most half): ${a ? 'pass' : 'fail'}`);
  console.log(`  (b) jumps found ${found(P)} vs ${found(D)} of ${RULE_JUMPS.length * SEEDS}, median delay ${delay(P)} vs ${delay(D)} (at most 3 longer): ${b ? 'pass' : 'fail'}`);
  console.log(a && b ? `Ships: '${P}' is offered as the watch setting for a wandering level (not the default).` : `Not offered on the page: '${P}' stays in watch-core.mjs for agents.`);
}
