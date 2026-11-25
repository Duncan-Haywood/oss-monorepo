#!/usr/bin/env node
// Robust PCA (principal component pursuit) from the command line.
// Zero dependencies; same engine as the page.
//   node cli.mjs table.csv [--label date] [--columns a,b] [--fold 24] [--json | --csv]
import { readFileSync } from "node:fs";
import { analyze, toCsv, PAPERS, fmt } from "./engine.mjs";
import { pathToFileURL } from "node:url";

export const HELP = `robust-pca: which cells of this table break the pattern the rest share?

Splits a table M into a low-rank part L (the pattern the rows share) and a
sparse part S (the few cells that break it), M = L + S, by principal component
pursuit: minimise ||L||_* + lambda ||S||_1 with lambda = 1/sqrt(max(rows, cols)).
Empty cells are filled from L. Every result carries a duality certificate: the
split is within the stated gap of the best possible.

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab or semicolon) with a header row. Rows are the
things measured (days, stores, sensors), numeric columns are the repeated
measurements (hours, weeks, channels). A text column, if any, names the rows.

Options:
  --label NAME        the column that names the rows (default: the first text column)
  --columns a,b,c     numeric columns that form the table (default: all of them)
  --fold P            fold one long numeric column into rows of P values (24 = hours into days)
  --scale none        none, or robust: subtract each column's median and divide by its MAD
                      first (for columns in different units); results stay in your units
  --sensitivity 1     multiplies lambda; 2 flags fewer cells, 0.5 more
  --top 25            how many cells and rows to list
  --csv               print every cell: observed, low_rank, sparse, flagged
  --json              print the full JSON result
  --help              this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ` ${p.url}`}`).join("\n")}

Statistical output from your data, not financial, legal, medical or professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/robust-pca/`;

const FLAGS = {
  "--label": "labelColumn",
  "--columns": "columns",
  "--fold": "fold",
  "--scale": "scale",
  "--sensitivity": "sensitivity",
  "--top": "top",
};

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, file: null };
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
      const key = FLAGS[a];
      if (key === "fold" || key === "top") {
        if (!/^\d+$/.test(val)) throw new Error(`${a} needs a whole number, got "${val}"`);
        o[key] = Number(val);
      } else if (key === "sensitivity") {
        if (!(Number(val) > 0)) throw new Error(`${a} needs a positive number such as 1`);
        o[key] = Number(val);
      } else if (key === "scale" && !["none", "robust"].includes(val)) throw new Error(`${a} is none or robust`);
      else if (key === "columns") o[key] = val.split(",").map((s) => s.trim()).filter(Boolean);
      else o[key] = val;
    } else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

const pct = (g) => (g < 1e-4 ? "< 0.01%" : `${(100 * g).toFixed(g < 0.001 ? 3 : 2)}%`);

export function formatText(r) {
  const out = [r.summary, ""];
  for (const w of r.warnings) out.push(`Note: ${w}`);
  if (r.warnings.length) out.push("");
  out.push(`Low-rank part: rank ${r.rank}; share of it held by each pattern: ${r.energy.slice(0, 5).map((e) => `${(100 * e).toFixed(2)}%`).join(", ")}${r.rank > 5 ? ", ..." : ""}`);
  out.push(`Sparse part: ${r.nonzero.toLocaleString("en-US")} nonzero cells, ${r.flaggedCount.toLocaleString("en-US")} above the noise line of ${fmt(r.threshold)}`);
  out.push(`lambda ${fmt(r.lambda)} (sensitivity ${r.sensitivity}), ${r.iterations} iterations, certified gap ${pct(r.gap)}`);
  if (r.rows.length) {
    out.push("", "Rows that break the pattern most:");
    out.push(`  ${"row".padEnd(18)} ${"cells".padStart(6)} ${"net".padStart(12)} ${"total |S|".padStart(12)}`);
    for (const x of r.rows) out.push(`  ${String(x.row).padEnd(18)} ${String(x.flagged).padStart(6)} ${fmt(x.net).padStart(12)} ${fmt(x.absSparse).padStart(12)}`);
    out.push("", "Largest single cells:");
    out.push(`  ${"row".padEnd(18)} ${"column".padEnd(10)} ${"observed".padStart(12)} ${"expected".padStart(12)} ${"sparse".padStart(12)}`);
    for (const c of r.cells) out.push(`  ${String(c.row).padEnd(18)} ${String(c.column).padEnd(10)} ${fmt(c.observed).padStart(12)} ${fmt(c.expected).padStart(12)} ${fmt(c.sparse).padStart(12)}`);
  }
  if (r.filled.length) {
    out.push("", "Empty cells, filled from the low-rank part:");
    for (const f of r.filled.slice(0, 25)) out.push(`  ${String(f.row).padEnd(18)} ${String(f.column).padEnd(10)} ${fmt(f.filled).padStart(12)}`);
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
  for (const k of Object.values(FLAGS)) if (o[k] !== undefined) input[k] = o[k];
  const r = analyze(input);
  if (r.error) return { code: 1, out: `Error: ${r.error}` };
  if (o.json) {
    const { L, S, M, observed, ...rest } = r;
    return { code: 0, out: JSON.stringify(rest, null, 2) };
  }
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
