#!/usr/bin/env node
// ROC analysis from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv [--outcome y] [--positive case] [--scores a,b] [--lower b] [--json | --csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, report, PAPERS } from "./engine.mjs";

export const HELP = `roc-analysis: how well does a score tell cases from non-cases, and is one score better than another?

ROC curves for one or more scores measured on the same people or items (a lab
marker, a screening questionnaire, a model's probability, a fraud score):
the AUC with DeLong's interval, DeLong's paired test of each pair of AUCs and
the chi-square test that all are equal, cut-offs by Youden's J, closest to the
top-left corner, a target sensitivity or a target specificity, sensitivity,
specificity, predictive values and likelihood ratios at a cut-off, the partial
AUC at high specificity (McClish-standardised, bootstrap interval) and, for
scores that are probabilities, a decision curve (net benefit).

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab, semicolon or spaces) with a header row and one row
per person or item: an outcome column (1/0, yes/no, case/control, or any two
labels with --positive) and one or more numeric score columns.

Options:
  --outcome NAME       the outcome column (default: a two-valued column, by name)
  --positive LABEL     the outcome value that is a case (e.g. malignant)
  --scores A,B,C       score columns to analyse (default: every numeric column, up to 8)
  --lower A,B          scores where a LOWER value points to a case
  --threshold T        report accuracy at "first score >= T" instead of Youden's cut-off
  --prevalence P       predictive values at this prevalence (0-1) instead of the sample's
  --partial 0.1        partial AUC over false positive rates 0 to this
  --sensitivity 0.9    target sensitivity for the cut-off table
  --specificity 0.9    target specificity for the cut-off table
  --probabilities A,B  scores that are predicted probabilities (decision curves)
  --level 0.95         confidence level
  --alpha 0.05         significance level for the verdicts
  --resamples 500      bootstrap resamples for the partial AUC interval (0 skips)
  --seed 1             seed for the bootstrap
  --csv                print every cut-off of every curve with its sensitivity and specificity
  --json               print the result as JSON (without the per-point arrays)
  --help               this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. doi:${p.doi}`).join("\n")}

Statistical output from your data, not medical, financial, legal or professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/roc-analysis/`;

const FLAGS = {
  "--outcome": ["outcomeColumn", "text"],
  "--positive": ["positive", "text"],
  "--scores": ["scoreColumns", "text"],
  "--lower": ["lower", "text"],
  "--probabilities": ["probabilityColumns", "text"],
  "--threshold": ["threshold", "number"],
  "--prevalence": ["prevalence", "fraction"],
  "--partial": ["partialFpr", "number"],
  "--sensitivity": ["targetSensitivity", "number"],
  "--specificity": ["targetSpecificity", "number"],
  "--level": ["level", "fraction"],
  "--alpha": ["alpha", "fraction"],
  "--resamples": ["resamples", "number"],
  "--seed": ["seed", "number"],
};

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, file: null, input: {} };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (FLAGS[a]) {
      if (val === undefined) {
        val = argv[++i];
        if (val === undefined) throw new Error(`${a} needs a value`);
      }
      const [key, kind] = FLAGS[a];
      if (kind === "text") o.input[key] = val;
      else {
        const v = Number(val);
        if (!Number.isFinite(v) || String(val).trim() === "") throw new Error(`${a} needs a number, got "${val}"`);
        if (kind === "fraction" && !(v > 0 && v < 1)) throw new Error(`${a} needs a number between 0 and 1, got "${val}"`);
        o.input[key] = v;
      }
    } else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

export function run(argv, stdinText = "") {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: `Error: ${e.message}\n\n${HELP}` };
  }
  if (o.help) return { code: 0, out: HELP };
  let csv = stdinText;
  try {
    if (o.file && o.file !== "-") csv = readFileSync(o.file, "utf8");
  } catch (e) {
    return { code: 2, out: `Error: cannot read ${o.file}: ${e.message}` };
  }
  if (!csv || !csv.trim()) return { code: 2, out: `Error: no input given (pass a file or pipe one in).\n\n${HELP}` };
  let r;
  try {
    const { lower, ...rest } = o.input;
    const input = { csv, ...rest };
    if (lower) input.direction = Object.fromEntries(lower.split(",").map((t) => [t.trim(), "lower"]));
    r = analyze(input);
  } catch (e) {
    return { code: 1, out: `Error: ${e.message}` };
  }
  if (o.csv) return { code: 0, out: toCsv(r).trimEnd() };
  if (o.json) {
    const slim = { ...r, results: r.results.map(({ curve, allPoints, decision, ...x }) => ({ ...x, decision: decision ? { prevalence: decision.prevalence, usefulFrom: decision.usefulFrom, usefulTo: decision.usefulTo } : null })) };
    return { code: 0, out: JSON.stringify(slim, (k, v) => (v === Infinity ? "Infinity" : v), 2) };
  }
  return { code: 0, out: report(r) };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const flagWithValue = new Set(Object.keys(FLAGS));
  const hasFile = argv.some((a, i) => !a.startsWith("-") && !flagWithValue.has(argv[i - 1]));
  const needsStdin = !argv.includes("--help") && !argv.includes("-h") && !hasFile;
  const finish = (text) => {
    const { code, out } = run(argv, text);
    process.stdout.write(out + "\n");
    process.exitCode = code;
  };
  if (needsStdin && !process.stdin.isTTY) {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => finish(buf));
  } else finish("");
}
