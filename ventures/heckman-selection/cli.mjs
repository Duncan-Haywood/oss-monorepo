#!/usr/bin/env node
// Heckman sample-selection model from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv --outcome y --regressors x1,x2 --selection z1,z2 [--selected s] [--json]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, PAPERS } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";

export const HELP = `heckman-selection: what do x do to y when y is seen only for the units that were
selected (a wage only for people in work, a loss only for approved loans), and
selection may share unobserved causes with y?
(selection probit, OLS on the selected rows, Heckman two-step with the corrected
covariance, full maximum likelihood with rho and its tests, identification checks)

Usage:
  node cli.mjs [file | -] --outcome COL --regressors X1,X2 --selection Z1,Z2 [options]
  node cli.mjs --example        2,000 simulated women, 1,213 with a wage (true return to schooling 0.085, rho 0.6)

Input: a CSV with one row per unit, selected or not. A constant is added to both
equations. Text columns become indicators. Without --selected, a row is selected
when its outcome is not blank.

Options:
  --outcome COL         the outcome, blank (or NA) for unselected rows
  --regressors X1,X2    outcome-equation variables (they also enter selection)
  --selection Z1,Z2     variables that affect selection but not the outcome (the exclusion restrictions)
  --selected COL        a 0/1 selection indicator (otherwise: outcome not blank)
  --selection-only      use exactly --selection in the selection equation (do not add the regressors)
  --estimator mle       mle | twostep: which one leads the reading (both are printed)
  --se conventional     conventional | robust | clustered (OLS and maximum likelihood)
  --cluster COL         the cluster id (needed for --se clustered)
  --alpha 0.05          1 - confidence level
  --csv                 print the coefficient tables as CSV
  --json                print the full JSON result
  --help                this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical output from your data, not legal, tax, financial, medical or policy advice. No warranty. MIT licence.
Web version: https://marisstella.app/heckman-selection/`;

const FLAGS = { "--outcome": "outcome", "--regressors": "regressors", "--selection": "selection", "--selected": "selected", "--estimator": "estimator", "--se": "se", "--cluster": "cluster", "--alpha": "alpha" };

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, example: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--selection-only") o.union = false;
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
  if (o.estimator && !["mle", "twostep"].includes(o.estimator.toLowerCase())) throw new Error("--estimator must be mle or twostep");
  if (o.se && !["conventional", "robust", "clustered"].includes(o.se.toLowerCase())) throw new Error("--se must be conventional, robust or clustered");
  if (o.alpha !== undefined) {
    const v = Number(o.alpha);
    if (!(v > 0 && v < 0.5)) throw new Error("--alpha must be between 0 and 0.5");
    o.alpha = v;
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

export function coefRows(r) {
  const rows = [];
  const add = (model, eq, terms) => { for (const t of terms) rows.push([model, eq, t.name, t.coef, t.se, t.z, t.p, t.ci[0], t.ci[1]]); };
  add("OLS (selected rows)", "outcome", r.models.ols.terms);
  add("Heckman two-step", "outcome", r.models.twostep.terms);
  add("Heckman two-step", "selection (probit)", r.models.twostep.selection);
  add("Maximum likelihood", "outcome", r.models.mle.terms);
  add("Maximum likelihood", "selection", r.models.mle.selection);
  const m = r.models.mle;
  rows.push(["Maximum likelihood", "auxiliary", "rho", m.rho.coef, m.rho.se, NaN, NaN, m.rho.ci[0], m.rho.ci[1]]);
  rows.push(["Maximum likelihood", "auxiliary", "sigma", m.sigma.coef, m.sigma.se, NaN, NaN, m.sigma.ci[0], m.sigma.ci[1]]);
  rows.push(["Maximum likelihood", "auxiliary", "lambda = rho x sigma", m.lambda.coef, m.lambda.se, NaN, NaN, NaN, NaN]);
  return rows;
}

export function toCsv(r) {
  return ["model,equation,term,coef,se,z,p_value,ci_low,ci_high", ...coefRows(r).map((row) => row.map((v, i) => (i < 3 ? csvCell(v) : f(v, 8))).join(","))].join("\n");
}

export function report(r) {
  const out = [r.summary, ""];
  const m = r.models;
  out.push(`Rows: ${r.n} (${r.n1} selected, ${r.n0} not)${r.clusters ? ` in ${r.clusters} clusters` : ""}. Standard errors: ${r.options.se} (two-step: conventional Heckman-Greene).`);
  const names = m.ols.terms.map((t) => t.name);
  out.push("", "Outcome equation", `${"term".padEnd(24)}${["OLS (selected)", "Two-step", "Max. likelihood"].map((s) => s.padStart(18)).join("")}`);
  names.forEach((nm, i) => {
    out.push(`${nm.padEnd(24)}${[m.ols, m.twostep, m.mle].map((x) => f(x.terms[i].coef).padStart(18)).join("")}`);
    out.push(`${"".padEnd(24)}${[m.ols, m.twostep, m.mle].map((x) => `(${f(x.terms[i].se)})`.padStart(18)).join("")}`);
  });
  const lam = m.twostep.terms[names.length];
  out.push(`${"lambda".padEnd(24)}${"".padStart(18)}${f(lam.coef).padStart(18)}${f(m.mle.lambda.coef).padStart(18)}`);
  out.push(`${"".padEnd(24)}${"".padStart(18)}${`(${f(lam.se)})`.padStart(18)}${`(${f(m.mle.lambda.se)})`.padStart(18)}`);
  out.push(`${"rho".padEnd(24)}${"".padStart(18)}${f(m.twostep.rho).padStart(18)}${f(m.mle.rho.coef).padStart(18)}`);
  out.push(`${"sigma".padEnd(24)}${"".padStart(18)}${f(m.twostep.sigma).padStart(18)}${f(m.mle.sigma.coef).padStart(18)}`);
  out.push("", "Selection equation", `${"term".padEnd(24)}${["Probit", "Max. likelihood"].map((s) => s.padStart(18)).join("")}`);
  r.probit.terms.forEach((t, i) => {
    out.push(`${t.name.padEnd(24)}${f(t.coef).padStart(18)}${f(m.mle.selection[i].coef).padStart(18)}`);
    out.push(`${"".padEnd(24)}${`(${f(t.se)})`.padStart(18)}${`(${f(m.mle.selection[i].se)})`.padStart(18)}`);
  });
  out.push("", "Tests of rho = 0 (no selection bias):");
  out.push(`  Likelihood ratio (MLE)        ${f(m.mle.tests.lr.stat, 3).padStart(10)}  chi2(1)  p ${f(m.mle.tests.lr.p)}`);
  out.push(`  Wald on atanh rho (MLE)       ${f(m.mle.tests.wald.stat, 3).padStart(10)}  chi2(1)  p ${f(m.mle.tests.wald.p)}`);
  out.push(`  t on lambda (two-step)        ${f(m.twostep.lambdaTest.stat, 3).padStart(10)}  normal   p ${f(m.twostep.lambdaTest.p)}`);
  out.push("", `Log L: ${f(m.mle.ll, 3)} (selection model), ${f(m.mle.llIndep, 3)} (probit + OLS, rho = 0). Probit pseudo R2 ${f(r.probit.pseudoR2, 3)}.`);
  out.push(`Exclusion restrictions: ${r.spec.exclusions.length ? r.spec.exclusions.join(", ") : "none"}. R2 of lambda on the regressors: ${f(r.diagnostics.lambdaR2, 3)}.`);
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
    const pick = ["outcome", "regressors", "selection", "selected", "estimator", "se", "cluster", "alpha", "union"].reduce((acc, k) => (o[k] !== undefined ? { ...acc, [k]: o[k] } : acc), {});
    const input = o.example ? { ...EXAMPLE_SPEC, csv: EXAMPLE_CSV, ...pick } : { csv: o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdin, ...pick };
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
