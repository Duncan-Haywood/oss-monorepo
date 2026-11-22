// node eval/risk-levelled.mjs <dir with .xer files> [--n 100] [--files a,b] [--crew 1,4] [--json out.json]
// The risk run with resource levelling in every run (risk.mjs opts.level)
// on the public P6 files. Per file:
//  1. identity: with every limit x1e6 the levelled run must equal the plain
//     run exactly on the same seed (every percentile, every activity's
//     criticality index): the levelling path adds nothing when nothing is
//     over a limit, and the resource-aware driving path equals cpm's.
//  2. at the file's limits (and each --crew multiple): P10/P50/P80/P90
//     levelled and not, the resource delay run by run (its minimum must be
//     >= 0: levelling only ever adds start floors), the share of runs whose
//     driving path ran through a resource wait, runs where a wait's blocker
//     could not be named, and level.mjs's self-check summed per run (0 h).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer, parseXer } from "../xer.mjs";
import { riskAnalysis } from "../risk.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const n = Number(opt("--n") || 100);
const crews = (opt("--crew") || "1").split(",").map(Number);
const only = opt("--files") ? opt("--files").split(",") : null;
const files = readdirSync(dir).filter((f) => f.endsWith(".xer") && (!only || only.some((o) => f.includes(o)))).sort();
const out = [];
const days = (r) => r.percentiles.map((p) => p.days);
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(join(dir, f))));
  const row = { file: f, n };
  let t = Date.now();
  const plain = riskAnalysis(xer, { iterations: n, seed: 7 });
  row.plainMs = Date.now() - t;
  t = Date.now();
  const big = riskAnalysis(xer, { iterations: n, seed: 7, level: { limitScale: { "*": 1e6 } } });
  row.identityMs = Date.now() - t;
  const crit = (r) => new Map(r.activities.map((a) => [a.code, a.criticality]));
  const c0 = crit(plain), c1 = crit(big);
  const same = [...new Set([...c0.keys(), ...c1.keys()])].filter((k) => c0.get(k) === c1.get(k)).length;
  row.identity = { percentilesEqual: JSON.stringify(days(plain)) === JSON.stringify(days(big)), criticalityEqual: same, of: new Set([...c0.keys(), ...c1.keys()]).size, resourceDelayMax: big.levelling.resourceDelay.p80, plainP: days(plain) };
  row.crews = [];
  for (const crew of crews) {
    t = Date.now();
    const r = riskAnalysis(xer, { iterations: n, seed: 7, level: crew === 1 ? true : { limitScale: { "*": crew } } });
    const L = r.levelling;
    row.crews.push({ crew, ms: Date.now() - t, resources: L.resources, levelledForecastDays: L.finishDays, pLevelledForecast: L.pLevelledFinish, levelled: days(r), unlevelled: L.unlevelled.percentiles.map((p) => p.days), resourceDelay: L.resourceDelay, resourceDriven: L.resourceDriven, pathCut: L.pathCut, leftMax: L.leftMax, selfCheckMax: L.selfCheckMax, topCritical: r.activities.slice(0, 5).map((a) => `${a.code} ${a.criticality}`) });
  }
  out.push(row);
  console.log(JSON.stringify(row));
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 1) + "\n");
