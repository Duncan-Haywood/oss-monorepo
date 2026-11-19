// Monte Carlo finish-date risk (risk.mjs) on real P6 files.
//
//   node eval/risk-check.mjs <dir-or-files...> [--runs 500] [--json out.json]
//
// Per file: (1) a zero-width range (every draw = the file's duration) must give
// the recomputed CPM finish in every run, so the sampled engine is the same
// engine that matches P6; (2) the default range (90/100/125%) independent and
// with correlation 0.3: P10/P50/P80/P90 against the forecast, the chance of the
// forecast and must-finish dates, how many activities were ever on the driving
// path, and the time taken.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, formatDate } from "../xer.mjs";
import { riskAnalysis } from "../risk.mjs";

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const runs = Number(opt("--runs") || 500);
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--runs", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const out = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const zero = riskAnalysis(xer, { iterations: 10, range: { min: 1, likely: 1, max: 1 } });
  const exact = zero.percentiles.every((q) => q.date === zero.project.finish);
  const row = { file: basename(f), varied: zero.varied, forecast: formatDate(zero.project.finish), forecastDays: zero.project.finishDays, zeroWidthExact: exact, cases: [] };
  for (const correlation of [0, 0.3]) {
    const t0 = Date.now();
    const r = riskAnalysis(xer, { iterations: runs, correlation });
    const ms = Date.now() - t0;
    const q = Object.fromEntries(r.percentiles.map((x) => [`P${x.p}`, x.overDeterministic]));
    row.cases.push({ correlation, ...q, pForecast: r.pDeterministic, pMustFinish: r.pMustFinish, everCritical: r.activities.filter((a) => a.criticality > 0).length, forecastPath: r.activities.filter((a) => a.deterministicCritical).length, nearCritical: r.activities.filter((a) => !a.deterministicCritical && a.criticality >= 0.1).length, seconds: Math.round(ms / 100) / 10 });
  }
  out.push(row);
  console.log(JSON.stringify(row));
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ runs, files: out }, null, 2) + "\n");
console.log("DONE");
