#!/usr/bin/env node
// Writes every ifcXML, ifcJSON and IFC5 model it finds as STEP (step-writer.mjs)
// and checks the written file three ways:
// - read back: the STEP reader gives the same entities, id for id (class and
//   every argument; numbers at 12 significant digits, as eval/ifcxml-twins.mjs
//   compares them), with no parse errors;
// - checked the same: each sample IDS (and with --ids-dir every .ids there)
//   gives the same verdicts, applicable counts and failing GlobalIds on the
//   model as read and on the written STEP;
// - filled: model-fill.mjs, which refused anything but STEP before
//   2026-11-22, fills the written file against the sample IDS (counts only).
// With --list FILE it writes the paths of the written .ifc files there, one a
// line, for a second reader (IfcOpenShell: eval/to-step-ifcopenshell.py).
//
//   node eval/to-step-twins.mjs [--ids-dir DIR] [--out DIR] [--list FILE] <dir> [<dir> ...]
//   (every .ifcxml, .json and .ifcx below each dir; exit 1 on any difference)
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename, relative } from "node:path";
import { resources, check, parseModel } from "../node.mjs";
import { toStep } from "../step-writer.mjs";
import { fillModel } from "../model-fill.mjs";

const argv = process.argv.slice(2);
const take = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const IDS_DIR = take("--ids-dir"), OUT = take("--out"), LIST = take("--list");
if (OUT) mkdirSync(OUT, { recursive: true });
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d).sort()) {
    if (n.startsWith(".")) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ifcxml|ifcx)$/i.test(n) || (/\.json$/i.test(n) && /ifcjson/i.test(p))) files.push(p);
  }
};
for (const d of argv) walk(d);
if (!files.length) { console.error("usage: node eval/to-step-twins.mjs [--ids-dir DIR] <dir> ...  (no models found)"); process.exit(2); }

const res = resources();
const idsFiles = ["coordination-basics.ids.xml", "quantities-and-naming.ids.xml", "infrastructure-and-mep.ids.xml"]
  .map((f) => [f, readFileSync(new URL("../samples/" + f, import.meta.url), "utf8")]);
const sampleCount = idsFiles.length;
if (IDS_DIR) for (const f of readdirSync(IDS_DIR).filter((f) => /\.ids$/i.test(f)).sort()) idsFiles.push([f, readFileSync(join(IDS_DIR, f), "utf8")]);

const numKey = (n) => (Number.isInteger(n) ? String(n) : Number(n).toPrecision(12));
const val = (v) => {
  if (v === null || v === undefined) return "$";
  if (typeof v === "number") return "n" + numKey(v);
  if (typeof v === "string") return "s" + JSON.stringify(v);
  if (typeof v === "boolean") return "b" + v;
  if (Array.isArray(v)) return "[" + v.map(val).join(",") + "]";
  if ("ref" in v) return "#" + v.ref;
  if ("typed" in v) return "t" + v.typed + "(" + val(v.value) + ")";
  if ("enum" in v) return "e" + String(v.enum).toUpperCase();
  if (v.unknown) return "u";
  // An ifcJSON list item wrapped as {"type": ..., "value": ...}: compared as its value.
  if (typeof v.type === "string" && "value" in v) return val(v.value);
  // A STEP binary keeps its leading unused-bits digit; xs:hexBinary does not.
  if (typeof v.binary === "string") { const h = v.binary.toUpperCase(); return "x" + (h.length % 2 ? h.slice(1) : h); }
  if (v.derived) return "*";
  return "?" + JSON.stringify(v);
};
const verdict = (r) => JSON.stringify(r.specs.map((s) => [s.status, s.applicable, s.failed.map((f) => f.globalId).sort()]));

const T = { files: 0, read: 0, entities: 0, entSame: 0, entDiff: 0, parseErr: 0, idsRuns: 0, idsSame: 0, filled: 0, fillWritten: 0, fillErr: 0, notes: 0, bytesIn: 0, bytesOut: 0 };
const diffKinds = new Map(), idsDiffs = [], errors = [], noteKinds = new Map(), written = [];
console.log("| model | format | schema | entities | read back same | IDS verdicts same | fill: values written (sample IDS) | notes |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const path of files) {
  T.files++;
  const name = relative(process.cwd(), path);
  let M;
  try { M = parseModel(readFileSync(path, "utf8")); } catch (e) { errors.push(`${name}: not read (${e.message})`); continue; }
  T.read++;
  let w;
  try { w = toStep(M, { name: basename(path).replace(/\.\w+$/, ".ifc"), timestamp: "2026-11-22T00:00:00" }); } catch (e) { errors.push(`${name}: not written (${e.message})`); continue; }
  T.bytesIn += statSync(path).size; T.bytesOut += Buffer.byteLength(w.text);
  for (const n of w.notes) { const k = n.replace(/#\d+/g, "#N").replace(/-?\d+(\.\d+)?(E-?\d+)?/g, "N").slice(0, 90); noteKinds.set(k, (noteKinds.get(k) || 0) + 1); }
  T.notes += w.notes.length;
  if (OUT) { const p = join(OUT, name.replace(/[\\/]/g, "__").replace(/\.\w+$/, ".ifc")); writeFileSync(p, w.text); written.push(p); }
  let W;
  try { W = parseModel(w.text); } catch (e) { errors.push(`${name}: written STEP not read back (${e.message})`); continue; }
  if (W.parseErrors.length) { T.parseErr++; errors.push(`${name}: ${W.parseErrors.length} parse errors reading the written STEP, e.g. ${W.parseErrors[0]}`); }
  let same = 0, diff = 0;
  for (const [id, e] of M.entities) {
    if (!Number.isInteger(id)) continue;
    const x = W.entities.get(id);
    const a = e.type + "(" + (e.args || []).map(val).join(",") + ")";
    const b = x ? x.type + "(" + x.args.map(val).join(",") + ")" : "missing";
    // Trailing unset arguments: a reader that kept fewer arguments than the
    // class has gets $ for the rest when written.
    const trim = (s) => s.replace(/(,\$)+\)$/, ")");
    if (a === b || trim(a) === trim(b)) same++;
    else {
      diff++;
      diffKinds.set(e.type, (diffKinds.get(e.type) || 0) + 1);
      if (diffKinds.get(e.type) === 1) errors.push(`${name} #${id}: as read ${a.slice(0, 160)} / written ${b.slice(0, 160)}`);
    }
  }
  T.entities += same + diff; T.entSame += same; T.entDiff += diff;
  let idsSame = 0;
  for (const [f, ids] of idsFiles) {
    T.idsRuns++;
    let a, b;
    try { a = verdict(check(ids, M, { maxFailed: Infinity })); } catch (e) { a = "error " + e.message; }
    try { b = verdict(check(ids, W, { maxFailed: Infinity })); } catch (e) { b = "error " + e.message; }
    if (a === b) { idsSame++; T.idsSame++; } else idsDiffs.push(`${name} x ${f}: read ${a.slice(0, 160)} / written ${b.slice(0, 160)}`);
  }
  let fillText = "";
  let wroteN = 0;
  for (const [, ids] of idsFiles.slice(0, sampleCount)) {
    try { const r = fillModel(ids, w.text, { ...res }); wroteN += r.written; }
    catch (e) { T.fillErr++; fillText = "error " + e.message.slice(0, 60); }
  }
  T.filled++; T.fillWritten += wroteN;
  console.log(`| ${name.replace(/^eval\/twins\//, "")} | ${M.format} | ${M.schemaRaw} | ${same + diff} | ${diff ? `${same} of ${same + diff}` : "all"} | ${idsSame} of ${idsFiles.length} | ${fillText || wroteN} | ${w.notes.length} |`);
}
console.log(`\n${T.read} of ${T.files} models read; written as STEP and read back: ${T.entSame} of ${T.entities} entities the same, ${T.parseErr} files with parse errors; IDS verdicts the same in ${T.idsSame} of ${T.idsRuns} checks; fill ran on ${T.filled} written files (${T.fillWritten} values written against the ${sampleCount} sample IDS, ${T.fillErr} errors); ${(T.bytesIn / 1e6).toFixed(1)} MB in, ${(T.bytesOut / 1e6).toFixed(1)} MB of STEP out; ${T.notes} writer notes.`);
if (noteKinds.size) { console.log("\nwriter notes by kind:"); for (const [k, n] of [...noteKinds].sort((a, b) => b[1] - a[1])) console.log(`- ${n} x ${k}`); }
if (diffKinds.size) console.log("\nentities that read back differently, by class: " + [...diffKinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", "));
if (errors.length) { console.log("\nproblems:"); for (const e of errors) console.log("- " + e); }
if (idsDiffs.length) { console.log(`\nIDS verdicts that differ: ${idsDiffs.length}`); for (const d of idsDiffs.slice(0, 20)) console.log("- " + d); }
if (LIST) writeFileSync(LIST, written.join("\n") + "\n");
process.exitCode = T.entDiff || T.parseErr || idsDiffs.length || errors.length ? 1 : 0;
