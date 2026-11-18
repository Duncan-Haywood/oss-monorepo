// How often does an in-control process raise at least one signal in Phase I?
// Simulates normal data with no shift at all, computes trial limits from the
// same data (as a first chart does), and counts charts with any signal.
// Run: node bench/false-alarms.mjs [replications]   (prints JSON)
import { analyse, mulberry32, gauss } from "../engine.mjs";

const REPS = Number(process.argv[2]) || 20000;
const SETS = { "rule 1 only": [1], "rules 1 and 2": [1, 2], "rules 1, 2, 5, 6 (Western Electric style)": [1, 2, 5, 6], "all eight Nelson rules": [1, 2, 3, 4, 5, 6, 7, 8] };
const CASES = [
  { type: "xbar-r", k: 25, n: 5 },
  { type: "imr", k: 25, n: 1 },
  { type: "imr", k: 100, n: 1 },
];
const out = { replications: REPS, seed: 2026, cases: [] };
const r = mulberry32(2026);
for (const c of CASES) {
  const sims = Array.from({ length: REPS }, () => Array.from({ length: c.k }, (_, i) => ({ label: String(i + 1), values: Array.from({ length: c.n }, () => gauss(r)) })));
  const row = { chart: c.type, points: c.k, subgroup: c.n, anySignal: {} };
  for (const [name, rules] of Object.entries(SETS)) {
    let hit = 0, loc = 0, disp = 0;
    for (const rows of sims) {
      const res = analyse({ type: c.type, rows, rules });
      if (res.signals.length) hit++;
      if (res.signals.some((s) => s.chart === res.charts[0].name)) loc++;
      if (res.signals.some((s) => s.chart === res.charts[1].name)) disp++;
    }
    const f = (h) => { const p = h / REPS; return { p: +p.toFixed(4), se: +Math.sqrt(p * (1 - p) / REPS).toFixed(4) }; };
    row.anySignal[name] = { either: f(hit), locationChart: f(loc), dispersionChart: f(disp) };
  }
  out.cases.push(row);
}
console.log(JSON.stringify(out, null, 2));
