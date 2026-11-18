// Round 5 of the watch: flicker after the baseline.
//
//   sh eval/tcpd-fetch.sh tcpd-data
//   node eval/watch-flicker.mjs tcpd-data > eval/watch-flicker.out.txt
//
// The fault (README "Replaying the watch on your own history"): on `ausair` (47 points) the first check at 20 points
// sees no change; at 21 points the engine finds two, at rows 9 and 15, both with 5 points after them, so the watch
// alerts on history it had just called quiet; at 22 both are gone. A detection that shows for one check and vanishes
// becomes an alert anyway, because `advance` alerts the first time a change has `confirm` points after it.
//
// Pre-registered 2026-11-12, written and committed before any run of this file. Candidates are `advance` options in
// watch-core.mjs, all on the shipped detector (bocpd-ar1-window, rho cap 0.8, --confirm 5, --tolerance 5), so one
// engine trace per series serves all four and the detections are identical across them:
//   'now'           the default: alert the first check a change has 5 points after it.
//   'hold'          holdHistory: a change dated where the first check already had 5 points after it is recorded
//                   as held, never alerted.
//   'persist2'      persist 2: a change is alerted only if a detection within 5 points of it was also present at the
//                   previous check (pending or not), so a one-check detection is never sent; costs one check of delay.
//   'hold+persist2' both.
// Part A, synthetic: round 4's ten cells (four rule nulls, AR(1) 0.95 reported only, five step cells) on fresh seeds
// 41-50, 500 points, baseline at 100, one check per point, step at point 301.
// Part B: the 31 univariate TCPD series TCPD ships, watched from 20% of their length (as rounds 1-4).
// Rule: a candidate replaces 'now' only if
//   (a) its mean false alerts per 1,000 checks over the four rule nulls (iid, AR(1) 0.5, t3, AR(1) 0.8) is at or
//       below 'now's, and
//   (b) it finds at least as many steps over the five step cells, with a median delay at most 2 points longer, and
//   (c) on TCPD it reaches at least as many majority-marked changes, sends fewer alerts, and its share of alerts at
//       any annotated change is not lower.
// If several pass, the one with the fewest TCPD alerts, then the shorter median synthetic delay. A candidate failing
// only (b)'s delay part is offered as an option with the cost stated.
// Part C, held out, deciding nothing for round 5: the 7 univariate TCPD series TCPD does not ship (tcpd-data/heldout,
// md5-checked by tcpd-fetch.sh), never used by any watch round. Reported for the four candidates, and used for one
// more pre-registered check, of round 4's shipped choice: the 0.8 rho cap is "confirmed on fresh data" if, against
// the uncapped AR(1) pass (rho clip 0.95) on these 7 series, it reaches at least as many majority-marked changes with
// a share of alerts at a mark at most 5 points lower; otherwise the README says it did not hold and the cap is
// revisited (nothing is changed automatically). The plain windowed pass (bocpd-window, no AR(1) term) is reported
// beside them, deciding nothing, for the "38 vs 33" lead in the flagship's next.
// Flicker, reported for every part: an alert whose change has no detection within 5 points at the very next check.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { detectBoth, advance, emptyState } from '../watch-core.mjs';

const TOL = 5, CONFIRM = 5;
export const POLICIES = {
  // Every option explicit (fixed after round 7's run): advance() fills gaps from WATCH_DEFAULTS, so once round 5
  // made hold the default, `{}` meant hold, not the old default, and once round 7 made persist 2 the default, `hold`
  // would have meant hold+persist2. The decision pairs (round 5: now vs the rest; round 7: hold vs hold+persist2)
  // are unchanged by this; only the meaning of the names in later reruns is pinned.
  now: { holdHistory: false, persist: 1 },
  hold: { holdHistory: true, persist: 1 },
  persist2: { holdHistory: false, persist: 2 },
  'hold+persist2': { holdHistory: true, persist: 2 },
};
// Detector lists traced per series: the shipped one always; the uncapped and plain ones for part C only.
const DET = {
  shipped: (v, l) => detectBoth(v, l, { model: 'mean', detector: 'bocpd-ar1-window', rhoCap: 0.8 })['bocpd-ar1-window'],
  uncapped: (v, l) => detectBoth(v, l, { model: 'mean', detector: 'bocpd-ar1-window', rhoCap: 0.95 })['bocpd-ar1-window'],
  plain: (v, l) => detectBoth(v, l, { model: 'mean', detector: 'bocpd-window' })['bocpd-window'],
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return { u, g };
}

function trace(values, start, dets) {
  const labels = values.map((_, i) => String(i + 1));
  const out = Object.fromEntries(dets.map((d) => [d, []]));
  for (let n = start; n <= values.length; n++) for (const d of dets) out[d].push({ n, changes: DET[d](values.slice(0, n), labels.slice(0, n)).map((c) => ({ index: c.index, label: c.label })) });
  return { labels, out };
}

if (!isMainThread) parentPort.on('message', ({ id, values, start, dets }) => parentPort.postMessage({ id, ...trace(values, start, dets) }));

async function traceAll(jobs) {
  const results = new Array(jobs.length);
  const k = Math.max(1, Math.min(jobs.length, availableParallelism()));
  let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    for (let w = 0; w < k; w++) {
      const worker = new Worker(new URL(import.meta.url), { argv: process.argv.slice(2) });
      const feed = () => { if (next < jobs.length) { const id = next++; worker.postMessage({ id, values: jobs[id].values, start: jobs[id].start, dets: jobs[id].dets }); } else worker.terminate(); };
      worker.on('message', (m) => { results[m.id] = m; done++; if (jobs[m.id].tag) process.stderr.write(`${jobs[m.id].tag} done (${done}/${jobs.length})\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

// Replay one trace under one advance policy: the alerts, the checks after the baseline, and how many alerts flickered.
export function replay(steps, labels, policy) {
  let state = emptyState();
  const alerts = [];
  steps.forEach(({ n, changes }, i) => {
    const r = advance(state, changes, n, labels.slice(0, n), { confirm: CONFIRM, tolerance: TOL, ...policy });
    for (const a of r.alerts) {
      const nx = steps[i + 1];
      alerts.push({ index: a.index, at: n, flicker: !!nx && !nx.changes.some((c) => Math.abs(c.index - a.index) <= TOL) });
    }
    state = r.state;
  });
  return { alerts, checks: steps.length - 1 };
}

function loadTcpd(dir, sub) {
  const ann = JSON.parse(readFileSync(join(dir, 'annotations.json'), 'utf8'));
  const series = [];
  for (const d of Object.keys(ann).sort()) {
    const f = join(dir, sub, `${d}.json`);
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

function scoreTcpd(series, traces, det, names) {
  const tot = {};
  for (const p of names) tot[p] = { alerts: 0, marked: 0, checks: 0, maj: 0, reached: 0, flicker: 0, per: [] };
  series.forEach((s, si) => {
    for (const p of names) {
      const { alerts, checks } = replay(traces[si].out[det], traces[si].labels, POLICIES[p] ?? {});
      const t = tot[p];
      const marked = alerts.filter((al) => s.anyMark.some((m) => Math.abs(m - al.index) <= TOL)).length;
      const reached = s.majority.filter((q) => alerts.some((x) => Math.abs(x.index - q) <= TOL));
      t.alerts += alerts.length; t.marked += marked; t.checks += Math.max(0, checks); t.maj += s.majority.length; t.reached += reached.length;
      t.flicker += alerts.filter((a) => a.flicker).length;
      t.per.push({ name: s.name, alerts: alerts.length, marked, reached: reached.length, maj: s.majority.length, flicker: alerts.filter((a) => a.flicker).length });
    }
  });
  return tot;
}

const share = (t) => (t.alerts ? (100 * t.marked) / t.alerts : 0);
function printTcpd(tot, label = 'candidate') {
  console.log(`  ${label.padEnd(16)} alerts  at a mark (share)  per 1000 checks  flicker  majority-marked reached`);
  for (const [p, t] of Object.entries(tot)) console.log(`  ${p.padEnd(16)} ${String(t.alerts).padStart(6)}  ${String(t.marked).padStart(9)} (${share(t).toFixed(0).padStart(2)}%)  ${((1000 * t.alerts) / Math.max(1, t.checks)).toFixed(1).padStart(15)}  ${String(t.flicker).padStart(7)}  ${t.reached}/${t.maj}`);
}

if (isMainThread) {
  const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'tcpd-data';
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
  const NULLS = Object.keys(SCEN).filter((x) => x.startsWith('null'));
  const STEPS = Object.keys(SCEN).filter((x) => x.startsWith('step'));
  const NAMES = Object.keys(POLICIES);
  const t0 = Date.now();
  const tcpd = loadTcpd(dir, 'ds'), held = loadTcpd(dir, 'heldout');
  const jobs = [];
  // Longest first, so the pool is not left waiting on one slow series at the end.
  for (const s of held) jobs.push({ part: 'C', values: s.values, start: s.start, dets: ['shipped', 'uncapped', 'plain'], tag: `heldout ${s.name}` });
  for (const s of tcpd) jobs.push({ part: 'B', values: s.values, start: s.start, dets: ['shipped'], tag: `TCPD ${s.name}` });
  for (const [sname, gen] of Object.entries(SCEN)) for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ part: 'A', sname, values: gen(rng((seed + SEED0) * 7919 + sname.length)), start: START, dets: ['shipped'], tag: seed === SEEDS ? `${sname} (last seed)` : null });
  const all = await traceAll(jobs);
  process.stderr.write(`traced in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);

  // ---- Part A
  const A = {};
  for (const p of NAMES) { A[p] = {}; for (const sn of Object.keys(SCEN)) A[p][sn] = { found: 0, total: 0, fa: 0, checks: 0, delays: [], flicker: 0 }; }
  jobs.forEach((job, j) => {
    if (job.part !== 'A') return;
    const truth = job.sname.startsWith('step') ? STEP_AT : null;
    for (const p of NAMES) {
      const { alerts, checks } = replay(all[j].out.shipped, all[j].labels, POLICIES[p]);
      const cell = A[p][job.sname];
      const hit = truth === null ? null : alerts.find((a) => Math.abs(a.index - truth) <= TOL);
      cell.total += truth === null ? 0 : 1; if (hit) { cell.found++; cell.delays.push(hit.at - truth); }
      cell.fa += alerts.filter((a) => truth === null || Math.abs(a.index - truth) > TOL).length; cell.checks += checks;
      cell.flicker += alerts.filter((a) => a.flicker).length;
    }
  });
  console.log(`Round 5: flicker after the baseline. Rule and reasons: header of eval/watch-flicker.mjs. Detector: bocpd-ar1-window, rho cap 0.8, --confirm ${CONFIRM}, --tolerance ${TOL} (the shipped default); only the advance policy differs.\n`);
  console.log(`Part A: ${SEEDS} fresh seeds (41-50) per cell, ${N} points, baseline check at ${START}, then one check per point; a step at point ${STEP_AT + 1}, found when an alert lies within ${TOL} points. False alerts per 1,000 checks (flicker alerts among them in brackets), then steps found and median delay.\n`);
  console.log(`  candidate        ${NULLS.map((x) => x.padEnd(16)).join('')}${STEPS.map((x) => x.padEnd(18)).join('')}`);
  for (const p of NAMES) console.log(`  ${p.padEnd(16)} ${NULLS.map((x) => `${((1000 * A[p][x].fa) / A[p][x].checks).toFixed(2)} (${A[p][x].flicker})`.padEnd(16)).join('')}${STEPS.map((x) => `${A[p][x].found}/${A[p][x].total} d${med(A[p][x].delays) ?? '-'}`.padEnd(18)).join('')}`);
  const meanFa = (p) => RULE_NULLS.reduce((t, x) => t + (1000 * A[p][x].fa) / A[p][x].checks, 0) / RULE_NULLS.length;
  const steps = (p) => STEPS.reduce((t, x) => t + A[p][x].found, 0);
  const delay = (p) => med(STEPS.flatMap((x) => A[p][x].delays));

  // ---- Part B
  const idx = (part) => jobs.map((j, i) => (j.part === part ? i : -1)).filter((i) => i >= 0);
  console.log(`\nPart B: ${tcpd.length} univariate TCPD series (the ones TCPD ships), watched from 20% of their length, one check per point. A majority-marked change is reached when an alert lies within ${TOL} points of it.\n`);
  const B = scoreTcpd(tcpd, idx('B').map((i) => all[i]), 'shipped', NAMES);
  printTcpd(B);
  console.log('\n  per series where the candidates differ (alerts / marked / reached of majority / flicker):');
  tcpd.forEach((s, si) => {
    const row = NAMES.map((p) => B[p].per[si]);
    if (row.every((r) => r.alerts === row[0].alerts && r.reached === row[0].reached)) return;
    console.log(`    ${s.name.padEnd(22)} ${row.map((r, k) => `${NAMES[k]} ${r.alerts}/${r.marked}/${r.reached} of ${r.maj}/${r.flicker}`).join('   ')}`);
  });

  // ---- Rule
  const D = 'now';
  console.log(`\nRule, against '${D}' (mean null false alerts ${meanFa(D).toFixed(2)} per 1,000; ${steps(D)} steps, median delay ${delay(D)}; TCPD ${B[D].alerts} alerts, ${B[D].reached} of ${B[D].maj} marks, ${share(B[D]).toFixed(1)}% at a mark):`);
  const res = NAMES.filter((p) => p !== D).map((p) => ({ p, a: meanFa(p) <= meanFa(D) + 1e-9, b1: steps(p) >= steps(D), b2: delay(p) <= delay(D) + 2, c: B[p].reached >= B[D].reached && B[p].alerts < B[D].alerts && share(B[p]) >= share(B[D]) - 1e-9 }));
  for (const r of res) console.log(`  ${r.p}: (a) mean null false alerts ${meanFa(r.p).toFixed(2)}: ${r.a ? 'pass' : 'fail'}; (b) steps ${steps(r.p)}, median delay ${delay(r.p)}: ${r.b1 && r.b2 ? 'pass' : 'fail'}; (c) TCPD ${B[r.p].alerts} alerts, ${B[r.p].reached} marks, ${share(B[r.p]).toFixed(1)}% at a mark: ${r.c ? 'pass' : 'fail'}.`);
  const win = res.filter((r) => r.a && r.b1 && r.b2 && r.c).sort((x, y) => B[x.p].alerts - B[y.p].alerts || delay(x.p) - delay(y.p))[0];
  const opt = res.filter((r) => r.a && r.b1 && !r.b2 && r.c).map((r) => r.p);
  console.log(win ? `Adopted: '${win.p}' becomes the watch's default.` : `Not adopted: '${D}' stays the default.${opt.length ? ` Offered as an option: ${opt.join(', ')}.` : ''}`);

  // ---- Part C
  const C = idx('C').map((i) => all[i]);
  console.log(`\nPart C, held out (deciding nothing for round 5): the ${held.length} univariate TCPD series TCPD does not ship, never used by a watch round (${held.map((s) => `${s.name} ${s.values.length}`).join(', ')}).\n`);
  printTcpd(scoreTcpd(held, C, 'shipped', NAMES));
  console.log('\n  The round-4 cap on fresh data (policy now):\n');
  const caps = { 'cap 0.8 (shipped)': scoreTcpd(held, C, 'shipped', ['now']).now, 'uncapped (0.95)': scoreTcpd(held, C, 'uncapped', ['now']).now, 'plain bocpd-window': scoreTcpd(held, C, 'plain', ['now']).now };
  printTcpd(caps, 'detector');
  console.log('\n  per series (alerts / marked / reached of majority):');
  held.forEach((s, si) => console.log(`    ${s.name.padEnd(18)} ${Object.entries(caps).map(([k, t]) => `${k}: ${t.per[si].alerts}/${t.per[si].marked}/${t.per[si].reached} of ${t.per[si].maj}`).join('   ')}`));
  const cap = caps['cap 0.8 (shipped)'], unc = caps['uncapped (0.95)'];
  const ok = cap.reached >= unc.reached && share(cap) >= share(unc) - 5;
  console.log(`\nCap check (pre-registered): cap 0.8 reaches ${cap.reached} of ${cap.maj} with ${share(cap).toFixed(1)}% at a mark; uncapped ${unc.reached} with ${share(unc).toFixed(1)}%. ${ok ? 'Confirmed on fresh data.' : 'Did not hold on fresh data.'}`);
}
