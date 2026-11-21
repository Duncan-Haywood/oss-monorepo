// "Write as a pattern" for dateTime ranges (2026-11-21): the editor writes a
// date-and-time range as one XSD pattern (temporal.mjs dateTimeRangePattern)
// that IfcTester reads the same way this checker reads the range. Doors carry
// one IFCDATETIME each, chosen on the edges: fractions past the millisecond,
// 24:00:00, zones whole and half hour, near and far from a bound, days that
// do not exist, non-ASCII digits, whitespace.
//   node eval/datetime-pattern.mjs OUT.ids OUT.ifc
//   python3 eval/crosscheck_ifctester.py OUT.ids OUT.ifc
import { readFileSync, writeFileSync } from "node:fs";
import { resources, check } from "../node.mjs";
import { buildIds, stateToDoc, blankReq, datePattern, zonesOf } from "../editor.mjs";

const step = (s) => [...s].map((c) => (c.charCodeAt(0) > 126 ? `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}\\X0\\` : c)).join("");
export const VALUES = [
  "2024-05-01T08:00:00", "2024-05-01T07:59:59", "2024-05-01T07:59:59.9999", "2024-05-01T08:00:00.0001", "2024-05-01T08:00:00.000",
  "2024-05-01T08:00:00Z", "2024-05-01T08:00:00+00:00", "2024-05-01T08:00:00-00:00", "2024-05-01T09:00:00+01:00", "2024-05-01T08:59:59+01:00",
  "2024-05-01T03:00:00-05:00", "2024-05-01T02:59:59-05:00", "2024-05-01T13:30:00+05:30", "2024-05-01T13:29:59+05:30", "2024-05-02T09:00:00+01:00",
  "2024-04-30T24:00:00", "2024-04-30T24:00:00.000", "2024-05-01T24:00:00", "2024-04-30T24:00:00.5", "2024-12-31T23:59:59",
  "2024-12-31T23:59:59.999999", "2024-12-31T24:00:00", "2025-01-01T00:00:00", "2025-01-01T00:00:00.0000001", "2024-12-31T18:00:00-05:00",
  "2025-01-01T00:59:59+01:00", "2025-01-01T01:00:00+01:00", "2026-06-15T12:00:00+09:30", "2024-02-30T10:00:00", "2023-02-29T10:00:00",
  "2024-02-29T10:00:00", "2024-05-01T23:60:00", "2024-05-01T08:00:00+24:00", "٢٠٢٤-06-01T10:00:00", " 2024-06-01T10:00:00 ",
  "2024-06-01", "2024-06-01T10:00", "1999-12-31T23:59:59", "2030-01-01T00:00:00", "2024-05-01T08:00:00.",
];
function model() {
  const gid = (n) => ("3Dpx" + String(n).padStart(18, "0")).slice(0, 22);
  let out = "", id = 2000;
  VALUES.forEach((v, i) => {
    const d = id++, ps = id++, a = id++, rel = id++;
    out += `#${d}=IFCDOOR('${gid(d)}',$,'V-${i}',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);\n`;
    out += `#${ps}=IFCPROPERTYSET('${gid(ps)}',$,'ACME_Handover',$,(#${a}));\n`;
    out += `#${a}=IFCPROPERTYSINGLEVALUE('InspectedAt',$,IFCDATETIME('${step(v)}'),$);\n`;
    out += `#${rel}=IFCRELDEFINESBYPROPERTIES('${gid(rel)}',$,$,$,(#${d}),#${ps});\n`;
  });
  return readFileSync(new URL("../samples/tiny-house.ifc", import.meta.url), "utf8").replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `${out}ENDSEC;\nEND-ISO-10303-21;\n`);
}
const R = resources();
const L = { S: R.schemas.IFC4, psets: R.psets.IFC4, tm: null };
const CASES = [
  ["2024-05-01T08:00:00", ""], ["2024-05-01T08:00:00", "", true], ["", "2024-12-31T23:59:59"], ["", "2025-01-01T00:00:00", false, true],
  ["2024-05-01T08:00:00", "2024-12-31T23:59:59"], ["2024-05-01T00:00:00", "2024-05-02T00:00:00", false, true], ["2024-05-01T08:00:00+05:30", "2025-01-01T00:00:00Z"],
  ["2024-05-01T07:59:59.9999", "2024-05-01T08:00:00.0001", true, true], ["2020-01-01T00:00:00", "2029-12-31T23:59:59.999"], ["2024-02-29T00:00:00", "2024-03-01T00:00:00", false, true],
];
const label = ([lo, hi, le, he]) => `${lo === "" ? "" : `${le ? ">" : ">="} ${lo}`}${lo !== "" && hi !== "" ? " and " : ""}${hi === "" ? "" : `${he ? "<" : "<="} ${hi}`}`;
const base = { ...blankReq(), kind: "property", set: "ACME_Handover", name: "InspectedAt", custom: true, dataType: "IFCDATETIME" };
const spec = (name, req) => ({ name, optionality: "required", cls: "IFCDOOR", withSub: false, also: [], predefinedType: "", reqs: [{ ...base, ...req }] });
const bounds = ([lo, hi, le, he]) => { const r = {}; if (lo) r[le ? "minExclusive" : "minInclusive"] = lo; if (hi) r[he ? "maxExclusive" : "maxInclusive"] = hi; return r; };
// With the model open, the editor places the zones the model writes exactly.
const MZ = zonesOf(VALUES.map((v) => [v, 1]));
const specs = [];
for (const c of CASES) {
  specs.push(spec(`${label(c)} (range)`, { mode: "range", min: c[0], max: c[1], minEx: !!c[2], maxEx: !!c[3] }));
  specs.push(spec(`${label(c)} (pattern)`, { mode: "pattern", pattern: datePattern(...c) }));
  specs.push(spec(`${label(c)} (pattern, model open)`, { mode: "pattern", pattern: datePattern(c[0], c[1], !!c[2], !!c[3], MZ) }));
}
const xml = buildIds(stateToDoc({ title: "dateTime ranges as patterns", schema: "IFC4", specs }, L), L.S);
const text = model();
if (process.argv[2]) writeFileSync(process.argv[2], xml);
if (process.argv[3]) writeFileSync(process.argv[3], text);
const rep = check(xml, text).specs;
const names = new Map();
const failed = (s) => new Set(s.failed.map((f) => f.id));
console.log(`model zones placed exactly with the model open: ${MZ.join(", ")} (minutes)`);
console.log(`${VALUES.length} doors, one ACME_Handover.InspectedAt (IFCDATETIME) each; ${CASES.length} ranges`);
let off = [0, 0], lens = [[], []];
const nameOf = (id) => { const m = text.match(new RegExp(`#${id}=IFCDOOR\\('[^']*',\\$,'V-(\\d+)'`)); return m ? JSON.stringify(VALUES[+m[1]]) : `#${id}`; };
for (let i = 0; i < CASES.length; i++) {
  const [r, p, w] = rep.slice(3 * i, 3 * i + 3).map(failed);
  const diff = (a, b) => [...a].filter((x) => !b.has(x)).concat([...b].filter((x) => !a.has(x)));
  const dp = diff(r, p), dw = diff(r, w);
  off[0] += dp.length; off[1] += dw.length;
  lens[0].push(datePattern(...CASES[i]).length); lens[1].push(datePattern(CASES[i][0], CASES[i][1], !!CASES[i][2], !!CASES[i][3], MZ).length);
  console.log(`${label(CASES[i]).padEnd(70)} range fails ${String(r.size).padStart(2)}; pattern differs on ${dp.length}${dp.length ? ` (${dp.map(nameOf).join(", ")})` : ""}; with the model open on ${dw.length}${dw.length ? ` (${dw.map(nameOf).join(", ")})` : ""}`);
}
console.log(`door verdicts unlike the range: pattern ${off[0]}, with the model open ${off[1]} (of ${VALUES.length * CASES.length} each)`);
console.log(`pattern length: ${Math.min(...lens[0])} to ${Math.max(...lens[0])} characters; with the model open ${Math.min(...lens[1])} to ${Math.max(...lens[1])}`);
