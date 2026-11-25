#!/usr/bin/env node
// Probability calibration check from the command line. Zero dependencies;
// same engine as the page.
//   node cli.mjs forecasts.csv [--forecast p] [--outcome y] [--positive yes] [--bins 10] [--json | --csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, report, PAPERS } from "./engine.mjs";

export const HELP = `probability-calibration: when these forecasts said 70%, did it happen 70% of the time?

Checks yes/no probability forecasts (a model's predicted probabilities, a
weather service's chance of rain, a forecaster's or a betting line's win
probabilities) against what happened. Draws the CORP reliability curve
(isotonic recalibration by pool-adjacent-violators), splits the Brier and log
scores exactly into miscalibration - discrimination + uncertainty, tests
calibration by resampling, and reports the binned expected calibration error,
the Murphy decomposition, Spiegelhalter's z test, the observed/expected count,
Cox's calibration slope and intercept and the AUC.

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab, semicolon or spaces) with a header row, one row per
forecast: a probability column (0-1, or 0-100 / "35%" as percentages) and an
outcome column (1/0, yes/no, true/false, or any label with --positive).

Options:
  --forecast NAME    the probability column (default: found by name and range)
  --outcome NAME     the outcome column (default: a yes/no column, by name)
  --positive LABEL   the outcome value that counts as the event (e.g. rain)
  --percent          read the forecasts as percentages (0-100)
  --bins 10          bins for the ECE and Murphy decomposition (2-50)
  --binning width    width (equal-width) or count (equal-count) bins
  --resamples 500    resamples for the calibration test and band (0 skips)
  --level 0.9        coverage of the consistency band
  --alpha 0.05       significance level for the verdict
  --seed 1           seed for the resampling
  --csv              print each forecast with its two recalibrated values
  --json             print the result as JSON (without the per-row arrays)
  --help             this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. doi:${p.doi}`).join("\n")}

Statistical output from your data, not financial, legal, medical or professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/probability-calibration/`;

const FLAGS = {
  "--forecast": ["forecastColumn", "text"],
  "--outcome": ["outcomeColumn", "text"],
  "--positive": ["positive", "text"],
  "--bins": ["bins", "number"],
  "--binning": ["binning", "text"],
  "--resamples": ["resamples", "number"],
  "--level": ["level", "fraction"],
  "--alpha": ["alpha", "fraction"],
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
    else if (a === "--percent") o.input.percent = true;
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
    r = analyze({ csv, ...o.input });
  } catch (e) {
    return { code: 1, out: `Error: ${e.message}` };
  }
  if (o.csv) return { code: 0, out: toCsv(r).trimEnd() };
  if (o.json) {
    const { forecasts, outcomes, recalibrate, ...rest } = r;
    return { code: 0, out: JSON.stringify(rest, null, 2) };
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
