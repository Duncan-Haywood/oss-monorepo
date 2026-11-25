#!/usr/bin/env node
// Propensity score analysis from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv --treatment trained --outcome earnings --covariates age,educ [--json]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, PAPERS } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";

export const HELP = `propensity-score: what did the treatment do, once we account for who chose it?
(propensity score weighting, regression adjustment, doubly robust AIPW and matching)

Usage:
  node cli.mjs [file | -] --treatment COL --outcome COL --covariates A,B,C [options]
  node cli.mjs --example        2,000 simulated job-training records (true ATE 1.333, ATT 1.644)

Input: a CSV with one row per unit: a 0/1 (or yes/no) treatment column, a numeric
outcome, and covariates measured before treatment. Text covariates become indicators.

Options:
  --treatment COL      the 0/1 treatment indicator
  --outcome COL        the outcome
  --covariates A,B     pre-treatment columns that drive both treatment and outcome
  --estimand ate       ate (everyone) | att (the treated) | atc (the controls);
                       chooses the weights for the balance table and the lead estimate
  --trim none          none | crump (drop scores outside 0.1-0.9) | a number a
                       (drop scores outside [a, 1 - a]); the model is refitted after
  --caliper 0.2        matching caliper in SDs of the logit score (0: none)
  --no-replace         match without replacement (greedy) instead of with
  --alpha 0.05         1 - confidence level
  --csv                print the estimates table as CSV
  --scores             print each row's propensity score and weight as CSV
  --json               print the full JSON result
  --help               this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical output from your data, not legal, tax, financial, medical or policy advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/propensity-score/`;

const FLAGS = { "--treatment": "treatment", "--outcome": "outcome", "--covariates": "covariates", "--estimand": "estimand", "--trim": "trim", "--caliper": "caliper", "--alpha": "alpha" };

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, scores: false, example: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--scores") o.scores = true;
    else if (a === "--no-replace") o.replace = false;
    else if (a === "--example") o.example = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (FLAGS[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[FLAGS[a]] = argv[++i];
    } else if (a.startsWith("--") && a.includes("=") && FLAGS[a.slice(0, a.indexOf("="))]) o[FLAGS[a.slice(0, a.indexOf("="))]] = a.slice(a.indexOf("=") + 1);
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}; see --help`);
    else if (o.file === null) o.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (o.estimand && !["ate", "att", "atc"].includes(o.estimand.toLowerCase())) throw new Error("--estimand must be ate, att or atc");
  for (const k of ["caliper", "alpha"]) {
    if (o[k] === undefined) continue;
    const v = Number(o[k]);
    if (!Number.isFinite(v) || v < 0) throw new Error(`--${k} must be a non-negative number`);
    o[k] = v;
  }
  return o;
}

const f = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : "");
// Spreadsheet formula-injection guard: a text cell starting =, +, -, @, tab or CR
// gets an apostrophe; plain numbers (including negatives) are left alone.
export function csvCell(c) {
  let s = String(c);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const METHODS = [["naive", "Difference in means (no adjustment)"], ["ipw", "Inverse probability weighting"], ["ra", "Regression adjustment"], ["aipw", "Doubly robust (AIPW)"], ["match", "Nearest-neighbour matching"]];

export function rowsOf(r) {
  const rows = [{ ...r.naive, estimand: "none", method: "naive" }];
  for (const e of ["ate", "att", "atc"]) for (const [m] of METHODS.slice(1)) { const x = r.estimates[e][m]; if (x) rows.push({ ...x, estimand: e, method: m }); }
  return rows;
}

export function toCsv(r) {
  return ["estimand,method,estimate,se,ci_low,ci_high,p_value,mean_control,mean_treated,error", ...rowsOf(r).map((x) => [x.estimand, x.method, f(x.estimate, 6), f(x.se, 6), f(x.ci?.[0], 6), f(x.ci?.[1], 6), f(x.pValue, 6), f(x.pom0, 6), f(x.pom1, 6), x.error || ""].map(csvCell).join(","))].join("\n");
}

export function report(r) {
  const out = [r.summary, ""];
  const lvl = Math.round((1 - r.options.alpha) * 100);
  out.push(`Units: ${r.n.treated} treated, ${r.n.control} control.${r.trimmed?.dropped ? ` Trimmed ${r.trimmed.dropped} outside [${r.trimmed.bounds.map((v) => f(v, 2)).join(", ")}].` : ""}`);
  out.push("", "Propensity model (logistic):");
  r.propensityModel.terms.forEach((t, i) => out.push(`  ${t.padEnd(24)} ${f(r.propensityModel.coefficients[i]).padStart(10)}  SE ${f(r.propensityModel.se[i])}`));
  out.push("", `${"Estimand / method".padEnd(40)} ${"estimate".padStart(10)} ${"SE".padStart(9)}  ${lvl}% CI`);
  const label = Object.fromEntries(METHODS);
  for (const x of rowsOf(r)) {
    const name = `${x.estimand === "none" ? "" : x.estimand.toUpperCase() + " "}${label[x.method]}`;
    out.push(x.error ? `${name.padEnd(40)} ${x.error}` : `${name.padEnd(40)} ${f(x.estimate).padStart(10)} ${f(x.se).padStart(9)}  ${f(x.ci[0])} to ${f(x.ci[1])}`);
  }
  out.push("", `Balance under the ${r.options.estimand.toUpperCase()} weights (standardised mean difference; |SMD| > 0.1 flagged):`);
  for (const b of r.balance.weighted) out.push(`  ${b.name.padEnd(24)} before ${f(b.smdBefore, 3).padStart(7)}  after ${f(b.smdAfter, 3).padStart(7)}${Math.abs(b.smdAfter) > 0.1 ? "  <-- imbalanced" : ""}`);
  if (r.balance.matched) {
    out.push(`Balance after matching (${r.balance.matchedFor.toUpperCase()}):`);
    for (const b of r.balance.matched) out.push(`  ${b.name.padEnd(24)} after ${f(b.smdAfter, 3).padStart(7)}${Math.abs(b.smdAfter) > 0.1 ? "  <-- imbalanced" : ""}`);
  }
  const ov = r.overlap;
  out.push("", `Overlap: treated scores ${f(ov.treatedSummary.min, 3)} to ${f(ov.treatedSummary.max, 3)} (median ${f(ov.treatedSummary.median, 3)}), controls ${f(ov.controlSummary.min, 3)} to ${f(ov.controlSummary.max, 3)} (median ${f(ov.controlSummary.median, 3)}); ${ov.outsideCommonSupport} outside the common range.`);
  out.push(`Effective sample size under the weights: ${f(r.effectiveSampleSize.treated, 1)} treated, ${f(r.effectiveSampleSize.control, 1)} control.`);
  if (r.notes.length) out.push("", ...r.notes.map((n) => `Note: ${n}`));
  return out.join("\n");
}

export function run(argv, stdin = "") {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: "", err: `${e.message}\n` };
  }
  if (o.help) return { code: 0, out: HELP };
  try {
    const pick = ["treatment", "outcome", "covariates", "estimand", "trim", "caliper", "replace", "alpha"].reduce((acc, k) => (o[k] !== undefined ? { ...acc, [k]: o[k] } : acc), {});
    const input = o.example ? { ...EXAMPLE_SPEC, csv: EXAMPLE_CSV, ...pick } : { csv: o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdin, ...pick };
    const r = analyze(input);
    if (o.json) return { code: 0, out: JSON.stringify(r, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v), 1) };
    if (o.csv) return { code: 0, out: toCsv(r) };
    if (o.scores) return { code: 0, out: ["row,treated,propensity_score", ...r.scores.map((p, i) => `${i + 1},${r.treated[i]},${f(p, 6)}`)].join("\n") };
    return { code: 0, out: report(r) };
  } catch (e) {
    return { code: 1, out: "", err: `${e.message}\n` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const hasFile = argv.some((a, i) => !a.startsWith("--") && !Object.keys(FLAGS).includes(argv[i - 1]) && a !== "-");
  const needsStdin = !argv.includes("--example") && !argv.includes("--help") && !argv.includes("-h") && !hasFile;
  const stdin = needsStdin ? readFileSync(0, "utf8") : "";
  const r = run(argv, stdin);
  if (r.out) process.stdout.write(r.out + "\n");
  if (r.err) process.stderr.write(r.err);
  process.exitCode = r.code;
}
