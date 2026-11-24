import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { resources } from "./node.mjs";
import { whereRules } from "./where-rules.mjs";
import { conformance } from "./conformance.mjs";

const { schemas, rules } = resources();
const step = (schema, body) => `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('t.ifc','2026-11-24T00:00:00',('a'),('b'),'p','s','');
FILE_SCHEMA(('${schema}'));
ENDSEC;
DATA;
${body}
ENDSEC;
END-ISO-10303-21;
`;
const run = (schema, body) => whereRules(parseStep(step(schema, body), { eager: true }), schemas[schema], rules[schema]);
const probe = (schema, body, expr, self = null) => whereRules(parseStep(step(schema, body), { eager: true }), schemas[schema], rules[schema], { probe: [expr, self] }).value;
const fired = (r) => r.findings.map((f) => `${f.id}:${f.attr}`);

test("every rule, derive, function and global rule in the three schemas parses", () => {
  for (const id of ["IFC2X3", "IFC4", "IFC4X3"]) {
    const r = whereRules(parseStep(step(id, ""), { eager: true }), schemas[id], rules[id]);
    assert.deepEqual(r.stats.unparsed, [], id);
  }
  // As many rules as ifcopenshell.validate runs: 363, 677 and 777 (entity and type rules).
  const count = (R) => Object.values(R.entities).reduce((a, e) => a + (e.where || []).length, 0) + Object.values(R.types).reduce((a, t) => a + t.length, 0);
  assert.deepEqual([count(rules.IFC2X3), count(rules.IFC4), count(rules.IFC4X3)], [363, 677, 777]);
});

test("the sample model breaks no rule and every rule it meets evaluates", () => {
  const p = parseStep(readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8"), { eager: true });
  const r = whereRules(p, schemas.IFC4, rules.IFC4);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.stats.errors, []);
  assert.ok(r.stats.evaluated > 50);
});

test("EXPRESS precedence, three-valued logic and aggregates", () => {
  const b = "#1=IFCCARTESIANPOINT((1.,2.,3.));";
  assert.equal(probe("IFC4", b, "1 + 2 * 3"), "7");
  assert.equal(probe("IFC4", b, "2 ** 3 ** 2"), "512");
  assert.equal(probe("IFC4", b, "7 DIV 2"), "3");
  assert.equal(probe("IFC4", b, "TRUE AND UNKNOWN"), "UNKNOWN");
  assert.equal(probe("IFC4", b, "FALSE AND UNKNOWN"), "false");
  assert.equal(probe("IFC4", b, "TRUE OR UNKNOWN"), "true");
  assert.equal(probe("IFC4", b, "? = 1"), "UNKNOWN");
  assert.equal(probe("IFC4", b, "{1 <= 2 < 3}"), "true");
  assert.equal(probe("IFC4", b, "SIZEOF([1, 2, 3] * [2, 3, 4])"), "2");
  assert.equal(probe("IFC4", b, "SIZEOF(QUERY(x <* [1, 2, 3, 4] | x > 2))"), "2");
  assert.equal(probe("IFC4", b, "SIZEOF([0 : 3])"), "3");
  assert.equal(probe("IFC4", b, "Coordinates[2]", 1), "IFCLENGTHMEASURE(2)");
  assert.equal(probe("IFC4", b, "SELF.Dim", 1), "3");
  assert.equal(probe("IFC4", b, "'IFC4.IFCPOINT' IN TYPEOF(SELF)", 1), "true");
});

test("a function with a CASE, LOCALs and entity constructors: IfcSIUnit's derived Dimensions", () => {
  const b = "#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);#2=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);";
  assert.match(probe("IFC4", b, "SELF.Dimensions", 1), /^IFCDIMENSIONALEXPONENTS\(1,0,0,0,0,0,0\)$/);
  assert.equal(probe("IFC4", b, "SELF.Dimensions.LengthExponent", 2), "2");
  assert.deepEqual(run("IFC4", b).findings, []);
  // A length unit with an area's dimensions breaks IfcNamedUnit.WR1.
  const bad = "#1=IFCDIMENSIONALEXPONENTS(2,0,0,0,0,0,0);#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);#3=IFCCONVERSIONBASEDUNIT(#1,.LENGTHUNIT.,'foot',#4);#4=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#2);";
  assert.deepEqual(fired(run("IFC4", bad)), ["3:IfcNamedUnit.WR1"]);
});

test("CorrectPredefinedType: USERDEFINED needs ObjectType, said in IDS terms", () => {
  const r = run("IFC4", "#1=IFCWALL('0abcdefghijklmnopqrstu',$,'W',$,$,$,$,$,.USERDEFINED.);#2=IFCWALL('1abcdefghijklmnopqrstu',$,'W',$,'Partition',$,$,$,.USERDEFINED.);");
  assert.deepEqual(fired(r), ["1:IfcWall.CorrectPredefinedType"]);
  assert.match(r.findings[0].message, /no ObjectType.*IDS predefinedType facet reads ObjectType/);
  const t = run("IFC4", "#1=IFCWALLTYPE('0abcdefghijklmnopqrstu',$,'T',$,$,$,$,$,$,.USERDEFINED.);");
  assert.deepEqual(fired(t), ["1:IfcWallType.CorrectPredefinedType"]);
  assert.match(t.findings[0].message, /no ElementType/);
});

test("CorrectTypeAssigned follows the IsTypedBy inverse to the type's class", () => {
  const r = run("IFC4", "#1=IFCWALL('0abcdefghijklmnopqrstu',$,'W',$,$,$,$,$,$);#2=IFCDOORTYPE('1abcdefghijklmnopqrstu',$,'D',$,$,$,$,$,$,.DOOR.,.SINGLE_SWING_LEFT.,$,$);#3=IFCRELDEFINESBYTYPE('2abcdefghijklmnopqrstu',$,$,$,(#1),#2);");
  assert.deepEqual(fired(r), ["1:IfcWall.CorrectTypeAssigned"]);
  assert.match(r.findings[0].message, /typed by #2, an IFCDOORTYPE, where IfcWall.CorrectTypeAssigned needs IFCWALLTYPE/);
});

test("a defined type's rule on a written value, and on an aggregate type (IFC2X3 latitude)", () => {
  const r = run("IFC4", "#1=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,-1.,2.);");
  assert.deepEqual(fired(r), ["1:IfcPositiveLengthMeasure.WR1"]);
  const s = run("IFC2X3", "#1=IFCSITE('0abcdefghijklmnopqrstu',#2,$,$,$,$,$,$,$,(-361,0,0),$,$,$,$);#2=IFCOWNERHISTORY($,$,$,.ADDED.,$,$,$,0);");
  assert.ok(fired(s).includes("1:IfcCompoundPlaneAngleMeasure.WR1"), fired(s).join());
});

test("a SET local keeps its members distinct: two property sets of one name on a wall", () => {
  const r = run("IFC4", `#1=IFCWALL('1SjOSKeDn8KOLFOaEVy$oN',$,$,$,$,$,$,$,$);
#2=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$);
#3=IFCPROPERTYSET('24PUuhvvDBAAfpODs9iLMq',$,'Pset_WallCommon',$,(#2));
#4=IFCRELDEFINESBYPROPERTIES('2S0SlVqz53ngyujVI74cbR',$,$,$,(#1),#3);
#5=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$);
#6=IFCPROPERTYSET('3uhaYX0B968xG1PXbJ$VVN',$,'Pset_WallCommon',$,(#5));
#7=IFCRELDEFINESBYPROPERTIES('1Q1amHTX1FCBA3duuSyAUM',$,$,$,(#1),#6);`);
  assert.deepEqual(fired(r), ["1:IfcObject.UniquePropertySetNames"]);
  assert.match(r.findings[0].message, /'Pset_WallCommon' twice/);
});

test("a function that writes into an entity it built does not touch the file's record", () => {
  // IfcNormalise copies its argument before dividing its ratios.
  const b = "#1=IFCDIRECTION((3.,4.,0.));";
  assert.equal(probe("IFC4", b, "IfcNormalise(SELF).DirectionRatios[1]", 1), "IFCREAL(0.6)");
  assert.equal(probe("IFC4", b, "SELF.DirectionRatios[1]", 1), "IFCREAL(3)");
});

test("global rule: one IfcProject per file", () => {
  const r = run("IFC2X3", "#1=IFCPROJECT('0abcdefghijklmnopqrstu',#3,'A',$,$,$,$,(#4),#5);#2=IFCPROJECT('1abcdefghijklmnopqrstu',#3,'B',$,$,$,$,(#4),#5);");
  assert.ok(r.findings.some((f) => f.attr === "IfcSingleProjectInstance" && f.id === null && /2 in the file/.test(f.message)), r.findings.map((f) => f.message).join("\n"));
});

test("UNKNOWN passes: a rule on an unset optional value raises nothing", () => {
  // IfcWall.CorrectPredefinedType with PredefinedType unset is NOT(EXISTS(...)) = TRUE;
  // IfcPerson.WR1 with neither name is FALSE and fires.
  assert.deepEqual(fired(run("IFC4", "#1=IFCWALL('0abcdefghijklmnopqrstu',$,$,$,$,$,$,$,$);")), []);
  assert.deepEqual(fired(run("IFC4", "#1=IFCPERSON($,$,$,$,$,$,$,$);")), ["1:IfcPerson.IdentifiablePerson"]);
});

test("conformance runs the WHERE rules only when given them", () => {
  const t = step("IFC4", "#1=IFCPERSON($,$,$,$,$,$,$,$);");
  const without = conformance(t, schemas);
  assert.equal(without.whereStats, null);
  assert.ok(!without.findings.some((f) => f.code === "where-rule"));
  const withRules = conformance(t, schemas, { rules });
  assert.ok(withRules.findings.some((f) => f.code === "where-rule" && f.attr === "IfcPerson.IdentifiablePerson"));
  assert.ok(withRules.whereStats.evaluated >= 1);
});
