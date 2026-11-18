// Round 18 of the watch: the label-free floors of rounds 15-17 on a fresh labelled multi-sensor set, SMD's 28 servers.
// Pre-registered 2026-11-15: this header, the rule, the predictions and the code below were written and committed
// before any run that printed a score. A timing-only pilot (one column of machine-1-1's test half, printing checks and
// seconds per bucket size and nothing else) showed hourly buckets cost about 3 s a column and 30-minute buckets about
// 26 s (the replay's cost grows with the cube of the points), so the round runs on hourly buckets.
//
//   sh eval/smd-fetch.sh smd-data
//   node eval/watch-smd.mjs smd-data > eval/watch-smd.out.txt
//
// Why (README "Round 17"). Rounds 14-17 tried four label-free floors for a loud many-column watch on SKAB, a seen set,
// and every one missed the three-part bar narrowly, from both sides (round 15: 27 of 33 faults at 1.40 false lines per
// 100 checks; round 16: 30 at 2.47; round 17's K: 29 at 1.50). Round 17 closed with "a fresh labelled multi-sensor set
// (the stronger test, now overdue)". SKAB is one testbed with 8 sensors and 16 near-copies of one valve fault; a near
// miss there may be SKAB's, not the floor's. This round asks whether any of the floors meets the same bar on data
// nobody here has scored.
//
// Data: the Server Machine Dataset (SMD; Su et al. 2019, KDD, "OmniAnomaly"; github.com/NetManAIOps/OmniAnomaly, MIT).
// 28 servers of a large internet company, 38 metrics each (CPU, memory, disk, network and the like, min-max scaled by
// the publishers), one row a minute for about five weeks: a train half (about 16-20 days, no labels, which the
// benchmark treats as normal operation) and a test half with a 0/1 label per row, 327 labelled segments in all. Nobody
// in this repository has looked at these series before; before this commit the labels were counted (segments per
// machine, how many are under 30 minutes, where the first falls) and each machine's columns that vary were counted, to
// size the design. No alert, line or score was computed.
//
// Design. (i) Hourly buckets: each half's rows are averaged in consecutive groups of 60 (a last partial group dropped);
// about 395-479 points a half. A segment [s, e] in minutes covers buckets floor(s/60) to floor(e/60); its window is one
// bucket wider each side, [floor(s/60) - 1, floor(e/60) + 1]. (ii) The columns watched on a machine are those that
// vary over the first half of its train half (what a person setting the watch up can see): 862 columns, 27-34 a
// machine; the others are constant there. Each runs the one-column watch under the shipped policy (Quiet,
// bocpd-ar1-window; window 1,000, confirm 5, tolerance 5, hold history, persist 2; level model, raw values, no log, no
// period), replayed after every point. The rolling windows of rounds 15 and 17 (SPREAD_WINDOW 60, MOVE_WINDOW 60,
// MOVE_SPAN 12) are kept in points: here 60 hours and 12-hour means. (iii) Three stretches per machine:
//   - setup: the train half's first half. Quiet replayed on the train half from point 24 (one day's baseline); its lines
//     sent before the half point are the normal-history lines each floor's k is read from, by that round's rule, per
//     machine (each machine's watch is set up on its own history): L = floor(2 / 100 * setup checks) whole-watch lines.
//   - null: the train half's second half, other days than the setup. Each arm is replayed on the whole train half with
//     its first check at the half point (the first half is the history; the changes already in it are the baseline),
//     so every line sent is out of sample. SMD labels nothing here; the benchmark treats it as normal, so every line is
//     counted false (some may be real unlabelled events; that biases every arm the same way).
//   - test: the test half, replayed from point 24 (one day's baseline). Segments whose start bucket is under 24 are in
//     the baseline and not scored.
// Arms (each with nothing set by hand and no label read):
//   Q  Quiet, no floor.
//   R  round 15's spread floor (minSpreadRatio): one k per machine, kFor over the setup lines' spread ratios.
//   S  round 16's loud split: loudSplit over the setup lines' spread ratios by column (a loud column gets its own k).
//   K  round 17's rolling move floor (minMoveRatio) with k read by kFor off the setup lines' move ratios.
// Round 14's equal split is left out: with about 30 columns and L of 3-4 lines a machine its per-column share is 0, so
// its floor is set above every setup line, a degenerate arm.
//
// Scores, on the 28 test halves, after the baseline. An alert line is one column's alert. At a mark: the alerted change's
// index inside some segment's window. A segment is reached (caught) when some line's change index lies inside its
// window; delay: hours from the segment's start bucket to the earliest such line's report. Lines per 1,000 whole-watch
// checks. Chance for "at a mark": the share of scored points inside a window. Null: lines per 100 whole-watch checks of
// the null stretches, pooled over the 28 machines.
//
// The rule, written before the run, for each of R, S and K against Q (T10-T13's three parts, with (b) scaled from
// "2 of 33" to SMD's count; ties in a "more" part fail; "at least" and "at most" include ties):
//  T14, a label-free floor on a fresh multi-sensor set:
//      (a) the arm's null lines at most 2 per 100 whole-watch checks;
//      (b) the arm catches at least Q's caught segments minus floor(0.06 * Q's);
//      (c) the arm's share of lines at a mark is at least Q's.
//  An arm passes when all three hold. Three arms are tested, so one pass is weaker evidence than its rule alone says.
//  Pass (any arm): the README, `--columns`'s help and the watch page name the arm as the one label-free floor that met
//  the bar on a fresh set after missing it on SKAB, and its `auto` form is pre-registered for the next fresh set;
//  nothing new ships to the CLI from one set. Fail (all three): the README, `--columns`'s help and the watch page say
//  the label-free floors missed the bar on a second, fresh set too, and the advice (replay first, hand floors on the
//  columns that do not matter) stands.
//
// Reported only, deciding nothing: each machine's k's; null and test lines per arm by machine; caught segments by
// length (under 60 minutes, which an hourly bucket dilutes, and longer); Q's lines with round 13's two-column agreement
// (agreeAlerts, within 12 points) applied after the fact; and how many of a caught segment's first lines came from a
// metric the publishers' interpretation labels name for that segment.
//
// Predictions, written before the run. Q on about 30 server metrics sends far more than SKAB's 8 sensors did: I predict
// its null near 15 lines per 100 whole-watch checks and its share at a mark near chance plus a few points (server
// metrics move for many unlabelled reasons, as NAB's did). The budget leaves 3-4 setup lines a machine, so every k is
// read from the tail of about a hundred lines and will be high; I predict (a) passes for all three arms (about 2-4 per
// 100 with one or two under 2), (c) passes for all three, and (b) fails for all three, each catching under 80% of Q's
// segments, because most labelled segments are under an hour and an hourly floor set to silence 30 columns also
// silences diluted events. Overall: T14 fails for every arm, on (b).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayWatch, spreadRatio, moveRatio, agreeAlerts } from '../watch-core.mjs';
import { kFor } from './watch-skab-spread.mjs';
import { loudSplit } from './watch-skab-loud.mjs';

export const BUCKET = 60;
export const FROM = 24;
const B = 2;
const POLICY = { confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000, detector: 'bocpd-ar1-window' };
export const ARMS = ['Q', 'R', 'S', 'K'];

// Answer only workers this file started.
if (!isMainThread && workerData === import.meta.url) {
  parentPort.on('message', ({ id, values, from, floor }) => {
    const r = replayWatch(values, null, { ...POLICY, from, budget: Infinity, ...(floor || {}) });
    parentPort.postMessage({ id, checks: r.checks, alerts: r.alerts.map((a) => ({ index: a.index, at: a.reportedAt, shift: a.shift, spread: spreadRatio(values, a), move: moveRatio(values, a) })) });
  });
}

async function runAll(jobs) {
  const results = new Array(jobs.length);
  const k = Math.max(1, Math.min(jobs.length, availableParallelism()));
  let next = 0, done = 0;
  const order = jobs.map((_, i) => i).sort((a, b) => jobs[b].values.length - jobs[a].values.length);
  await new Promise((resolve, reject) => {
    for (let w = 0; w < k; w++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: import.meta.url });
      const feed = () => { if (next < order.length) { const id = order[next++]; const j = jobs[id]; worker.postMessage({ id, values: j.values, from: j.from, floor: j.floor }); } else worker.terminate(); };
      worker.on('message', (m) => { if (results[m.id]) { reject(new Error(`job ${m.id} answered twice`)); return; } results[m.id] = m; done++; if (done % 200 === 0) process.stderr.write(`${done}/${jobs.length}\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

/** Parse one SMD file (comma-separated, no header): rows of numbers. */
export function parseRows(text, name = '') {
  return text.trim().split('\n').map((l, i) => { const r = l.split(',').map(Number); if (r.some((x) => !Number.isFinite(x))) throw new Error(`${name}: a bad value on row ${i + 1}`); return r; });
}

/** Means of consecutive groups of `k` values; a last partial group is dropped. */
export function buckets(v, k = BUCKET) {
  const out = [];
  for (let i = 0; i + k <= v.length; i += k) { let s = 0; for (let j = 0; j < k; j++) s += v[i + j]; out.push(s / k); }
  return out;
}

/** Labelled segments [start, end] (rows, inclusive) from a 0/1 label per row. */
export function segments(labels) {
  const out = [];
  labels.forEach((x, i) => { if (x && (i === 0 || !labels[i - 1])) out.push([i, i]); if (x) out[out.length - 1][1] = i; });
  return out;
}

/** The interpretation labels: "start-end:d1,d2,..." per line, metrics 1-based; returns [{ s, e, dims (0-based) }]. */
export function parseInterpretation(text) {
  return text.trim().split('\n').filter(Boolean).map((l) => { const [r, d] = l.split(':'); const [s, e] = r.split('-').map(Number); return { s, e, dims: d.split(',').map((x) => Number(x) - 1) }; });
}

/** Columns that vary over the first `h` rows. */
export function varying(rows, h) {
  const out = [];
  for (let c = 0; c < rows[0].length; c++) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < h; i++) { lo = Math.min(lo, rows[i][c]); hi = Math.max(hi, rows[i][c]); } if (hi > lo) out.push(c); }
  return out;
}

/** One machine in hourly buckets (or `BUCKET_`-minute buckets with a baseline of `from` points, round 19): the watched columns of each half, the half point, and the scored segment windows. */
export function machineFrom({ name, train, test, label, interp }, BUCKET_ = BUCKET, from = FROM) {
  const BUCKET = BUCKET_, FROM = from;
  const half = Math.floor(Math.floor(train.length / BUCKET) / 2);
  const cols = varying(train, half * BUCKET);
  const tr = cols.map((c) => buckets(train.map((r) => r[c]), BUCKET));
  const te = cols.map((c) => buckets(test.map((r) => r[c]), BUCKET));
  const n = te[0].length;
  const segs = segments(label);
  const wins = segs.map(([s, e]) => {
    const it = interp.find((x) => x.s <= e && x.e >= s);
    return { b: Math.floor(s / BUCKET), lo: Math.floor(s / BUCKET) - 1, hi: Math.floor(e / BUCKET) + 1, minutes: e - s + 1, dims: it ? it.dims : [] };
  }).filter((w) => w.b < n);
  let covered = 0;
  for (let i = FROM; i < n; i++) if (wins.some((w) => i >= w.lo && i <= w.hi)) covered++;
  return { name, cols, tr, te, half, nTrain: tr[0].length, n, wins, covered, scored: n - FROM, from: FROM };
}

export function loadSmd(dir) {
  return readdirSync(join(dir, 'test')).filter((f) => f.endsWith('.txt')).sort().map((f) => machineFrom({
    name: f.replace(/\.txt$/, ''),
    train: parseRows(readFileSync(join(dir, 'train', f), 'utf8'), f),
    test: parseRows(readFileSync(join(dir, 'test', f), 'utf8'), f),
    label: readFileSync(join(dir, 'test_label', f), 'utf8').trim().split('\n').map(Number),
    interp: parseInterpretation(readFileSync(join(dir, 'interpretation_label', f), 'utf8')),
  }));
}

const inWin = (w, i) => i >= w.lo && i <= w.hi;

/** Score lines over the test halves. linesOf(machine) gives that machine's lines, each { col, index, at }. */
export function score(machines, linesOf) {
  const t = { alerts: 0, atMark: 0, checks: 0, segs: 0, caught: 0, delays: [], short: 0, shortCaught: 0, named: 0 };
  for (const m of machines) {
    const lines = linesOf(m);
    t.alerts += lines.length; t.checks += m.scored;
    t.atMark += lines.filter((a) => m.wins.some((w) => inWin(w, a.index))).length;
    for (const w of m.wins) {
      if (w.b < (m.from ?? FROM)) continue;
      t.segs++;
      if (w.minutes < 60) t.short++;
      const hit = lines.filter((a) => inWin(w, a.index));
      if (!hit.length) continue;
      t.caught++;
      if (w.minutes < 60) t.shortCaught++;
      const first = hit.reduce((x, y) => (y.at < x.at ? y : x));
      t.delays.push(first.at - w.b);
      if (w.dims.includes(m.cols[first.col])) t.named++;
    }
  }
  t.share = t.alerts ? (100 * t.atMark) / t.alerts : 0;
  t.per1000 = t.checks ? (1000 * t.alerts) / t.checks : 0;
  const d = [...t.delays].sort((x, y) => x - y), h = d.length >> 1;
  t.medianDelay = d.length ? (d.length % 2 ? d[h] : (d[h - 1] + d[h]) / 2) : null;
  return t;
}

/** T14 for one arm on scored totals (exported so the test can check it on made-up numbers). */
export function ruleT14(q, x, xNullPer100) {
  const p = [xNullPer100 <= B, x.caught >= q.caught - Math.floor(0.06 * q.caught), x.share >= q.share];
  return { parts: p, pass: p.every(Boolean) };
}

/** Each arm's floor options per column for one machine, from Q's setup lines (lines[c] = [{ spread, move }]). */
export function floorsFor(setupLines, setupChecks) {
  const L = Math.floor((B / 100) * setupChecks);
  const kR = kFor(setupLines.flatMap((ls) => ls.map((a) => a.spread)), L);
  const { ks: kS, loud } = loudSplit(setupLines.map((ls) => ls.map((a) => a.spread)), L);
  const kK = kFor(setupLines.flatMap((ls) => ls.map((a) => a.move)), L);
  const opt = (key, k) => (k > 0 ? { [key]: k } : null);
  return {
    L, kR, kS, loud, kK,
    Q: setupLines.map(() => null),
    R: setupLines.map(() => opt('minSpreadRatio', kR)),
    S: kS.map((k) => opt('minSpreadRatio', k)),
    K: setupLines.map(() => opt('minMoveRatio', kK)),
  };
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'smd-data';
  const t0 = Date.now();
  const machines = loadSmd(dir);

  // Pass 1: Quiet on each train half from point 24; lines sent before the half point are the setup lines.
  const jobs1 = [];
  machines.forEach((m, mi) => m.tr.forEach((values, c) => jobs1.push({ mi, c, values, from: FROM, floor: null })));
  const res1 = await runAll(jobs1);
  const setup = machines.map((m) => m.cols.map(() => []));
  jobs1.forEach((j, i) => { setup[j.mi][j.c] = res1[i].alerts.filter((a) => a.at < machines[j.mi].half); });
  const F = machines.map((m, mi) => floorsFor(setup[mi], m.half - FROM));

  // Pass 2: every arm on the null stretch (train, first check at the half point) and on the test half (from 24).
  const jobs2 = [];
  machines.forEach((m, mi) => m.cols.forEach((_, c) => { for (const arm of ARMS) {
    jobs2.push({ mi, c, arm, part: 'null', values: m.tr[c], from: m.half, floor: F[mi][arm][c] });
    jobs2.push({ mi, c, arm, part: 'test', values: m.te[c], from: FROM, floor: F[mi][arm][c] });
  } }));
  const res2 = await runAll(jobs2);
  const got = Object.fromEntries(ARMS.map((a) => [a, { null: machines.map(() => []), test: machines.map(() => []) }]));
  jobs2.forEach((j, i) => { for (const x of res2[i].alerts) got[j.arm][j.part][j.mi].push({ ...x, col: j.c }); });

  const nullChecks = machines.reduce((t, m) => t + (m.nTrain - m.half), 0);
  const nullPer100 = (arm) => (100 * got[arm].null.reduce((t, ls) => t + ls.length, 0)) / nullChecks;
  const linesOf = (arm) => (m) => got[arm].test[machines.indexOf(m)];

  const totalCols = machines.reduce((t, m) => t + m.cols.length, 0);
  console.log(`Round 18: label-free floors on SMD, ${machines.length} servers, ${totalCols} varying metrics, hourly buckets, Quiet, test halves from point ${FROM}.\n`);
  console.log('  machine        cols  setup checks  L   k R    k S (loud columns: own k)        k K   null checks  segments scored');
  machines.forEach((m, mi) => {
    const f = F[mi];
    const sTxt = `${f.kS.find((_, c) => !f.loud.includes(c))?.toFixed(2) ?? '-'}${f.loud.length ? ` (${f.loud.map((c) => `m${m.cols[c] + 1}: ${f.kS[c].toFixed(1)}`).join(', ')})` : ''}`;
    console.log(`  ${m.name.padEnd(14)} ${String(m.cols.length).padStart(4)}  ${String(m.half - FROM).padStart(12)}  ${String(f.L).padStart(2)}  ${f.kR.toFixed(2).padStart(5)}  ${sTxt.padEnd(32)} ${f.kK.toFixed(2).padStart(5)}  ${String(m.nTrain - m.half).padStart(11)}  ${m.wins.filter((w) => w.b >= FROM).length}`);
  });
  const chance = machines.reduce((t, m) => t + m.covered, 0) / machines.reduce((t, m) => t + m.scored, 0);
  console.log(`\n  Chance: ${(100 * chance).toFixed(1)}% of scored test points lie inside a segment window. Null checks: ${nullChecks}.\n`);

  const NAMES = { Q: 'Q  Quiet, no floor', R: 'R  spread floor, one k (round 15)', S: 'S  spread floor, loud split (round 16)', K: 'K  rolling move floor, k read (round 17)' };
  console.log('  arm (28 test halves)                         lines  at a mark (share)  per 1000 checks  segments caught  median delay h  null per 100');
  const T = {};
  for (const arm of ARMS) {
    const t = (T[arm] = score(machines, linesOf(arm)));
    t.null100 = nullPer100(arm);
    console.log(`  ${NAMES[arm].padEnd(44)} ${String(t.alerts).padStart(6)}   ${String(t.atMark).padStart(5)} (${t.share.toFixed(1).padStart(4)}%)   ${t.per1000.toFixed(1).padStart(9)}       ${String(t.caught).padStart(4)}/${t.segs}        ${t.medianDelay === null ? '   -' : String(t.medianDelay).padStart(5)}        ${t.null100.toFixed(2)}`);
  }
  const v = (x) => (x ? 'PASS' : 'FAIL');
  const q = T.Q;
  for (const arm of ['R', 'S', 'K']) {
    const x = T[arm];
    const { parts, pass } = ruleT14(q, x, x.null100);
    console.log(`  T14 ${arm} vs Q: (a) null ${x.null100.toFixed(2)} per 100 vs ${B} ${v(parts[0])}; (b) ${x.caught} vs ${q.caught} - ${Math.floor(0.06 * q.caught)} ${v(parts[1])}; (c) ${x.share.toFixed(1)}% vs ${q.share.toFixed(1)}% ${v(parts[2])}. ${pass ? 'PASSES' : 'FAILS'}.`);
  }

  console.log('\n  Reported only, deciding nothing.\n');
  console.log('  by segment length: caught under 60 minutes / longer');
  for (const arm of ARMS) { const t = T[arm]; console.log(`  ${arm}  ${t.shortCaught}/${t.short}  ${t.caught - t.shortCaught}/${t.segs - t.short}   first line from a metric the interpretation label names: ${t.named}/${t.caught}`); }
  const agree = (m) => {
    const ls = got.Q.test[machines.indexOf(m)].map((a) => ({ ...a, column: a.col }));
    return agreeAlerts(ls, 2, 12).map((a) => ({ ...a, col: a.columns[0] }));
  };
  try {
    const a2 = score(machines, agree);
    const a2null = machines.reduce((t, m, mi) => t + agreeAlerts(got.Q.null[mi].map((a) => ({ ...a, column: a.col })), 2, 12).length, 0);
    console.log(`\n  A2, Q's lines kept when two metrics agree within 12 points (round 13), after the fact: ${a2.alerts} messages, ${a2.share.toFixed(1)}% at a mark, ${a2.caught}/${a2.segs} caught, null ${((100 * a2null) / nullChecks).toFixed(2)} per 100.`);
  } catch (e) { console.log(`\n  A2 not computed: ${e.message}`); }
  console.log('\n  by machine: null lines Q R S K | test lines Q R S K | caught Q R S K');
  machines.forEach((m, mi) => {
    const one = (arm) => score([m], linesOf(arm));
    console.log(`  ${m.name.padEnd(14)} ${ARMS.map((a) => String(got[a].null[mi].length).padStart(4)).join('')} | ${ARMS.map((a) => String(got[a].test[mi].length).padStart(5)).join('')} | ${ARMS.map((a) => String(one(a).caught).padStart(3)).join('')}/${one('Q').segs}`);
  });
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s wall on ${availableParallelism()} cores.`);
}
