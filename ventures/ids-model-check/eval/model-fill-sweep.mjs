// Fills real models from public IDS files (model-fill.mjs) and measures it.
//
//   node --max-old-space-size=8192 eval/model-fill-sweep.mjs MODEL.ifc IDS_DIR OUT_DIR [--write N]
//
// For each IDS file (*.ids, *.ids.xml) the model is filled twice:
//   ids    values the IDS fixes (a simpleValue or a one-item enumeration);
//   table  those, plus a stand-in for a person filling the to-fill table:
//          the first value of an enumeration, a bound or 1 for a number,
//          true for a boolean, "X" for unrestricted text (patterns skipped).
// Each pair's line in OUT_DIR/fill.jsonl: values written, sets edited/copied/
// added, failing elements before and after, the values read back and passing
// the facet that failed, the file's lines that changed (must equal the records
// the fill says it edited), and the written (element, set, property) list.
// The first N filled files of each mode (--write, default 0) are saved to
// OUT_DIR for eval/model_fill_ifctester.py.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, appendFileSync } from "node:fs";
import { basename, join } from "node:path";
import { resources } from "../node.mjs";
import { Model } from "../ids.mjs";
import { fillModel } from "../model-fill.mjs";

const [modelPath, idsDir, outDir] = process.argv.slice(2);
const wi = process.argv.indexOf("--write");
const writeN = wi > 0 ? Number(process.argv[wi + 1]) : 0;
mkdirSync(outDir, { recursive: true });
const R = resources();
const text = readFileSync(modelPath, "utf8");
const t0 = performance.now();
const origLines = text.split(/\r?\n/);
const origSet = new Set(origLines);
const parse = () => { const m = new Model(text, R.schemas, { psets: R.psets }); m.measureUnits = R.measureUnits; return m; };
console.error(`${basename(modelPath)}: ${(text.length / 1e6).toFixed(1)} MB`);

const suggest = (r, dataType, prim) => {
  const x = r.value.r;
  if (x && x.pattern.length) return undefined;
  if (x && x.enumeration.length) return x.enumeration[0];
  if (prim === "boolean" || prim === "logical") return "true";
  if (prim === "double" || prim === "integer") {
    const b = x && (x.minInclusive ?? x.maxInclusive);
    if (b !== undefined) return prim === "integer" ? String(Math.ceil(Number(b))) : b;
    if (x && (x.minExclusive !== undefined || x.maxExclusive !== undefined)) return x.minExclusive !== undefined ? String(Number(x.minExclusive) + 1) : String(Number(x.maxExclusive) - 1);
    return "1";
  }
  if (prim === "string") {
    if (x && (x.length !== undefined || x.minLength !== undefined)) return "X".repeat(Number(x.length ?? x.minLength) || 1);
    return "X";
  }
  return undefined;
};

const files = readdirSync(idsDir).filter((f) => /\.ids(\.xml)?$/i.test(f)).sort();
const saved = { ids: 0, table: 0 };
for (const f of files) {
  const idsText = readFileSync(join(idsDir, f), "utf8");
  for (const mode of ["ids", "table"]) {
    const row = { model: basename(modelPath), ids: f, mode };
    const t1 = performance.now();
    try {
      // A fresh parse per fill: the fill must not depend on caches another
      // IDS left on the model.
      const r = fillModel(idsText, text, { ...R, model: parse(), suggest: mode === "table" ? suggest : undefined });
      const newLines = r.text.split(/\r?\n/);
      const changed = newLines.filter((l) => !origSet.has(l)).length;
      Object.assign(row, {
        written: r.written, elements: r.elements, fromIds: r.fromIds, fromTable: r.fromTable, sets: r.sets,
        addedRecords: r.added, editedRecords: r.editedRecords, changedLines: changed, lineCountDelta: newLines.length - origLines.length,
        unfilled: r.unfilled.length, notWritten: r.notWritten,
        verified: r.verified && { values: r.verified.values, pass: r.verified.pass, fail: r.verified.fail.length, parseErrors: r.verified.parseErrors },
        before: r.before, after: r.after,
      });
      if (r.written && saved[mode] < writeN) {
        saved[mode]++;
        const out = join(outDir, `${mode}__${basename(modelPath, ".ifc")}__${f.replace(/\.xml$/, "")}.ifc`);
        writeFileSync(out, r.text);
        writeFileSync(out + ".written.json", JSON.stringify({ ids: join(idsDir, f), written: r.writtenList }));
        row.saved = out;
      }
    } catch (e) {
      row.error = String(e && e.message).slice(0, 300);
    }
    row.seconds = Number(((performance.now() - t1) / 1000).toFixed(2));
    appendFileSync(join(outDir, "fill.jsonl"), JSON.stringify(row) + "\n");
    console.error(`  ${mode} ${f}: ${row.error ? "ERROR " + row.error : `${row.written} written, failing ${row.before.failing} -> ${row.after.failing}`} (${row.seconds} s)`);
  }
}
console.error(`done in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
