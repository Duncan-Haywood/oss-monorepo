#!/usr/bin/env node
// Synthetic control from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs panel.csv --unit state --time year --outcome sales --treated California --at 1989 [--json]
import { readFileSync } from "node:fs";
import { analyze, PAPERS } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";

export const HELP = `synthetic-control: did an intervention change one unit's outcome? (Abadie et al. synthetic control)

Usage:
  node cli.mjs [file | -] --unit COL --time COL --outcome COL --treated NAME --at TIME [options]
  node cli.mjs --example        the West German reunification study (Abadie, Diamond & Hainmueller 2015)

Input: a long panel CSV, one row per unit and period (for example state,year,sales,price).
Times must be numbers (years, or period indices).

Options:
  --unit COL           column naming each unit (state, country, store, ...)
  --time COL           column holding the period
  --outcome COL        the outcome the intervention may have changed
  --treated NAME       the unit that got the intervention
  --at TIME            the first period the intervention could affect
  --covariates A,B     predictor columns, averaged over the pre-period (default: none; the
                       pre-period outcome path itself is matched)
  --donors A,B         the comparison pool (default: every other unit with complete outcome data)
  --v nested           how predictor weights V are chosen: nested (minimise pre-period outcome
                       error, as in Synth) | cv (train on the first half of the pre-period,
                       validate on the second; Abadie et al. 2015) | equal
  --pre-filter 5       placebo screen: drop placebos whose pre-period MSPE is over this
                       multiple of the treated unit's (0 keeps all)
  --no-placebo         skip the placebo-in-space runs
  --no-loo             skip the leave-one-out runs
  --csv                print the time series (treated, synthetic, gap) as CSV
  --json               print the full JSON result
  --help               this text

The summary gives the donor weights, pre-period fit, the average post-period gap, the
placebo permutation p-value and how much the estimate moves when each donor is dropped.

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical output from your data, not legal, tax, financial, medical or policy advice. No warranty. MIT licence.
Web version: https://marisstella.app/synthetic-control/`;

const FLAGS = { "--unit": "unit", "--time": "time", "--outcome": "outcome", "--treated": "treated", "--at": "treatmentTime", "--covariates": "covariates", "--donors": "donors", "--v": "vMethod", "--pre-filter": "preFilter" };

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, example: false, placebo: true, leaveOneOut: true, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--example") o.example = true;
    else if (a === "--no-placebo") o.placebo = false;
    else if (a === "--no-loo") o.leaveOneOut = false;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (FLAGS[a]) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[FLAGS[a]] = argv[++i];
    } else if (a.startsWith("--") && a.includes("=") && FLAGS[a.slice(0, a.indexOf("="))]) o[FLAGS[a.slice(0, a.indexOf("="))]] = a.slice(a.indexOf("=") + 1);
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}; see --help`);
    else if (o.file === null) o.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  for (const k of ["covariates", "donors"]) if (typeof o[k] === "string") o[k] = o[k].split(",").map((s) => s.trim()).filter(Boolean);
  if (o.vMethod && !["nested", "cv", "equal"].includes(o.vMethod)) throw new Error("--v must be nested, cv or equal");
  return o;
}

const q = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "");

export function toCsv(r) {
  return ["time,treated,synthetic,gap", ...r.series.map((s) => [s.time, f(s.treated, 6), f(s.synthetic, 6), f(s.gap, 6)].join(","))].join("\n");
}

export function report(r) {
  const out = [r.summary, ""];
  out.push("Donor weights:");
  for (const w of r.weights.filter((x) => x.weight >= 0.001)) out.push(`  ${(100 * w.weight).toFixed(1).padStart(5)}%  ${w.unit}`);
  out.push("", `Predictor balance (V = importance${r.vMethod === "cv" ? ", cross-validated" : ""}):`);
  out.push(`  ${"predictor".padEnd(28)} ${"treated".padStart(11)} ${"synthetic".padStart(11)} ${"donor mean".padStart(11)} ${"V".padStart(6)}`);
  for (const b of r.balance) out.push(`  ${b.predictor.slice(0, 28).padEnd(28)} ${f(b.treated).padStart(11)} ${f(b.synthetic).padStart(11)} ${f(b.donorMean).padStart(11)} ${f(b.v, 3).padStart(6)}`);
  if (r.placebo) {
    out.push("", "Placebo runs (post/pre RMSPE ratio, largest first):");
    const rows = [{ unit: `${r.treated} (treated)`, ratio: r.ratio, preRMSPE: r.preRMSPE }, ...r.placebo.runs.filter((x) => Number.isFinite(x.ratio))].sort((a, b) => b.ratio - a.ratio);
    for (const p of rows) out.push(`  ${f(p.ratio).padStart(8)}  pre RMSPE ${f(p.preRMSPE).padStart(10)}  ${p.unit}`);
  }
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
    const input = o.example
      ? { ...EXAMPLE_SPEC, csv: EXAMPLE_CSV, placebo: o.placebo, leaveOneOut: o.leaveOneOut, ...(o.preFilter !== undefined ? { preFilter: Number(o.preFilter) } : {}) }
      : {
          csv: o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdin,
          unit: o.unit, time: o.time, outcome: o.outcome, treated: o.treated, treatmentTime: o.treatmentTime,
          covariates: o.covariates, donors: o.donors, vMethod: o.vMethod ?? "nested",
          placebo: o.placebo, leaveOneOut: o.leaveOneOut,
          ...(o.preFilter !== undefined ? { preFilter: Number(o.preFilter) } : {}),
        };
    const r = analyze(input);
    if (o.json) return { code: 0, out: JSON.stringify(r, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v), 1) };
    if (o.csv) return { code: 0, out: toCsv(r) };
    return { code: 0, out: report(r) };
  } catch (e) {
    return { code: 1, out: "", err: `${e.message}\n` };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const needsStdin = !argv.includes("--example") && !argv.includes("--help") && !argv.includes("-h") && !argv.some((a, i) => !a.startsWith("--") && !Object.keys(FLAGS).includes(argv[i - 1]) && a !== "-");
  const stdin = needsStdin ? readFileSync(0, "utf8") : "";
  const r = run(argv, stdin);
  if (r.out) process.stdout.write(r.out + "\n");
  if (r.err) process.stderr.write(r.err);
  process.exitCode = r.code;
}
