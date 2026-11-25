#!/usr/bin/env node
// Instrumental variables regression from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv --outcome y --endogenous x --instruments z1,z2 [--exogenous w1,w2] [--json]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, PAPERS } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";

export const HELP = `instrumental-variables: what does x do to y when x is not randomly assigned,
using instruments that move x and reach y only through it?
(OLS, two-stage least squares, LIML and Fuller; first-stage strength, overidentification
and exogeneity tests, and the weak-instrument-robust Anderson-Rubin confidence set)

Usage:
  node cli.mjs [file | -] --outcome COL --endogenous A[,B] --instruments Z1,Z2 [options]
  node cli.mjs --example        3,000 simulated people in 150 counties (true return to schooling 0.08)

Input: a CSV with one row per unit. A constant is added. Text controls become indicators.

Options:
  --outcome COL        the outcome (y)
  --endogenous A,B     regressors whose effect you want and that are not randomly assigned
  --instruments Z1,Z2  excluded instruments: at least one per endogenous regressor
  --exogenous W1,W2    controls that appear in both stages
  --estimator 2sls     2sls | liml | fuller: which one leads the reading (all four are printed)
  --se robust          unadjusted | robust | clustered
  --cluster COL        the cluster id (needed for --se clustered)
  --fuller 1           Fuller's constant a
  --debiased           small-sample factors and t / F distributions
  --alpha 0.05         1 - confidence level
  --no-constant        leave out the constant
  --csv                print the coefficient table as CSV
  --json               print the full JSON result
  --help               this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical output from your data, not legal, tax, financial, medical or policy advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/instrumental-variables/`;

const FLAGS = { "--outcome": "outcome", "--endogenous": "endogenous", "--instruments": "instruments", "--exogenous": "exogenous", "--estimator": "estimator", "--se": "se", "--cluster": "cluster", "--fuller": "fuller", "--alpha": "alpha" };

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, example: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--debiased") o.debiased = true;
    else if (a === "--no-constant") o.constant = false;
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
  if (o.estimator && !["2sls", "liml", "fuller"].includes(o.estimator.toLowerCase())) throw new Error("--estimator must be 2sls, liml or fuller");
  if (o.se && !["unadjusted", "robust", "clustered"].includes(o.se.toLowerCase())) throw new Error("--se must be unadjusted, robust or clustered");
  for (const k of ["fuller", "alpha"]) {
    if (o[k] === undefined) continue;
    const v = Number(o[k]);
    if (!Number.isFinite(v) || v < 0) throw new Error(`--${k} must be a non-negative number`);
    o[k] = v;
  }
  return o;
}

const f = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? "+inf" : x === -Infinity ? "-inf" : "");
// Spreadsheet formula-injection guard: a text cell starting =, +, -, @, tab or CR
// gets an apostrophe; plain numbers (including negatives) are left alone.
export function csvCell(c) {
  let s = String(c);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(r) {
  const rows = ["model,term,coef,se,stat,p_value,ci_low,ci_high"];
  for (const m of Object.values(r.models)) for (const t of m.terms) rows.push([m.name, t.name, f(t.coef, 8), f(t.se, 8), f(t.stat, 6), f(t.p, 6), f(t.ci[0], 8), f(t.ci[1], 8)].map(csvCell).join(","));
  return rows.join("\n");
}

export function report(r) {
  const out = [r.summary, ""];
  const lvl = Math.round((1 - r.options.alpha) * 100);
  out.push(`Rows: ${r.n}${r.clusters ? ` in ${r.clusters} clusters` : ""}. Standard errors: ${r.options.se}${r.options.debiased ? ", debiased" : ""}. LIML k = ${f(r.kappa.liml, 6)}, Fuller k = ${f(r.kappa.fuller, 6)}.`);
  const names = r.models.ols.terms.map((t) => t.name);
  out.push("", `${"term".padEnd(22)}${Object.values(r.models).map((m) => m.name.padStart(18)).join("")}`);
  names.forEach((nm, i) => {
    out.push(`${nm.padEnd(22)}${Object.values(r.models).map((m) => f(m.terms[i].coef).padStart(18)).join("")}`);
    out.push(`${"".padEnd(22)}${Object.values(r.models).map((m) => `(${f(m.terms[i].se)})`.padStart(18)).join("")}`);
  });
  out.push("", "First stage:");
  for (const s of r.firstStage) {
    out.push(`  ${s.variable}: R2 ${f(s.r2, 3)}, partial R2 ${f(s.partialR2, 3)}, Shea partial R2 ${f(s.sheaR2, 3)}, F ${f(s.F, 2)} (${s.fDist.startsWith("F") ? s.fDist : `Wald ${f(s.wald, 2)} ~ ${s.fDist}`}, p ${f(s.fP, 4)}), effective F ${f(s.effectiveF, 2)}`);
    for (const z of s.instruments) out.push(`    ${z.name.padEnd(20)} ${f(z.coef).padStart(10)}  SE ${f(z.se)}`);
  }
  out.push("", "Tests:");
  for (const t of [...r.overid, ...r.exogeneity]) out.push(`  ${t.name.padEnd(32)} ${t.error ? t.error : `${f(t.stat, 3).padStart(10)}  ${t.dist.padEnd(12)} p ${f(t.p, 4)}`}`);
  if (r.andersonRubin) {
    const a = r.andersonRubin;
    out.push("", `Anderson-Rubin ${lvl}% set for ${r.spec.endogenous[0]}: ${a.intervals.length ? a.intervals.map(([lo, hi]) => `[${f(lo)}, ${f(hi)}]`).join(" U ") : "empty"} (${a.kind}; ${a.method}); AR test of 0: ${f(a.atZero.stat, 3)} ${a.atZero.dist}, p ${f(a.atZero.p, 4)}.`);
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
    const pick = ["outcome", "endogenous", "instruments", "exogenous", "estimator", "se", "cluster", "fuller", "alpha", "debiased", "constant"].reduce((acc, k) => (o[k] !== undefined ? { ...acc, [k]: o[k] } : acc), {});
    const input = o.example ? { ...EXAMPLE_SPEC, se: "clustered", csv: EXAMPLE_CSV, ...pick } : { csv: o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdin, ...pick };
    const r = analyze(input);
    if (o.json) return { code: 0, out: JSON.stringify(r, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? (Number.isNaN(v) ? null : String(v)) : v), 1) };
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
