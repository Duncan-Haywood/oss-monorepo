#!/usr/bin/env node
// Counts the audit's class-abstract warnings (an entity facet naming an
// abstract class, which IDS matches as an exact class and so never applies)
// on the files eval/fetch-audit-corpus.sh and eval/fetch-testcases.sh fetch.
//
//   node eval/abstract-classes.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseIds } from "../ids.mjs";
import { auditIds } from "../audit.mjs";
import { resources } from "../node.mjs";

const here = new URL(".", import.meta.url).pathname;
const sets = [
  ["real", join(here, "corpus/real")],
  ["IDS-Audit-tool ValidFiles", join(here, "corpus/IDS-Audit-tool/testing.shared/ValidFiles")],
  ["IDS-Audit-tool InvalidFiles", join(here, "corpus/IDS-Audit-tool/testing.shared/InvalidFiles")],
  ["buildingSMART test cases", join(here, "IDS/Documentation/ImplementersDocumentation/TestCases")],
];
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".ids") ? [join(d, e.name)] : []));
const res = resources();
for (const [label, dir] of sets) {
  if (!existsSync(dir)) { console.log(`${label}: not fetched`); continue; }
  let files = 0, specs = 0, unread = 0;
  const hits = [];
  for (const f of walk(dir).sort()) {
    let ids;
    try { ids = parseIds(readFileSync(f, "utf8")); } catch { unread++; continue; }
    files++; specs += ids.specs.length;
    for (const x of auditIds(ids, res)) if (x.code === "class-abstract") hits.push({ file: f.slice(dir.length + 1), ...x, optionality: ids.specs[x.spec].optionality });
  }
  const filesHit = new Set(hits.map((h) => h.file)).size;
  console.log(`${label}: ${files} files (${unread} unreadable), ${specs} specifications; class-abstract on ${hits.length} facet(s) in ${new Set(hits.map((h) => h.file + "#" + h.spec)).size} specification(s) of ${filesHit} file(s)`);
  for (const h of hits) console.log(`  ${h.file} [${h.spec}] ${JSON.stringify(h.specName)} (${h.optionality}) ${h.facet}: ${h.message}`);
}
