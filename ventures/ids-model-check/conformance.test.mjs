// conformance.mjs: one hand-written record per fault class of IfcOpenShell's
// labelled broken files (test/fixtures/validate; LGPL, not copied here), each
// with a clean twin, plus the CLI mode and the check's model warning
// (eval/conformance-2026-11-24.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resources, check } from "./node.mjs";
import { conformance, conformanceText, header } from "./conformance.mjs";

const here = new URL(".", import.meta.url).pathname;
const HEAD = (schema, name = "'','2026-11-24T00:00:00',(''),(''),'t','t',''") =>
  `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\nFILE_NAME(${name});\nFILE_SCHEMA(('${schema}'));\nENDSEC;\nDATA;\n`;
const file = (schema, data, name) => HEAD(schema, name) + data.trim() + "\nENDSEC;\nEND-ISO-10303-21;\n";
const codes = (schema, data, name) => conformance(file(schema, data, name), resources().schemas).findings.map((f) => f.code);

const CASES = [
  // [what, schema, faulty data, clean twin, expected code]
  ["too few attributes", "IFC4", "#1=IFCPERSON($,$,$,$,$,$,$);", "#1=IFCPERSON($,$,$,$,$,$,$,$);", "attribute-count"],
  ["too many attributes", "IFC4", "#1=IFCPERSON($,$,$,$,$,$,$,$,$);", "#1=IFCPERSON($,$,$,$,$,$,$,$);", "attribute-count"],
  ["* in an attribute that is not derived", "IFC4", "#1=IFCSIUNIT(*,.LENGTHUNIT.,*,.METRE.);", "#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", "derived-in-explicit"],
  ["$ in a derived attribute", "IFC4", "#1=IFCSIUNIT($,.LENGTHUNIT.,$,.METRE.);", "#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", "unset-derived"],
  ["enumeration value inside a select", "IFC4", "#1=IFCPRESENTATIONSTYLEASSIGNMENT((IFCNULLSTYLE(.NOT_A_VALUE.)));", "#1=IFCPRESENTATIONSTYLEASSIGNMENT((IFCNULLSTYLE(.NULL.)));", "bad-enum"],
  ["enumeration value of a later schema", "IFC2X3", "#1=IFCOWNERHISTORY($,$,$,.NOTDEFINED.,$,$,$,0);", "#1=IFCOWNERHISTORY($,$,$,.ADDED.,$,$,$,0);", "bad-enum"],
  ["typed value with nothing inside", "IFC2X3", "#1=IFCPROPERTYSINGLEVALUE('x',$,IFCREAL(),$);", "#1=IFCPROPERTYSINGLEVALUE('x',$,IFCREAL(0.5),$);", "typed-empty"],
  ["typed value of a type the schema lacks", "IFC2X3", "#1=IFCPROPERTYSINGLEVALUE('x',$,IFCNOSUCHTYPE(0.1),$);", "#1=IFCPROPERTYSINGLEVALUE('x',$,IFCREAL(0.1),$);", "typed-unknown-type"],
  ["string in a number type", "IFC4", "#1=IFCPROPERTYSINGLEVALUE('x',$,IFCPOSITIVELENGTHMEASURE('1'),$);", "#1=IFCPROPERTYSINGLEVALUE('x',$,IFCPOSITIVELENGTHMEASURE(1.),$);", "wrong-literal"],
  ["number in a label", "IFC2X3", "#1=IFCPROPERTYSINGLEVALUE('x',$,IFCLABEL(0.5),$);", "#1=IFCPROPERTYSINGLEVALUE('x',$,IFCLABEL('0.5'),$);", "wrong-literal"],
  ["untyped number where a select needs a type", "IFC2X3", "#1=IFCPROPERTYSINGLEVALUE('x',$,0.2,$);", "#1=IFCPROPERTYSINGLEVALUE('x',$,IFCREAL(0.2),$);", "untyped-in-select"],
  ["typed value where a bare one belongs", "IFC2X3", "#1=IFCQUANTITYAREA('a',$,$,IFCAREAMEASURE(5.4));", "#1=IFCQUANTITYAREA('a',$,$,5.4);", "typed-in-simple"],
  ["NaN in a coordinate", "IFC4", "#1=IFCCARTESIANPOINT((5.,5.,nan.));", "#1=IFCCARTESIANPOINT((5.,5.,0.));", "nan"],
  ["duplicate ApplicationIdentifier", "IFC4", "#1=IFCORGANIZATION($,'o',$,$,$);\n#2=IFCAPPLICATION(#1,'1','A','id');\n#3=IFCAPPLICATION(#1,'1','B','id');", "#1=IFCORGANIZATION($,'o',$,$,$);\n#2=IFCAPPLICATION(#1,'1','A','id1');\n#3=IFCAPPLICATION(#1,'1','B','id2');", "duplicate-application"],
  ["duplicate ApplicationFullName and Version", "IFC4", "#1=IFCORGANIZATION($,'o',$,$,$);\n#2=IFCAPPLICATION(#1,'1','A','id1');\n#3=IFCAPPLICATION(#1,'1','A','id2');", "#1=IFCORGANIZATION($,'o',$,$,$);\n#2=IFCAPPLICATION(#1,'1','A','id1');\n#3=IFCAPPLICATION(#1,'2','A','id2');", "duplicate-application"],
  ["IFC2X3 group with no assignment", "IFC2X3", "#1=IFCGROUP('1AftmW30PC4xMJ7tU7EJK8',$,$,$,$);", "#1=IFCGROUP('1AftmW30PC4xMJ7tU7EJK8',$,$,$,$);\n#2=IFCWALL('3g5hZOvez0U9ta9w2d8T5$',$,$,$,$,$,$,$);\n#3=IFCRELASSIGNSTOGROUP('0B3vnDCO9Cfg4Q09lNwjms',$,$,$,(#2),$,#1);", "group-assignments"],
  ["reference to the wrong class", "IFC4", "#1=IFCCARTESIANPOINT((0.,0.,0.));\n#2=IFCOWNERHISTORY($,#1,$,.ADDED.,$,$,$,0);", "#1=IFCORGANIZATION($,'o',$,$,$);\n#3=IFCAPPLICATION(#1,'1','A','id');\n#2=IFCOWNERHISTORY($,#3,$,.ADDED.,$,$,$,0);", "reference-wrong-class"],
  ["reference to a record that is not there", "IFC4", "#1=IFCCARTESIANPOINT((0.,0.,0.));\n#3=IFCAXIS2PLACEMENT3D(#1,$,$);\n#2=IFCLOCALPLACEMENT(#999,#3);", "#1=IFCCARTESIANPOINT((0.,0.,0.));\n#3=IFCAXIS2PLACEMENT3D(#1,$,$);\n#2=IFCLOCALPLACEMENT($,#3);", "dangling-reference"],
  ["required attribute unset", "IFC4", "#1=IFCPROJECTLIBRARY($,$,'L',$,$,$,$,$,$);", "#1=IFCPROJECTLIBRARY('1iBd2lkrX61vZxF9AnXLa0',$,'L',$,$,$,$,$,$);", "required-unset"],
  ["empty list where one item is the least", "IFC4", "#1=IFCCLASSIFICATION($,$,$,'C',$,$,());", "#1=IFCCLASSIFICATION($,$,$,'C',$,$,('.'));", "list-too-short"],
  ["3D points in a 2D point list", "IFC4", "#1=IFCCARTESIANPOINTLIST2D(((0.,0.,0.),(1.,1.,0.)));", "#1=IFCCARTESIANPOINTLIST2D(((0.,0.),(1.,1.)));", "inner-list-size"],
  ["abstract class written as a record", "IFC4", "#1=IFCELEMENT('2CbOYFeCHBku9$oytmyQ2e',$,$,$,$,$,$,$);", "#1=IFCBUILDINGELEMENTPROXY('2CbOYFeCHBku9$oytmyQ2e',$,$,$,$,$,$,$,$);", "abstract-class"],
];

for (const [what, schema, bad, good, code] of CASES) {
  test(`${what}: ${code}, and its clean twin has no finding`, () => {
    // The faulty record's findings less its twin's are exactly the fault;
    // the twin does not have it (a few twins leave other required slots
    // unset, which both share).
    const b = codes(schema, bad), g = codes(schema, good);
    const rest = [...b];
    for (const c of g) { const i = rest.indexOf(c); if (i >= 0) rest.splice(i, 1); }
    assert.deepEqual(rest, [code], what);
    assert.ok(!g.includes(code), what + " (twin)");
  });
}

test("the header records against ISO 10303-21's shapes", () => {
  const h = (name) => header(HEAD("IFC4", name)).map((x) => x.code);
  assert.deepEqual(h("'','2026-11-24T00:00:00',(''),(''),'t','t',''"), []);
  assert.deepEqual(h("'','2026-11-24T00:00:00',(''),(''),'t','t'"), ["header-count"]);
  assert.deepEqual(h("'','2026-11-24T00:00:00',(''),(''),'t','t','',''"), ["header-count"]);
  assert.deepEqual(h("'',$,(''),(''),'t','t',''"), ["header-type"]);
  assert.deepEqual(h("'','2026-11-24T00:00:00',$,(''),'t','t',''"), ["header-type"]);
  assert.deepEqual(h("'','2026-11-24T00:00:00',(4,5),(''),'t','t',''"), ["header-type"]);
  assert.deepEqual(h("'','2026-11-24T00:00:00',(),(),'t','t',''"), ["header-empty-list", "header-empty-list"]);
});

test("a NUMBER takes an integer or a real; a complex number's list is read as one value", () => {
  assert.deepEqual(codes("IFC4", "#90=IFCQUANTITYCOUNT('count',$,$,25.,$);\n#91=IFCQUANTITYCOUNT('count',$,$,25,$);"), []);
  assert.deepEqual(codes("IFC4", "#1=IFCPROPERTYSINGLEVALUE('Test',$,IFCCOMPLEXNUMBER((0.,0.)),$);"), []);
});

test("a draft IFC4X3 schema is named before its differences", () => {
  const r = conformance(file("IFC4X3_RC2", "#1=IFCCARTESIANPOINT((0.,0.,0.));"), resources().schemas);
  assert.equal(r.findings[0].code, "draft-schema");
  const b = conformance(file("IFC4X2", "#1=IFCCARTESIANPOINT((0.,0.,0.));"), resources().schemas);
  assert.deepEqual(b.findings.map((f) => f.code), ["draft-schema"]);
  assert.match(b.findings[0].message, /read as IFC4,/);
});

test("the shipped samples follow their schema", () => {
  for (const f of ["samples/tiny-house.ifc"]) {
    const r = conformance(readFileSync(new URL(f, import.meta.url)), resources().schemas);
    assert.deepEqual(r.findings, [], f);
    assert.match(conformanceText(r), /every one follows the schema/);
  }
});

test("findings fold by kind: a hundred records with one fault print one line", () => {
  const data = Array.from({ length: 100 }, (_, i) => `#${i + 1}=IFCPROPERTYSINGLEVALUE('x',$,0.2,$);`).join("\n");
  const r = conformance(file("IFC2X3", data), resources().schemas);
  assert.equal(r.findings.length, 100);
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].count, 100);
  assert.equal(r.groups[0].first, 1);
  assert.match(conformanceText(r), /^IFC2X3: 100 schema fault\(s\) in 1 kind\(s\)/);
});

test("CLI --conformance: exit 1 with the fault named, 0 on a clean file, --json lists findings", () => {
  const dir = mkdtempSync(join(tmpdir(), "conf-"));
  const bad = join(dir, "bad.ifc");
  writeFileSync(bad, file("IFC2X3", "#1=IFCPROPERTYSINGLEVALUE('x',$,IFCLABEL(0.5),$);"));
  let r = spawnSync(process.execPath, [here + "cli.mjs", "--conformance", bad], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /NominalValue: 0\.5 where a string belongs/);
  r = spawnSync(process.execPath, [here + "cli.mjs", "--conformance", bad, "--json"], { encoding: "utf8" });
  assert.equal(JSON.parse(r.stdout).findings[0].code, "wrong-literal");
  r = spawnSync(process.execPath, [here + "cli.mjs", "--conformance", here + "samples/tiny-house.ifc"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("the check's report carries the faults as a model warning, not a verdict", () => {
  const dir = mkdtempSync(join(tmpdir(), "conf-"));
  const bad = join(dir, "bad.ifc");
  writeFileSync(bad, file("IFC2X3", "#1=IFCPROPERTYSINGLEVALUE('x',$,0.2,$);"));
  const r = spawnSync(process.execPath, [here + "cli.mjs", bad, here + "samples/edge/outside-schema.ids.xml"], { encoding: "utf8" });
  assert.equal(r.status, 0, "the IDS verdict is unchanged (nothing applicable)");
  assert.match(r.stdout, /model warning: 1 place\(s\) where the file breaks its own IFC2X3 schema/);
  const j = JSON.parse(spawnSync(process.execPath, [here + "cli.mjs", bad, here + "samples/edge/outside-schema.ids.xml", "--json"], { encoding: "utf8" }).stdout);
  assert.equal(j.conformance.total, 1);
  assert.equal(j.conformance.groups[0].code, "untyped-in-select");
  const none = JSON.parse(spawnSync(process.execPath, [here + "cli.mjs", bad, here + "samples/edge/outside-schema.ids.xml", "--json", "--no-conformance"], { encoding: "utf8" }).stdout);
  assert.equal(none.conformance, undefined);
});

test("the library check() leaves conformance to the caller (no second read)", () => {
  const r = check(readFileSync(new URL("samples/edge/outside-schema.ids.xml", import.meta.url), "utf8"), file("IFC2X3", "#1=IFCPROPERTYSINGLEVALUE('x',$,0.2,$);"));
  assert.equal(r.conformance, undefined);
});
