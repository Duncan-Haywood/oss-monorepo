#!/usr/bin/env node
// Lomb-Scargle periodogram from the command line. Zero dependencies; same
// engine as the page.
//   node cli.mjs series.csv [--time t] [--value y] [--error e] [--group site] [--json | --csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, report, PAPERS } from "./engine.mjs";

export const HELP = `lomb-scargle-periodogram: which periods are in these unevenly spaced measurements?

Fits a sinusoid plus one offset per group at every trial frequency (the
generalised Lomb-Scargle periodogram, weighted by 1/error^2 when errors are
given), reports the strongest periods with Baluev's false alarm probability,
removes each one and searches again (pre-whitening), and checks every period
against the sampling's own rhythms (the spectral window) for aliases.

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab, semicolon or spaces) with a header row: a time
column (numbers in any unit, such as days or JD, or ISO dates 2024-03-05),
a value column, and optionally an error column and a group column (the
instrument, site or observer; each group gets its own offset).

Options:
  --time NAME         the time column (default: the first numeric or date column)
  --value NAME        the value column (default: the next numeric column)
  --error NAME        the error column (default: one named err, error, sigma, unc ...; "" for none)
  --group NAME        the group column (default: the first text column; "" for none)
  --min-period P      shortest period searched (default: twice the median gap)
  --max-period P      longest period searched (default: the time span)
  --oversample 5      grid points per peak width
  --signals 3         how many periods to find, removing each before the next
  --fap-level 0.01    stop when the next peak's false alarm probability is above this
  --jitter 0          extra error added in quadrature to every point (value units)
  --top 10            how many peaks of the first periodogram to list
  --csv               print the periodogram: frequency, period, power, window power
  --json              print the result as JSON (without the full arrays)
  --help              this text

Periods are in the time column's units (days for ISO dates).

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ` ${p.url}`}`).join("\n")}

Statistical output from your data, not financial, legal, medical or professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/lomb-scargle-periodogram/`;

const FLAGS = {
  "--time": ["timeColumn", "text"],
  "--value": ["valueColumn", "text"],
  "--error": ["errorColumn", "text"],
  "--group": ["groupColumn", "text"],
  "--min-period": ["minPeriod", "positive"],
  "--max-period": ["maxPeriod", "positive"],
  "--oversample": ["oversample", "positive"],
  "--signals": ["signals", "whole"],
  "--fap-level": ["fapLevel", "positive"],
  "--jitter": ["jitter", "nonneg"],
  "--top": ["top", "whole"],
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
        if (kind === "whole" && !(/^\d+$/.test(val) && v >= 1)) throw new Error(`${a} needs a whole number such as 3, got "${val}"`);
        if (kind === "positive" && !(v > 0)) throw new Error(`${a} needs a positive number, got "${val}"`);
        if (kind === "nonneg" && !(v >= 0 && val.trim() !== "")) throw new Error(`${a} needs zero or a positive number, got "${val}"`);
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
    const { frequency, residualPower, window, times, values, errors, groupOf, ...rest } = r;
    return { code: 0, out: JSON.stringify(rest, null, 2) };
  }
  const lines = [report(r), "", "Peaks of the first periodogram:", `  ${"period".padStart(12)} ${"power".padStart(8)}  FAP`];
  for (const p of r.peaks) lines.push(`  ${p.period.toPrecision(7).padStart(12)} ${p.power.toFixed(4).padStart(8)}  ${p.fap.fap < 1e-4 ? `1e${Math.round(p.fap.log10)}` : `${(100 * p.fap.fap).toPrecision(2)}%`}`);
  if (r.windowPeaks.length) lines.push("", `Sampling rhythms (spectral window peaks): ${r.windowPeaks.map((w) => `${w.period.toPrecision(5)} (${w.power.toFixed(2)})`).join(", ")}`);
  return { code: 0, out: lines.join("\n") };
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
