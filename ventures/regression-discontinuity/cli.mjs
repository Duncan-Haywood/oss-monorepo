#!/usr/bin/env node
// Regression discontinuity from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv --running score --outcome y --cutoff 50 [--treatment took_up] [--json]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, PAPERS } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";

export const HELP = `regression-discontinuity: did crossing a cutoff change the outcome?
(local polynomial RD with Calonico-Cattaneo-Titiunik robust bias-corrected intervals)

Usage:
  node cli.mjs [file | -] --running COL --outcome COL [--cutoff 0] [options]
  node cli.mjs --example        1,000 simulated close elections (true jump 0.04)

Input: a CSV with one row per unit. Treatment is assigned at running >= cutoff.

Options:
  --running COL        the running variable (score, vote margin, age, distance, ...)
  --outcome COL        the outcome
  --cutoff 0           the threshold
  --treatment COL      take-up (0/1) for a fuzzy design: the estimate becomes the
                       jump in the outcome divided by the jump in take-up
  --covariates A,B     columns that should not jump (placebo outcomes)
  --p 1                local polynomial order (0-4)
  --kernel triangular  triangular | epanechnikov | uniform
  --h H                estimation bandwidth (default: MSE-optimal)
  --b B                bias bandwidth (default: MSE-optimal pilot, or h when --h is given)
  --vce nn             variance: nn (3 nearest neighbours) | hc0 | hc1 | hc2 | hc3
  --alpha 0.05         1 - confidence level
  --csv                print the bandwidth sweep as CSV
  --json               print the full JSON result
  --help               this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical output from your data, not legal, tax, financial, medical or policy advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/regression-discontinuity/`;

const FLAGS = { "--running": "running", "--outcome": "outcome", "--cutoff": "cutoff", "--treatment": "treatment", "--covariates": "covariates", "--p": "p", "--kernel": "kernel", "--h": "h", "--b": "b", "--vce": "vce", "--alpha": "alpha" };

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, example: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
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
  if (o.kernel && !["triangular", "epanechnikov", "uniform"].includes(o.kernel)) throw new Error("--kernel must be triangular, epanechnikov or uniform");
  if (o.vce && !["nn", "hc0", "hc1", "hc2", "hc3"].includes(o.vce)) throw new Error("--vce must be nn, hc0, hc1, hc2 or hc3");
  for (const k of ["cutoff", "p", "h", "b", "alpha"]) {
    if (o[k] === undefined) continue;
    const v = Number(o[k]);
    if (!Number.isFinite(v)) throw new Error(`--${k} must be a number`);
    if (k !== "cutoff" && v < 0) throw new Error(`--${k} must not be negative`);
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

export function toCsv(r) {
  return ["h,estimate,robust_estimate,robust_ci_low,robust_ci_high,observations_in_h", ...r.sweep.filter((s) => !s.error).map((s) => [f(s.h, 6), f(s.estimate, 6), f(s.robustEstimate, 6), f(s.ci[0], 6), f(s.ci[1], 6), s.inH].map(csvCell).join(","))].join("\n");
}

export function report(r) {
  const out = [r.summary, ""];
  const lvl = Math.round((1 - r.options.alpha) * 100);
  out.push(`Cutoff ${r.options.cutoff}; observations ${r.n.left} below, ${r.n.right} at or above.`);
  out.push(`Bandwidths: h = ${f(r.bandwidth.h)} (${r.bandwidth.chosen === "mse" ? "MSE-optimal" : "given"}), b = ${f(r.bandwidth.b)}; p = ${r.options.p}, q = ${r.options.q}, kernel ${r.options.kernel}, variance ${r.options.vce}.`);
  out.push("", `${"".padEnd(16)} ${"estimate".padStart(10)} ${"SE".padStart(9)}  ${lvl}% CI`);
  for (const [name, x] of [["Conventional", r.conventional], ["Bias-corrected", r.biasCorrected], ["Robust", r.robust]]) out.push(`${name.padEnd(16)} ${f(x.estimate).padStart(10)} ${f(x.se).padStart(9)}  ${f(x.ci[0])} to ${f(x.ci[1])}`);
  if (r.firstStage) out.push("", `First stage (take-up jump): ${f(r.firstStage.conventional)} (SE ${f(r.firstStage.se)})`);
  out.push("", "Bandwidth sweep (robust CI):");
  for (const s of r.sweep) out.push(s.error ? `  h ${f(s.h)}  ${s.error}` : `  h ${f(s.h).padStart(9)}  estimate ${f(s.estimate).padStart(9)}  CI ${f(s.ci[0])} to ${f(s.ci[1])}  (${s.inH} obs)`);
  out.push("", "Placebo cutoffs (median of each side, that side's data only):");
  for (const q of r.placebo) out.push(q.error ? `  ${q.side} ${f(q.cutoff)}: ${q.error}` : `  ${q.side.padEnd(5)} ${f(q.cutoff).padStart(9)}  estimate ${f(q.estimate)}  p = ${f(q.pValue, 3)}`);
  if (r.balance.length) {
    out.push("", "Covariates (should not jump):");
    for (const q of r.balance) out.push(q.error ? `  ${q.covariate}: ${q.error}` : `  ${q.covariate.padEnd(16)} jump ${f(q.estimate)}  p = ${f(q.pValue, 3)}`);
  }
  if (r.mccrary) out.push("", `Density (McCrary): log difference ${f(r.mccrary.theta, 3)} (SE ${f(r.mccrary.se, 3)}), p = ${f(r.mccrary.pValue, 3)}`);
  out.push(`Counts near the cutoff: ${r.density.map((d) => `within ${f(d.window, 3)}: ${d.below} below, ${d.above} above`).join("; ")}`);
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
    const pick = ["cutoff", "treatment", "covariates", "p", "kernel", "h", "b", "vce", "alpha"].reduce((acc, k) => (o[k] !== undefined ? { ...acc, [k]: o[k] } : acc), {});
    const input = o.example
      ? { ...EXAMPLE_SPEC, csv: EXAMPLE_CSV, ...pick }
      : { csv: o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdin, running: o.running, outcome: o.outcome, ...pick };
    const r = analyze(input);
    if (o.json) return { code: 0, out: JSON.stringify(r, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v), 1) };
    if (o.csv) return { code: 0, out: toCsv(r) };
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
