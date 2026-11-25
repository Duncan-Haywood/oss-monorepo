#!/usr/bin/env node
// Inter-rater agreement from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs ratings.csv [--layout auto|wide|long|counts] [--scale auto|nominal|ordinal|interval|ratio] [--json | --csv]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { analyze, toCsv, report, PAPERS, SCALES } from "./engine.mjs";

export const HELP = `inter-rater-agreement: do your raters agree beyond chance, and where do they not?

Krippendorff's alpha (nominal, ordinal, interval or ratio; any number of
raters; missing ratings allowed) with a bootstrap interval, plus Cohen's
(weighted) kappa for two raters, Fleiss' kappa and Gwet's AC1/AC2 for many,
pairwise kappas, alpha with each rater left out, per-category kappa, and the
six intraclass correlations for numeric ratings.

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV (comma, tab or semicolon) with a header row, in one of three layouts:
  wide    one row per subject, one column per rater (an id column such as
          "id" or "subject" is recognised by name); the default
  long    three columns: subject, rater, rating (picked when a column is
          named rater, coder, annotator, judge, ...)
  counts  one row per subject, one column per category, each cell the number
          of raters who chose it (Fleiss' layout; no rater-level views)
Empty cells, NA, N/A, ".", "-" and "?" are missing.

Options:
  --layout MODE         auto, wide, long or counts (default auto)
  --scale MODE          auto, ${SCALES.join(", ")} (default auto: labels nominal,
                        up to 10 whole-number levels ordinal, other numbers interval)
  --categories a,b,c    the possible categories in order (makes the scale ordinal
                        unless --scale says otherwise; sets q for Gwet's AC1)
  --id NAME             wide layout: the subject id column ("none" for no id column)
  --confidence 0.95     interval level
  --bootstrap 1000      bootstrap replicates for the multi-rater intervals (0 = off)
  --seed 1              bootstrap seed
  --csv                 one row per subject: ratings, modal rating, agreement
  --json                the result as JSON (without the per-subject rows)
  --help                this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ` ${p.url}`}`).join("\n")}

Statistical output from your data, not legal, medical, financial or professional advice. No warranty. FSL-1.1-MIT licence.
Web version: https://marisstella.app/inter-rater-agreement/`;

const FLAGS = {
  "--layout": ["layout", "text"],
  "--scale": ["scale", "text"],
  "--categories": ["categories", "text"],
  "--id": ["idColumn", "text"],
  "--confidence": ["confidence", "fraction"],
  "--bootstrap": ["bootstrap", "count"],
  "--seed": ["seed", "count"],
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
      else if (kind === "count") {
        const v = Number(val);
        if (!(Number.isInteger(v) && v >= 0)) throw new Error(`${a} needs a whole number, got "${val}"`);
        o.input[key] = v;
      } else {
        const v = Number(val);
        if (!(v > 0 && v < 1)) throw new Error(`${a} needs a number between 0 and 1, got "${val}"`);
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
    const { subjects, ...rest } = r;
    return { code: 0, out: JSON.stringify(rest, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? null : v), 2) };
  }
  return { code: 0, out: report(r) };
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
