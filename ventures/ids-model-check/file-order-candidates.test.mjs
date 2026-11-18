// Specifications with no entity facet take their pool from the index a
// prefilter reads and sort it back into file order, instead of walking every
// entity (eval/file-order-candidates-2026-11-18.md). Each pool must give the
// entities, in the order, that every entity run through the facets' own tests
// gives; real STEP exports number their entities out of file order, and so
// does this model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applies, fileOrder } from "./ids.mjs";
import { parseModel, parseIds } from "./node.mjs";

const HEAD = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('','',(),(),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n";
const ifc = (lines) => HEAD + lines.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
const ids = (specs) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;
const sv = (x) => `<simpleValue>${x}</simpleValue>`;
const pat = (x) => `<xs:restriction base="xs:string"><xs:pattern value="${x}"/></xs:restriction>`;
const spec = (app) => `<specification name="s" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded">${app}</applicability><requirements><attribute><name>${sv("Name")}</name></attribute></requirements></specification>`;

// Ids deliberately out of file order: later records carry lower numbers.
const lines = [
  "#90=IFCPROJECT('0p000000000000000000aa',$,'P',$,$,$,$,$,$);",
  "#80=IFCBUILDINGSTOREY('0s000000000000000000aa',$,'L1',$,$,$,$,$,.ELEMENT.,$);",
  "#70=IFCRELAGGREGATES('0r000000000000000000aa',$,$,$,#90,(#80));",
  "#3=IFCWALL('0w000000000000000000aa',$,'W1',$,$,$,$,'T1',$);",
  "#60=IFCDOOR('0d000000000000000000aa',$,'D1',$,$,$,$,$,$,$,$,$,$);",
  "#2=IFCDOOR('0d000000000000000000bb',$,'D2',$,$,$,$,$,$,$,$,$,$);",
  "#50=IFCDOORTYPE('0t000000000000000000aa',$,'DT',$,$,(#41),$,$,$,.DOOR.,.SINGLE_SWING_LEFT.,$,$);",
  "#40=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.F.),$);",
  "#41=IFCPROPERTYSET('0q000000000000000000aa',$,'Pset_DoorCommon',$,(#40));",
  "#42=IFCPROPERTYSET('0q000000000000000000bb',$,'Pset_WallCommon',$,(#40));",
  "#1=IFCRELDEFINESBYTYPE('0r000000000000000000bb',$,$,$,(#2,#60),#50);",
  "#43=IFCRELDEFINESBYPROPERTIES('0r000000000000000000cc',$,$,$,(#3),#42);",
  "#44=IFCRELCONTAINEDINSPATIALSTRUCTURE('0r000000000000000000dd',$,$,$,(#60,#3),#80);",
  "#45=IFCCLASSIFICATIONREFERENCE($,'21.22','Walls',$,$,$);",
  "#46=IFCRELASSOCIATESCLASSIFICATION('0r000000000000000000ee',$,$,$,(#3),#45);",
  "#47=IFCMATERIAL('Oak',$,$);",
  "#48=IFCRELASSOCIATESMATERIAL('0r000000000000000000ff',$,$,$,(#2),#47);",
  "#49=IFCMATERIALPROPERTIES('Pset_MaterialWood',$,(#40),#47);",
  // The door type's classification and material reach D1 only through its type.
  "#33=IFCCLASSIFICATIONREFERENCE($,'23.30','Doors',$,$,$);",
  "#34=IFCRELASSOCIATESCLASSIFICATION('0r000000000000000000ii',$,$,$,(#50),#33);",
  "#35=IFCMATERIAL('Steel',$,$);",
  "#36=IFCRELASSOCIATESMATERIAL('0r000000000000000000jj',$,$,$,(#50),#35);",
  "#30=IFCOPENINGELEMENT('0o000000000000000000aa',$,'O1',$,$,$,$,$,$);",
  "#31=IFCRELVOIDSELEMENT('0r000000000000000000gg',$,$,$,#3,#30);",
  "#32=IFCRELFILLSELEMENT('0r000000000000000000hh',$,$,$,#30,#2);",
];
// Geometry, so that most pools are well under half the model.
for (let i = 0; i < 60; i++) lines.push(`#${1000 - i}=IFCCARTESIANPOINT((${i}.,0.,0.));`);
const MODEL = ifc(lines);

const APPS = [
  `<property><propertySet>${sv("Pset_DoorCommon")}</propertySet><baseName>${sv("IsExternal")}</baseName></property>`,
  `<property><propertySet>${pat("Pset_.*")}</propertySet><baseName>${sv("IsExternal")}</baseName></property>`,
  `<property><propertySet>${sv("Nothing")}</propertySet><baseName>${sv("X")}</baseName></property>`,
  `<classification/>`,
  `<classification><value>${sv("21.22")}</value></classification>`,
  `<material/>`,
  `<material><value>${sv("Oak")}</value></material>`,
  `<classification><value>${sv("23.30")}</value></classification>`,
  `<material><value>${sv("Steel")}</value></material>`,
  `<partOf relation="IFCRELCONTAINEDINSPATIALSTRUCTURE"><entity><name>${sv("IFCBUILDINGSTOREY")}</name></entity></partOf>`,
  `<partOf relation="IFCRELAGGREGATES"><entity><name>${sv("IFCPROJECT")}</name></entity></partOf>`,
  `<partOf relation="IFCRELVOIDSELEMENT IFCRELFILLSELEMENT"><entity><name>${sv("IFCWALL")}</name></entity></partOf>`,
  `<partOf><entity><name>${pat(".*")}</name></entity></partOf>`,
  `<attribute><name>${sv("Tag")}</name></attribute>`,
  `<attribute><name>${sv("PredefinedType")}</name></attribute>`,
  `<attribute><name>${sv("Name")}</name></attribute>`,
  `<attribute><name>${pat(".*")}</name></attribute>`,
  `<attribute><name>${sv("Coordinates")}</name></attribute>`,
  `<attribute><name>${sv("Tag")}</name></attribute><property><propertySet>${pat("Pset_.*")}</propertySet><baseName>${sv("IsExternal")}</baseName></property>`,
  `<material/><classification/>`,
];

test("every pool gives the walk's entities in file order", () => {
  const m = parseModel(MODEL);
  const ord = [...m.entities.keys()];
  assert.notDeepEqual(ord, [...ord].sort((a, b) => a - b), "the model's ids are out of file order");
  const doc = parseIds(ids(APPS.map(spec).join("")));
  const ctx = { typeMap: null };
  const seen = [];
  for (const [i, sp] of doc.specs.entries()) {
    // The reference: every entity, in the Map's (file) order, through the facets' own tests.
    const ref = [...m.entities.values()].filter((e) => sp.applicability.every((f) => f.test(e, m, ctx).ok)).map((e) => e.id);
    assert.deepEqual(applies(sp, m, ctx).map((e) => e.id), ref, APPS[i]);
    seen.push(ref.length);
    assert.deepEqual(applies(sp, m, ctx, true).map((e) => e.id), ref, APPS[i] + " (walk)");
  }
  assert.ok(seen.filter((n) => n > 1).length >= 12, `most specs apply to several entities: ${seen}`);
  // At least one non-empty spec took a pool, not the walk.
  assert.ok(m._fileOrder, "fileOrder was built");
});

test("fileOrder is each entity's position in the Map, dense ids or not", () => {
  const m = parseModel(MODEL);
  const ord = fileOrder(m);
  [...m.entities.values()].forEach((e, i) => assert.equal(ord(e), i));
  // Sparse ids fall back to a Map.
  const sparse = { entities: new Map([[5e9, { id: 5e9 }], [3, { id: 3 }], [7, { id: 7 }]]) };
  const o2 = fileOrder(sparse);
  assert.deepEqual([...sparse.entities.values()].map(o2), [0, 1, 2]);
});
