// Opens every public IDS file (eval/corpus/real, sh eval/fetch-audit-corpus.sh) in the
// editor, lists the standard-property rows kept in the dataType the file gave
// them (fileType), applies "Use the template's type" (templateTypeRow) to each
// the templates refuse, and counts the audit's pset-datatype errors before and
// after.   node eval/template-type.mjs > eval/template-type.txt   (eval/template-type-2026-11-17.md)
import { readFileSync, readdirSync } from "node:fs";
import { parseIds } from "../ids.mjs";
import { resources } from "../node.mjs";
import { importIds, stateToDoc, buildIds, templateTypeRow, fileTypeRefused } from "../editor.mjs";
import { auditIds } from "../audit.mjs";
const R = resources();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
const dir = new URL("corpus/real/", import.meta.url).pathname;
let rows = 0, refused = 0, fixed = 0, dropped = 0, files = 0, errBefore = 0, errAfter = 0;
for (const fn of readdirSync(dir).sort()) {
  let parsed; try { parsed = parseIds(readFileSync(dir + fn, "utf8")); } catch { continue; }
  const { state } = importIds(parsed, loadFor);
  const L = loadFor(state.schema);
  let any = false;
  for (const s of state.specs) for (const [i, r] of s.reqs.entries()) {
    if (!r.fileType) continue;
    rows++; any = true;
    const ref = fileTypeRefused(L, r); if (ref) refused++;
    const t = templateTypeRow(L, r);
    console.log(fn.slice(0, 45), r.set + "." + r.name, r.fileType, "mode=" + r.mode, ref ? "REFUSED" : "allowed", t ? "-> " + t.dataType + (t.dropped ? " dropped" : "") + " mode=" + t.row.mode : "");
    if (ref && t) { s.reqs[i] = t.row; fixed++; if (t.dropped) dropped++; }
  }
  if (!any) continue;
  files++;
  const count = (st) => auditIds(parseIds(buildIds(stateToDoc(st, L), L.S)), R).filter((x) => x.code === "pset-datatype").length;
  errAfter += count(state);
  errBefore += count(importIds(parsed, loadFor).state);
}
console.log({ rows, refused, fixed, dropped, files, pset_datatype_before: errBefore, after_fix: errAfter });
