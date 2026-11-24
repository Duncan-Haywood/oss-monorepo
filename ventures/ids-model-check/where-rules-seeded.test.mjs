// Seeded faults (eval/where-rules-seeded-2026-11-24.md): each fault family,
// written into the bundled sample, makes its rule fail on exactly the records
// it touched, and takes no other finding away.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAMILY_NAMES, seedAndCheck, runRules, splitArgs } from "./eval/where-rules-seeded.mjs";

const tiny = readFileSync(new URL("./samples/tiny-house.ifc", import.meta.url), "utf8");
// The sample has no 2D placement and no representation context; give it one
// of each so the placement and context families have a target.
const withProfile = tiny.replace(/\nENDSEC;\s*END-ISO/, "\n#900=IFCCARTESIANPOINT((0.,0.));\n#901=IFCAXIS2PLACEMENT2D(#900,$);\n#902=IFCRECTANGLEPROFILEDEF(.AREA.,$,#901,200.,100.);\n#903=IFCCARTESIANPOINT((0.,0.,0.));\n#904=IFCAXIS2PLACEMENT3D(#903,$,$);\n#905=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#904,$);\nENDSEC;\nEND-ISO");

test("every seed family fires on exactly the seeded records of the sample", () => {
  const before = runRules(withProfile);
  for (const fam of FAMILY_NAMES) {
    const r = seedAndCheck(withProfile, fam, before);
    assert.ok(r, `${fam} found something to seed`);
    // The sample is IFC4, whose IfcSameAxis2Placement never compares locations.
    if (fam !== "context-moved-wcs") assert.ok(r.want.length > 0, fam);
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

test("the global RULEs and the less direct families name their rules", () => {
  const rules = (fam) => seedAndCheck(withProfile, fam).want.map((k) => k.split(" ")[1]);
  assert.deepEqual(rules("second-project"), ["IFCSINGLEPROJECTINSTANCE"]);
  assert.deepEqual(rules("context-rotated-wcs"), ["IFCREPRESENTATIONCONTEXTSAMEWCS"]);
  assert.deepEqual(rules("si-unit-wrong-dimension"), ["IFCNAMEDUNIT.WR1"]);
  assert.deepEqual(rules("material-on-non-element"), ["IFCRELASSOCIATESMATERIAL.ALLOWEDELEMENTS"]);
  assert.deepEqual(rules("material-on-opening"), ["IFCRELASSOCIATESMATERIAL.NOVOIDELEMENT"]);
  // The sample's aggregations are all spatial, so the self-reference also breaks WR41.
  assert.deepEqual(rules("aggregate-self-reference").sort(), ["IFCRELAGGREGATES.NOSELFREFERENCE", "IFCSPATIALSTRUCTUREELEMENT.WR41"]);
});

test("a moved world origin breaks IfcRepresentationContextSameWCS only in IFC4X3", () => {
  // IFC2X3 and IFC4's IfcSameAxis2Placement compares ap1.Location with itself.
  const r4 = seedAndCheck(withProfile, "context-moved-wcs");
  assert.deepEqual(r4.added, []);
  const x3 = withProfile.replace(/FILE_SCHEMA\s*\(\s*\('IFC4'\)\s*\)/, "FILE_SCHEMA(('IFC4X3_ADD2'))");
  assert.notEqual(x3, withProfile);
  const r = seedAndCheck(x3, "context-moved-wcs");
  assert.deepEqual(r.want, ["null IFCREPRESENTATIONCONTEXTSAMEWCS"]);
  assert.ok(r.added.includes("null IFCREPRESENTATIONCONTEXTSAMEWCS"));
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

test("conformance warns on a moved context origin the IFC4 rule cannot see", async () => {
  const { resources } = await import("./node.mjs");
  const { conformance } = await import("./conformance.mjs");
  const R = resources();
  const codes = (text) => conformance(text, R.schemas, { rules: R.rules }).findings.filter((f) => f.attr === "IfcRepresentationContextSameWCS").map((f) => f.code);
  assert.deepEqual(codes(withProfile), []);
  const moved = seedAndCheck(withProfile, "context-moved-wcs").text;
  assert.deepEqual(codes(moved), ["context-origin"]);
  // A turned axis the schema's own rule catches: no second note.
  assert.deepEqual(codes(seedAndCheck(withProfile, "context-rotated-wcs").text), ["where-rule"]);
  // IFC4X3's rule compares origins itself.
  const x3 = moved.replace(/FILE_SCHEMA\s*\(\s*\('IFC4'\)\s*\)/, "FILE_SCHEMA(('IFC4X3_ADD2'))");
  assert.deepEqual(codes(x3), ["where-rule"]);
});
