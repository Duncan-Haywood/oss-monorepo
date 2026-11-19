// The finish date risk run inside the written review (report.mjs), on real P6 files.
//
//   node eval/review-risk-check.mjs <dir-or-files...> [--runs 300] [--json out.json]
//
// Per file (each project the file's default assessment picks):
// (1) the review built with a risk run carries exactly the base corrections
//     plus riskItems(), the percentiles it prints are the run's own, and the
//     document stays script-free;
// (2) the near-critical correction (off the forecast's driving path, driving
//     the finish in >= 25% of runs) is not sampling noise: a second run with
//     another seed flags the same activities (Jaccard overlap);
// (3) what it adds over the reviewer's usual float filter: the total float
//     the CPM engine gives each flagged activity, and how long a "float under
//     10 working days" list is on the same file.
// The default range (90/100/125%) is used: none of the files carries ranges.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { assess } from "../dcma.mjs";
import { riskAnalysis } from "../risk.mjs";
import { reviewHtml, reviewItems, riskItems, RISK_LIMITS } from "../report.mjs";
import { formatDate } from "../xer.mjs";

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const runs = Number(opt("--runs") || 300);
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--runs", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const out = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const a = assess(xer);
  const t0 = Date.now();
  const r = riskAnalysis(xer, { projId: a.project.id, iterations: runs, seed: 1 });
  const secs = (Date.now() - t0) / 1000;
  const r2 = riskAnalysis(xer, { projId: a.project.id, iterations: runs, seed: 2 });
  const html = reviewHtml(a, null, { risk: r, date: "2026-11-19" });
  const base = reviewItems(a), withRisk = reviewItems(a, null, r), ri = riskItems(r);
  const itemsOk = withRisk.length === base.length + ri.length && ri.every((x) => withRisk.includes(x) || withRisk.some((y) => y.action === x.action));
  const pctOk = r.percentiles.every((q) => html.includes(`<td>P${q.p}</td><td>${formatDate(q.date).slice(0, 10)}</td>`));
  const flag = (x) => new Set(x.activities.filter((y) => !y.deterministicCritical && y.criticality >= RISK_LIMITS.nearCritical).map((y) => y.code));
  const s1 = flag(r), s2 = flag(r2);
  const inter = [...s1].filter((c) => s2.has(c)).length, uni = new Set([...s1, ...s2]).size;
  const fl = new Map(a.activities.map((x) => [x.code, x.totalFloatH === null ? null : x.totalFloatH / x.hoursPerDay]));
  const flaggedFloat = [...s1].map((c) => fl.get(c)).filter((v) => v !== null && v !== undefined).sort((x, y) => x - y);
  const lowFloat = a.activities.filter((x) => x.totalFloatH !== null && x.totalFloatH / x.hoursPerDay < 10).length;
  const row = {
    file: basename(f), project: a.project.code, open: a.project.open, runs, seconds: Math.round(secs * 10) / 10,
    itemsOk, pctOk, noScript: !/<script/i.test(html),
    pForecast: r.pDeterministic, pMust: r.pMustFinish, p80Over: r.percentiles.find((q) => q.p === 80).overDeterministic,
    riskItems: ri.map((x) => `${x.severity}:${/must-finish/.test(x.action) ? "must-finish" : /near-critical/.test(x.action) ? `near-critical(${x.items.length})` : "contingency"}`),
    nearCritical: s1.size, nearCriticalSeed2: s2.size, jaccard: uni ? Math.round((inter / uni) * 1000) / 1000 : null,
    flaggedFloatDays: flaggedFloat.length ? { min: Math.round(flaggedFloat[0] * 10) / 10, median: Math.round(flaggedFloat[flaggedFloat.length >> 1] * 10) / 10, max: Math.round(flaggedFloat.at(-1) * 10) / 10 } : null,
    lowFloatUnder10: lowFloat,
    flaggedInLowFloat: flaggedFloat.filter((v) => v < 10).length,
    reviewKb: Math.round(html.length / 1024),
  };
  out.push(row);
  console.log(JSON.stringify(row));
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 2) + "\n");
