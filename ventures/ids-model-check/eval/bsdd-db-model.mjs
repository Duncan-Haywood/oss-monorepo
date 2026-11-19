// Does reading a decibel property as a sound pressure or a sound power level
// (bsdd-units.mjs, levelOf) change a model's verdict the way it should?
// One bSDD-style class with three dB properties, the way CEN/TC 126's
// building-acoustics dictionary names them:
//   LA_Fmax_nT  dB, at most 30   (ISO 16032 maximum A-weighted sound
//                                 pressure level: a pressure level)
//   LWA         dB, at most 45   (ISO 3740 A-weighted sound power level)
//   R_w         dB, at least 50  (ISO 717-1 weighted sound reduction index:
//                                 neither level, stays IFCREAL)
// written as an IDS before (every dB property IFCREAL, as before 2026-11-19's
// change: the same file with the two level types put back to IFCREAL; dB
// has a factor of 1, so nothing else differs) and after, and checked against
// samples/tiny-house.ifc with three walls classified as that class:
//   W-01  levels typed as IFC means, all within the limits
//   W-02  levels typed as IFC means, both levels too loud, R_w too low
//   P-01  every value a plain IfcReal, within the limits
//   node eval/bsdd-db-model.mjs [--write DIR]   (DIR: both IDS and the model, for IfcTester)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { bsddIds } from "../bsdd-spec.mjs";
import { check, resources } from "../node.mjs";

const R = resources();
const D = "https://identifier.buildingsmart.org/uri/example/demo/1";
const prop = (code, name, extra) => ({ propertySet: "Akoestiek", propertyCode: code, name, dataType: "Real", units: ["dB"], qudtCodes: ["DeciB"], isRequired: true, ...extra });
const CLS = {
  code: "Wand", referenceCode: "Wand", name: "Wand", uri: `${D}/class/Wand`, dictionaryUri: D, status: "Active", classType: "Class",
  relatedIfcEntityNames: ["IFCWALL"],
  classProperties: [
    prop("LA_Fmax_nT", "LA_Fmax_nT", { maxInclusive: 30 }),
    prop("LWA", "LWA", { maxInclusive: 45 }),
    prop("R_w", "R_w", { minInclusive: 50 }),
  ],
};
const fetch = async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(new URL(url).pathname.startsWith("/api/Dictionary") ? { dictionaries: [{ name: "Demo", uri: D }] } : CLS) });
const gen = await bsddIds([CLS.uri], { fetch, schemas: R.schemas, psets: R.psets, schema: R.schemas.IFC4X3, schemaId: "IFC4", units: R.bsddUnits });
const after = gen.text.replace(/IFC4X3_ADD2/g, "IFC4");
const before = after.replace(/IFCSOUND(PRESSURE|POWER)LEVELMEASURE/g, "IFCREAL");

const base = readFileSync(new URL("../samples/tiny-house.ifc", import.meta.url), "utf8");
let n = 900;
const gid = () => `0aaaaaaaaaaaaaaaaaaa${String(n).padStart(2, "0").slice(-2)}`;
const add = ["#900=IFCCLASSIFICATION($,$,$,'Demo',$,$,$);", "#901=IFCCLASSIFICATIONREFERENCE($,'Wand','Wand',#900,$,$);", "#902=IFCRELASSOCIATESCLASSIFICATION('0aaaaaaaaaaaaaaaaaaaa1',$,$,$,(#20,#21,#22),#901);"];
const walls = [
  ["#20", "IFCSOUNDPRESSURELEVELMEASURE(28.)", "IFCSOUNDPOWERLEVELMEASURE(40.)", "IFCREAL(52.)"],
  ["#21", "IFCSOUNDPRESSURELEVELMEASURE(35.)", "IFCSOUNDPOWERLEVELMEASURE(50.)", "IFCREAL(45.)"],
  ["#22", "IFCREAL(28.)", "IFCREAL(40.)", "IFCREAL(52.)"],
];
let id = 910;
for (const [w, la, lw, r] of walls) {
  const ps = id, a = id + 1, b = id + 2, c = id + 3, rel = id + 4;
  n = id;
  add.push(`#${ps}=IFCPROPERTYSET('${gid()}A',$,'Akoestiek',$,(#${a},#${b},#${c}));`);
  add.push(`#${a}=IFCPROPERTYSINGLEVALUE('LA_Fmax_nT',$,${la},$);`, `#${b}=IFCPROPERTYSINGLEVALUE('LWA',$,${lw},$);`, `#${c}=IFCPROPERTYSINGLEVALUE('R_w',$,${r},$);`);
  add.push(`#${rel}=IFCRELDEFINESBYPROPERTIES('${gid()}B',$,$,$,(${w}),#${ps});`);
  id += 10;
}
const i = base.lastIndexOf("ENDSEC;");
const model = base.slice(0, i) + add.join("\n") + "\n" + base.slice(i);

console.log("types written after:", [...after.matchAll(/dataType="(\w+)"/g)].map((m) => m[1]).join(", "));
for (const note of gen.notes || []) console.log("note:", note);
for (const [label, ids] of [["before (dB as IFCREAL)", before], ["after (levelOf)", after]]) {
  const r = check(ids, model);
  const s = r.specs[0];
  console.log(`${label}: ${s.applicable} applicable, ${s.passed} pass`);
  for (const f of s.failed) console.log(`  fails: ${f.name || f.tag || f.globalId || ""} ${(f.reasons || f.reason || []).toString().slice(0, 400)}`);
}
const dir = process.argv.includes("--write") ? process.argv[process.argv.indexOf("--write") + 1] : null;
if (dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/before.ids`, before);
  writeFileSync(`${dir}/after.ids`, after);
  writeFileSync(`${dir}/model.ifc`, model);
}
