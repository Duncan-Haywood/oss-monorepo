#!/usr/bin/env node
// Wasserstein distance (earth mover's distance) between two groups, from the command line.
// Zero dependencies; same engine as the page.
//   node cli.mjs data.csv --group period [--columns a,b] [--json | --csv]
import { readFileSync } from "node:fs";
import { analyze, toCsv, PAPERS, fmt } from "./engine.mjs";
import { pathToFileURL } from "node:url";

export const HELP = `wasserstein-distance: how far apart are two groups' distributions, in your units, and where did the mass move?

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab or semicolon) with a header row, one column naming
the group of each row (for example period, site, variant) and one or more
numeric columns. Rows missing a chosen value are left out.

Options:
  --group NAME          the column that names the groups (default: guessed)
  --groups A,B          the two values to compare, first is the baseline (default: the first two seen)
  --columns a,b,c       numeric columns to compare (default: all of them)
  --cost euclidean      euclidean (W1, earth mover's distance) or sqeuclidean (W2) for several columns
  --scale auto          auto, sd or none: divide each column by its pooled SD before
                        the several-column distance (auto = sd)
  --blur 0.01           Sinkhorn's eps as a share of the mean cost; smaller is a tighter, slower bracket
  --permutations 999    shuffles for each column's W1 test (0 to skip)
  --energy-permutations 199   shuffles for the several-column energy test (0 to skip)
  --max-points 1200     rows per group for the several-column problems (seeded subsample above it)
  --seed 42             random seed for shuffles and subsamples
  --csv                 print the per-column table
  --json                print the full JSON result
  --help                this text

One column: W1 is the area between the two CDFs, exact. W1 = mass moved up +
mass moved down, and up - down = the mean shift. W2^2 = location + spread + shape.
Several columns: optimal transport by log-stabilised Sinkhorn iterations; the
exact (unregularised) distance is certified to lie between a dual lower bound
and the cost of a rounded feasible plan.

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ` ${p.url}`}`).join("\n")}

Statistical output from your data, not financial, legal, medical or professional advice. No warranty. MIT licence.
Web version: https://marisstella.app/wasserstein-distance/`;

const FLAGS = {
  "--group": "group",
  "--groups": "groups",
  "--columns": "columns",
  "--cost": "cost",
  "--scale": "scale",
  "--blur": "blur",
  "--permutations": "permutations",
  "--energy-permutations": "energyPermutations",
  "--max-points": "maxPoints",
  "--seed": "seed",
};
const INTEGER = new Set(["permutations", "energyPermutations", "maxPoints", "seed"]);

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
      if (INTEGER.has(key)) {
        if (!/^\d+$/.test(val)) throw new Error(`${a} needs a whole number, got "${val}"`);
        o[key] = Number(val);
      } else if (key === "blur") {
        if (!(Number(val) > 0)) throw new Error(`${a} needs a positive number such as 0.01`);
        o[key] = Number(val);
      } else if (key === "cost" && !["euclidean", "sqeuclidean"].includes(val)) throw new Error(`${a} is euclidean or sqeuclidean`);
      else if (key === "scale" && !["auto", "sd", "none"].includes(val)) throw new Error(`${a} is auto, sd or none`);
      else o[key] = val;
    } else if (a === "-" || !a.startsWith("-")) o.file = a;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

const p3 = (p) => (p === null ? "" : p < 0.001 ? "<0.001" : p.toFixed(3));

export function formatText(r) {
  const [A, B] = r.groups;
  const out = [r.summary, ""];
  for (const w of r.warnings) out.push(`Note: ${w}`);
  if (r.warnings.length) out.push("");
  out.push(`One column at a time (${B} minus ${A}; exact):`);
  out.push(`  ${"column".padEnd(16)} ${"W1".padStart(10)} ${"mean shift".padStart(11)} ${"moved up".padStart(10)} ${"moved down".padStart(10)} ${"W2".padStart(10)}  p (W1)`);
  for (const c of r.columns) {
    out.push(`  ${c.column.padEnd(16)} ${fmt(c.w1).padStart(10)} ${fmt(c.meanShift).padStart(11)} ${fmt(c.movedUp).padStart(10)} ${fmt(c.movedDown).padStart(10)} ${fmt(c.w2).padStart(10)}  ${p3(c.pValue)}`);
  }
  out.push("", "Quantile shifts (B minus A):");
  out.push(`  ${"column".padEnd(16)} ${r.columns[0].quantiles.map((q) => `q${Math.round(q.p * 100)}`.padStart(9)).join("")}`);
  for (const c of r.columns) out.push(`  ${c.column.padEnd(16)} ${c.quantiles.map((q) => fmt(q.shift).padStart(9)).join("")}`);
  out.push("", "W2 squared = location + spread + shape:");
  for (const c of r.columns) {
    const t = c.w2 ** 2 || 1;
    const pc = (v) => `${Math.round((100 * v) / t)}%`;
    out.push(`  ${c.column.padEnd(16)} ${fmt(c.w2 ** 2)} = ${pc(c.w2Parts.location)} location + ${pc(c.w2Parts.spread)} spread + ${pc(c.w2Parts.shape)} shape`);
  }
  if (r.multi) {
    const m = r.multi;
    out.push("", `All columns at once (${m.metric}, in ${m.units}):`);
    out.push(`  distance ${fmt(m.distance)}; exact value between ${fmt(m.lower)} and ${fmt(m.upper)}`);
    out.push(`  Sinkhorn eps ${fmt(m.eps)} (blur ${m.blur}), ${m.iterations} iterations, marginal error ${fmt(m.marginalError)}`);
    out.push(`  share of the movement: ${m.columnShare.map((s) => `${s.column} ${Math.round(s.share * 100)}%`).join(", ")}`);
    if (m.energy) out.push(`  energy distance ${fmt(m.energy.statistic)}, permutation p ${p3(m.energy.pValue)} (${m.energy.permutations} shuffles)`);
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
    const { points, ...rest } = r;
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
