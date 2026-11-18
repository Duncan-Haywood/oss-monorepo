#!/usr/bin/env node
// The numeric attribute facets of IDS-Audit-tool's RichFileAttribute files
// (specifications with no class) as the IDS editor opens them, and what an
// editor-written no-class number check does on a real IFC4X3 model.
//
//   sh eval/fetch-audit-corpus.sh
//   node eval/no-class-numbers.mjs
//
// Part 1, per numeric facet (one of / range): does it open as an editable row,
// and if not, what the audit says about it.
// Part 2: the page's own rows (blankSpec/blankReq, no class) written by
// buildIds and checked on samples/bsi-ifc43/Building-Hvac.ifc.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseIds } from "../ids.mjs";
import { auditIds } from "../audit.mjs";
import { resources, check } from "../node.mjs";
import { importIds, stateToDoc, buildIds, blankSpec, blankReq, attributeValueKind } from "../editor.mjs";

const here = new URL(".", import.meta.url).pathname;
const R = resources();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
const dir = join(here, "corpus/IDS-Audit-tool/testing.shared/ValidFiles");
const files = readdirSync(dir).filter((n) => /^RichFileAttribute_.*\.ids$/.test(n)).sort();
if (!files.length) { console.error("run eval/fetch-audit-corpus.sh first"); process.exit(2); }

const NUM = new Set(["integer", "double", "decimal", "float"]);
const tally = { list: { row: 0, kept: 0 }, range: { row: 0, kept: 0 } };
const why = new Map();
console.log("| file | attribute | value | opens as | why |\n| --- | --- | --- | --- | --- |");
for (const n of files) {
  const parsed = parseIds(readFileSync(join(dir, n), "utf8"));
  const imp = importIds(parsed, loadFor);
  const L = loadFor(imp.state.schema);
  const audit = auditIds(parsed, R);
  imp.state.specs.forEach((s, i) => {
    if (s.cls) return;
    for (const r of s.reqs) {
      const f = r.fixed || null;
      const name = f ? (f.name && f.name.equals) : r.name;
      const base = f ? f.value && f.value.r && f.value.r.base : null;
      if (r.kind !== "attribute") continue;
      const isNum = f ? NUM.has(base) : ["oneOf", "range"].includes(r.mode) && attributeValueKind(L.S, [], r.name).kind === "number";
      if (!isNum) continue;
      const list = f ? f.value.r.enumeration.length > 0 : r.mode === "oneOf";
      const shape = list ? "list" : "range";
      const val = f ? (list ? f.value.r.enumeration.join(", ") : Object.entries(f.value.r).filter(([k, v]) => /clusive$/.test(k) && v !== undefined).map(([k, v]) => `${k} ${v}`).join(" ")) : (list ? r.oneOf.join(", ") : `${r.minEx ? ">" : ">="} ${r.min} ${r.max ? (r.maxEx ? "<" : "<=") + " " + r.max : ""}`.trim());
      let reason;
      if (f) {
        const w = audit.find((x) => x.specName === parsed.specs[i].name && x.level === "warning" && /IDS cannot compare it with a value/.test(x.message));
        reason = w ? "audit warning: " + w.message.replace(/ \(IFC.*\)$/, "") : "kept, no audit note";
        tally[shape].kept++;
      } else {
        const k = attributeValueKind(L.S, [], r.name);
        reason = [r.numBase ? `on ${r.numBase}, as written` : null, k.derivedOn ? `derived on ${k.derivedOn.join(", ")}` : null].filter(Boolean).join("; ") || "typed";
        tally[shape].row++;
      }
      const key = f ? "kept: " + reason.replace(/^audit warning: (\w+) is (a \w+).*/, "$2 attribute") : "row: " + reason.replace(/[\d.]+/g, "");
      why.set(key, (why.get(key) || 0) + 1);
      console.log(`| ${n} | ${name} | ${val} | ${f ? "kept as written" : "row"} | ${reason} |`);
    }
  });
}
console.log(`\nnumeric lists: ${tally.list.row} open as rows, ${tally.list.kept} kept; ranges: ${tally.range.row} rows, ${tally.range.kept} kept`);
for (const [k, v] of [...why].sort()) console.log(`  ${v}  ${k}`);

// Part 2: the page's rows on a real model.
const L4 = loadFor("IFC4X3");
const spec = (name, rows, app = rows[0].name) => ({ ...blankSpec(), name, cls: "", app: [{ ...blankReq(), kind: "attribute", name: app }], reqs: rows.map((r) => ({ ...blankReq(), kind: "attribute", ...r })) });
const state = { title: "No-class numbers", description: "", schema: "IFC4X3", info: {}, specs: [
  spec("Contexts are 3D", [{ name: "CoordinateSpaceDimension", mode: "oneOf", oneOf: ["3"] }]),
  spec("Context precision at most 1 mm", [{ name: "Precision", mode: "range", min: "", max: "0.001" }]),
  // Applies to every object with a ContextType, subcontexts included: their
  // CoordinateSpaceDimension is derived (*), so they fail.
  spec("Every context with a type is 3D", [{ name: "CoordinateSpaceDimension", mode: "oneOf", oneOf: ["3"] }], "ContextType"),
] };
const xml = buildIds(stateToDoc(state, L4), L4.S);
const model = join(here, "../samples/bsi-ifc43/Building-Hvac.ifc");
const res = check(xml, readFileSync(model, "utf8"));
console.log("\nEditor-written no-class specifications on samples/bsi-ifc43/Building-Hvac.ifc:");
const restr = [...xml.matchAll(/<xs:restriction base="([^"]+)">/g)].map((m) => m[1]);
console.log(`  restriction bases written: ${restr.join(", ")}`);
for (const s of res.specs) {
  const failed = Array.isArray(s.failed) ? s.failed : [];
  console.log(`  ${s.name}: ${s.status}, ${s.applicable} applicable, ${typeof s.passed === "number" ? s.passed : (s.passed || []).length} pass, ${failed.length} fail`);
  for (const f of failed.slice(0, 4)) console.log(`    fail: ${JSON.stringify(f).slice(0, 200)}`);
}
console.log(`  audit of the written file: ${auditIds(parseIds(xml), R).map((x) => `${x.level} ${x.code}`).join("; ") || "clean"}`);
