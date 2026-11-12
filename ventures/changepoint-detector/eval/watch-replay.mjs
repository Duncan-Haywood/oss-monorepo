// Replay series one point at a time through watch.mjs, as a daily cron job would see them, and
// measure what a person watching would get: false alerts per 1,000 checks, how many real changes
// are reported, and how many points after the change the report comes.
//
// Pre-registered (written before the first run, 2026-11-12):
//   Part A, synthetic streams, picks the defaults. Candidates: detector pelt-mean, pelt-meanvar,
//   bocpd (the engine's Bayesian detections, mean model), each with --confirm 3, 5 or 10.
//   Rule: among candidates that report at least 90% of the 2-sd steps in independent noise,
//   take the one with the fewest false alerts per 1,000 checks averaged over the three null
//   streams; a tie (within 0.5 per 1,000) goes to the shorter median delay.
//   Part B, the TCPD series (van den Burg and Williams 2020), is scored once with the chosen
//   defaults and the others for context, and changes nothing.
//
// Round 2 (pre-registered 2026-11-12, after round 1 chose bocpd --confirm 5 and before this round ran):
//   a unit test found a clear 3-sd step that bocpd never reports, because its probability was split
//   between neighbouring points (peak 0.36). Candidate 'bocpd-window' sums the probability over 5
//   neighbouring points. On fresh seeds (11-20), both with --confirm 5, adopt bocpd-window as the default
//   only if (a) it finds at least as many steps as bocpd in every step cell and strictly more over the
//   four combined, and (b) its mean false alerts per 1,000 checks over the three nulls is at most 1.0
//   above bocpd's. TCPD is scored for both and decides nothing.
//   node eval/watch-replay.mjs tcpd-data --round2 > eval/watch-replay-round2.out.txt
//
// Round 3 (pre-registered 2026-11-12, after round 2 and before this round ran): sticky noise is where
//   round 2's windowed probability lost (AR(1) 0.5 nulls: 7.0 to 15.0 false alerts per 1,000), and the engine's
//   Bayesian pass already has an AR(1) term (rho estimated from the window, the conditional AR(1) likelihood).
//   Candidates, each with --confirm 5: 'bocpd-ar1' (that pass) and 'bocpd-ar1-window' (that pass, probability
//   summed over 5 neighbouring points), against the default 'bocpd'. Fresh seeds 21-30. Two cells are added to
//   the round-1 seven: 'null ar1 0.8' and 'step 4sd ar1 0.8' (step 4 marginal sd, i.e. 2.4 innovation sd).
//   Rule: a candidate replaces bocpd as the default only if (a) its mean false alerts per 1,000 checks over the
//   four nulls is at or below bocpd's, and (b) it finds at least as many steps as bocpd summed over the five
//   step cells. If both candidates pass, the one finding more steps (then fewer false alerts). A candidate that
//   passes (a) with fewer false alerts on both AR(1) nulls but fails (b) is offered as an option for sticky series,
//   with the lost power stated. TCPD is scored for all three and decides nothing.
//   node eval/watch-replay.mjs tcpd-data --round3 > eval/watch-replay-round3.out.txt
//
// usage: node eval/watch-replay.mjs [tcpd-data] > eval/watch-replay.out.txt
//        (sh eval/tcpd-fetch.sh tcpd-data first for part B; without it part B is skipped)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { detectBoth, advance, emptyState } from '../watch.mjs';

const TOL = 5;
const ROUND3 = process.argv.includes('--round3');
const ROUND2 = ROUND3 || process.argv.includes('--round2');
const DETECTORS = ROUND3 ? {
  bocpd: { detector: 'bocpd', model: 'mean' },
  'bocpd-ar1': { detector: 'bocpd-ar1', model: 'mean' },
  'bocpd-ar1-win': { detector: 'bocpd-ar1-window', model: 'mean' },
} : ROUND2 ? {
  bocpd: { detector: 'bocpd', model: 'mean' },
  'bocpd-window': { detector: 'bocpd-window', model: 'mean' },
} : {
  'pelt-mean': { detector: 'pelt', model: 'mean' },
  'pelt-meanvar': { detector: 'pelt', model: 'meanvar' },
  bocpd: { detector: 'bocpd', model: 'mean' },
};
const CONFIRMS = ROUND2 ? [5] : [3, 5, 10];
const SEED0 = ROUND3 ? 20 : ROUND2 ? 10 : 0;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const log = (s) => process.stderr.write(s + '\n');

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return { u, g };
}

// Changes found at every prefix length n = start..N, per detector (one engine call per model per prefix).
function trace(values, start) {
  const labels = values.map((_, i) => String(i + 1));
  const out = {};
  for (const name of Object.keys(DETECTORS)) out[name] = [];
  for (let n = start; n <= values.length; n++) {
    const v = values.slice(0, n), l = labels.slice(0, n);
    const runs = { mean: detectBoth(v, l, { model: 'mean', ar1Detectors: ROUND3, rhoCap: null }), meanvar: ROUND2 ? null : detectBoth(v, l, { model: 'meanvar' }) };
    for (const [name, d] of Object.entries(DETECTORS)) out[name].push({ n, changes: runs[d.model][d.detector] });
  }
  return { labels, out };
}

// The engine runs are the slow part (about 0.15 s per prefix pair at 500 points): they go to a pool of workers.
if (!isMainThread) {
  parentPort.on('message', ({ id, values, start }) => parentPort.postMessage({ id, ...trace(values, start) }));
}
async function traceAll(jobs) {
  const results = new Array(jobs.length);
  const k = Math.max(1, Math.min(jobs.length, availableParallelism()));
  let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    for (let w = 0; w < k; w++) {
      const worker = new Worker(new URL(import.meta.url), { argv: process.argv.slice(2) });
      const feed = () => { if (next < jobs.length) { const id = next++; worker.postMessage({ id, values: jobs[id].values, start: jobs[id].start }); } else worker.terminate(); };
      worker.on('message', (m) => { results[m.id] = m; done++; if (jobs[m.id].tag) log(`${jobs[m.id].tag} done`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

// Run the state machine over a trace with one confirm value. Returns the alerts with the n at which each was reported.
function replay(steps, labels, confirm) {
  let state = emptyState();
  const alerts = [];
  for (const { n, changes } of steps) {
    const r = advance(state, changes, n, labels.slice(0, n), { confirm, tolerance: TOL, holdHistory: false, persist: 1 }); // the watch before round 5's guards
    for (const a of r.alerts) alerts.push({ index: a.index, at: n });
    state = r.state;
  }
  return { alerts, checks: steps.length - 1 }; // the first check is the baseline
}

function score(alerts, truth, checks) {
  const hit = truth.map((t) => alerts.find((a) => Math.abs(a.index - t) <= TOL));
  const fa = alerts.filter((a) => !truth.some((t) => Math.abs(a.index - t) <= TOL)).length;
  return { detected: hit.filter(Boolean).length, delays: hit.filter(Boolean).map((a, i) => a.at - truth[i]), fa, checks };
}

// ---------------------------------------------------------------- part A
const N = 500, START = 100, STEP_AT = 300, SEEDS = 10;
const SCEN = {
  'null iid': (r) => Array.from({ length: N }, r.g),
  'null ar1 0.5': (r) => { let e = 0; return Array.from({ length: N }, () => (e = 0.5 * e + Math.sqrt(0.75) * r.g())); },
  'null t3': (r) => Array.from({ length: N }, () => { const z = r.g(); const c = r.g() ** 2 + r.g() ** 2 + r.g() ** 2; return z / Math.sqrt(c / 3) / Math.sqrt(3); }),
  'step 1sd iid': (r) => Array.from({ length: N }, (_, i) => (i >= STEP_AT ? 1 : 0) + r.g()),
  'step 2sd iid': (r) => Array.from({ length: N }, (_, i) => (i >= STEP_AT ? 2 : 0) + r.g()),
  'step 3sd iid': (r) => Array.from({ length: N }, (_, i) => (i >= STEP_AT ? 3 : 0) + r.g()),
  'step 2sd ar1 0.5': (r) => { let e = 0; return Array.from({ length: N }, (_, i) => (i >= STEP_AT ? 2 : 0) + (e = 0.5 * e + Math.sqrt(0.75) * r.g())); },
};
if (ROUND3) {
  // marginal sd 1: innovation sd sqrt(1 - 0.64) = 0.6, so a 4-sd step is 6.7 innovation sd and (1 - rho) of it, 2.4 per step of the differences
  SCEN['null ar1 0.8'] = (r) => { let e = 0; return Array.from({ length: N }, () => (e = 0.8 * e + 0.6 * r.g())); };
  SCEN['step 4sd ar1 0.8'] = (r) => { let e = 0; return Array.from({ length: N }, (_, i) => (i >= STEP_AT ? 4 : 0) + (e = 0.8 * e + 0.6 * r.g())); };
}
const A = {}; // A[det][confirm][scen] = { detected, total, delays, fa, checks }
for (const det of Object.keys(DETECTORS)) { A[det] = {}; for (const k of CONFIRMS) { A[det][k] = {}; for (const s of Object.keys(SCEN)) A[det][k][s] = { detected: 0, total: 0, delays: [], fa: 0, checks: 0 }; } }
const t0 = Date.now();
if (isMainThread) {
const jobsA = [];
for (const [sname, gen] of Object.entries(SCEN)) for (let seed = 1; seed <= SEEDS; seed++) jobsA.push({ sname, values: gen(rng((seed + SEED0) * 7919 + sname.length)), start: START, tag: seed === SEEDS ? `${sname} (last seed)` : null });
const tracesA = await traceAll(jobsA);
log(`part A traced in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
jobsA.forEach((job, j) => {
  const truth = job.sname.startsWith('step') ? [STEP_AT] : [];
  const { labels, out } = tracesA[j];
  for (const det of Object.keys(DETECTORS)) for (const k of CONFIRMS) {
    const { alerts, checks } = replay(out[det], labels, k);
    const sc = score(alerts, truth, checks), cell = A[det][k][job.sname];
    cell.detected += sc.detected; cell.total += truth.length; cell.delays.push(...sc.delays); cell.fa += sc.fa; cell.checks += sc.checks;
  }
});

console.log(`Part A: synthetic streams, ${SEEDS} seeds each, ${N} points, first check (the baseline) at ${START}, then one check per new point (${N - START} checks per stream). A step, where there is one, is at point ${STEP_AT + 1}; an alert dated within ${TOL} points of it counts as reporting it. False alerts are all other alerts, per 1,000 checks. Delay = points from the change to the check that reported it.`);
const nulls = Object.keys(SCEN).filter((s) => s.startsWith('null'));
const steps = Object.keys(SCEN).filter((s) => s.startsWith('step'));
console.log(`\n  detector      confirm  ${nulls.map((s) => `FA/1000 ${s}`.padEnd(22)).join('')}${steps.map((s) => `${s} found (median delay)`.padEnd(34)).join('')}`);
const cand = [];
for (const det of Object.keys(DETECTORS)) for (const k of CONFIRMS) {
  const row = A[det][k];
  const fa = nulls.map((s) => (1000 * row[s].fa) / row[s].checks);
  const found = steps.map((s) => `${row[s].detected}/${row[s].total} (${median(row[s].delays) ?? '-'})`);
  console.log(`  ${det.padEnd(13)} ${String(k).padStart(7)}  ${fa.map((v) => v.toFixed(2).padEnd(22)).join('')}${found.map((f) => f.padEnd(34)).join('')}`);
  cand.push({ det, k, meanFa: fa.reduce((s, v) => s + v, 0) / fa.length, power2: row['step 2sd iid'].detected / row['step 2sd iid'].total, delay2: median(row['step 2sd iid'].delays) ?? Infinity });
}
const ok = cand.filter((c) => c.power2 >= 0.9).sort((a, b) => a.meanFa - b.meanFa);
let pick = null;
if (ok.length) {
  const tied = ok.filter((c) => c.meanFa - ok[0].meanFa <= 0.5).sort((a, b) => a.delay2 - b.delay2);
  pick = tied[0];
}
if (ROUND3) {
  const fa = (d) => nulls.reduce((t, st) => t + (1000 * A[d][5][st].fa) / A[d][5][st].checks, 0) / nulls.length;
  const faAt = (d, st) => (1000 * A[d][5][st].fa) / A[d][5][st].checks;
  const found = (d) => steps.reduce((t, st) => t + A[d][5][st].detected, 0);
  const res = ['bocpd-ar1', 'bocpd-ar1-win'].map((d) => ({ d, fa: fa(d), found: found(d), a: fa(d) <= fa('bocpd'), b: found(d) >= found('bocpd'), sticky: ['null ar1 0.5', 'null ar1 0.8'].every((st) => faAt(d, st) < faAt('bocpd', st)) }));
  console.log(`\nRound 3 rule, against bocpd (mean null false alerts ${fa('bocpd').toFixed(2)} per 1,000, ${found('bocpd')} steps found):`);
  for (const c of res) console.log(`  ${c.d}: (a) mean null false alerts ${c.fa.toFixed(2)}, at or below: ${c.a ? 'yes' : 'no'}; (b) steps found ${c.found}, at least as many: ${c.b ? 'yes' : 'no'}; fewer false alerts on both AR(1) nulls: ${c.sticky ? 'yes' : 'no'}.`);
  const win = res.filter((c) => c.a && c.b).sort((x, y) => y.found - x.found || x.fa - y.fa)[0];
  const opt = res.filter((c) => c.a && !c.b && c.sticky).map((c) => c.d);
  console.log(win ? `Adopted: ${win.d} becomes the default.` : `Not adopted: bocpd stays the default.${opt.length ? ` Offered as an option for sticky series: ${opt.join(', ')}.` : ''}`);
} else if (ROUND2) {
  const cells = steps.map((st) => [A.bocpd[5][st].detected, A['bocpd-window'][5][st].detected]);
  const fa = (d) => nulls.reduce((t, st) => t + (1000 * A[d][5][st].fa) / A[d][5][st].checks, 0) / nulls.length;
  const a = cells.every(([b, w]) => w >= b) && cells.reduce((t, [b, w]) => t + w - b, 0) > 0;
  const b = fa('bocpd-window') - fa('bocpd') <= 1.0;
  console.log(`\nRound 2 rule: (a) bocpd-window finds at least as many steps in every cell and more overall: ${a ? 'yes' : 'no'} (${cells.map(([x, y]) => `${x} vs ${y}`).join(', ')}); (b) null false alerts at most 1.0 per 1,000 above bocpd: ${b ? 'yes' : 'no'} (${fa('bocpd').toFixed(2)} vs ${fa('bocpd-window').toFixed(2)}). ${a && b ? 'Adopted: bocpd-window becomes the default.' : 'Not adopted: bocpd stays the default.'}`);
}
if (!ROUND2) console.log(`\nRule (round 1): ${ok.length} of ${cand.length} candidates report at least 90% of the 2-sd steps. ${pick ? `Chosen: ${pick.det} with --confirm ${pick.k} (mean ${pick.meanFa.toFixed(2)} false alerts per 1,000 checks on the nulls; 2-sd steps ${Math.round(pick.power2 * 100)}% found, median delay ${pick.delay2}).` : 'None qualifies.'}`);

// ---------------------------------------------------------------- part B
const DIR = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'tcpd-data';
if (!existsSync(join(DIR, 'annotations.json'))) { console.log(`\nPart B skipped: no ${DIR}/annotations.json (sh eval/tcpd-fetch.sh ${DIR}).`); process.exit(0); }
const ann = JSON.parse(readFileSync(join(DIR, 'annotations.json'), 'utf8'));
const series = [];
for (const d of Object.keys(ann).sort()) {
  const f = join(DIR, 'ds', `${d}.json`);
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  if (j.n_dim !== 1) continue;
  let last = null;
  const values = j.series[0].raw.map((v) => { if (v == null || !Number.isFinite(Number(v))) return last; last = Number(v); return last; });
  series.push({ name: d, values });
}
console.log(`\nPart B: TCPD replay, ${series.length} univariate series that ship in the TCPD repository. Each series is watched from 20% of its length (the baseline check), then checked after every point. An alert is "marked" when an annotator put a change within ${TOL} points of its date. Recall: of the locations a majority of annotators marked after the baseline, how many an alert reached. Delay: points from the nearest marked location to the check that reported it.`);
const B = {}; for (const det of Object.keys(DETECTORS)) { B[det] = {}; for (const k of CONFIRMS) B[det][k] = { alerts: 0, marked: 0, checks: 0, maj: 0, reached: 0, delays: [], per: [] }; }
const tracesB = await traceAll(series.map((s) => ({ values: s.values, start: Math.max(20, Math.floor(0.2 * s.values.length)), tag: `TCPD ${s.name}` })));
series.forEach((s, si) => {
  const n = s.values.length, start = Math.max(20, Math.floor(0.2 * n));
  const a = Object.values(ann[s.name]), K = a.length;
  const anyMark = [...new Set(a.flat())];
  const majority = [];
  for (const l of [...anyMark].sort((x, y) => x - y)) {
    if (l < start) continue;
    if (a.filter((locs) => locs.some((m) => Math.abs(m - l) <= TOL)).length * 2 <= K) continue;
    if (majority.some((p) => Math.abs(p - l) <= TOL)) continue;
    majority.push(l);
  }
  const { labels, out } = tracesB[si];
  for (const det of Object.keys(DETECTORS)) for (const k of CONFIRMS) {
    const { alerts, checks } = replay(out[det], labels, k);
    const cell = B[det][k];
    const marked = alerts.filter((al) => anyMark.some((m) => Math.abs(m - al.index) <= TOL));
    cell.alerts += alerts.length; cell.marked += marked.length; cell.checks += checks; cell.maj += majority.length;
    for (const p of majority) { const al = alerts.find((x) => Math.abs(x.index - p) <= TOL); if (al) { cell.reached++; cell.delays.push(al.at - p); } }
    cell.per.push({ name: s.name, n, alerts: alerts.length, marked: marked.length, maj: majority.length });
  }
});
console.log('\n  detector      confirm  alerts  marked (share)   per 1000 checks  majority locations reached  median delay');
for (const det of Object.keys(DETECTORS)) for (const k of CONFIRMS) {
  const c = B[det][k];
  const star = !ROUND2 && pick && pick.det === det && pick.k === k ? ' *' : '';
  console.log(`  ${(det + star).padEnd(13)} ${String(k).padStart(7)}  ${String(c.alerts).padStart(6)}  ${String(c.marked).padStart(6)} (${c.alerts ? Math.round((100 * c.marked) / c.alerts) : 0}%)${' '.repeat(6)}${((1000 * c.alerts) / c.checks).toFixed(1).padStart(8)}         ${c.reached}/${c.maj}${' '.repeat(22)}${median(c.delays) ?? '-'}`);
}
if (pick && !ROUND2) {
  console.log(`\nPer series, the chosen setting (${pick.det}, --confirm ${pick.k}): alerts, of which marked; majority locations after the baseline.`);
  for (const p of B[pick.det][pick.k].per) console.log(`  ${p.name.padEnd(20)} n ${String(p.n).padStart(4)}  alerts ${String(p.alerts).padStart(3)}  marked ${String(p.marked).padStart(3)}  majority locations ${p.maj}`);
}
}
