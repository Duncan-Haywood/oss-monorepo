#!/usr/bin/env node
// STL decomposition from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs sales.csv --column sales [--period 12] [--robust] [--json | --csv]
import { readFileSync } from "node:fs";
import { analyze, PAPERS, fmt, csvCell } from "./engine.mjs";

export const HELP = `stl-decomposition: split a time series into trend, seasonal and remainder (STL, Cleveland et al. 1990)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV with a header row (a date column and a value column), or a bare
list of numbers one per line (then --period is required). Rows are sorted by
date; interior missing values are filled by straight-line interpolation.

Options:
  --column NAME        value column (default: one named value, sales, ... or the last numeric column)
  --date NAME          date column (default: the first column of dates)
  --period N           steps per seasonal cycle (default: inferred from the dates,
                       e.g. 12 for monthly, 7 for daily, 24 for hourly, 4 for quarterly)
  --seasonal 7         seasonal smoother window, odd >= 3 (larger = steadier seasonal shape)
  --trend N            trend window, odd > period (default: smallest odd >= 1.5 period / (1 - 1.5 / seasonal))
  --low-pass N         low-pass window, odd > period (default: smallest odd > period)
  --seasonal-deg 1     loess degree for the seasonal smoother, 0 or 1 (also --trend-deg, --low-pass-deg)
  --seasonal-jump 1    evaluate loess every N points and interpolate (also --trend-jump, --low-pass-jump)
  --robust             down-weight outliers (15 robustness passes)
  --inner N --outer N  iteration counts (default 5/0, or 2/15 with --robust)
  --outlier-z 3.5      robust z-score of the remainder at which a point is listed as unusual
  --csv                print date, observed, trend, seasonal, remainder, adjusted, weight
  --json               print the full JSON result
  --help               this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical output from your data, not financial or professional advice. No warranty. MIT licence.
Web version: https://marisstella.app/stl-decomposition/`;

const FLAGS = {
  "--column": "column",
  "--date": "dateColumn",
  "--period": "period",
  "--seasonal": "seasonal",
  "--trend": "trend",
  "--low-pass": "lowPass",
  "--seasonal-deg": "seasonalDeg",
  "--trend-deg": "trendDeg",
  "--low-pass-deg": "lowPassDeg",
  "--seasonal-jump": "seasonalJump",
  "--trend-jump": "trendJump",
  "--low-pass-jump": "lowPassJump",
  "--inner": "innerIter",
  "--outer": "outerIter",
  "--outlier-z": "outlierZ",
};
const NUMERIC = new Set(Object.values(FLAGS).filter((k) => k !== "column" && k !== "dateColumn"));

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, robust: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.startsWith("--") && a.includes("=") ? a.indexOf("=") : -1;
    const name = eq > 0 ? a.slice(0, eq) : a;
    if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--robust") o.robust = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (FLAGS[name]) {
      let v;
      if (eq > 0) v = a.slice(eq + 1);
      else {
        if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
        v = argv[++i];
      }
      if (NUMERIC.has(FLAGS[name]) && !Number.isFinite(Number(v))) throw new Error(`${name} needs a number, got "${v}"`);
      o[FLAGS[name]] = NUMERIC.has(FLAGS[name]) ? Number(v) : v;
    } else if (a.startsWith("--")) throw new Error(`unknown option ${a}; see --help`);
    else if (o.file === null) o.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

// Every cell goes through csvCell (engine.mjs), the spreadsheet formula-injection guard.
export function toCsv(r) {
  const lines = ["date,observed,trend,seasonal,remainder,seasonally_adjusted,robustness_weight,interpolated"];
  const filled = new Set(r.filled);
  for (let i = 0; i < r.n; i++) lines.push([r.dates[i], r.observed[i], r.trend[i], r.seasonal[i], r.resid[i], r.adjusted[i], r.weights[i], filled.has(i) ? 1 : 0].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}

export function formatText(r) {
  if (r.error) return `Error: ${r.error}`;
  const p = r.params;
  const out = [r.summary, ""];
  out.push(`Period ${r.period} (${r.periodSource}); windows: seasonal ${p.seasonal}, trend ${p.trend}, low-pass ${p.lowPass}; ${p.robust ? "robust" : "not robust"}, ${p.innerIter} inner / ${p.outerIter} outer passes.`);
  out.push(`Strength of seasonality ${r.strength.seasonal.toFixed(3)}, of trend ${r.strength.trend.toFixed(3)} (0 = none, 1 = all of the variation outside the remainder).`);
  out.push("", "Seasonal profile (latest cycle; average over all cycles):");
  for (const s of r.profile) out.push(`  ${String(s.label).padEnd(12)} ${fmt(s.latest).padStart(10)}   ${fmt(s.average).padStart(10)}`);
  if (r.unusual.length) {
    out.push("", "Unusual points (largest first):", "  date              observed    expected   remainder   robust z");
    for (const u of r.unusual.slice(0, 20)) out.push(`  ${String(u.date).slice(0, 16).padEnd(16)} ${fmt(u.value).padStart(9)}  ${fmt(u.expected).padStart(10)}  ${fmt(u.resid).padStart(10)}  ${u.z.toFixed(1).padStart(8)}`);
    if (r.unusual.length > 20) out.push(`  ... and ${r.unusual.length - 20} more (--csv lists every point)`);
  }
  if (r.warnings.length) out.push("", ...r.warnings.map((w) => `Note: ${w}`));
  return out.join("\n");
}

export function run(argv, stdinText) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: `Error: ${e.message}\n\n${HELP}` };
  }
  if (o.help) return { code: 0, out: HELP };
  let csv;
  try {
    csv = o.file && o.file !== "-" ? readFileSync(o.file, "utf8") : stdinText;
  } catch (e) {
    return { code: 2, out: `Error: cannot read ${o.file}: ${e.message}` };
  }
  if (!csv || !csv.trim()) return { code: 2, out: `Error: no input given (pass a file or pipe one in).\n\n${HELP}` };
  const input = { csv, robust: o.robust };
  for (const k of ["column", "dateColumn", ...NUMERIC]) if (o[k] !== undefined) input[k] = o[k];
  const r = analyze(input);
  if (r.error) return { code: 1, out: `Error: ${r.error}` };
  if (o.json) return { code: 0, out: JSON.stringify(r, null, 2) };
  if (o.csv) return { code: 0, out: toCsv(r).trimEnd() };
  return { code: 0, out: formatText(r) };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
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
