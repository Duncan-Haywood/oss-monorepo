// Writes, with the IDS editor, ranges whose bounds are inclusive or exclusive
// on the sample house's door height (2100 mm) and a wall's ThermalTransmittance,
// checks them here, and saves the IDS for IfcTester:
//   node eval/exclusive-bounds.mjs OUT.ids
//   python3 eval/crosscheck_ifctester.py OUT.ids samples/tiny-house.ifc
import { readFileSync, writeFileSync } from "node:fs";
import { resources, check } from "../node.mjs";
import { buildIds, stateToDoc } from "../editor.mjs";

const R = resources();
const L = { S: R.schemas.IFC4, psets: R.psets.IFC4, tm: null };
const text = readFileSync(new URL("../samples/tiny-house.ifc", import.meta.url), "utf8");
const row = (min, max, minEx, maxEx) => ({ kind: "attribute", name: "OverallHeight", cardinality: "required", mode: "range", min, max, minEx, maxEx, oneOf: [] });
const cases = [
  ["2000", "2100", false, false], ["2000", "2100", true, false], ["2000", "2100", false, true], ["2000", "2100", true, true],
  ["2100", "", false, false], ["2100", "", true, false], ["", "2100", false, true], ["", "2100.5", false, true],
];
const label = ([lo, hi, le, he]) => `${lo === "" ? "" : `${le ? ">" : ">="} ${lo}`}${lo !== "" && hi !== "" ? " and " : ""}${hi === "" ? "" : `${he ? "<" : "<="} ${hi}`}`;
const specs = cases.map((c) => ({ name: `OverallHeight ${label(c)}`, optionality: "required", cls: "IFCDOOR", withSub: false, also: [], predefinedType: "", reqs: [row(...c)] }));
const xml = buildIds(stateToDoc({ title: "exclusive bounds", schema: "IFC4", specs }, L), L.S);
if (process.argv[2]) writeFileSync(process.argv[2], xml);
for (const s of check(xml, text).specs) console.log(`${s.name}: ${s.status}`);
