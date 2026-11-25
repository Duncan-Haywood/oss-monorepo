#!/usr/bin/env node
// Difference-in-differences from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs panel.csv --unit state --time year --outcome y --cohort first_treated [--json]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, PAPERS } from "./engine.mjs";
import { EXAMPLE_CSV, EXAMPLE_SPEC } from "./example-data.mjs";

export const HELP = `difference-in-differences: did a policy or change adopted at different times move the outcome?
(Callaway & Sant'Anna group-time effects, event study, TWFE and its Goodman-Bacon decomposition)

Usage:
  node cli.mjs [file | -] --unit COL --time COL --outcome COL (--cohort COL | --treatment COL) [options]
  node cli.mjs --example        castle-doctrine laws and US state homicide rates, 2000-2010

Input: a long, balanced panel CSV, one row per unit and period. Times must be numbers.

Options:
  --unit COL           column naming each unit (state, store, school, ...)
  --time COL           column holding the period
  --outcome COL        the outcome
  --cohort COL         the first period each unit was treated (0 or blank: never treated)
  --treatment COL      or a 0/1 column that switches on and stays on
  --control never      comparison group: never (never-treated units) | notyet (also units not yet treated)
  --base varying       pre-period comparisons: varying (each period vs the one before) | universal
                       (every period vs the last one before treatment)
  --anticipation 0     periods before treatment in which units may already react
  --min-cohort 1       leave out cohorts with fewer units than this (2 drops one-unit cohorts,
                       whose own noise no standard error can see)
  --alpha 0.05         1 - confidence level
  --bootstrap 999      multiplier-bootstrap draws for the simultaneous event-study band (0: none)
  --seed 20211         bootstrap seed
  --csv                print the event study as CSV
  --json               print the full JSON result
  --help               this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical output from your data, not legal, tax, financial, medical or policy advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/difference-in-differences/`;

const FLAGS = { "--unit": "unit", "--time": "time", "--outcome": "outcome", "--cohort": "cohort", "--treatment": "treatment", "--control": "control", "--base": "base", "--anticipation": "anticipation", "--min-cohort": "minCohort", "--alpha": "alpha", "--bootstrap": "bootstrap", "--seed": "seed" };

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
  if (o.control && !["never", "notyet"].includes(o.control)) throw new Error("--control must be never or notyet");
  if (o.base && !["varying", "universal"].includes(o.base)) throw new Error("--base must be varying or universal");
  for (const k of ["anticipation", "minCohort", "alpha", "bootstrap", "seed"]) {
    if (o[k] === undefined) continue;
    const v = Number(o[k]);
    if (!Number.isFinite(v) || v < 0) throw new Error(`--${k === "minCohort" ? "min-cohort" : k} must be a non-negative number`);
    o[k] = v;
  }
  if (o.alpha !== undefined && !(o.alpha > 0 && o.alpha < 1)) throw new Error("--alpha must be between 0 and 1");
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
  return ["event_time,att,se,ci_low,ci_high,band_low,band_high,cohorts", ...r.eventStudy.map((e) => [e.e, f(e.att, 6), f(e.se, 6), f(e.lo, 6), f(e.hi, 6), f(e.ulo, 6), f(e.uhi, 6), e.cohorts.join(" ")].map(csvCell).join(","))].join("\n");
}

export function report(r) {
  const out = [r.summary, ""];
  const ci = (x) => `${f(x.att)}  (SE ${f(x.se)}, CI ${f(x.lo)} to ${f(x.hi)})`;
  out.push(`Units: ${r.units} (${r.neverTreated} never treated), periods ${r.periods[0]}-${r.periods[r.periods.length - 1]}, comparison: ${r.options.control === "never" ? "never treated" : "not yet treated"}, base period: ${r.options.base}.`);
  out.push("", "Overall effect:");
  if (r.overall) out.push(`  simple (cohort-size weighted)  ${ci(r.overall)}`);
  if (r.dynamicAverage) out.push(`  event-study average (e >= 0)   ${ci(r.dynamicAverage)}`);
  if (r.groupAverage) out.push(`  cohort average                 ${ci(r.groupAverage)}`);
  out.push("", `Event study (e = periods since treatment; band = simultaneous${r.uniformCritical ? `, critical value ${f(r.uniformCritical, 2)}` : ", not computed"}):`);
  out.push(`  ${"e".padStart(4)} ${"ATT".padStart(9)} ${"SE".padStart(8)} ${"CI low".padStart(9)} ${"CI high".padStart(9)}  cohorts`);
  for (const e of r.eventStudy) out.push(`  ${String(e.e).padStart(4)} ${f(e.att).padStart(9)} ${f(e.se).padStart(8)} ${f(e.lo).padStart(9)} ${f(e.hi).padStart(9)}  ${e.reference ? "(reference period)" : e.cohorts.join(" ")}`);
  out.push("", "By cohort (first treated period):");
  for (const g of r.groups) out.push(`  ${String(g.g).padStart(6)}  ${String(g.units).padStart(4)} ${g.units === 1 ? "unit " : "units"}  ${ci(g)}`);
  if (r.pretest) out.push("", `Pre-test (${r.pretest.level}, ${r.pretest.cells} estimates): chi-square ${f(r.pretest.statistic, 2)} on ${r.pretest.df} df, p = ${f(r.pretest.pValue)}`);
  if (r.twfe) out.push("", `Two-way fixed effects: ${f(r.twfe.beta)} (cluster-robust SE ${f(r.twfe.se)})`);
  if (r.bacon) {
    out.push("Goodman-Bacon decomposition of that coefficient:");
    for (const b of r.bacon.byType) out.push(`  ${b.type.padEnd(28)} weight ${f(b.weight, 3)}  average estimate ${f(b.estimate)}  (${b.comparisons} comparisons)`);
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
    const pick = ["control", "base", "anticipation", "minCohort", "alpha", "bootstrap", "seed"].reduce((acc, k) => (o[k] !== undefined ? { ...acc, [k]: o[k] } : acc), {});
    const input = o.example
      ? { ...EXAMPLE_SPEC, csv: EXAMPLE_CSV, ...pick }
      : { csv: o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdin, unit: o.unit, time: o.time, outcome: o.outcome, cohort: o.cohort, treatment: o.treatment, ...pick };
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
