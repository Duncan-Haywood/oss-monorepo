#!/usr/bin/env node
// Mann-Kendall trend test and Sen's slope from the command line. Zero
// dependencies; same engine as the page.
//   node cli.mjs series.csv [--time date] [--value conc] [--seasons auto|none|month|quarter] [--season-column c] [--correction yue-wang] [--json | --csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, report, PAPERS, CORRECTIONS } from "./engine.mjs";

export const HELP = `mann-kendall-trend: is this series going up or down, by how much, and is it more than noise?

Runs the Mann-Kendall trend test on a time series and estimates the trend with
Sen's slope and its confidence interval. For a single series it also corrects
for serial correlation (Yue-Wang AR(1) by default; Hamed-Rao and trend-free
pre-whitening for comparison). For monthly or quarterly data it runs the
seasonal Kendall test, with the Hirsch-Slack covariance between seasons when
there are at least 10 years, a per-season table and a test that the seasons
share one trend.

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab, semicolon or spaces) with a header row: a time
column (ISO dates 2024-03-05 or 2024-03, or numbers such as years) and a value
column. Rows with a missing time or value are skipped; values like "<5" (below
a detection limit) are skipped with a warning.

Options:
  --time NAME           the time column (default: the first date or numeric column)
  --value NAME          the value column (default: the next numeric column)
  --seasons MODE        auto (monthly dates -> by month), none, month, quarter (default auto)
  --season-column NAME  a column naming each row's season (overrides --seasons)
  --correction NAME     ${CORRECTIONS.join(", ")} (single series; default yue-wang)
  --covariance MODE     seasonal test: auto (on with >= 10 years), on, off (default auto)
  --alpha 0.05          significance level
  --confidence 0.95     confidence of Sen's slope interval
  --csv                 print the readings with Sen's line and residuals
  --json                print the result as JSON (without the per-reading arrays)
  --help                this text

Slopes are per year for date columns, otherwise per unit of the time column.

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ` ${p.url}`}`).join("\n")}

Statistical output from your data, not financial, legal, medical or professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/mann-kendall-trend/`;

const FLAGS = {
  "--time": ["timeColumn", "text"],
  "--value": ["valueColumn", "text"],
  "--seasons": ["seasons", "text"],
  "--season-column": ["seasonColumn", "text"],
  "--correction": ["correction", "text"],
  "--covariance": ["covariance", "text"],
  "--alpha": ["alpha", "fraction"],
  "--confidence": ["confidence", "fraction"],
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
        if (!(v > 0 && v < 1)) throw new Error(`${a} needs a number between 0 and 1, got "${val}"`);
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
    const { times, values, seasonOf, ...rest } = r;
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
