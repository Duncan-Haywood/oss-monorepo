// POST HOC, deciding nothing: why eval/update-rate-spells-openings.mjs failed O1 on P3w30 and O2 on P5d60.
//
// Read after that round's output: the openings changed the spell's first weekday as well as the history before it
// (S % 7 = 1, 5, 3, 2, 6, 4 for P120, P250, P500, P800, Z50P250, Z50P500). A Monday/Wednesday/Friday spell inside
// Monday-Friday differs from its neighbours only on Tuesdays and Thursdays; 30 days hold 9 of them when the spell
// starts Tuesday, Wednesday or Thursday and 8 otherwise. The three O1 failures are the three openings whose spells
// start Friday, Saturday or Sunday (8). This script holds the opening at P500 and moves only the first weekday:
// S = 500..506, the same cells, a fresh seed (20270101), 200 series a cell, and prints found against the count of
// informative days inside the spell (days where the spell's schedule and the base schedule differ).
// usage: node eval/update-rate-spells-openings-why.mjs > eval/update-rate-spells-openings-why.out.txt
import { makeRng } from './update-rate-sim.mjs';
import { readSeries, SPELLS } from './update-rate-spells-openings.mjs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';

const SEED = 20270101, TOL = 10, POST = 599, REPS = Number(process.env.REPS_SMOKE) || 200, NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELLS = ['P3w30', 'P5d60', 'P1w60', 'P3w60'].flatMap((shape) => [0, 1, 2, 3, 4, 5, 6].map((k) => ({ shape, S: 500 + k })));

function runCell(ci) {
  const { shape, S } = CELLS[ci], [base, inside, D] = SPELLS[shape], rnd = makeRng(SEED + 7919 * ci);
  let found = 0, neither = 0;
  for (let r = 0; r < REPS; r++) {
    const z = [];
    for (let t = 0; t < S + POST; t++) z.push(rnd() < ((t >= S && t < S + D ? inside(t) : base(t)) ? 0.03 : 0.95) ? 1 : 0);
    const x = readSeries(z), at = (q) => Math.abs(q.a - S) <= TOL;
    if (x.search.some(at) || x.printedEdge.some(at)) found++;
    if (!x.search.some(at) && !x.edge.some(at)) neither++;
  }
  let informative = 0;
  for (let t = S; t < S + D; t++) if (inside(t) !== base(t)) informative++;
  return { shape, S, informative, found, neither };
}

if (!isMainThread && workerData?.whyWorker) {
  parentPort.on('message', ({ ci }) => parentPort.postMessage({ ci, out: runCell(ci) }));
} else if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now(), res = new Array(CELLS.length), queue = CELLS.map((_, i) => i);
  await new Promise((done, fail) => {
    let live = 0;
    const next = (w) => { if (!queue.length) { w.terminate(); if (--live === 0) done(); return; } w.postMessage({ ci: queue.shift() }); };
    for (let i = 0; i < Math.min(availableParallelism(), CELLS.length); i++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { whyWorker: true } });
      live++; w.on('message', (m) => { res[m.ci] = m.out; next(w); }); w.on('error', fail); next(w);
    }
  });
  console.log(`POST HOC, seed ${SEED}, opening P500 with the spell's first step moved over one week; found of ${REPS} by the --spells line`);
  for (const shape of [...new Set(CELLS.map((c) => c.shape))]) {
    console.log(`\n${shape}`);
    for (const r of res.filter((x) => x.shape === shape)) {
      console.log(`  S ${r.S} (starts ${NAMES[r.S % 7]})  informative days ${String(r.informative).padStart(2)}  found ${String(r.found).padStart(3)}  neither ${String(r.neither).padStart(3)}`);
    }
  }
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
