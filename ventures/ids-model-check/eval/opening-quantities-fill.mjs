#!/usr/bin/env node
// The model fill end to end on real exports with their stored opening
// quantities hidden: every quantity named Width, Height, Depth or Area is
// renamed, the fill is asked for Qto_OpeningElementBaseQuantities' four on
// every IfcOpeningElement (opening-quantities/opening-quantities.ids.xml)
// with --from-geometry, and each written value is compared with the figure
// the exporter had stored on that opening. eval/opening-quantities-2026-11-22.md.
//   node eval/opening-quantities-fill.mjs MODEL.ifc ... [--out DIR]
//   python3 eval/model_fill_ifctester.py DIR DIR/hidden/*.ifc   # IfcTester's read of the same fill
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resources } from "../node.mjs";
import { fillModel } from "../model-fill.mjs";
import { measureModel, geometryLookup } from "../geometry-quantities.mjs";
import { parseStep } from "../../ifc-quantity-takeoff/step.mjs";
import { readUnits } from "../../ifc-quantity-takeoff/qto.mjs";

const NAMES = ["Width", "Height", "Depth", "Area"];
const IDS = readFileSync(new URL("./opening-quantities/opening-quantities.ids.xml", import.meta.url), "utf8");
const args = process.argv.slice(2);
const oi = args.indexOf("--out");
const outDir = oi >= 0 ? args.splice(oi, 2)[1] : null;
for (const f of args) {
  const orig = readFileSync(f, "utf8");
  const m0 = parseStep(orig);
    const U = readUnits(m0);
  const toSI = (q) => (/Area$/.test(q) ? U.AREAUNIT : U.LENGTHUNIT); // written values are in the model's units
  const stored = new Map();
  // takeoff rows hold no openings: read each opening's stored quantities from its sets
  const ref = (v) => (v && typeof v === "object" && "ref" in v ? v.ref : null);
  const val = (v) => (typeof v === "number" ? v : typeof v?.value === "number" ? v.value : typeof v === "string" ? v : v?.value);
  const E = m0.entities;
  for (const e of E.values()) {
    if (e.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const pd = E.get(ref(e.args[5]));
    if (pd?.type !== "IFCELEMENTQUANTITY") continue;
    for (const id of (e.args[4] || []).map(ref)) {
      if (E.get(id)?.type !== "IFCOPENINGELEMENT") continue;
      for (const qid of pd.args[5] || []) {
        const q = E.get(ref(qid)), n = q && val(q.args[0]);
        if (NAMES.includes(n) && val(q.args[3]) > 0) stored.set(`${id} ${n}`, val(q.args[3]) * (q.type === "IFCQUANTITYAREA" ? U.AREAUNIT : U.LENGTHUNIT));
      }
    }
  }
  if (!stored.size) continue;
  const re = new RegExp(`(IFCQUANTITY(?:LENGTH|AREA)\\(')(${NAMES.join("|")})'`, "g");
  const hidden = orig.replace(re, "$1$2AsExported'");
  const t0 = Date.now();
  const geometry = geometryLookup(await measureModel(hidden));
  const r = fillModel(IDS, hidden, { ...resources(), geometry });
  const by = {};
  for (const w of r.writtenList) {
    const q = w.prop;
    const t = (by[q] ||= { written: 0, scored: 0, within: 0, worst: 0 });
    t.written++;
    const st = stored.get(`${w.id} ${q}`);
    if (st == null) continue;
    t.scored++;
    const e = Math.abs((Number(w.value) * toSI(q)) / st - 1);
    t.worst = Math.max(t.worst, e);
    if (e <= 0.01) t.within++;
  }
  console.log(`${f.split("/").pop()}: ${r.written} written (${r.fromGeometry} from geometry) in ${((Date.now() - t0) / 1000).toFixed(1)} s; filled model passes every check: ${r.after ? r.after.pass : "-"}, failing before ${JSON.stringify(r.before.failing)}, after ${JSON.stringify(r.after?.failing)}; written values verified ${r.verified?.pass} of ${r.verified?.values}; left in the to-fill table ${r.unfilled.length}`);
  for (const q of NAMES) { const t = by[q] || { written: 0, scored: 0, within: 0, worst: 0 }; const n = [...stored.keys()].filter((k) => k.endsWith(` ${q}`)).length; console.log(`  ${q}: ${t.written} written, ${t.scored} of ${n} stored rewritten, ${t.within} within 1% (worst ${(t.worst * 100).toFixed(3)}%)`); }
  if (outDir) {
    // for eval/model_fill_ifctester.py: the filled copy, its written list, and the hidden original it starts from
    const stem = f.split("/").pop().replace(/\.ifc$/i, "");
    mkdirSync(`${outDir}/hidden`, { recursive: true });
    writeFileSync(`${outDir}/hidden/${stem}.ifc`, hidden);
    writeFileSync(`${outDir}/opening__${stem}__fill.ifc`, r.text);
    writeFileSync(`${outDir}/opening__${stem}__fill.ifc.written.json`, JSON.stringify({ ids: fileURLToPath(new URL("./opening-quantities/opening-quantities.ids.xml", import.meta.url)), written: r.writtenList }));
  }
}
