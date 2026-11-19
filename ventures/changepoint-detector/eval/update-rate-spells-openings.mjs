// Pre-registered: SHORT SPELLS UNDER DIFFERENT SERIES OPENINGS. Which line dates a planted spell, and does the
// --spells line a user reads hold up when the series starts somewhere else?
//
// Background (README "Short spells on a second provider", 2026-11-19, eval/update-rate-spells-nyt-why.mjs): NYT's
// Alaska series is month by month almost JHU's, but starts 2020-03-12 instead of 2020-01-22 (JHU's first ~50 days
// are all zeros, all repeats). With the shorter opening the default update-rate line cut both edges of the spell
// (2021-06-04 fewer, 2021-08-01 back to more), so the spell search, which looks INSIDE that line's stretches, had
// nothing left to find. edgeSpellsOf now restates such a pair as a spell. That section's "Next": "plant the same
// spell in series with different openings and count how often it falls to the search, the default line, both, or
// neither." Two things were never measured: (1) whether the combined --spells line (search spells, plus edge
// spells that overlap none of them, as spellsLine prints) dates a spell equally well whatever the opening; (2) the
// edge restatement's false-alarm rate: it shipped with no null check ("it adds no test and no new p"), and on null
// series the default line's own false cut pairs would print as spells.
//
// Written before this file ran on any cell. The module functions are used unchanged: shortSpells (z01 guard, m 3.5)
// and edgeSpellsOf (<= 120 steps), on updateRateChanges with the stale-feed verdict off (`catchUp: { method: null }`,
// as in eval/update-rate-sparse-spells.mjs: it labels a change and never moves a cut).
//
// Schedule model as rounds 1-5 and the spells round: a publishing day repeats with p 0.03, any other day with 0.95;
// step s has weekday s % 7 (0 = Monday) throughout. A series is OPENING + spell (D steps from index S) + the old
// schedule again for 599 - D steps (the post-spell length of eval/update-rate-sparse-spells.mjs, whose series had
// S = 500, N = 1099). OPENINGS (S = steps before the spell):
//   P120, P250, P500, P800: S steps of the base schedule (P500 is the spells round's own series);
//   Z50P250, Z50P500:       a quiet start of 50 steps that repeat with p 0.98 every day (a series that begins with
//                           its zeros, as JHU's does), then 250 / 500 steps of the base schedule (S = 300 / 550).
// SPELL shapes (five, the spells round's cells): W5 base with Wednesdays only for 30 / 60 steps (P1w30, P1w60);
// W5 with Monday/Wednesday/Friday for 30 / 60 (P3w30, P3w60); daily with Monday-Friday for 60 (P5d60).
// NULL shapes (no spell; the same openings; length S + 599): W5, W3, W7 constant, and LAST: W5 with Wednesdays only
// from S to the end (a lasting move to fewer days, not a spell). Any search spell or printed edge spell on a null
// series is false.
// 200 series a cell; cell i draws from makeRng(SEED + 7919 i), cells ordered openings-major (P120..Z50P500), each
// opening's spells then nulls. SEED 20261231 (fresh). One run, no calibration: nothing is chosen.
//
// Per spell series, with S the spell's first repeat indicator (value index S + 1):
//   SEARCH = a shortSpells spell whose first indicator (from - 1) is within 10 steps of S;
//   EDGE   = an edgeSpellsOf spell whose first indicator is within 10 of S (the default line's two cuts);
//   classed as search only, edge only, both, neither. LINE = SEARCH or (EDGE overlapping no search spell): what the
//   --spells line prints. End within 10 steps of S + D is reported, descriptive.
// Bars (all decided on this one run):
//   O1 robustness: for each spell shape, LINE found at every opening is within 30 of 200 of the same shape at P500;
//   O2 every 60-step cell (P1w60, P3w60, P5d60) at every opening: neither <= 20 of 200;
//   O3 every null cell: mean false spells the line prints (search spells + edge spells overlapping no search spell)
//      <= 0.020 a series;
//   O4 every null cell: mean false EDGE spells (printed or not) <= 0.020 a series (the restatement's own budget).
// Descriptive (decides nothing): the share that moves from search to edge as the opening changes, the prediction
// from Alaska being that shorter openings move spells from the search to the default line.
// What follows: O1-O4 pass -> the README says the combined line is robust to the opening and the edge restatement
// is within the spell budget; nothing changes. O3 or O4 fails -> the edge restatement prints false spells and the
// next round pre-registers a guard for it (the z01 rise of the middle stretch over its two neighbours). O1 or O2
// fails -> the README names the openings where the line loses spells; the next round pre-registers a fix.
// Whatever the verdict, nothing the CLI or the page prints changes in this round.
// usage: node eval/update-rate-spells-openings.mjs > eval/update-rate-spells-openings.out.txt   (REPS_SMOKE=n for a smoke run)
import { updateRateChanges, shortSpells, edgeSpellsOf } from '../update-rate.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { valuesFrom } from './update-rate-returns.mjs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';

const SEED = 20261231, TOL = 10, POST = 599, REPS = Number(process.env.REPS_SMOKE) || 200;
const SHIPPED_OPTS = { catchUp: { method: null } };
const on = (...d) => (t) => d.includes(t % 7);
const W1 = on(2), W3 = on(0, 2, 4), W5 = on(0, 1, 2, 3, 4), W7 = () => true;
export const OPENINGS = { P120: [0, 120], P250: [0, 250], P500: [0, 500], P800: [0, 800], Z50P250: [50, 250], Z50P500: [50, 500] };
export const SPELLS = { P1w30: [W5, W1, 30], P1w60: [W5, W1, 60], P3w30: [W5, W3, 30], P3w60: [W5, W3, 60], P5d60: [W7, W5, 60] };
export const NULLS = { W5: [W5, null], W3: [W3, null], W7: [W7, null], LAST: [W5, W1] };
const SIXTY = ['P1w60', 'P3w60', 'P5d60'];

/** One series: { z, S, D } with D 0 for a null. Quiet start repeats every day with p 0.98. */
export function makeSeries(rnd, opening, shape, isNull) {
  const [quiet, pre] = OPENINGS[opening], S = quiet + pre;
  const [base, inside, D0] = isNull ? [...NULLS[shape], 0] : SPELLS[shape];
  const D = isNull ? 0 : D0, n = S + POST;
  const z = [];
  for (let t = 0; t < n; t++) {
    let p;
    if (t < quiet) p = 0.98;
    else if (!isNull && t >= S && t < S + D) p = inside(t) ? 0.03 : 0.95;
    else if (isNull && inside && t >= S) p = inside(t) ? 0.03 : 0.95;
    else p = base(t) ? 0.03 : 0.95;
    z.push(rnd() < p ? 1 : 0);
  }
  return { z, S, D };
}

export const CELLS = Object.keys(OPENINGS).flatMap((o) => [
  ...Object.keys(SPELLS).map((s) => ({ opening: o, shape: s, isNull: false })),
  ...Object.keys(NULLS).map((s) => ({ opening: o, shape: s, isNull: true })),
]);

/** What the --spells line sees on one series: search spells and edge spells, as z-index intervals [a, b). */
export function readSeries(z) {
  const v = valuesFrom(z), u = updateRateChanges(v, SHIPPED_OPTS), days = z.map((_, s) => s % 7);
  const search = shortSpells(v, { days, u }).spells.map((s) => ({ a: s.from - 1, b: s.to }));
  const edge = edgeSpellsOf(u).map((s) => ({ a: s.from - 1, b: s.to }));
  const printedEdge = edge.filter((e) => !search.some((s) => s.a < e.b && e.a < s.b));
  return { search, edge, printedEdge };
}

export function runCell(ci, reps = REPS) {
  const c = CELLS[ci], rnd = makeRng(SEED + 7919 * ci), rows = [];
  for (let r = 0; r < reps; r++) {
    const { z, S, D } = makeSeries(rnd, c.opening, c.shape, c.isNull), x = readSeries(z);
    const at = (q) => Math.abs(q.a - S) <= TOL, end = (q) => Math.abs(q.b - (S + D)) <= TOL;
    rows.push(c.isNull
      ? { falseLine: x.search.length + x.printedEdge.length, falseEdge: x.edge.length }
      : { search: x.search.some(at), edge: x.edge.some(at), line: x.search.some(at) || x.printedEdge.some(at),
        endOk: [...x.search, ...x.printedEdge].some((q) => at(q) && end(q)) });
  }
  return { ...c, rows };
}

function runAll() {
  const W = Math.min(availableParallelism(), CELLS.length), queue = CELLS.map((_, i) => i), res = new Array(CELLS.length);
  return new Promise((done, fail) => {
    let live = 0;
    const next = (w) => {
      if (!queue.length) { w.terminate(); if (--live === 0) done(res); return; }
      w.postMessage({ ci: queue.shift() });
    };
    for (let i = 0; i < W; i++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { openingsWorker: true } });
      live++;
      w.on('message', (msg) => { res[msg.ci] = msg.out; next(w); });
      w.on('error', fail);
      next(w);
    }
  });
}

if (!isMainThread && workerData?.openingsWorker) {
  parentPort.on('message', ({ ci }) => parentPort.postMessage({ ci, out: runCell(ci) }));
} else if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now(), res = await runAll(), ops = Object.keys(OPENINGS);
  const get = (o, s) => res.find((r) => r.opening === o && r.shape === s);
  const cnt = (rows, f) => rows.filter(f).length;
  console.log(`SPELL CELLS, seed ${SEED}, found of ${REPS}: line (search only / edge only / both / neither), end within ${TOL}`);
  const line = {};
  for (const s of Object.keys(SPELLS)) {
    console.log(`\n${s}`);
    for (const o of ops) {
      const R = get(o, s).rows, so = cnt(R, (x) => x.search && !x.edge), eo = cnt(R, (x) => x.edge && !x.search), b = cnt(R, (x) => x.search && x.edge);
      const ne = cnt(R, (x) => !x.search && !x.edge), L = cnt(R, (x) => x.line);
      (line[s] ||= {})[o] = { L, ne };
      console.log(`  ${o.padEnd(8)} line ${String(L).padStart(3)}   search only ${String(so).padStart(3)}  edge only ${String(eo).padStart(3)}  both ${String(b).padStart(3)}  neither ${String(ne).padStart(3)}   end ok ${cnt(R, (x) => x.endOk)}`);
    }
  }
  console.log(`\nNULL CELLS: mean false spells a series, printed by the line / edge spells (printed or not)`);
  let worstLine = 0, worstEdge = 0;
  for (const s of Object.keys(NULLS)) {
    const parts = ops.map((o) => {
      const R = get(o, s).rows, fl = R.reduce((t, x) => t + x.falseLine, 0) / R.length, fe = R.reduce((t, x) => t + x.falseEdge, 0) / R.length;
      worstLine = Math.max(worstLine, fl); worstEdge = Math.max(worstEdge, fe);
      return `${o} ${fl.toFixed(3)}/${fe.toFixed(3)}`;
    });
    console.log(`  ${s.padEnd(5)} ${parts.join('  ')}`);
  }
  const o1 = Object.keys(SPELLS).flatMap((s) => ops.filter((o) => Math.abs(line[s][o].L - line[s].P500.L) > 30).map((o) => `${s} ${o} ${line[s][o].L} vs ${line[s].P500.L}`));
  const o2 = SIXTY.flatMap((s) => ops.filter((o) => line[s][o].ne > 20).map((o) => `${s} ${o} neither ${line[s][o].ne}`));
  console.log(`\nO1 line found within 30 of P500 at every opening: ${o1.length ? `FAIL (${o1.join('; ')})` : 'pass'}`);
  console.log(`O2 60-step cells, neither <= 20 at every opening: ${o2.length ? `FAIL (${o2.join('; ')})` : 'pass'}`);
  console.log(`O3 null cells, printed false spells <= 0.020 (worst ${worstLine.toFixed(3)}): ${worstLine <= 0.02 ? 'pass' : 'FAIL'}`);
  console.log(`O4 null cells, edge false spells <= 0.020 (worst ${worstEdge.toFixed(3)}): ${worstEdge <= 0.02 ? 'pass' : 'FAIL'}`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
