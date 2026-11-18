#!/usr/bin/env node
// Scores the IDS audit on files written by others (eval/fetch-audit-corpus.sh):
//
// 1. buildingSMART's IDS-Audit-tool test files: ValidFiles must audit with no
//    error, InvalidFiles should (some are invalid only by XML schema, which this
//    audit does not check).
// 2. Real IDS files from public repositories: counts each audit code, and lists
//    the property set template findings (pset-*) so each can be read by hand.
//
//   node eval/audit-corpus.mjs [--all]     # --all lists every finding
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseIds } from "../ids.mjs";
import { auditIds } from "../audit.mjs";
import { resources } from "../node.mjs";

const here = new URL(".", import.meta.url).pathname;
const all = process.argv.includes("--all");
const tool = join(here, "corpus/IDS-Audit-tool/testing.shared");
const real = join(here, "corpus/real");
if (!existsSync(tool) || !existsSync(real)) { console.error("run eval/fetch-audit-corpus.sh first"); process.exit(2); }

const auditFile = (f) => auditIds(parseIds(readFileSync(f, "utf8")), resources());
const errorsOf = (iss) => [...new Set(iss.filter((x) => x.level === "error").map((x) => x.code))];

console.log("IDS-Audit-tool test files");
for (const sub of ["ValidFiles", "InvalidFiles"]) {
  let n = 0, flagged = 0, unread = 0;
  for (const f of readdirSync(join(tool, sub)).filter((f) => f.endsWith(".ids")).sort()) {
    let codes;
    try { codes = errorsOf(auditFile(join(tool, sub, f))); } catch { unread++; continue; }
    n++;
    if (codes.length) flagged++;
    if (all || (sub === "ValidFiles" && codes.length) || codes.some((c) => c.startsWith("pset-"))) console.log(`  ${sub}/${f}: ${codes.length ? "INVALID " + codes.join(",") : "valid"}`);
  }
  console.log(`  ${sub}: ${flagged} of ${n} read as invalid${unread ? ` (${unread} not readable as IDS)` : ""}`);
}

console.log("\nReal IDS files");
const tally = {};
let files = 0, specs = 0, withPset = 0;
const lines = [];
for (const f of readdirSync(real).filter((f) => f.endsWith(".ids")).sort()) {
  let ids;
  try { ids = parseIds(readFileSync(join(real, f), "utf8")); } catch (e) { console.log(`  skipped ${f}: ${e.message}`); continue; }
  files++;
  specs += ids.specs.length;
  const iss = auditIds(ids, resources());
  if (iss.some((x) => x.code.startsWith("pset-"))) withPset++;
  for (const x of iss) {
    tally[`${x.level} ${x.code}`] = (tally[`${x.level} ${x.code}`] || 0) + 1;
    if (all || x.code.startsWith("pset-")) lines.push(`  ${f.slice(0, 60)}: ${x.level} ${x.code}: ${x.message}`);
  }
}
for (const l of [...new Set(lines)]) console.log(l);
console.log(`  ${files} files, ${specs} specifications; ${withPset} files with a property set template finding`);
for (const [k, v] of Object.entries(tally).sort()) console.log(`  ${k}: ${v}`);
