// Writes, with the IDS editor, "one of" rows on the dates and durations of the
// date-ranges model (61 doors, Pset_Warranty IFCDATE and IFCDURATION), each
// twice: on the XSD base IDS 1.0's DataTypes table gives the type (xs:date,
// xs:duration: what a new row writes since 2026-11-17) and on xs:string (what
// the editor wrote before; an opened file that has it keeps it). Checks both
// here, reopens the file in the editor (every row editable, written back
// byte-for-byte), and saves the IDS for IfcTester:
//   node eval/date-ranges.mjs /tmp/r.ids MODEL.ifc
//   node eval/date-oneof.mjs MODEL.ifc OUT.ids
//   python3 eval/crosscheck_ifctester.py OUT.ids MODEL.ifc
import { readFileSync, writeFileSync } from "node:fs";
import { resources, check } from "../node.mjs";
import { parseIds } from "../ids.mjs";
import { buildIds, stateToDoc, blankReq, importIds } from "../editor.mjs";

const [modelPath, outPath] = process.argv.slice(2);
if (!modelPath) { console.error("usage: node eval/date-oneof.mjs MODEL.ifc [OUT.ids]"); process.exit(2); }
const text = readFileSync(modelPath, "utf8");
const R = resources();
const L = { S: R.schemas.IFC4, psets: R.psets.IFC4, tm: null };
const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });

// The dates the model holds, to pick lists that pass some doors and not others.
const starts = [...text.matchAll(/'WarrantyStartDate',\$,IFCDATE\('([^']+)'\)/g)].map((m) => m[1]).sort();
const ends = [...text.matchAll(/'WarrantyEndDate',\$,IFCDATE\('([^']+)'\)/g)].map((m) => m[1]).sort();
const cases = [
  ["WarrantyStartDate", [...new Set(starts)]],          // every start date: pass
  ["WarrantyStartDate", starts.slice(0, 30)],           // half of them: fail
  ["WarrantyStartDate", ["2024-05-01"]],                // the sample door's only
  ["WarrantyStartDate", ["2024-05-01Z", "2024-05-01+00:00"]], // the same day, written with a zone: string compare fails it
  ["WarrantyEndDate", [...new Set(ends)]],              // every end date: pass
  ["WarrantyEndDate", ends.slice(-10)],                 // the ten latest
  ["WarrantyPeriod", ["P2Y"]],                          // only the sample door has a period
  ["WarrantyPeriod", ["P24M", "P730D"]],                // P2Y by value, not by text
];
const row = (name, oneOf, oneOfBase) => ({ ...blankReq(), kind: "property", set: "Pset_Warranty", name, mode: "oneOf", oneOf, ...(oneOfBase ? { oneOfBase } : {}) });
const specs = [];
for (const [i, [name, vals]] of cases.entries()) for (const base of [null, "xs:string"])
  specs.push({ name: `${i + 1}. ${name} one of ${vals.length} (${base || "DataTypes base"})`, optionality: "required", cls: "IFCDOOR", withSub: false, also: [], predefinedType: "", reqs: [row(name, vals, base)] });
const xml = buildIds(stateToDoc({ title: "date and duration one-of rows", schema: "IFC4", specs }, L), L.S);
if (outPath) writeFileSync(outPath, xml);

const bases = [...xml.matchAll(/<xs:restriction base="([^"]+)"><xs:enumeration/g)].map((m) => m[1]);
console.log(`bases written: ${Object.entries(bases.reduce((t, b) => ({ ...t, [b]: (t[b] || 0) + 1 }), {})).map(([b, n]) => `${b} ${n}`).join(", ")}`);
const res = check(xml, text).specs;
const failing = (s) => (s.failed || []).map((f) => f.id).sort();
for (const s of res) console.log(`${s.name}: ${s.status} (${s.applicable} applicable, ${failing(s).length} failing)`);
let same = 0;
for (let i = 0; i < res.length; i += 2) if (JSON.stringify([res[i].status, failing(res[i])]) === JSON.stringify([res[i + 1].status, failing(res[i + 1])])) same++;
console.log(`same verdict on both bases: ${same} of ${res.length / 2}`);

// Reopened: every row editable, and the file written back unchanged.
const imp = importIds(parseIds(xml), loadFor);
const back = buildIds(stateToDoc(imp.state, L), L.S);
console.log(`reopened: ${imp.rows - specs.length} of ${specs.length} requirement rows editable, ${imp.kept} kept as written; written back ${back === xml ? "identical" : "DIFFERENT"}`);
if (back !== xml || imp.kept) process.exitCode = 1;
