// Seeded faults (eval/where-rules-seeded-2026-11-24.md): each fault family,
// written into the bundled sample, makes its rule fail on exactly the records
// it touched, and takes no other finding away.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAMILY_NAMES, seedAndCheck, runRules, splitArgs } from "./eval/where-rules-seeded.mjs";

const tiny = readFileSync(new URL("./samples/tiny-house.ifc", import.meta.url), "utf8");
// The sample has no 2D placement; give it one so the two placement families have a target.
const withProfile = tiny.replace(/\nENDSEC;\s*END-ISO/, "\n#900=IFCCARTESIANPOINT((0.,0.));\n#901=IFCAXIS2PLACEMENT2D(#900,$);\n#902=IFCRECTANGLEPROFILEDEF(.AREA.,$,#901,200.,100.);\nENDSEC;\nEND-ISO");

test("every seed family fires on exactly the seeded records of the sample", () => {
  const before = runRules(withProfile);
  for (const fam of FAMILY_NAMES) {
    const r = seedAndCheck(withProfile, fam, before);
    assert.ok(r, `${fam} found something to seed`);
    assert.ok(r.want.length > 0, fam);
    assert.deepEqual([...r.added].sort(), [...r.want].sort(), fam);
    assert.deepEqual(r.lost, [], fam);
  }
});

test("seeds name the rules an IDS check leans on", () => {
  const rules = (fam) => seedAndCheck(withProfile, fam).want.map((k) => k.split(" ")[1]);
  assert.ok(rules("userdefined-unnamed").includes("IFCWALL.CORRECTPREDEFINEDTYPE"));
  assert.ok(rules("type-of-another-class").includes("IFCWALL.CORRECTTYPEASSIGNED"));
  assert.deepEqual(rules("duplicate-pset-name"), ["IFCOBJECT.UNIQUEPROPERTYSETNAMES"]);
  assert.deepEqual(rules("duplicate-property-name"), ["IFCPROPERTYSET.UNIQUEPROPERTYNAMES"]);
  assert.deepEqual(rules("3d-refdirection-in-2d"), ["IFCAXIS2PLACEMENT2D.REFDIRIS2D"]);
});

test("a seed skips a record that already breaks its rule", () => {
  // Wall #20 already USERDEFINED with no ObjectType: the seed moves to the next wall.
  const broken = withProfile.replace("#20=IFCWALL('3vB2YO$MX4xv5uCqZZG05x',$,'W-01',$,$,$,$,$,.SOLIDWALL.)", "#20=IFCWALL('3vB2YO$MX4xv5uCqZZG05x',$,'W-01',$,$,$,$,$,.USERDEFINED.)");
  assert.notEqual(broken, withProfile);
  const r = seedAndCheck(broken, "userdefined-unnamed");
  assert.ok(!r.want.includes("20 IFCWALL.CORRECTPREDEFINEDTYPE"));
  assert.ok(r.want.includes("21 IFCWALL.CORRECTPREDEFINEDTYPE"));
  assert.deepEqual([...r.added].sort(), [...r.want].sort());
});

test("splitArgs keeps strings and nested lists whole", () => {
  assert.deepEqual(splitArgs("'a,b',(#1,#2),$,'it''s, ok',IFCLABEL('x,y')"), ["'a,b'", "(#1,#2)", "$", "'it''s, ok'", "IFCLABEL('x,y')"]);
});

test("a failing IDS row says when the model breaks a rule the facet leans on", async () => {
  const { checkIds } = await import("./ids.mjs");
  const { resources } = await import("./node.mjs");
  const { conformance, markModelRules } = await import("./conformance.mjs");
  const { textReport } = await import("./report.mjs");
  const R = resources();
  const ids = readFileSync(new URL("./samples/coordination-basics.ids.xml", import.meta.url), "utf8");
  // W-02 (#21) has no LoadBearing. Make it USERDEFINED with no ObjectType, type
  // it by a proxy type, and give it a second Pset_WallCommon through its type.
  const model = tiny
    .replace("#21=IFCWALL('1Lz5$gbjv4GQ6_kuh4Wa3J',$,'W-02',$,$,$,$,$,.SOLIDWALL.)", "#21=IFCWALL('1Lz5$gbjv4GQ6_kuh4Wa3J',$,'W-02',$,$,$,$,$,.USERDEFINED.)")
    .replace(/\nENDSEC;\s*END-ISO/, "\n#950=IFCPROPERTYSINGLEVALUE('Reference',$,IFCIDENTIFIER('X'),$);\n#951=IFCPROPERTYSINGLEVALUE('Reference',$,IFCIDENTIFIER('Y'),$);\n#952=IFCPROPERTYSET('3Sseededpset000000000a',$,'Pset_BuildingElementProxyCommon',$,(#950,#951));\n#953=IFCBUILDINGELEMENTPROXYTYPE('3Sseededtype000000000a',$,'proxy type',$,$,(#952),$,$,$,.NOTDEFINED.);\n#954=IFCRELDEFINESBYTYPE('3Sseededrel0000000000a',$,$,$,(#21),#953);\nENDSEC;\nEND-ISO");
  const report = checkIds(ids, model, { schemas: R.schemas, auditSchemas: R.schemas, typeMap: R.typeMap, measureUnits: R.measureUnits, psets: R.psets });
  const conf = conformance(model, R.schemas, { rules: R.rules });
  assert.ok(markModelRules(report, conf) > 0);
  const row = report.specs.find((s) => /load-bearing/.test(s.name)).failed.find((f) => f.id === 21);
  assert.ok(row, "W-02 fails the LoadBearing spec");
  const notes = row.modelRules.join("\n");
  assert.match(notes, /IfcWall\.CorrectPredefinedType: PredefinedType is USERDEFINED/);
  assert.match(notes, /IfcWall\.CorrectTypeAssigned: its type is another class's type/);
  assert.match(notes, /IfcPropertySet\.UniquePropertyNames on its type's property set #952/);
  // Rows of elements the model does not break carry no note.
  for (const s of report.specs) for (const f of s.failed) if (f.id !== 21) assert.equal(f.modelRules, undefined, `#${f.id}`);
  assert.match(textReport(report), /note: the model breaks IfcWall\.CorrectPredefinedType/);
});
