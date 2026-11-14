#!/usr/bin/env node
// Gaussian-process regression from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv [--x month] [--y value] [--kernel auto] [--mean linear] [--predict 2027-01] [--json | --csv]
import { readFileSync } from "node:fs";
import { analyze, toCsv, PAPERS, KERNELS, fmt } from "./engine.mjs";
import { pathToFileURL } from "node:url";

export const HELP = `gaussian-process-regression: fit a smooth curve with an honest uncertainty band (Rasmussen & Williams 2006)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab or semicolon) with a header row. x is the first numeric
or date column (YYYY-MM or YYYY-MM-DD, read as decimal years), y the next
numeric column. Rows with a missing x or y are skipped.

Options:
  --x NAME             column to use as x
  --y NAME             column to use as y
  --kernel K           auto (try all, keep the highest evidence) or one of:
                       ${Object.keys(KERNELS).join(", ")}
  --mean M             linear (default: a straight line with a vague prior, R&W 2.7) or constant
  --period P           period in x units (dates default to 1 year); seeds the search
  --fix-period         hold the period at --period instead of fitting it
  --restarts 3         random restarts of the optimiser per kernel (0 to 20)
  --seed 42            random seed; the same seed gives the same fit
  --horizon H          forecast H x units past the last point (default 15% of the x range)
  --predict a,b,c      x values or dates to predict at
  --csv                print the fitted curve on a grid (mean, 95% bands)
  --json               print the full JSON result
  --help               this text

Hyperparameters are fitted by maximising the log marginal likelihood
log p(y | X, theta) = -y'K^-1 y/2 - log|K|/2 - n log(2 pi)/2.
The 95% band for the curve leaves out noise; the band for a single new
reading includes it. The leave-one-out coverage says whether the band is honest
inside the data; it says nothing about how far a forecast can be trusted.

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

Statistical output from your data, not financial, legal or professional advice. No warranty. MIT licence.
Web version: https://marisstella.app/gaussian-process-regression/`;

const FLAGS = {
  "--x": "xColumn",
  "--y": "yColumn",
  "--kernel": "kernel",
  "--mean": "mean",
  "--period": "period",
  "--restarts": "restarts",
  "--seed": "seed",
  "--horizon": "horizon",
  "--predict": "predictAt",
};
const INTEGER = new Set(["restarts", "seed"]);
const NUMBER = new Set(["period", "horizon"]);

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--fix-period") o.fixPeriod = true;
    else if (FLAGS[a]) {
      if (val === undefined) {
        val = argv[++i];
        if (val === undefined) throw new Error(`${a} needs a value`);
      }
      const key = FLAGS[a];
      if (INTEGER.has(key)) {
        if (!/^-?\d+$/.test(val)) throw new Error(`${a} needs a whole number, got "${val}"`);
        o[key] = Number(val);
      } else if (NUMBER.has(key)) {
        if (!Number.isFinite(Number(val)) || Number(val) < 0) throw new Error(`${a} needs a positive number, got "${val}"`);
        o[key] = Number(val);
      } else o[key] = val;
    } else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

const xText = (r, p) => (r.dateMode ? p.xLabel : fmt(p.x, 5));

export function formatText(r) {
  const out = [r.summary, ""];
  for (const w of r.warnings) out.push(`Note: ${w}`);
  if (r.warnings.length) out.push("");
  out.push(`Kernel ${r.kernelTitle}: k(r) = ${r.kernelFormula} + noise`);
  out.push(`Mean: ${r.mean === "linear" ? `straight line ${fmt(r.trend.intercept, 5)} + ${fmt(r.trend.slope, 4)} x (vague prior)` : "constant (the data mean)"}`);
  out.push("Fitted hyperparameters:");
  for (const h of r.hyperparameters) out.push(`  ${h.name.padEnd(28)} ${fmt(h.value, 4)}${h.unit === "x" ? (r.dateMode ? " years" : ` (${r.xName})`) : h.unit === "y" ? ` (${r.yName})` : ""}${h.fixed ? "  fixed" : ""}${h.atBound ? "  at bound" : ""}`);
  out.push(`Log marginal likelihood: ${r.logMarginalLikelihood.toFixed(3)} (${r.mean === "linear" ? "of what the straight line leaves" : "of y"}, in y units)`);
  if (r.comparison.length > 1) {
    out.push("", "Kernels by evidence (difference in log marginal likelihood from the best):");
    for (const c of r.comparison) out.push(`  ${c.title.padEnd(34)} ${c.delta === 0 ? "best" : c.delta.toFixed(2)}${c.atBound ? "  (a parameter at its bound)" : ""}`);
  }
  out.push("", `Leave-one-out: RMSE ${fmt(r.loo.rmse)}, ${(r.loo.coverage95 * 100).toFixed(1)}% inside 95% intervals, mean log predictive density ${r.loo.meanLogPredictive.toFixed(3)}.`);
  for (const o of r.loo.outliers.slice(0, 10)) out.push(`  line ${o.line}: x ${xText(r, o)}, y ${fmt(o.y, 5)}, predicted ${fmt(o.looMean, 5)} +/- ${fmt(o.looSd)} (z ${o.z.toFixed(1)})`);
  if (r.predictions.length) {
    out.push("", "Predictions (curve mean, 95% band for the curve, 95% band for a new reading):");
    for (const p of r.predictions) out.push(`  ${String(xText(r, p)).padEnd(12)} ${fmt(p.mean, 5)}  [${fmt(p.lo, 5)}, ${fmt(p.hi, 5)}]  [${fmt(p.obsLo, 5)}, ${fmt(p.obsHi, 5)}]${p.beyondData ? "  beyond the data" : ""}`);
  }
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
  for (const k of [...Object.values(FLAGS), "fixPeriod"]) if (o[k] !== undefined) input[k] = o[k];
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
