// A real gauge study on a stopwatch: how well do three ways of timing a
// JavaScript function measure "microseconds per call"?
//   parts     = 10 workloads (sorting a copy of a Float64Array of 400 to 4,000 numbers)
//   operators = 3 timing harnesses
//   trials    = 3 readings per harness per workload, in shuffled order
// Run: node eval/benchmark-study.mjs > data/benchmark-timing.csv
import { performance } from "node:perf_hooks";

let seed = 7;
const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
const sizes = Array.from({ length: 10 }, (_, i) => 400 * (i + 1));
const inputs = sizes.map((n) => Float64Array.from({ length: n }, rnd));
const work = (j) => { const a = inputs[j].slice(); a.sort(); return a[0]; };
let sink = 0;

const harnesses = {
  // One call between two performance.now() readings.
  single: (j) => { const t = performance.now(); sink += work(j); return (performance.now() - t) * 1000; },
  // 50 calls in a loop, total time divided by 50.
  loop50: (j) => { const t = performance.now(); for (let i = 0; i < 50; i++) sink += work(j); return ((performance.now() - t) * 1000) / 50; },
  // Median of 15 single-call readings from process.hrtime.bigint().
  median15: (j) => {
    const v = [];
    for (let i = 0; i < 15; i++) { const t = process.hrtime.bigint(); sink += work(j); v.push(Number(process.hrtime.bigint() - t) / 1000); }
    v.sort((a, b) => a - b);
    return v[7];
  },
};

// Warm up every workload so the JIT has settled before the study starts.
for (let r = 0; r < 200; r++) for (let j = 0; j < sizes.length; j++) sink += work(j);

const runs = [];
for (const h of Object.keys(harnesses)) for (let j = 0; j < sizes.length; j++) for (let t = 1; t <= 3; t++) runs.push({ h, j, t });
for (let i = runs.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [runs[i], runs[k]] = [runs[k], runs[i]]; }
const out = runs.map((r) => ({ ...r, us: harnesses[r.h](r.j) }));
out.sort((a, b) => a.h.localeCompare(b.h) || a.j - b.j || a.t - b.t);
console.log("part,operator,trial,measurement");
for (const r of out) console.log(`sort-${sizes[r.j]},${r.h},${r.t},${r.us.toFixed(3)}`);
if (sink === 42) console.error("");
