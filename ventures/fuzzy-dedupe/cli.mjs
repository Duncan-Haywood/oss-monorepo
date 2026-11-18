#!/usr/bin/env node
// Fuzzy duplicate finder from the command line. Zero dependencies; same engine as the page.
//   node cli.mjs contacts.csv [--threshold 0.9] [--annotated out.csv] [--merged out.csv] [--json]
import { readFileSync, writeFileSync } from "node:fs";
import { analyze, annotatedCsv, mergedCsv, parseCsv, PAPERS, FIELD_TYPES, guessTypes, fmtPct } from "./engine.mjs";
import { pathToFileURL } from "node:url";

export const HELP = `fuzzy-dedupe: find duplicate people or companies in a CSV, even when names, emails
and addresses are spelled differently (Fellegi-Sunter record linkage with EM-learned weights)

Usage:
  node cli.mjs [file | -] [options]        (reads stdin when no file or "-")

Input: a CSV with a header row. Column types are guessed from the headers
(first name, last name, email, phone, company, address, city, ZIP, state,
date of birth, ID number); override with --column.

Options:
  --column "Header=type"  set a column's type (repeatable). Types: ${Object.keys(FIELD_TYPES).join(", ")}
  --threshold 0.9         match probability at or above which rows are grouped
  --review 0.5            probability at or above which a pair is listed as borderline
  --no-name-guard         let pairs with clearly different first names merge on other fields
  --annotated FILE        write the input with duplicate_group, keep, best_match_row columns
  --merged FILE           write one row per person (groups merged, blanks filled)
  --json                  print the full JSON result
  --help                  this text

Citations:
${PAPERS.map((p) => `  ${p.authors} (${p.year}). ${p.title}. ${p.venue}.${p.doi ? ` doi:${p.doi}` : ""} ${p.url}`).join("\n")}

Statistical matching on your data; check groups before deleting anything. No warranty. MIT licence.
Web version: https://marisstella.app/fuzzy-dedupe/`;

export function parseArgs(argv) {
  const o = { json: false, help: false, file: null, columns: {}, annotated: null, merged: null, opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--json") o.json = true;
    else if (a === "--no-name-guard") o.opts.differentNameGuard = false;
    else if (a === "--threshold" || a === "--review") {
      const v = Number(next());
      if (!(v > 0 && v < 1)) throw new Error(`${a} must be between 0 and 1`);
      o.opts[a === "--threshold" ? "matchThreshold" : "reviewThreshold"] = v;
    } else if (a === "--column") {
      const v = next();
      const eq = v.lastIndexOf("=");
      if (eq < 1) throw new Error(`--column wants "Header=type", got "${v}"`);
      const t = v.slice(eq + 1).trim();
      if (!FIELD_TYPES[t]) throw new Error(`unknown type "${t}"`);
      o.columns[v.slice(0, eq).trim()] = t;
    } else if (a === "--annotated") o.annotated = next();
    else if (a === "--merged") o.merged = next();
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else o.file = a;
  }
  return o;
}

export function run(argv, readInput = (f) => readFileSync(f === "-" || !f ? 0 : f, "utf8")) {
  const o = parseArgs(argv);
  if (o.help) return { out: HELP, code: 0 };
  const { header, rows } = parseCsv(readInput(o.file));
  const types = guessTypes(header).map((t, j) => o.columns[header[j]] || t);
  for (const h of Object.keys(o.columns)) if (!header.includes(h)) throw new Error(`no column named "${h}"`);
  const r = analyze({ header, rows, types, ...o.opts });
  const files = {};
  if (o.annotated) files[o.annotated] = annotatedCsv(r, rows);
  if (o.merged) files[o.merged] = mergedCsv(r, rows);
  if (o.json) return { out: JSON.stringify(r, null, 2), code: 0, files };
  const lines = [r.summary, "", "Columns compared: " + header.map((h, j) => `${h} (${types[j]})`).filter((_, j) => types[j] !== "ignore").join(", ")];
  lines.push(`Compared ${r.candidatePairs.toLocaleString("en-US")} of ${r.allPairs.toLocaleString("en-US")} possible pairs (blocking).`);
  for (const g of r.groups.slice(0, 50)) {
    lines.push("", `Group ${g.id} (${g.members.length} rows, weakest link ${fmtPct(g.minLink)}; keep row ${g.keep + 2}):`);
    for (const i of g.members) lines.push(`  row ${i + 2}: ${rows[i].filter(Boolean).join(" | ")}`);
  }
  if (r.groups.length > 50) lines.push("", `... and ${r.groups.length - 50} more groups (use --annotated to get them all).`);
  if (r.review.length) {
    lines.push("", "Borderline pairs (look before merging):");
    for (const p of r.review.slice(0, 20)) lines.push(`  rows ${p.a + 2} and ${p.b + 2}: ${fmtPct(p.probability)}${p.held ? " (different first names, held back)" : ""}`);
  }
  return { out: lines.join("\n"), code: 0, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { out, code, files } = run(process.argv.slice(2));
    for (const [f, text] of Object.entries(files || {})) writeFileSync(f, text);
    console.log(out);
    process.exit(code);
  } catch (e) {
    console.error(`fuzzy-dedupe: ${e.message}`);
    process.exit(2);
  }
}
