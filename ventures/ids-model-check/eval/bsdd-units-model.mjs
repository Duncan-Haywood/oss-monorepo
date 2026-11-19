// Does the measure type bsdd-units.mjs writes change a model's verdict the
// way it should? One bSDD-style class (a wall thickness in mm, 50 to 400),
// written as an IDS twice: without the unit table (IFCREAL, 50 to 400, as
// before 2026-11-19) and with it (IFCLENGTHMEASURE, 0.05 to 0.4 in SI). Both
// are checked against samples/tiny-house.ifc (project length unit mm) with
// three walls classified as that class:
//   W-01  IfcLengthMeasure 200 (mm)   the way IFC stores a thickness
//   W-02  IfcLengthMeasure 500 (mm)   too thick
//   P-01  IfcReal 200                  a plain number
//   node eval/bsdd-units-model.mjs [--write DIR]   (DIR: the two IDS and the model, for IfcTester)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { bsddIds } from "../bsdd-spec.mjs";
import { check, resources } from "../node.mjs";

const R = resources();
const D = "https://identifier.buildingsmart.org/uri/example/demo/1";
const CLS = {
  code: "Wand", referenceCode: "Wand", name: "Wand", uri: `${D}/class/Wand`, dictionaryUri: D, status: "Active", classType: "Class",
  relatedIfcEntityNames: ["IFCWALL"],
  classProperties: [{ propertySet: "Maten", propertyCode: "Dikte", dataType: "Real", units: ["mm"], qudtCodes: ["MilliM"], dimension: "1 0 0 0 0 0 0", minInclusive: 50, maxInclusive: 400, isRequired: true }],
};
const fetch = async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(new URL(url).pathname.startsWith("/api/Dictionary") ? { dictionaries: [{ name: "Demo", uri: D }] } : CLS) });
const before = (await bsddIds([CLS.uri], { fetch, schemas: R.schemas, psets: R.psets, schema: R.schemas.IFC4X3, schemaId: "IFC4" })).text.replace(/IFC4X3_ADD2/g, "IFC4");
const after = (await bsddIds([CLS.uri], { fetch, schemas: R.schemas, psets: R.psets, schema: R.schemas.IFC4X3, schemaId: "IFC4", units: R.bsddUnits })).text.replace(/IFC4X3_ADD2/g, "IFC4");

const base = readFileSync(new URL("../samples/tiny-house.ifc", import.meta.url), "utf8");
const add = [
  "#900=IFCCLASSIFICATION($,$,$,'Demo',$,$,$);",
  "#901=IFCCLASSIFICATIONREFERENCE($,'Wand','Wand',#900,$,$);",
  "#902=IFCRELASSOCIATESCLASSIFICATION('0aaaaaaaaaaaaaaaaaaaa1',$,$,$,(#20,#21,#22),#901);",
  "#910=IFCPROPERTYSET('0aaaaaaaaaaaaaaaaaaaa2',$,'Maten',$,(#911));",
  "#911=IFCPROPERTYSINGLEVALUE('Dikte',$,IFCLENGTHMEASURE(200.),$);",
  "#912=IFCRELDEFINESBYPROPERTIES('0aaaaaaaaaaaaaaaaaaaa3',$,$,$,(#20),#910);",
  "#920=IFCPROPERTYSET('0aaaaaaaaaaaaaaaaaaaa4',$,'Maten',$,(#921));",
  "#921=IFCPROPERTYSINGLEVALUE('Dikte',$,IFCLENGTHMEASURE(500.),$);",
  "#922=IFCRELDEFINESBYPROPERTIES('0aaaaaaaaaaaaaaaaaaaa5',$,$,$,(#21),#920);",
  "#930=IFCPROPERTYSET('0aaaaaaaaaaaaaaaaaaaa6',$,'Maten',$,(#931));",
  "#931=IFCPROPERTYSINGLEVALUE('Dikte',$,IFCREAL(200.),$);",
  "#932=IFCRELDEFINESBYPROPERTIES('0aaaaaaaaaaaaaaaaaaaa7',$,$,$,(#22),#930);",
];
const i = base.lastIndexOf("ENDSEC;");
const model = base.slice(0, i) + add.join("\n") + "\n" + base.slice(i);

const names = { "#20": "W-01 IfcLengthMeasure 200 mm", "#21": "W-02 IfcLengthMeasure 500 mm", "#22": "P-01 IfcReal 200" };
// The measure with the bounds left in mm: what writing the type alone would do.
const typeOnly = after.replace(/"0\.05"/, '"50"').replace(/"0\.4"/, '"400"');
for (const [label, ids] of [["before (IFCREAL 50..400)", before], ["type only, bounds not in SI (IFCLENGTHMEASURE 50..400)", typeOnly], ["after (IFCLENGTHMEASURE 0.05..0.4)", after]]) {
  const r = check(ids, model);
  const s = r.specs[0];
  console.log(`${label}: ${s.applicable} applicable, ${s.passed} pass`);
  for (const f of s.failed) console.log(`  fails: ${f.name || f.tag || f.globalId || ""} ${(f.reasons || f.reason || []).toString().slice(0, 140)}`);
}
const dir = process.argv.includes("--write") ? process.argv[process.argv.indexOf("--write") + 1] : null;
if (dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/before.ids`, before);
  writeFileSync(`${dir}/after.ids`, after);
  writeFileSync(`${dir}/type-only.ids`, typeOnly);
  writeFileSync(`${dir}/model.ifc`, model);
}
