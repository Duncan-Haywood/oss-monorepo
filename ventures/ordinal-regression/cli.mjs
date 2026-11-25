#!/usr/bin/env node
// Ordinal regression from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv [--outcome rating] [--levels "Poor,Fair,Good"] [--predictors a,b] [--link probit] [--json | --csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, report, PAPERS } from "./engine.mjs";

export const HELP = `ordinal-regression: what moves a rating, a Likert answer, a grade or a stage up or down the scale?

Fits the proportional-odds model (ordered logit; McCullagh 1980) or the
ordered probit to an outcome with 3 to 15 ordered levels: coefficients with
standard errors, Wald tests and intervals, odds ratios per unit and per
standard deviation, cut-points, the likelihood-ratio test against no
predictors, McFadden's pseudo R-squared, AIC and BIC, Brant's (1990) test of
the proportional-odds assumption (overall, per predictor, and the slopes of
the separate binary logits at each cut), and predicted probabilities of every
level at a profile.

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab, semicolon or spaces) with a header row, one row per
person or item, an outcome column and one or more predictor columns. Numeric
predictors are used as they are; text predictors with 2 to 20 values become
dummy variables against a reference level (the most common one by default).
Numbers order the outcome; so do common answer scales (Strongly disagree ...
Strongly agree, Never ... Always, Poor ... Excellent, None ... Severe);
anything else needs --levels.

Options:
  --outcome NAME            the outcome column (default: guessed by name and values)
  --levels "A,B,C"          the outcome's levels, lowest first
  --predictors A,B          predictor columns (default: every usable column)
  --categorical A,B         treat these numeric-looking columns as categories
  --reference COL=LEVEL     reference level of a categorical predictor (repeatable)
  --at COL=VALUE            profile for the predicted probabilities (repeatable;
                            default: means of numbers, reference levels of categories)
  --link logit|probit       the link (default logit; Brant's test needs logit)
  --level 0.95              confidence level
  --alpha 0.05              significance level for the verdicts
  --csv                     print the coefficient and cut-point table as CSV
  --json                    print the result as JSON
  --help                    this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ` ${p.url}`}`).join("\n")}

Statistical output from your data, not medical, financial, legal or professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/ordinal-regression/`;

const FLAGS = {
  "--outcome": ["outcomeColumn", "text"],
  "--levels": ["levels", "text"],
  "--predictors": ["predictorColumns", "text"],
  "--categorical": ["categorical", "text"],
  "--reference": ["reference", "pair"],
  "--at": ["at", "pair"],
  "--link": ["link", "text"],
  "--level": ["level", "fraction"],
  "--alpha": ["alpha", "fraction"],
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
      else if (kind === "pair") {
        const eq = val.indexOf("=");
        if (eq < 1) throw new Error(`${a} needs COLUMN=VALUE, got "${val}"`);
        o.input[key] = { ...(o.input[key] || {}), [val.slice(0, eq).trim()]: val.slice(eq + 1).trim() };
      } else {
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
    r = analyze({ csv, ...o.input });
  } catch (e) {
    return { code: 1, out: `Error: ${e.message}` };
  }
  if (o.csv) return { code: 0, out: toCsv(r).trimEnd() };
  if (o.json) return { code: 0, out: JSON.stringify(r, null, 2) };
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
