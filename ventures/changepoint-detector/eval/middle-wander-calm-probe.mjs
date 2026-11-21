// Probe (decides nothing; eval/middle-wander-calm.prereg.md): variants of the count wander gate replayed daily on probe
// seeds 9901-9908 (not reused by the round). Cells: the calm simulated Search Console sites where the shipped gate lost
// falls (cv 0.15, base 50 and 400, 10% and 20% falls; eval/middle-wander.out.txt) and set 3's T4, T5, T6.
//   NSEEDS=16 node eval/middle-wander-calm-probe.mjs > eval/middle-wander-calm-probe.out.txt
//   PROBE=3 NSEEDS=16 node eval/middle-wander-calm-probe.mjs > eval/middle-wander-calm-probe3.out.txt (M, W, S)
//   PROBE=2 NSEEDS=16 node eval/middle-wander-calm-probe.mjs > eval/middle-wander-calm-probe2.out.txt
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { replayWatch, COUNT_MIDDLE } from '../watch-core.mjs';
import { CELLS3, series3 } from './middle-trend-sets.mjs';
import { FROM, labels, AT, series as gsc } from './gsc-sites.mjs';

export const VARIANTS = {
  M: { ...COUNT_MIDDLE },
  W: { ...COUNT_MIDDLE, wander: 'gated', wanderBefore: false },
  A2: { ...COUNT_MIDDLE, wander: 'gated', wanderBefore: false, wanderMargin: 2 },
  A3: { ...COUNT_MIDDLE, wander: 'gated', wanderBefore: false, wanderMargin: 3 },
  J1: { ...COUNT_MIDDLE, wander: 'gated', wanderBefore: false, wanderJump: 1 },
  T1: { ...COUNT_MIDDLE, wander: 'gated', wanderBefore: false, wanderTest: 1 },
  T05: { ...COUNT_MIDDLE, wander: 'gated', wanderBefore: false, wanderTest: 0.5 },
  H60: { ...COUNT_MIDDLE, wander: 'gated', wanderBefore: 60 },
  S: { ...COUNT_MIDDLE, wander: 'gated', wanderBefore: false, wanderSplit: true },
};
// PROBE=2 runs the second probe (M, W and the gate decided before the newest change), PROBE=3 the third (M, W and the
// gate decided with a given jump at the newest change), on the same seeds.
if (process.env.PROBE === '2') for (const k of ['A2', 'A3', 'J1', 'T1', 'T05']) delete VARIANTS[k];
else if (process.env.PROBE === '3') for (const k of ['A2', 'A3', 'J1', 'T1', 'T05', 'H60']) delete VARIANTS[k];
else { delete VARIANTS.H60; delete VARIANTS.S; }
const SEEDS = Array.from({ length: Number(process.env.NSEEDS ?? 8) }, (_, i) => 9901 + i);
const CELLS = [
  ...[50, 400].flatMap((base) => [0.1, 0.2].map((fall) => ({ id: `gsc ${base} ${fall}`, fall: true, gen: (s) => gsc(s, base, fall, 0.15) }))),
  ...CELLS3.filter((c) => ['T4', 'T5', 'T6'].includes(c.key)).map((c) => ({ id: c.key, fall: !!c.fall, gen: (s) => series3(c, s) })),
];

function run({ cell, seed }) {
  const c = CELLS.find((x) => x.id === cell), v = c.gen(seed), out = {};
  for (const [a, o] of Object.entries(VARIANTS)) {
    const r = replayWatch(v, labels, { model: 'poisson', ...o, from: FROM, step: 1, budget: Infinity });
    let got = null, other = 0;
    for (const x of r.alerts) {
      const idx = labels.indexOf(String(x.label));
      if (c.fall && Math.abs(idx - AT) <= 7 && x.reportedAt >= AT) { if (got == null) got = x.reportedAt - AT; } else other++;
    }
    out[a] = { alerts: r.alerts.length, other, heard: got != null, unaware: c.fall ? (got ?? labels.length - AT) : null };
  }
  return { cell, seed, out };
}

if (!isMainThread) parentPort.postMessage(run(workerData));
else {
  const t0 = Date.now(), jobs = CELLS.flatMap((c) => SEEDS.map((seed) => ({ cell: c.id, seed }))), res = [];
  await Promise.all(Array.from({ length: availableParallelism() }, async () => {
    while (jobs.length) { const j = jobs.shift(); res.push(await new Promise((ok, bad) => { const w = new Worker(new URL(import.meta.url), { workerData: j }); w.once('message', ok); w.once('error', bad); })); process.stderr.write(`${j.cell} ${j.seed} ${((Date.now() - t0) / 1000).toFixed(0)} s\n`); }
  }));
  const A = Object.keys(VARIANTS);
  console.log(`Probe seeds ${SEEDS[0]}-${SEEDS.at(-1)}. Fall cells: heard / mean days unaware / other alerts. Wander cells: alerts (series alerted).`);
  console.log(`| cell | ${A.join(' | ')} |\n|---|${A.map(() => '---|').join('')}`);
  for (const c of CELLS) {
    const rows = res.filter((r) => r.cell === c.id);
    const f = (a) => c.fall && c.id.startsWith('gsc')
      ? `${rows.filter((r) => r.out[a].heard).length} / ${(rows.reduce((t, r) => t + r.out[a].unaware, 0) / rows.length).toFixed(1)} / ${rows.reduce((t, r) => t + r.out[a].other, 0)}`
      : c.fall ? `${rows.filter((r) => r.out[a].heard).length} heard, ${rows.reduce((t, r) => t + r.out[a].other, 0)} other`
      : `${rows.reduce((t, r) => t + r.out[a].alerts, 0)} (${rows.filter((r) => r.out[a].alerts).length})`;
    console.log(`| ${c.id} | ${A.map(f).join(' | ')} |`);
  }
  console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
