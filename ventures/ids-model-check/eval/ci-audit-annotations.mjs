#!/usr/bin/env node
// Measures the CI's IDS audit annotations (ci.mjs auditFindings, idsSpecLines)
// on the files eval/fetch-audit-corpus.sh and eval/fetch-testcases.sh fetch:
//
// 1. Line placement: for every readable IDS, idsSpecLines() must find one
//    line per parsed specification, and the start tag found on line N must be
//    the specification parseIds() read N-th (its name attribute matches).
// 2. Annotations: each IDS is checked against two sample models (one IFC4,
//    one IFC2X3) as `ci-cli.mjs --pairing all` would pair them; the IDS audit
//    annotations must be one per IDS file and specification with a warning
//    (not one per model), each on its specification's line, up to nine per
//    step; past nine, the rest fold into one annotation naming the job summary.
//
//   node eval/ci-audit-annotations.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { check, parseIds, parseModel } from "../node.mjs";
import { annotations, auditFindings, idsSpecLines, tally } from "../ci.mjs";

const here = new URL(".", import.meta.url).pathname;
const sets = [
  ["Real IDS from public repositories", join(here, "corpus/real")],
  ["IDS-Audit-tool ValidFiles", join(here, "corpus/IDS-Audit-tool/testing.shared/ValidFiles")],
  ["IDS-Audit-tool InvalidFiles", join(here, "corpus/IDS-Audit-tool/testing.shared/InvalidFiles")],
  ["buildingSMART IDS test cases", join(here, "IDS/Documentation/ImplementersDocumentation/TestCases")],
];
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".ids") ? [join(d, e.name)] : []));
const ifc2x3 = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('m.ifc','',(''),(''),'','','');", "FILE_SCHEMA(('IFC2X3'));", "ENDSEC;", "DATA;",
  "#1=IFCWALL('1hqIFTRjfV6AWq_bMtnZwI',$,'W1',$,$,$,$,$);", "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
const models = [["tiny-house.ifc (IFC4)", parseModel(readFileSync(join(here, "../samples/tiny-house.ifc"), "utf8"))], ["one-wall.ifc (IFC2X3)", parseModel(ifc2x3)]];
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(x?)([0-9a-fA-F]+);/g, (_, x, n) => codePointOr(parseInt(n, x ? 16 : 10))).replace(/&amp;/g, "&");

console.log("| Set | Files | Specifications | Lines found | Tag on line is that spec | Specs with audit warnings | Audit annotations (2 models) | On the spec's line | Folded into the pointer |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
const misses = [];
for (const [label, dir] of sets) {
  if (!existsSync(dir)) { console.log(`| ${label} | not fetched | | | | | | | |`); continue; }
  let files = 0, specs = 0, found = 0, same = 0, warned = 0, notes = 0, onLine = 0, folded = 0;
  for (const f of walk(dir).sort()) {
    const text = readFileSync(f, "utf8");
    let ids;
    try { ids = parseIds(text); } catch { continue; }
    files++; specs += ids.specs.length;
    const lines = idsSpecLines(text);
    if (lines.length === ids.specs.length) found += lines.length; else misses.push(`${f.slice(dir.length + 1)}: ${lines.length} lines for ${ids.specs.length} specs`);
    const rows = text.split("\n");
    lines.forEach((l, i) => {
      if (i >= ids.specs.length) return;
      const tail = rows.slice(l - 1).join("\n");
      const tag = /<(?:[A-Za-z_][\w.-]*:)?specification[\s/>][^>]*>?/.exec(tail)?.[0] || "";
      const nm = /\bname\s*=\s*(["'])([^]*?)\1/.exec(tag);
      if (nm && unesc(nm[2]) === (ids.specs[i].name ?? "")) same++; else if (!nm && !ids.specs[i].name) same++; else misses.push(`${f.slice(dir.length + 1)}: spec ${i} name mismatch on line ${l}`);
    });
    const name = f.slice(dir.length + 1);
    const runs = models.map(([m, model]) => {
      try { return { model: m, ids: name, report: check(ids, model) }; } catch (e) { return { model: m, ids: name, error: e.message }; }
    });
    const fsAudit = auditFindings(runs);
    warned += fsAudit.length;
    const a = annotations(runs, { idsLines: new Map([[name, lines]]) }).filter((x) => x.includes(",title=IDS audit"));
    notes += a.length;
    for (const x of fsAudit) if (a.some((y) => y.includes(`,line=${lines[x.index]},`))) onLine++;
    const ptr = a.find((y) => /more specification\(s\) with warnings/.test(y));
    if (ptr) folded += Number(/IDS audit%3A (\d+) more/.exec(ptr)[1]);
    if (onLine + folded > warned) misses.push(`${name}: annotations overlap`);
    if (tally(runs).auditWarnings !== fsAudit.reduce((n, x) => n + x.warnings.length, 0)) misses.push(`${name}: tally mismatch`);
  }
  console.log(`| ${label} | ${files} | ${specs} | ${found} | ${same} | ${warned} | ${notes} | ${onLine} | ${folded} |`);
}
console.log(misses.length ? `\nMisses (${misses.length}):\n` + misses.slice(0, 40).join("\n") : "\nMisses: none");

// A character reference or escape past U+10FFFF (or not a number) becomes U+FFFD,
// as HTML parsers do, instead of throwing a RangeError on a stranger's input.
function codePointOr(n) { return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\uFFFD"; }
