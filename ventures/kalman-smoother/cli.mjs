#!/usr/bin/env node
// Kalman smoother for structural time-series models from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs series.csv [--column sales] [--slope auto] [--season auto] [--log] [--horizon 12] [--json | --csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, PAPERS, fmt } from "./engine.mjs";

export const HELP = `kalman-smoother: the underlying level of a noisy series, with bands, gaps filled, forecasts,
and which points are outliers or level shifts (Kalman filter and smoother, Durbin & Koopman 2012)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab or semicolon) with a header row, one row per period in
time order. The time column is the one named date/year/month/quarter/period/...
or the first non-numeric column; the value column is the first other numeric
column. Blank, NA or "." values are missing: the smoother fills them.

Options:
  --column NAME        the value column
  --time NAME          the time column (labels only; rows must be equally spaced)
  --slope auto         "none" (local level), "fixed" (drift), "stochastic"
                       (local linear trend) or "auto" (lowest AIC of the three)
  --season auto        period of a seasonal pattern: 0 for none, 12 monthly,
                       4 quarterly, 7 daily-with-weekdays; "auto" reads YYYY-MM
                       (12) and YYYY-Qn (4) labels
  --log                model the logarithm (for series whose swings grow with
                       their level); levels are reported back in the original units
  --level 0.9          coverage of the bands
  --horizon 0          forecast this many periods past the end
  --threshold 2.5      |t| above which an outlier or a level shift is reported
  --top 8              how many outliers and shifts to list
  --csv                print every period: level, band, slope, seasonal, residuals
  --json               print the full JSON result
  --help               this text

Outlier t: the standardised smoothed irregular (one point off the level).
Shift t: the standardised smoothed level disturbance between two periods (the
level itself moved). Both are auxiliary residuals (Harvey & Koopman 1992).

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

Statistical output from your data, not financial, legal or professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/kalman-smoother/`;

const FLAGS = {
  "--column": "column",
  "--time": "timeColumn",
  "--slope": "slope",
  "--season": "season",
  "--level": "level",
  "--horizon": "horizon",
  "--threshold": "threshold",
  "--top": "top",
};
const NUMERIC = new Set(["level", "horizon", "threshold", "top"]);

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--log") o.log = true;
    else if (FLAGS[a]) {
      if (val === undefined) {
        val = argv[++i];
        if (val === undefined) throw new Error(`${a} needs a value`);
      }
      const key = FLAGS[a];
      if (NUMERIC.has(key)) {
        if (!/^\d*\.?\d+$/.test(val)) throw new Error(`${a} needs a number, got "${val}"`);
        o[key] = Number(val);
      } else if (key === "season") {
        if (val !== "auto" && !/^\d+$/.test(val)) throw new Error(`--season needs a whole number or "auto", got "${val}"`);
        o.season = val === "auto" ? "auto" : Number(val);
      } else o[key] = val;
    } else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

export function formatText(r) {
  const pct = Math.round(r.level * 100);
  const out = [r.summary, ""];
  for (const w of r.warnings) out.push(`Note: ${w}`);
  if (r.warnings.length) out.push("");
  const m = r.model;
  out.push(`Model: ${m.description}${r.log ? " (on logs)" : ""}. Loglikelihood ${m.loglik.toFixed(3)}, AIC ${m.aic.toFixed(2)}.`);
  out.push(`Variances: ${Object.entries(m.variances).map(([k, v]) => `${k} ${fmt(v)}`).join(", ")}.`);
  if (r.candidates.length > 1) out.push(`Compared by AIC: ${r.candidates.map((c) => `${c.slope} ${c.aic.toFixed(2)}`).join(", ")}.`);
  out.push("", "Level shifts (|t| above the threshold):");
  if (!r.shifts.length) out.push("  none");
  for (const s of r.shifts) out.push(`  ${String(s.from).padEnd(10)} -> ${String(s.to).padEnd(10)} t ${s.tStat.toFixed(2).padStart(6)}  level ${fmt(s.before)} -> ${fmt(s.after)}`);
  out.push("", "Outliers (|t| above the threshold):");
  if (!r.outliers.length) out.push("  none");
  for (const o of r.outliers) out.push(`  ${String(o.label).padEnd(10)} t ${o.tStat.toFixed(2).padStart(6)}  value ${fmt(o.y)}, level ${fmt(o.level)}`);
  if (r.forecast.length) {
    out.push("", `Forecast (${pct}% interval for a new value):`);
    for (const f of r.forecast) out.push(`  +${String(f.h).padEnd(4)} ${fmt(f.mean).padStart(10)}  ${fmt(f.lo)} to ${fmt(f.hi)}`);
  }
  const d = r.diagnostics;
  const parts = [];
  if (d.ljungBox) parts.push(`Ljung-Box Q(${d.ljungBox.lags}) ${d.ljungBox.Q.toFixed(2)}, p ${d.ljungBox.p.toFixed(3)}`);
  if (d.normality) parts.push(`normality N ${d.normality.N.toFixed(2)}, p ${d.normality.p.toFixed(3)}`);
  if (d.heteroscedasticity) parts.push(`H(${d.heteroscedasticity.h}) ${d.heteroscedasticity.H.toFixed(2)}, p ${d.heteroscedasticity.p.toFixed(3)}`);
  if (parts.length) out.push("", `Residual checks: ${parts.join("; ")}.`);
  return out.join("\n");
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
  const input = { csv };
  for (const k of [...Object.values(FLAGS), "log"]) if (o[k] !== undefined) input[k] = o[k];
  const r = analyze(input);
  if (r.error) return { code: 1, out: `Error: ${r.error}` };
  if (o.json) return { code: 0, out: JSON.stringify(r, null, 2) };
  if (o.csv) return { code: 0, out: toCsv(r).trimEnd() };
  return { code: 0, out: formatText(r) };
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
