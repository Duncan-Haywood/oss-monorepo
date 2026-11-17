// Writes, with the IDS editor, date and duration ranges on a door's warranty
// (Pset_Warranty.WarrantyStartDate IFCDATE 2024-05-01, WarrantyPeriod
// IFCDURATION P2Y, added to the sample house), checks them here, and saves
// the IDS and the model for IfcTester:
//   node eval/date-ranges.mjs OUT.ids OUT.ifc
// Each date range is written a second time as the pattern datePattern() makes.
//   python3 eval/crosscheck_ifctester.py OUT.ids OUT.ifc
import { readFileSync, writeFileSync } from "node:fs";
import { resources, check } from "../node.mjs";
import { buildIds, stateToDoc, blankReq, datePattern } from "../editor.mjs";

// 60 more doors, each with its own warranty start and end dates, spread over
// 2022 to 2027 (deterministic), and no placement or geometry: what a date
// facet reads is the property, not the door's shape.
function extraDoors() {
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const gid = (n) => ("2Wty" + String(n).padStart(18, "0")).slice(0, 22);
  let out = "", id = 1000;
  for (let i = 0; i < 60; i++) {
    const start = Date.parse("2022-01-01") + ((i * 37) % 1826) * 86400000;
    const end = start + (365 + ((i * 53) % 730)) * 86400000;
    const d = id++, ps = id++, a = id++, b = id++, rel = id++;
    out += `#${d}=IFCDOOR('${gid(d)}',$,'D-${i + 2}',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);\n`;
    out += `#${ps}=IFCPROPERTYSET('${gid(ps)}',$,'Pset_Warranty',$,(#${a},#${b}));\n`;
    out += `#${a}=IFCPROPERTYSINGLEVALUE('WarrantyStartDate',$,IFCDATE('${iso(start)}'),$);\n`;
    out += `#${b}=IFCPROPERTYSINGLEVALUE('WarrantyEndDate',$,IFCDATE('${iso(end)}'),$);\n`;
    out += `#${rel}=IFCRELDEFINESBYPROPERTIES('${gid(rel)}',$,$,$,(#${d}),#${ps});\n`;
  }
  return out;
}
const R = resources();
const L = { S: R.schemas.IFC4, psets: R.psets.IFC4, tm: null };
const text = readFileSync(new URL("../samples/tiny-house.ifc", import.meta.url), "utf8").replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `#900=IFCPROPERTYSET('1Wty0000000000000000aa',$,'Pset_Warranty',$,(#901,#902,#904));
#901=IFCPROPERTYSINGLEVALUE('WarrantyStartDate',$,IFCDATE('2024-05-01'),$);
#902=IFCPROPERTYSINGLEVALUE('WarrantyPeriod',$,IFCDURATION('P2Y'),$);
#904=IFCPROPERTYSINGLEVALUE('WarrantyEndDate',$,IFCDATE('2026-04-30'),$);
#903=IFCRELDEFINESBYPROPERTIES('1Wty0000000000000000ab',$,$,$,(#23),#900);
${extraDoors()}ENDSEC;
END-ISO-10303-21;
`);
const row = (name, min, max, minEx = false, maxEx = false) => ({ ...blankReq(), kind: "property", set: "Pset_Warranty", name, mode: "range", min, max, minEx, maxEx });
const cases = [
  ["WarrantyStartDate", "2024-01-01", ""], ["WarrantyStartDate", "2024-05-01", "", true], ["WarrantyStartDate", "2024-05-01", "2024-05-01"],
  ["WarrantyStartDate", "", "2024-05-01", false, true], ["WarrantyStartDate", "2023-12-31", "2024-12-31"],
  ["WarrantyEndDate", "2026-01-01", "2026-12-31"], ["WarrantyEndDate", "2026-05-01", ""],
  ["WarrantyStartDate", "2023-02-28", "2025-03-01", true, true], ["WarrantyEndDate", "", "2024-12-31"], ["WarrantyEndDate", "2027-06-15", "2028-01-31", false, true],
  ["WarrantyPeriod", "P1Y", ""], ["WarrantyPeriod", "", "P2Y", false, true], ["WarrantyPeriod", "P2Y", "P2Y"],
  ["WarrantyPeriod", "P23M", "P25M"], ["WarrantyPeriod", "P18M", "P730D"], ["WarrantyPeriod", "P731D", ""],
];
const label = ([n, lo, hi, le, he]) => `${n} ${lo === "" ? "" : `${le ? ">" : ">="} ${lo}`}${lo !== "" && hi !== "" ? " and " : ""}${hi === "" ? "" : `${he ? "<" : "<="} ${hi}`}`;
const specs = cases.map((c) => ({ name: label(c), optionality: "required", cls: "IFCDOOR", withSub: false, also: [], predefinedType: "", reqs: [row(...c)] }));
// Each date range again, as the pattern the page's "Write as a pattern" writes.
for (const c of cases.filter(([n]) => /Date$/.test(n))) {
  const pattern = datePattern(...c.slice(1));
  specs.push({ name: `${label(c)} (as a pattern)`, optionality: "required", cls: "IFCDOOR", withSub: false, also: [], predefinedType: "", reqs: [{ ...row(c[0], "", ""), mode: "pattern", pattern }] });
}
const xml = buildIds(stateToDoc({ title: "date and duration ranges", schema: "IFC4", specs }, L), L.S);
if (process.argv[2]) writeFileSync(process.argv[2], xml);
if (process.argv[3]) writeFileSync(process.argv[3], text);
for (const s of check(xml, text).specs) console.log(`${s.name}: ${s.status}`);
