// Benchmark vrptw.mjs on the 56 Solomon VRPTW instances (100 customers),
// against the best-known solutions (BKS) under the DIMACS convention:
// distances and travel times are Euclidean truncated to one decimal, the
// objective is total distance, and the fleet is capped at the instance's
// vehicle count.
//
// Instances and BKS: github.com/PyVRP/Instances (MIT), VRPTW/Solomon/*.vrp and
// *.sol, which take the BKS from CVRPLIB. They are not committed here; fetch:
//
//   B=https://raw.githubusercontent.com/PyVRP/Instances/main/VRPTW/Solomon
//   mkdir -p /tmp/solomon && for n in C101 ... RC208; do
//     curl -sfo /tmp/solomon/$n.vrp $B/$n.vrp; curl -sfo /tmp/solomon/$n.sol $B/$n.sol; done
//
// Run: node eval/solomon.mjs DIR [--iterations N] [--seeds 1,2] [--only C101,R101]
//      [--jobs 4] [--json out.json]
// Every BKS route set is re-scored by verify() first: its distance must equal
// the file's Cost line, or the script stops (wrong reader or convention).
// Every solver plan is checked by verify() as well; an infeasible one fails.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cpus } from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { solve, verify } from "../vrptw.mjs";

export function parseVrplib(text) {
  const lines = text.split(/\r?\n/);
  const head = {};
  let section = null;
  const coords = [], demand = [], tw = [], service = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line === "EOF") continue;
    const m = line.match(/^([A-Z_]+)\s*:\s*(.*)$/);
    if (m) { head[m[1]] = m[2].trim(); section = null; continue; }
    if (/_SECTION$/.test(line)) { section = line; continue; }
    const f = line.split(/\s+/).map(Number);
    if (section === "NODE_COORD_SECTION") coords[f[0] - 1] = [f[1], f[2]];
    else if (section === "DEMAND_SECTION") demand[f[0] - 1] = f[1];
    else if (section === "TIME_WINDOW_SECTION") tw[f[0] - 1] = [f[1], f[2]];
    else if (section === "SERVICE_TIME_SECTION") service[f[0] - 1] = f[1];
  }
  const n = coords.length;
  const dist = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const d = Math.hypot(coords[i][0] - coords[j][0], coords[i][1] - coords[j][1]);
    dist[i * n + j] = Math.floor(d * 10) / 10;
  }
  const st = Number(head.SERVICE_TIME || 0);
  return {
    name: head.NAME,
    n,
    dist,
    time: dist,
    service: Array.from({ length: n }, (_, i) => (i === 0 ? 0 : service[i] ?? st)),
    ready: tw.map((w) => w[0]),
    due: tw.map((w) => w[1]),
    demand: Array.from({ length: n }, (_, i) => demand[i] ?? 0),
    capacity: Number(head.CAPACITY),
    maxVehicles: Number(head.VEHICLES || Infinity),
  };
}

export function parseSol(text) {
  const routes = [];
  let cost = null;
  for (const line of text.split(/\r?\n/)) {
    const r = line.match(/^Route\s*#\d+\s*:\s*(.*)$/i);
    if (r) routes.push(r[1].trim().split(/\s+/).filter(Boolean).map(Number));
    const c = line.match(/^Cost\s+([\d.]+)/i);
    if (c) cost = Number(c[1]);
  }
  return { routes, cost };
}

function runOne({ dir, name, iterations, seed }) {
  const inst = parseVrplib(readFileSync(join(dir, name + ".vrp"), "utf8"));
  const bks = parseSol(readFileSync(join(dir, name + ".sol"), "utf8"));
  const check = verify(inst, bks.routes);
  const bksOk = check.ok && check.served === inst.n - 1 && Math.abs(check.distance - bks.cost) < 0.05;
  const t = performance.now();
  const res = solve(inst, { iterations, seed });
  const ms = performance.now() - t;
  const v = verify(inst, res.routes);
  return {
    name, seed, iterations, ms: Math.round(ms),
    bks: bks.cost, bksVehicles: bks.routes.length, bksRecomputed: Math.round(check.distance * 10) / 10, bksOk,
    distance: Math.round(res.distance * 10) / 10, vehicles: res.vehicles, missing: res.missing.length,
    feasible: v.ok && v.served === inst.n - 1,
    gapPct: Math.round(((res.distance - bks.cost) / bks.cost) * 1e4) / 100,
    start: Math.round(res.startDistance * 10) / 10,
  };
}

if (!isMainThread) {
  parentPort.on("message", (job) => parentPort.postMessage(runOne(job)));
} else if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const dir = args[0];
  const iterations = Number(opt("--iterations", 50000));
  const seeds = opt("--seeds", "1").split(",").map(Number);
  const only = opt("--only", "");
  const jobsN = Number(opt("--jobs", Math.max(1, cpus().length)));
  const out = opt("--json", "");
  let names = readdirSync(dir).filter((f) => f.endsWith(".vrp")).map((f) => f.slice(0, -4)).sort();
  if (only) names = names.filter((x) => only.split(",").includes(x));
  const jobs = [];
  for (const name of names) for (const seed of seeds) jobs.push({ dir, name, iterations, seed });
  const results = [];
  const workers = Array.from({ length: Math.min(jobsN, jobs.length) }, () => new Worker(new URL(import.meta.url)));
  await new Promise((resolve) => {
    let next = 0, done = 0;
    const feed = (w) => { if (next < jobs.length) w.postMessage(jobs[next++]); };
    for (const w of workers) {
      w.on("message", (r) => {
        results.push(r);
        console.log(`${r.name.padEnd(6)} seed ${r.seed}  ${String(r.distance).padStart(8)} vs BKS ${String(r.bks).padStart(8)}  gap ${r.gapPct.toFixed(2).padStart(6)}%  veh ${r.vehicles}/${r.bksVehicles}  ${r.feasible ? "feasible" : "INFEASIBLE"}${r.bksOk ? "" : "  BKS-MISMATCH " + r.bksRecomputed}  ${(r.ms / 1000).toFixed(1)}s`);
        if (++done === jobs.length) resolve(); else feed(w);
      });
      feed(w);
    }
  });
  for (const w of workers) w.terminate();
  results.sort((a, b) => a.name.localeCompare(b.name) || a.seed - b.seed);
  const bad = results.filter((r) => !r.bksOk || !r.feasible);
  const fam = {};
  for (const r of results) {
    const f = r.name.replace(/\d+$/, "").replace(/(\D+)/, "$1") + r.name.match(/\d/)[0];
    (fam[f] ||= []).push(r.gapPct);
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  console.log("\nfamily  runs  mean gap  worst gap");
  for (const [f, g] of Object.entries(fam)) console.log(`${f.padEnd(6)} ${String(g.length).padStart(5)}  ${mean(g).toFixed(2).padStart(7)}%  ${Math.max(...g).toFixed(2).padStart(8)}%`);
  const all = results.map((r) => r.gapPct);
  console.log(`all    ${String(all.length).padStart(5)}  ${mean(all).toFixed(2).padStart(7)}%  ${Math.max(...all).toFixed(2).padStart(8)}%`);
  console.log(`at or below BKS: ${results.filter((r) => r.gapPct <= 0.005).length} of ${results.length}; mean time ${(mean(results.map((r) => r.ms)) / 1000).toFixed(1)} s`);
  if (out) writeFileSync(out, JSON.stringify({ iterations, seeds, results }, null, 1));
  if (bad.length) { console.error(`FAIL: ${bad.length} run(s) infeasible or BKS mismatch`); process.exit(1); }
}
