#!/usr/bin/env node
// Matrix profile explorer CLI: motifs and discords of a time series from a CSV
// file or stdin. Zero dependencies; runs the same engine as the web page.
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, PAPERS, CONVENTIONS, DEFAULTS } from "./engine.mjs";

const HELP = `matrix-profile-explorer: find repeated patterns (motifs) and anomalies (discords)
in a time series with the exact matrix profile. Runs locally; nothing is uploaded.

Usage:
  node cli.mjs series.csv [--column NAME|N] [--window M] [--top K] [--detrend] [--json]
  cat series.csv | node cli.mjs [options]
  node cli.mjs --example [--json]        analyse the bundled NOAA Mauna Loa CO2 series

Input: one number per line, or a CSV with a header (time,value,...). Comma,
semicolon or tab separated; lines starting with # are skipped.

Options:
  --column NAME|N  column to analyse, by header name or 1-based number
                   (default: the first mostly-numeric column after the
                   first that is not named like a time, e.g. year, date)
  --window M       subsequence length in points (default: suggested from the
                   data's autocorrelation; see below)
  --top K          how many motifs and discords to list (default ${DEFAULTS.top}, max 20)
  --detrend        remove a least-squares straight line before analysis
  --json           print the full result as JSON
  --profile        with --json, include the matrix profile and its index
  --help           this text

Method:
  Distance: ${CONVENTIONS.distance}
  Exclusion zone: ${CONVENTIONS.exclusionZone}
  Flat windows: ${CONVENTIONS.constant}
  Window suggestion: ${CONVENTIONS.windowSuggestion}
  Exact O(n^2) computation; above about 20,000 points it gets slow.

Papers (please cite them if you use the results):
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}, ${p.pages}. doi:${p.doi}`).join("\n")}
  Further reading: the UCR Matrix Profile page, https://www.cs.ucr.edu/~eamonn/MatrixProfile.html

No warranty. Results are statistical descriptions of the data you supply, not
legal, tax, or financial advice. MIT licensed.
`;

function parseArgs(argv) {
  const o = { file: null, json: false, help: false, example: false, profile: false, detrend: false, column: null, window: null, top: DEFAULTS.top };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--example") o.example = true;
    else if (a === "--profile") o.profile = true;
    else if (a === "--detrend") o.detrend = true;
    else if (a === "--column") o.column = val();
    else if (a === "--window" || a === "-m") o.window = val();
    else if (a === "--top" || a === "-k") o.top = Number(val());
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else if (o.file === null) o.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function fmt(r) {
  const at = (i, label) => (label ? `${i} (${label})` : String(i));
  const lines = [r.summary, ""];
  lines.push(`Window m = ${r.window} (${r.windowSource}: ${r.windowReason}); exclusion zone ${r.exclusionZone}; ${r.subsequences} subsequences.`);
  lines.push("", "Motifs (most similar pairs):");
  for (const t of r.motifs) lines.push(`  #${t.rank}  ${at(t.a, t.aLabel)}  and  ${at(t.b, t.bLabel)}   distance ${t.distance.toFixed(4)}   correlation ${t.correlation.toFixed(4)}`);
  lines.push("", "Discords (most unusual subsequences):");
  for (const t of r.discords) lines.push(`  #${t.rank}  ${at(t.index, t.label)}   distance ${t.distance.toFixed(4)} to nearest ${at(t.nearest, t.nearestLabel)}`);
  if (r.warnings.length) lines.push("", ...r.warnings.map((w) => `Note: ${w}`));
  return lines.join("\n");
}

export function main(argv, stdinText = null) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    return { code: 2, out: "", err: `${e.message}\n\n${HELP}` };
  }
  if (o.help) return { code: 0, out: HELP, err: "" };
  let csv = null;
  if (!o.example) {
    if (o.file && o.file !== "-") {
      try {
        csv = readFileSync(o.file, "utf8");
      } catch (e) {
        return { code: 2, out: "", err: `cannot read ${o.file}: ${e.code || e.message}\n` };
      }
    } else {
      csv = stdinText ?? readStdin();
      if (!csv.trim()) return { code: 2, out: "", err: `no input: give a CSV file, pipe one on stdin, or use --example\n\n${HELP}` };
    }
  }
  const r = analyze({ csv, column: o.column, window: o.window, top: o.top, detrend: o.detrend, includeProfile: o.json && o.profile });
  if (r.error) return { code: 1, out: "", err: `${r.error}${r.columns ? `\nColumns: ${r.columns.join(", ")}` : ""}\n` };
  return { code: 0, out: o.json ? JSON.stringify(r, null, 2) + "\n" : fmt(r) + "\n", err: "" };
}

const isMain = (() => {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const argv = process.argv.slice(2);
  // A terminal on stdin with no file means no input, not a wait for typing.
  const res = main(argv, process.stdin.isTTY ? "" : null);
  if (res.out) process.stdout.write(res.out);
  if (res.err) process.stderr.write(res.err);
  process.exitCode = res.code;
}
