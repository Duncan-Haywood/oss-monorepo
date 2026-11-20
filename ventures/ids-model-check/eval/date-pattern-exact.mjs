// The editor's "Write as a pattern" before and after 2026-11-20, on values
// where the old pattern (a lexical shape: \d digits, any zone, any day number
// up to 31) and the date range it replaces disagree: days that do not exist,
// a time zone east or west of UTC on a bound, non-ASCII digits, whitespace.
// Writes the IDS and model for IfcTester:
//   node eval/date-pattern-exact.mjs OUT.ids OUT.ifc
//   python3 eval/crosscheck_ifctester.py OUT.ids OUT.ifc
import { readFileSync, writeFileSync } from "node:fs";
import { resources, check } from "../node.mjs";
import { buildIds, stateToDoc, blankReq, datePattern } from "../editor.mjs";
import { lexRange } from "../temporal.mjs";

// The datePattern the editor shipped from 2026-11-17 to 2026-11-20.
function oldDatePattern(min, max, minEx = false, maxEx = false) {
  const DAY = 86400000, isoDay = (t) => new Date(t).toISOString().slice(0, 10), t = (d) => Date.parse(d + "T00:00:00Z");
  const lo = !min ? "0000-00-00" : minEx ? isoDay(t(min) + DAY) : min;
  const hi = !max ? "9999-99-99" : maxEx ? isoDay(t(max) - DAY) : max;
  return lo > hi ? null : `${lexRange(lo, hi)}(Z|[+\\-]\\d{2}:\\d{2})?`;
}

// STEP strings: \X2\ hex for non-ASCII (Arabic-Indic digits).
const step = (s) => [...s].map((c) => (c.charCodeAt(0) > 126 ? `\\X2\\${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}\\X0\\` : c)).join("");
const VALUES = [
  "2024-05-01", "2024-04-30", "2024-05-02", "2024-12-31", "2025-01-01", "2023-12-31", "2026-01-01", "2026-12-31", "2027-01-01",
  "2024-02-29", "2023-02-29", "2024-02-30", "2024-04-31", "2024-06-31", "2026-02-29", "2026-11-31", "2025-02-29", "1900-02-29",
  "2024-05-01+01:00", "2024-05-01-05:00", "2024-04-30-05:00", "2024-05-02+14:00", "2024-12-31-01:00", "2026-01-01+02:00", "2026-12-31-03:00",
  "2024-05-01+24:00", "2024-05-01+10:60", "2024-05-01Z", "2024-05-01-00:00",
  "٢٠٢٤-05-01", "2024-05-01 ",
];
function model() {
  const gid = (n) => ("3Dpx" + String(n).padStart(18, "0")).slice(0, 22);
  let out = "", id = 2000;
  VALUES.forEach((v, i) => {
    const d = id++, ps = id++, a = id++, rel = id++;
    out += `#${d}=IFCDOOR('${gid(d)}',$,'V-${i}',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);\n`;
    out += `#${ps}=IFCPROPERTYSET('${gid(ps)}',$,'Pset_Warranty',$,(#${a}));\n`;
    out += `#${a}=IFCPROPERTYSINGLEVALUE('WarrantyStartDate',$,IFCDATE('${step(v)}'),$);\n`;
    out += `#${rel}=IFCRELDEFINESBYPROPERTIES('${gid(rel)}',$,$,$,(#${d}),#${ps});\n`;
  });
  return readFileSync(new URL("../samples/tiny-house.ifc", import.meta.url), "utf8").replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `${out}ENDSEC;\nEND-ISO-10303-21;\n`);
}
const R = resources();
const L = { S: R.schemas.IFC4, psets: R.psets.IFC4, tm: null };
const CASES = [
  ["2024-01-01", ""], ["2024-05-01", "", true], ["2024-05-01", "2024-05-01"], ["", "2024-05-01", false, true], ["2023-12-31", "2024-12-31"],
  ["2026-01-01", "2026-12-31"], ["2026-05-01", ""], ["2023-02-28", "2025-03-01", true, true], ["", "2024-12-31"], ["2027-06-15", "2028-01-31", false, true],
];
const label = ([lo, hi, le, he]) => `${lo === "" ? "" : `${le ? ">" : ">="} ${lo}`}${lo !== "" && hi !== "" ? " and " : ""}${hi === "" ? "" : `${he ? "<" : "<="} ${hi}`}`;
const base = { ...blankReq(), kind: "property", set: "Pset_Warranty", name: "WarrantyStartDate" };
const spec = (name, req) => ({ name, optionality: "required", cls: "IFCDOOR", withSub: false, also: [], predefinedType: "", reqs: [{ ...base, ...req }] });
const specs = [];
for (const c of CASES) {
  specs.push(spec(`${label(c)} (range)`, { mode: "range", min: c[0], max: c[1], minEx: !!c[2], maxEx: !!c[3] }));
  specs.push(spec(`${label(c)} (old pattern)`, { mode: "pattern", pattern: oldDatePattern(...c) }));
  specs.push(spec(`${label(c)} (new pattern)`, { mode: "pattern", pattern: datePattern(...c) }));
}
const xml = buildIds(stateToDoc({ title: "date patterns, old and new", schema: "IFC4", specs }, L), L.S);
const text = model();
if (process.argv[2]) writeFileSync(process.argv[2], xml);
if (process.argv[3]) writeFileSync(process.argv[3], text);
const rep = check(xml, text).specs;
const failed = (s) => new Set(s.failed.map((f) => f.id));
let oldOff = 0, newOff = 0, lens = [];
console.log(`${VALUES.length} doors, one WarrantyStartDate each; ${CASES.length} ranges`);
for (let i = 0; i < CASES.length; i++) {
  const [r, o, n] = rep.slice(3 * i, 3 * i + 3).map(failed);
  const diff = (a, b) => [...a].filter((x) => !b.has(x)).concat([...b].filter((x) => !a.has(x)));
  const dOld = diff(r, o), dNew = diff(r, n);
  oldOff += dOld.length; newOff += dNew.length;
  lens.push(datePattern(...CASES[i]).length);
  console.log(`${label(CASES[i]).padEnd(32)} range fails ${String(r.size).padStart(2)}; old pattern disagrees on ${String(dOld.length).padStart(2)} doors, new on ${dNew.length}`);
}
console.log(`total door verdicts unlike the range: old pattern ${oldOff}, new pattern ${newOff} (of ${VALUES.length * CASES.length})`);
console.log(`new pattern length: ${Math.min(...lens)} to ${Math.max(...lens)} characters`);
