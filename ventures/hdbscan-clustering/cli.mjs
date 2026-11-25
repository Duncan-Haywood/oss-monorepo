#!/usr/bin/env node
// HDBSCAN clustering from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs data.csv [--columns a,b,c] [--min-cluster-size 5] [--json | --csv]
import { readFileSync } from "node:fs";
import { analyze, toCsv, PAPERS, fmt } from "./engine.mjs";
import { pathToFileURL } from "node:url";

export const HELP = `hdbscan-clustering: find the groups in a table, how many, and which rows belong to none (HDBSCAN, Campello, Moulavi & Sander 2013)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab or semicolon) with a header row. Every numeric column
is a feature unless it looks like an ID or a year, or is a code with 3 or
fewer values. Rows with a missing feature value are left out. Text columns
are not clustered on; they describe the clusters' make-up.

Options:
  --columns a,b,c         feature columns to use (default: the numeric columns, as above)
  --label NAME            column that names each row in the output
  --min-cluster-size 5    the smallest group worth calling a cluster
  --min-samples N         neighbours that make a row "dense" (default: the min cluster size);
                          larger is more conservative, more rows become noise
  --method eom            "eom" (excess of mass: the most persistent clusters) or
                          "leaf" (many small, tight clusters)
  --allow-single-cluster  let the whole table be one cluster when nothing splits it
  --scale standard        "standard" (z-scores), "robust" (median and IQR) or "none"
  --top 10                how many of the strongest outliers to list
  --csv                   print label, line, cluster, membership, outlier score for every row
  --json                  print the full JSON result
  --help                  this text

Membership (0 to 1): how deep inside its cluster a row sits; noise rows have 0.
Outlier score (GLOSH, 0 to 1): near 0 at the dense heart of a cluster, near 1
far from any dense region.

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""}`).join("\n")}

Statistical output from your data, not financial, legal or professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/hdbscan-clustering/`;

const FLAGS = {
  "--columns": "columns",
  "--label": "labelColumn",
  "--min-cluster-size": "minClusterSize",
  "--min-samples": "minSamples",
  "--method": "method",
  "--scale": "scale",
  "--top": "top",
};
const NUMERIC = new Set(["minClusterSize", "minSamples", "top"]);

export function parseArgs(argv) {
  const o = { json: false, help: false, csv: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let val;
    if (a.startsWith("--") && a.includes("=")) [a, val] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--allow-single-cluster") o.allowSingleCluster = true;
    else if (FLAGS[a]) {
      if (val === undefined) {
        val = argv[++i];
        if (val === undefined) throw new Error(`${a} needs a value`);
      }
      const key = FLAGS[a];
      if (NUMERIC.has(key)) {
        if (!/^\d+$/.test(val)) throw new Error(`${a} needs a whole number, got "${val}"`);
        o[key] = Number(val);
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
  for (const c of r.clusters) {
    out.push(`Cluster ${c.label + 1}: ${c.size} rows (${(c.share * 100).toFixed(1)}%), mean membership ${c.meanStrength.toFixed(2)}, stability ${fmt(c.stability)}, most typical: ${c.exemplar.label}`);
    out.push(`  medians: ${c.columns.map((x) => `${x.column} ${fmt(x.median)}`).join(", ")}`);
    for (const m of c.mostly) out.push(`  ${m.column}: ${m.values.map((v) => `${v.value} ${v.count}`).join(", ")}`);
  }
  if (r.noise) out.push(`Noise: ${r.noiseCount} rows${r.noise.mostly.length ? `; ${r.noise.mostly.map((m) => `${m.column}: ${m.values.map((v) => `${v.value} ${v.count}`).join(", ")}`).join("; ")}` : ""}`);
  out.push("", "Strongest outliers (GLOSH score; near 1 = far from any dense region):");
  for (const o of r.outliers) {
    const why = o.standsOut.map((f) => `${f.column} ${fmt(f.value)} (${f.z > 0 ? "+" : ""}${f.z.toFixed(1)} SD)`).join(", ") || "no single column extreme";
    out.push(`  ${o.label.padEnd(14)} ${o.score.toFixed(3)}  ${o.cluster < 0 ? "noise    " : `cluster ${String(o.cluster + 1).padEnd(2)}`} ${why}`);
  }
  const p = r.params;
  out.push("", `Features: ${r.features.join(", ")} (scale: ${p.scale}). min_cluster_size ${p.minClusterSize}, min_samples ${p.minSamples}, selection ${p.method}${p.allowSingleCluster ? ", single cluster allowed" : ""}.`);
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
  for (const k of [...Object.values(FLAGS), "allowSingleCluster"]) if (o[k] !== undefined) input[k] = o[k];
  const r = analyze(input);
  if (r.error) return { code: 1, out: `Error: ${r.error}` };
  if (o.json) {
    const { matrix, projection, ...rest } = r;
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
