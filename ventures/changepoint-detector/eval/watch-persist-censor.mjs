// Round 7 of the watch: persist 2 retried with end-of-series censoring scored apart.
//
//   sh eval/tcpd-fetch.sh tcpd-data
//   node eval/watch-persist-censor.mjs tcpd-data > eval/watch-persist-censor.out.txt
//
// Why (README "Round 5, after the round"): round 5's `persist2` failed its rule by one majority-marked change, on
// `children_per_woman`, and eval/watch-persist-why.mjs traced it: the change at row 142 is first detected at point 301,
// the last row, so persist 1 sends it there and persist 2 is still waiting for its second check when the replay ends.
// The replay scored that as a miss. A live watch would get a next check; a finite replay does not. The README asked
// for a retry that scores such end-pending changes apart, with the rule pre-registered before the run.
//
// Pre-registered 2026-11-12, written and committed before any run of this file.
//
// Candidate: 'hold+persist2' (holdHistory and persist 2). Default it is measured against: 'hold' (the default since
// round 5). 'now' and 'persist2' are printed beside them, deciding nothing. Same detector as rounds 4-6
// (bocpd-ar1-window, rho cap 0.8, --confirm 5, --tolerance 5), so detections are identical and only what is sent
// differs.
//
// Censored scoring, for a pair (default D, candidate P) on one series. "End-pending" for a policy: a change in its
// `pending` list at the last check with `unconfirmed` set (it has `confirm` points after it and waits only for the
// second check; under persist 1 there are none).
//   - A majority-marked change is censored when, under either policy, an end-pending change lies within 5 points of
//     it and that policy has no alert within 5 points of it. Censored marks are removed from both policies' totals
//     and counted apart.
//   - An alert of either policy sent at the last check whose change lies within 5 points of an end-pending change
//     of the other policy is removed from that policy's alert count (the other policy would decide on it at the
//     next check) and counted apart.
//   The raw (round 5) scoring is printed too.
//
// Rule: 'hold+persist2' replaces 'hold' as the watch's default only if all of
//   (a) Part A, fresh seeds 51-60 (round 5 used 41-50): mean false alerts per 1,000 checks over the four rule nulls
//       (iid, AR(1) 0.5, t3, AR(1) 0.8) at or below 'hold''s;
//   (b) Part A: at least as many steps found over the five step cells, median delay at most 2 points longer;
//   (c) Part B, TCPD's 31 shipped univariate series, censored scoring: at least as many majority-marked changes
//       reached, fewer alerts, share of alerts at any annotated change not lower;
//   (d) Part C, the 7 held-out TCPD series, censored scoring: at least as many majority-marked changes reached and no
//       more alerts.
// Otherwise 'hold' stays and persist 2 stays an option; the README says which part failed.
//
// What is not fresh, said before the run. Parts B and C were scored for 'hold+persist2' in round 5
// (eval/watch-flicker.out.txt), so (c) and (d) are re-scorings of seen data under a rule written after seeing it.
// Prediction from round 5's output, written before this run: on B the one censored mark is children_per_woman row
// 142; removing it and hold's point-301 alert gives hold 32 of 51 reached, 105 alerts, 44 at a mark (41.9%) against
// hold+persist2 32 of 51, 103 alerts, 44 (42.7%), so (c) is expected to pass; on C round 5 had 9 of 12 against 9 of
// 12 and 61 against 59 alerts, so (d) is expected to pass unless censoring moves something there. Only (a) and (b)
// are on unseen data. If the result matches the prediction, the change rests on fresh synthetic seeds plus a
// bookkeeping correction on seen real data, and the README says so in those words.
//
// Part D, deciding nothing: the 57 series in data/ that eval/watch-replay-bisect.mjs replays (no labels), watched from 20% of their length, alerts sent and
// end-pending counts per policy, to show how often a replay ends with a change waiting on its second check.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { detectBoth, advance, emptyState } from '../watch-core.mjs';
import { parseSeries } from '../engine.mjs';

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
const shipped = (v, l) => detectBoth(v, l, { model: 'mean', detector: 'bocpd-ar1-window', rhoCap: 0.8 })['bocpd-ar1-window'];

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return { u, g };
}

function trace(values, start) {
  const labels = values.map((_, i) => String(i + 1));
  const out = [];
  for (let n = start; n <= values.length; n++) out.push({ n, changes: shipped(values.slice(0, n), labels.slice(0, n)).map((c) => ({ index: c.index, label: c.label })) });
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

// Replay one trace under one policy: alerts (with the check they were sent at), checks after the baseline, and the
// end-pending changes (waiting only for persist's second check at the last check).
export function replay(steps, labels, policy) {
  let state = emptyState();
  const alerts = [];
  let endPending = [];
  steps.forEach(({ n, changes }, i) => {
    const r = advance(state, changes, n, labels.slice(0, n), { confirm: CONFIRM, tolerance: TOL, ...policy });
    for (const a of r.alerts) alerts.push({ index: a.index, at: n });
    if (i === steps.length - 1) endPending = r.pending.filter((p) => p.unconfirmed).map((p) => p.index);
    state = r.state;
  });
  return { alerts, checks: steps.length - 1, endPending, last: steps.length ? steps[steps.length - 1].n : 0 };
}

const near = (a, b) => Math.abs(a - b) <= TOL;

// Censored scoring of one series for a pair of replays (see the header).
export function censorPair(s, rd, rp) {
  const pend = (r) => (m) => r.endPending.some((e) => near(e, m)) && !r.alerts.some((a) => near(a.index, m));
  const censoredMarks = s.majority.filter((m) => pend(rd)(m) || pend(rp)(m));
  const keepMarks = s.majority.filter((m) => !censoredMarks.includes(m));
  const side = (r, other) => {
    const dropped = r.alerts.filter((a) => a.at === r.last && other.endPending.some((e) => near(e, a.index)));
    const kept = r.alerts.filter((a) => !dropped.includes(a));
    return {
      alerts: kept.length,
      marked: kept.filter((a) => s.anyMark.some((m) => near(m, a.index))).length,
      reached: keepMarks.filter((q) => r.alerts.some((a) => near(a.index, q))).length,
      maj: keepMarks.length,
      droppedAlerts: dropped.length,
    };
  };
  return { d: side(rd, rp), p: side(rp, rd), censoredMarks };
}

export function rawScore(s, r) {
  return {
    alerts: r.alerts.length,
    marked: r.alerts.filter((a) => s.anyMark.some((m) => near(m, a.index))).length,
    reached: s.majority.filter((q) => r.alerts.some((a) => near(a.index, q))).length,
    maj: s.majority.length,
  };
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

// data/*.csv as eval/watch-replay-bisect.mjs reads them (parseSeries, 40 to 800 points: the same 57 series).
function loadData(dir) {
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.csv')).sort()) {
    let p;
    try { p = parseSeries(readFileSync(join(dir, f), 'utf8'), null, null); } catch { continue; }
    if (p.values.length < 40 || p.values.length > 800) continue;
    out.push({ name: f.replace(/\.csv$/, ''), values: p.values, start: Math.max(20, Math.floor(0.2 * p.values.length)) });
  }
  return out;
}

const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const pct = (m, a) => (a ? (100 * m) / a : 0);
const sum = (rows, k) => rows.reduce((t, r) => t + r[k], 0);

function scoreSet(series, traces, D, P, title) {
  const per = series.map((s, i) => {
    const r = Object.fromEntries(Object.entries(POLICIES).map(([k, pol]) => [k, replay(traces[i].out, traces[i].labels, pol)]));
    return { s, r, raw: Object.fromEntries(Object.keys(POLICIES).map((k) => [k, rawScore(s, r[k])])), cen: censorPair(s, r[D], r[P]) };
  });
  console.log(`${title}\n`);
  console.log('  raw scoring (as round 5):');
  console.log('  policy           alerts  at a mark (share)  majority-marked reached  end-pending at the last check');
  for (const k of Object.keys(POLICIES)) {
    const rows = per.map((x) => x.raw[k]), ep = per.reduce((t, x) => t + x.r[k].endPending.length, 0);
    console.log(`  ${k.padEnd(16)} ${String(sum(rows, 'alerts')).padStart(6)}  ${String(sum(rows, 'marked')).padStart(9)} (${pct(sum(rows, 'marked'), sum(rows, 'alerts')).toFixed(1).padStart(4)}%)  ${String(sum(rows, 'reached')).padStart(10)}/${sum(rows, 'maj')}  ${String(ep).padStart(12)}`);
  }
  const tot = (side) => ({ alerts: per.reduce((t, x) => t + x.cen[side].alerts, 0), marked: per.reduce((t, x) => t + x.cen[side].marked, 0), reached: per.reduce((t, x) => t + x.cen[side].reached, 0), maj: per.reduce((t, x) => t + x.cen[side].maj, 0), dropped: per.reduce((t, x) => t + x.cen[side].droppedAlerts, 0) });
  const cd = tot('d'), cp = tot('p'), cm = per.flatMap((x) => x.cen.censoredMarks.map((m) => `${x.s.name} row ${m}`));
  console.log(`\n  censored scoring, '${D}' against '${P}' (header): censored marks ${cm.length}${cm.length ? ` (${cm.join(', ')})` : ''}`);
  for (const [k, c] of [[D, cd], [P, cp]]) console.log(`  ${k.padEnd(16)} ${String(c.alerts).padStart(6)}  ${String(c.marked).padStart(9)} (${pct(c.marked, c.alerts).toFixed(1).padStart(4)}%)  ${String(c.reached).padStart(10)}/${c.maj}  alerts set apart: ${c.dropped}`);
  console.log('\n  per series where the two differ (raw alerts / marked / reached of majority; end-pending):');
  for (const x of per) {
    const a = x.raw[D], b = x.raw[P];
    if (a.alerts === b.alerts && a.reached === b.reached && !x.r[P].endPending.length) continue;
    console.log(`    ${x.s.name.padEnd(22)} ${D} ${a.alerts}/${a.marked}/${a.reached} of ${a.maj}   ${P} ${b.alerts}/${b.marked}/${b.reached} of ${b.maj}; end-pending ${x.r[P].endPending.length ? `rows ${x.r[P].endPending.join(', ')}` : 'none'}`);
  }
  console.log('');
  return { cd, cp, cm };
}

if (isMainThread) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'tcpd-data';
  const N = 500, START = 100, STEP_AT = 300, SEEDS = 10, SEED0 = 50;
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
  const NAMES = Object.keys(POLICIES), D = 'hold', P = 'hold+persist2';
  const t0 = Date.now();
  const tcpd = loadTcpd(dir, 'ds'), held = loadTcpd(dir, 'heldout'), data = loadData(join(here, '..', 'data'));
  const jobs = [];
  for (const s of held) jobs.push({ part: 'C', values: s.values, start: s.start, tag: `heldout ${s.name}` });
  for (const s of tcpd) jobs.push({ part: 'B', values: s.values, start: s.start, tag: `TCPD ${s.name}` });
  for (const s of data) jobs.push({ part: 'D', values: s.values, start: s.start, tag: null });
  for (const [sname, gen] of Object.entries(SCEN)) for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ part: 'A', sname, values: gen(rng((seed + SEED0) * 7919 + sname.length)), start: START, tag: seed === SEEDS ? `${sname} (last seed)` : null });
  const all = await traceAll(jobs);
  process.stderr.write(`traced in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  const idx = (part) => jobs.map((j, i) => (j.part === part ? i : -1)).filter((i) => i >= 0);

  // ---- Part A (raw scoring: a step at 301 of 500 leaves 200 checks after it, so nothing there is end-censored)
  const A = {};
  for (const p of NAMES) { A[p] = {}; for (const sn of Object.keys(SCEN)) A[p][sn] = { found: 0, total: 0, fa: 0, checks: 0, delays: [] }; }
  for (const j of idx('A')) {
    const job = jobs[j], truth = job.sname.startsWith('step') ? STEP_AT : null;
    for (const p of NAMES) {
      const { alerts, checks } = replay(all[j].out, all[j].labels, POLICIES[p]);
      const cell = A[p][job.sname];
      const hit = truth === null ? null : alerts.find((a) => near(a.index, truth));
      cell.total += truth === null ? 0 : 1; if (hit) { cell.found++; cell.delays.push(hit.at - truth); }
      cell.fa += alerts.filter((a) => truth === null || !near(a.index, truth)).length; cell.checks += checks;
    }
  }
  console.log(`Round 7: persist 2 retried with end-of-series censoring scored apart. Rule and reasons: header of eval/watch-persist-censor.mjs. Detector: bocpd-ar1-window, rho cap 0.8, --confirm ${CONFIRM}, --tolerance ${TOL}; only the advance policy differs.\n`);
  console.log(`Part A: ${SEEDS} fresh seeds (${SEED0 + 1}-${SEED0 + SEEDS}) per cell, ${N} points, baseline check at ${START}, then one check per point; a step at point ${STEP_AT + 1}. False alerts per 1,000 checks, then steps found and median delay.\n`);
  console.log(`  policy           ${NULLS.map((x) => x.padEnd(15)).join('')}${STEPS.map((x) => x.padEnd(18)).join('')}`);
  for (const p of NAMES) console.log(`  ${p.padEnd(16)} ${NULLS.map((x) => ((1000 * A[p][x].fa) / A[p][x].checks).toFixed(2).padEnd(15)).join('')}${STEPS.map((x) => `${A[p][x].found}/${A[p][x].total} d${med(A[p][x].delays) ?? '-'}`.padEnd(18)).join('')}`);
  const meanFa = (p) => RULE_NULLS.reduce((t, x) => t + (1000 * A[p][x].fa) / A[p][x].checks, 0) / RULE_NULLS.length;
  const steps = (p) => STEPS.reduce((t, x) => t + A[p][x].found, 0);
  const delay = (p) => med(STEPS.flatMap((x) => A[p][x].delays));
  console.log('');

  const B = scoreSet(tcpd, idx('B').map((i) => all[i]), D, P, `Part B: ${tcpd.length} univariate TCPD series (shipped), watched from 20% of their length.`);
  const C = scoreSet(held, idx('C').map((i) => all[i]), D, P, `Part C: the ${held.length} held-out TCPD series (seen by round 5's report, not by its rule).`);

  // ---- Part D (deciding nothing)
  console.log(`Part D, deciding nothing: ${data.length} series in data/ (no labels), watched from 20% of their length.\n`);
  const dRows = idx('D').map((i) => all[i]);
  for (const p of NAMES) {
    const rs = dRows.map((t) => replay(t.out, t.labels, POLICIES[p]));
    console.log(`  ${p.padEnd(16)} alerts ${String(rs.reduce((t, r) => t + r.alerts.length, 0)).padStart(4)}   series ending with a change waiting on its second check: ${rs.filter((r) => r.endPending.length).length}`);
  }

  // ---- Rule
  const a = meanFa(P) <= meanFa(D) + 1e-9, b = steps(P) >= steps(D) && delay(P) <= delay(D) + 2;
  const c = B.cp.reached >= B.cd.reached && B.cp.alerts < B.cd.alerts && pct(B.cp.marked, B.cp.alerts) >= pct(B.cd.marked, B.cd.alerts) - 1e-9;
  const d = C.cp.reached >= C.cd.reached && C.cp.alerts <= C.cd.alerts;
  console.log(`\nRule, '${P}' against '${D}':`);
  console.log(`  (a) mean null false alerts ${meanFa(P).toFixed(2)} vs ${meanFa(D).toFixed(2)}: ${a ? 'pass' : 'fail'}`);
  console.log(`  (b) steps ${steps(P)} vs ${steps(D)}, median delay ${delay(P)} vs ${delay(D)}: ${b ? 'pass' : 'fail'}`);
  console.log(`  (c) TCPD censored: reached ${B.cp.reached} vs ${B.cd.reached} of ${B.cd.maj}, alerts ${B.cp.alerts} vs ${B.cd.alerts}, at a mark ${pct(B.cp.marked, B.cp.alerts).toFixed(1)}% vs ${pct(B.cd.marked, B.cd.alerts).toFixed(1)}%: ${c ? 'pass' : 'fail'}`);
  console.log(`  (d) held out censored: reached ${C.cp.reached} vs ${C.cd.reached} of ${C.cd.maj}, alerts ${C.cp.alerts} vs ${C.cd.alerts}: ${d ? 'pass' : 'fail'}`);
  console.log(a && b && c && d ? `Adopted: '${P}' becomes the watch's default.` : `Not adopted: '${D}' stays the default; persist 2 stays an option.`);
}
