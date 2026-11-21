#!/usr/bin/env node
// Reads every .ifcx file below a folder (buildingSMART's IFC5 examples,
// eval/fetch-ifcx-twins.sh) and prints, per file, the objects read, the
// property sets made, the reader's notes and the time; with the three
// starter IDS checked on each (eval/ifcx-twins-2026-11-21.md, "Every file").
//   node eval/ifcx-sweep.mjs eval/twins/ifc5/examples
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { resources, check } from "../node.mjs";
import { Model } from "../ids.mjs";

const R = resources();
const root = process.argv[2];
const ids = ["coordination-basics.ids.xml", "quantities-and-naming.ids.xml", "infrastructure-and-mep.ids.xml"].map((f) => readFileSync(new URL("../samples/" + f, import.meta.url), "utf8"));
const files = [];
const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.ifcx$/i.test(n)) files.push(p); } };
walk(root);
let ok = 0, objects = 0, failed = 0;
const notes = new Map();
console.log("| file | MB | objects | property sets | notes | IDS run | seconds |\n| --- | --- | --- | --- | --- | --- | --- |");
for (const f of files) {
  const t0 = performance.now();
  const bytes = readFileSync(f);
  let row;
  try {
    const m = new Model(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length), R.schemas, { psets: R.psets });
    const objs = [...m.entities.values()].filter((e) => m.isA(e, "IFCOBJECT")).length;
    const sets = [...m.entities.values()].filter((e) => e.type === "IFCPROPERTYSET" || e.type === "IFCELEMENTQUANTITY").length;
    let ran = 0;
    for (const x of ids) { try { check(x, m, { audit: false }); ran++; } catch (e) { failed++; } }
    ok++; objects += objs;
    for (const n of m.parseErrors) { const k = n.replace(/"[^"]*"/g, '"…"'); notes.set(k, (notes.get(k) || 0) + 1); }
    row = `${objs} | ${sets} | ${m.parseErrors.length ? m.parseErrors.slice(0, 2).join("; ").slice(0, 160) : "-"} | ${ran} of 3`;
  } catch (e) { failed++; row = `error: ${e.message.slice(0, 160)} | | | `; }
  console.log(`| ${f.slice(root.length + 1)} | ${(bytes.length / 1e6).toFixed(1)} | ${row} | ${((performance.now() - t0) / 1000).toFixed(2)} |`);
}
console.log(`\n${files.length} files: ${ok} read, ${objects} objects; ${failed} reads or checks failed.`);
for (const [k, n] of [...notes].sort((a, b) => b[1] - a[1])) console.log(`- ${n} file(s): ${k}`);
