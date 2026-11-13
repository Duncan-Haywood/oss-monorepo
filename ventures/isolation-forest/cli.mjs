#!/usr/bin/env node
// Isolation forest from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv [--columns a,b,c] [--contamination 0.05] [--json | --csv]
import { readFileSync } from "node:fs";
import { analyze, toCsv, PAPERS, fmt } from "./engine.mjs";

export const HELP = `isolation-forest: rank the rows of a table from most to least unusual (Liu, Ting & Zhou 2008)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab or semicolon) with a header row. Every numeric column
is a feature unless it looks like an ID or a code with 3 or fewer values;
missing cells are filled with the column median. The first ID or text column
labels the rows.

Options:
  --columns a,b,c      feature columns to use (default: the numeric columns, as above)
  --label NAME         column that names each row in the output
  --trees 100          number of isolation trees (1 to 20,000)
  --sample-size 256    rows drawn for each tree (the paper's psi)
  --seed 42            random seed; the same seed gives the same scores
  --contamination X    "auto" (flag scores above 0.5) or a share such as 0.05 (flag the top 5%)
  --top 20             how many of the most unusual rows to list
  --csv                print label, line, score, rank, flagged, mean path length for every row
  --json               print the full JSON result
  --help               this text

Score: s = 2^(-E[h] / c(psi)), where E[h] is the average number of random cuts
needed to isolate the row. Near 1: isolated almost at once, an anomaly. Well
below 0.5: an ordinary row. All near 0.5: no distinct anomaly in the data.

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

Statistical output from your data, not financial, legal or professional advice. No warranty. MIT licence.
Web version: https://marisstella.app/isolation-forest/`;

const FLAGS = {
  "--columns": "columns",
  "--label": "labelColumn",
  "--trees": "trees",
  "--sample-size": "sampleSize",
  "--seed": "seed",
  "--contamination": "contamination",
  "--top": "top",
};
const NUMERIC = new Set(["trees", "sampleSize", "seed", "top"]);

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
      if (NUMERIC.has(key)) {
        if (!/^-?\d+$/.test(val)) throw new Error(`${a} needs a whole number, got "${val}"`);
        o[key] = Number(val);
      } else if (key === "contamination") {
        if (val !== "auto" && !Number.isFinite(Number(val))) throw new Error(`${a} needs "auto" or a number such as 0.05`);
        o[key] = val === "auto" ? "auto" : Number(val);
      } else o[key] = val;
    } else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

export function formatText(r) {
  const out = [r.summary, ""];
  for (const w of r.warnings) out.push(`Note: ${w}`);
  if (r.warnings.length) out.push("");
  out.push(`Most unusual rows (score; near 1 = anomaly, below 0.5 = ordinary):`);
  for (const t of r.top) {
    const why = t.standsOut.map((f) => `${f.column} ${fmt(f.value)} (${f.z > 0 ? "+" : ""}${f.z.toFixed(1)} SD)`).join(", ") || "rare combination of values";
    out.push(`  ${String(t.rank).padStart(3)}. ${t.label.padEnd(14)} ${t.score.toFixed(3)}${t.flagged ? " *" : "  "}  ${why}`);
  }
  out.push("", `* flagged (${r.params.contamination === "auto" ? "score above 0.5" : `top ${(r.params.contamination * 100).toFixed(1)}%`}): ${r.flaggedCount} of ${r.n} rows.`);
  out.push(`Scores: median ${r.stats.median.toFixed(3)}, 90th percentile ${r.stats.p90.toFixed(3)}, highest ${r.stats.max.toFixed(3)}.`);
  const p = r.params;
  out.push(`Features: ${r.features.join(", ")}. ${p.trees} trees, ${p.sampleSize} rows each, height limit ${p.heightLimit}, seed ${p.seed}.`);
  out.push(`SD = robust standard deviations from the column median (1.4826 x MAD).`);
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
