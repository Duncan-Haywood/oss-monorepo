// The editor's "Write as a pattern" for dateTime ranges (2026-11-21): beams
// whose Pset_PrecastConcreteElementFabrication.ActualErectionDate (IFCDATETIME)
// sits on the edges a pattern could get wrong (a millisecond either side of a
// bound, fractions longer than milliseconds, 24:00:00, time zones in use and
// one no zone uses, days that do not exist), each checked against dateTime
// ranges and the pattern the editor writes for them. Writes the IDS and model
// for IfcTester:
//   node eval/datetime-pattern.mjs OUT.ids OUT.ifc
//   python3 eval/crosscheck_ifctester.py OUT.ids OUT.ifc
import { readFileSync, writeFileSync } from "node:fs";
import { resources, check } from "../node.mjs";
import { buildIds, stateToDoc, blankReq, dateTimePattern } from "../editor.mjs";

const VALUES = [
  "2025-03-01T07:00:00", "2025-03-01T06:59:59.999", "2025-03-01T06:59:59.9999", "2025-03-01T07:00:00.0001", "2025-03-01T07:00:00Z",
  "2025-03-01T12:45:00+05:45", "2025-03-01T12:44:59+05:45", "2025-03-01T02:00:00-05:00", "2025-03-01T01:59:59.5-05:00",
  "2025-03-01T08:00:00+01:00", "2025-02-28T21:30:00-09:30", "2025-02-28T24:00:00", "2025-03-01T00:00:00+14:00",
  "2025-03-01T17:17:00+10:17", "2025-03-03T12:00:00+10:17", "2025-02-29T12:00:00", "2025-03-01T24:00:01", "2025-03-01T23:59:60",
  "2025-06-30T17:00:00", "2025-06-30T17:00:00.001", "2025-06-30T16:59:59.999", "2025-06-30T22:30:00+05:30", "2025-06-30T22:30:00.001+05:30",
  "2025-06-30T19:00:00+02:00", "2025-06-30T12:00:00-05:00", "2025-07-01T00:00:00", "2025-05-15T09:00:00", "2024-12-31T23:59:59",
  "2025-03-01", "2025-06-30T17:00:00.5", "2025-06-30T17:00:00.0009",
];
function model() {
  const gid = (n) => ("2Bm" + String(n).padStart(19, "0")).slice(0, 22);
  let out = "", id = 3000;
  VALUES.forEach((v, i) => {
    const d = id++, ps = id++, a = id++, rel = id++;
    out += `#${d}=IFCBEAM('${gid(d)}',$,'B-${i}',$,$,$,$,$,.BEAM.);\n`;
    out += `#${ps}=IFCPROPERTYSET('${gid(ps)}',$,'Pset_PrecastConcreteElementFabrication',$,(#${a}));\n`;
    out += `#${a}=IFCPROPERTYSINGLEVALUE('ActualErectionDate',$,IFCDATETIME('${v}'),$);\n`;
    out += `#${rel}=IFCRELDEFINESBYPROPERTIES('${gid(rel)}',$,$,$,(#${d}),#${ps});\n`;
  });
  return readFileSync(new URL("../samples/tiny-house.ifc", import.meta.url), "utf8").replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `${out}ENDSEC;\nEND-ISO-10303-21;\n`);
}
const R = resources();
const L = { S: R.schemas.IFC4, psets: R.psets.IFC4, tm: null };
const CASES = [
  ["2025-03-01T07:00:00", ""], ["2025-03-01T07:00:00", "", true], ["", "2025-06-30T17:00:00"], ["", "2025-06-30T17:00:00", false, true],
  ["2025-03-01T07:00:00", "2025-06-30T17:00:00"], ["2025-03-01T07:00:00Z", "2025-06-30T17:00:00.5Z", true, true],
  ["2025-03-01T12:45:00+05:45", "2025-06-30T12:00:00-05:00"], ["2025-01-01T00:00:00", "2025-12-31T23:59:59.999"],
  ["2025-02-28T00:00:00", "2025-03-01T00:00:00"], ["2025-06-30T16:59:59.999", "2025-06-30T17:00:00.001"],
];
const label = ([lo, hi, le, he]) => `${lo === "" ? "" : `${le ? ">" : ">="} ${lo}`}${lo !== "" && hi !== "" ? " and " : ""}${hi === "" ? "" : `${he ? "<" : "<="} ${hi}`}`;
const base = { ...blankReq(), kind: "property", set: "Pset_PrecastConcreteElementFabrication", name: "ActualErectionDate" };
const spec = (name, req) => ({ name, optionality: "required", cls: "IFCBEAM", withSub: false, also: [], predefinedType: "", reqs: [{ ...base, ...req }] });
const specs = [];
for (const c of CASES) {
  specs.push(spec(`${label(c)} (range)`, { mode: "range", min: c[0], max: c[1], minEx: !!c[2], maxEx: !!c[3] }));
  specs.push(spec(`${label(c)} (pattern)`, { mode: "pattern", pattern: dateTimePattern(...c) }));
}
const xml = buildIds(stateToDoc({ title: "dateTime ranges as patterns", schema: "IFC4", specs }, L), L.S);
const text = model();
if (process.argv[2]) writeFileSync(process.argv[2], xml);
if (process.argv[3]) writeFileSync(process.argv[3], text);
const rep = check(xml, text).specs;
const failed = (s) => new Set(s.failed.map((f) => f.id));
const odd = new Set(VALUES.map((v, i) => (/\+10:17$/.test(v) ? i : -1)).filter((i) => i >= 0));
let off = 0, oddOff = 0;
const lens = [];
console.log(`${VALUES.length} beams, one ActualErectionDate each (${odd.size} with +10:17, an offset no zone uses); ${CASES.length} ranges`);
for (let i = 0; i < CASES.length; i++) {
  const [r, p] = rep.slice(2 * i, 2 * i + 2).map(failed);
  const ids = rep[2 * i].failed.concat(rep[2 * i + 1].failed);
  const name = (id) => (ids.find((f) => f.id === id) || {}).name;
  const diff = [...r].filter((x) => !p.has(x)).concat([...p].filter((x) => !r.has(x)));
  const oddDiff = diff.filter((id) => odd.has(Number(String(name(id) || "").slice(2))));
  off += diff.length - oddDiff.length; oddOff += oddDiff.length;
  lens.push(dateTimePattern(...CASES[i]).length);
  console.log(`${label(CASES[i]).padEnd(70)} range fails ${String(r.size).padStart(2)}; pattern disagrees on ${diff.length - oddDiff.length}${oddDiff.length ? ` (+${oddDiff.length} at +10:17)` : ""}`);
}
console.log(`beam verdicts unlike the range: ${off} of ${(VALUES.length - odd.size) * CASES.length} on zones in use; ${oddOff} of ${odd.size * CASES.length} at +10:17`);
console.log(`pattern length: ${Math.min(...lens)} to ${Math.max(...lens)} characters`);
