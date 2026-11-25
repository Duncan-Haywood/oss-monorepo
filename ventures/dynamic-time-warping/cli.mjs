#!/usr/bin/env node
// Dynamic time warping between two series in a CSV, or a short pattern searched
// for in a long one, from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv --a before --b after [--json | --csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, PAPERS, fmt } from "./engine.mjs";

export const HELP = `dynamic-time-warping: how alike are these two series once timing is allowed to stretch, and where is one ahead of the other?

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab or semicolon) with a header row and one series per
numeric column, one row per time step. A text column (a date or label) is
used to name the rows. Blank cells at either end of a column are dropped;
blank cells inside it are filled by straight lines between neighbours.

Options:
  --a NAME              the first series (default: the first numeric column)
  --b NAME              the second series (default: the next numeric column)
  --mode pair           pair: align a with b; subsequence: find the column a (short) inside b (long)
  --step symmetric2     symmetric2 (divided by N+M), symmetric1, or asymmetric (divided by N)
  --window-type band    band (around the diagonal), itakura (parallelogram) or none
  --window W            band half-width in steps (default: 10% of the longer series)
  --dist abs            abs or squared difference between two points
  --smooth H            centred moving average over +/- H steps first (default 0)
  --znorm               z-normalise each series first, to compare shape rather than level
  --matches 5           subsequence mode: how many non-overlapping matches
  --label NAME          the column that names the rows (default: the first text column)
  --no-matrix           skip the distance matrix between every pair of numeric columns
  --csv                 print the alignment (pair) or the matches (subsequence) as CSV
  --json                print the full JSON result
  --help                this text

Lag: for each point of a, the matched point of b minus its own position, in
rows. Negative means b reaches the same value earlier. Each point is read as
"timing" (the warp closes the gap), "level" (it does not), "turn" (a sits at a
peak or trough, so the lag is a hop across it, not a delay) or "same" (no gap).

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}. doi:${p.doi}`).join("\n")}

Checked against dtw-python 1.9.0 (eval/reference.json). Statistical output from
your data, not financial, legal, medical or professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/dynamic-time-warping/`;

const FLAGS = {
  "--a": "a",
  "--b": "b",
  "--mode": "mode",
  "--step": "step",
  "--window-type": "windowType",
  "--window": "window",
  "--dist": "dist",
  "--smooth": "smooth",
  "--matches": "matches",
  "--label": "label",
};
const INTEGER = new Set(["window", "smooth", "matches"]);
const CHOICES = {
  mode: ["pair", "subsequence"],
  step: ["symmetric1", "symmetric2", "asymmetric"],
  windowType: ["band", "itakura", "none"],
  dist: ["abs", "squared"],
};

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, file: null, znorm: false, matrix: true };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--znorm") o.znorm = true;
    else if (a === "--no-matrix") o.matrix = false;
    else if (FLAGS[a]) {
      if (val === undefined) {
        val = argv[++i];
        if (val === undefined) throw new Error(`${a} needs a value`);
      }
      const key = FLAGS[a];
      if (INTEGER.has(key)) {
        if (!/^\d+$/.test(val)) throw new Error(`${a} needs a whole number, got "${val}"`);
        o[key] = Number(val);
      } else if (CHOICES[key] && !CHOICES[key].includes(val)) throw new Error(`${a} is one of ${CHOICES[key].join(", ")}`);
      else o[key] = val;
    } else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

const pct = (v) => `${Math.round(100 * v)}%`;

export function formatText(r) {
  const out = [r.summary, ""];
  for (const w of r.notes) out.push(`Note: ${w}`);
  if (r.notes.length) out.push("");
  const s = r.settings;
  out.push(`Settings: ${s.mode}, step ${s.step}, window ${s.windowType}${s.windowType === "band" ? ` ${s.window}` : ""}, ${s.dist} difference${s.smooth ? `, smoothed +/- ${s.smooth}` : ""}${s.znorm ? ", z-normalised" : ""}.`);
  if (r.subsequence) {
    out.push("", `Matches of "${r.a}" in "${r.b}" (cost per query point; lower is closer):`);
    out.push(`  ${"rank".padEnd(5)} ${"from".padEnd(14)} ${"to".padEnd(14)} ${"length".padStart(7)} ${"per point".padStart(10)}`);
    for (const t of r.subsequence.matches) out.push(`  ${String(t.rank).padEnd(5)} ${String(t.from).padEnd(14)} ${String(t.to).padEnd(14)} ${String(t.length).padStart(7)} ${fmt(t.normalizedDistance).padStart(10)}`);
    return out.join("\n");
  }
  const p = r.pair;
  out.push(`Path: ${p.pathLength} steps, ${pct(p.diagonalShare)} diagonal.`);
  out.push("", `Lag of "${r.b}" against "${r.a}", by stretch of "${r.a}" (rows; negative = ${r.b} earlier):`);
  out.push(`  ${"from".padEnd(12)} ${"to".padEnd(12)} ${"timing lag".padStart(11)} ${"timing".padStart(7)} ${"turn".padStart(5)} ${"level".padStart(6)} ${"gap".padStart(8)} ${"left".padStart(8)}`);
  for (const g of p.segments) {
    out.push(`  ${String(g.from).padEnd(12)} ${String(g.to).padEnd(12)} ${(g.timingLag === null ? "-" : fmt(g.timingLag, 1)).padStart(11)} ${pct(g.timingShare).padStart(7)} ${pct(g.turnShare).padStart(5)} ${pct(g.levelShare).padStart(6)} ${fmt(g.meanGap).padStart(8)} ${fmt(g.meanResidual).padStart(8)}`);
  }
  out.push("  (gap: |a - b| at the same row; left: what remains after warping)");
  if (r.matrix) {
    const m = r.matrix;
    const w = Math.max(8, ...m.columns.map((c) => c.length));
    out.push("", `DTW distance between every pair of columns (${m.normalized ? "per step" : "total"}):`);
    out.push(`  ${"".padEnd(w)} ${m.columns.map((c) => c.padStart(w)).join(" ")}`);
    m.cells.forEach((row, i) => out.push(`  ${m.columns[i].padEnd(w)} ${row.map((v) => (v === null ? "-" : fmt(v)).padStart(w)).join(" ")}`));
    out.push("", "Nearest column to each:");
    for (const n of m.nearest) out.push(`  ${n.column} -> ${n.nearest ?? "-"} (${fmt(n.distance)})`);
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
  const input = { csv, znorm: o.znorm, matrix: o.matrix };
  for (const k of Object.values(FLAGS)) if (o[k] !== undefined) input[k] = o[k];
  const r = analyze(input);
  if (r.error) return { code: 1, out: `Error: ${r.error}` };
  if (o.json) {
    const { series, ...rest } = r;
    if (rest.pair) rest.pair = { ...rest.pair, profile: rest.pair.profile.map(({ matched, ...p }) => p) };
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
