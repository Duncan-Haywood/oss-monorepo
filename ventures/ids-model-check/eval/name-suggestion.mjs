// Opens every public IDS file (eval/corpus/real, sh eval/fetch-audit-corpus.sh)
// and the IDS-Audit-tool files in the editor, lists the kept property
// requirements that get a "did you mean" (nameSuggestion), applies each
// (renameRow) and counts the audit's pset-property and pset-name errors before
// and after, and whether the rest of each file writes back unchanged.
//   node eval/name-suggestion.mjs > eval/name-suggestion.txt   (eval/name-suggestion-2026-11-17.md)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { parseIds } from "../ids.mjs";
import { resources } from "../node.mjs";
import { importIds, stateToDoc, buildIds, renameRow, renameSuggestion, specBases, templateTypeRow, fileTypeRefused } from "../editor.mjs";
import { auditIds } from "../audit.mjs";
const R = resources();
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
const NAME = new Set(["pset-property", "pset-name"]);
function walk(d) {
  if (!existsSync(d)) return [];
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + e.name + "/") : e.name.endsWith(".ids") ? [d + e.name] : []));
}
const root = new URL("corpus/", import.meta.url).pathname;
const totals = {};
for (const [label, dir] of [["real", root + "real/"], ["IDS-Audit-tool", root + "IDS-Audit-tool/"]]) {
  const t = { files: 0, filesWith: 0, suggested: 0, toRow: 0, toKept: 0, nameErrBefore: 0, nameErrAfter: 0, otherErrChanged: 0, typeFaultUnmasked: 0, typeErrBefore: 0, typeErrAfterBoth: 0 };
  for (const path of walk(dir).sort()) {
    let parsed; try { parsed = parseIds(readFileSync(path, "utf8")); } catch { continue; }
    t.files++;
    const { state } = importIds(parsed, loadFor);
    const L = loadFor(state.schema);
    const audit = (st) => auditIds(parseIds(buildIds(stateToDoc(st, L), L.S)), R);
    const before = audit(state);
    let any = false;
    const pending = [];
    for (const s of state.specs) for (const rows of [s.reqs, s.app || []]) for (const [i, r] of rows.entries()) {
      const sug = renameSuggestion(L, specBases(s), r);
      if (!sug) continue;
      any = true; t.suggested++;
      const n = renameRow(L, specBases(s), r);
      if (n.fixed) t.toKept++; else t.toRow++;
      const typeFault = !n.fixed && fileTypeRefused(L, n);
      if (typeFault) t.typeFaultUnmasked++;
      if (label === "real") console.log(path.slice(dir.length, dir.length + 48), rows === s.reqs ? "req" : "app", `${sug.fromSet}.${sug.fromName} -> ${sug.set}.${sug.name}`, r.fixed ? "kept" : "row", "->", n.fixed ? "kept (corrected)" : "editable row", typeFault ? `(file's ${n.fileType} now reads as pset-datatype)` : "");
      rows[i] = n;
      pending.push([rows, i]);
    }
    const after = audit(state);
    const nb = before.filter((x) => NAME.has(x.code)).length, na = after.filter((x) => NAME.has(x.code)).length;
    if (any) t.filesWith++;
    t.nameErrBefore += nb; t.nameErrAfter += na;
    const other = (a) => a.filter((x) => !NAME.has(x.code)).map((x) => x.code + x.message).sort().join("\n");
    if (other(before) !== other(after)) { t.otherErrChanged++; if (label === "real") console.log("  other errors changed in", path.slice(dir.length), JSON.stringify(after.filter((x) => !before.some((y) => y.code === x.code && y.message === x.message)).map((x) => x.code))); }
    // Then "Use the template's type" on each renamed row the templates refuse.
    for (const [reqs, i] of pending) { if (fileTypeRefused(L, reqs[i])) { const tt = templateTypeRow(L, reqs[i]); if (tt) reqs[i] = tt.row; } }
    const dt = (a) => a.filter((x) => x.code === "pset-datatype").length;
    t.typeErrBefore += dt(before); t.typeErrAfterBoth += dt(audit(state));
  }
  totals[label] = t;
}
console.log(JSON.stringify(totals, null, 1));
