import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resources, parseModel, check } from "./node.mjs";
import { toStep, stepRealExact } from "./step-writer.mjs";
import { fillModel } from "./model-fill.mjs";
import { Model } from "./ids.mjs";

const sample = (f) => readFileSync(new URL("./samples/" + f, import.meta.url), "utf8");
const val = (v) => JSON.stringify(v, (k, x) => (typeof x === "number" && !Number.isInteger(x) ? Number(x.toPrecision(12)) : x));
const same = (A, B) => {
  for (const [id, e] of A.entities) {
    const x = B.entities.get(id);
    assert.ok(x, `#${id} written`);
    assert.equal(x.type, e.type);
    assert.equal(val(x.args), val(e.args), `#${id} ${e.type}`);
  }
};

test("REALs carry a point and read back as the same double", () => {
  assert.equal(stepRealExact(1), "1.");
  assert.equal(stepRealExact(-0.5), "-0.5");
  assert.equal(stepRealExact(1e-7), "1.E-7");
  assert.equal(stepRealExact(1.5e-7), "1.5E-7");
  assert.equal(stepRealExact(1e21), "1.E21");
  assert.equal(stepRealExact(0.1 + 0.2), "0.30000000000000004");
  assert.throws(() => stepRealExact(NaN));
});

test("an ifcXML model written as STEP reads back to the same entities and verdicts", () => {
  const X = parseModel(sample("tiny-house.ifcxml"));
  const w = toStep(X, { name: "tiny-house.ifc", timestamp: "2026-11-22T00:00:00" });
  assert.deepEqual(w.notes, []);
  assert.match(w.text, /^ISO-10303-21;\nHEADER;/);
  assert.match(w.text, /FILE_SCHEMA\(\('IFC4'\)\);/);
  const S = parseModel(w.text);
  assert.equal(S.format, "STEP");
  assert.deepEqual(S.parseErrors, []);
  assert.equal(S.entities.size, X.entities.size);
  same(X, S);
  for (const f of ["coordination-basics.ids.xml", "quantities-and-naming.ids.xml"]) {
    const v = (m) => JSON.stringify(check(sample(f), m).specs.map((s) => [s.status, s.applicable, s.failed.map((x) => x.globalId).sort()]));
    assert.equal(v(S), v(X), f);
  }
});

test("a STEP model written again is the same model; INTEGER and REAL kept apart by the schema", () => {
  const A = parseModel(sample("tiny-house.ifc"));
  const w = toStep(A);
  const B = parseModel(w.text);
  same(A, B);
  // IfcDoor's OverallHeight is a REAL; an IfcInteger in a property is not.
  const text = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('','',(''),(''),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCDOOR('2HZIdgNmz5bROhh9k9DLyK',$,'D',$,$,$,$,$,2100.,900.,.DOOR.,$,$);\n#2=IFCPROPERTYSINGLEVALUE('N',$,IFCINTEGER(3),$);\n#3=IFCPROPERTYSINGLEVALUE('B',$,IFCLOGICAL(.U.),$);\n#4=IFCPIXELTEXTURE(.T.,.F.,'TEXTURE',$,$,1,1,4,("0FF000000"));\nENDSEC;\nEND-ISO-10303-21;\n`;
  const out = toStep(parseModel(text)).text;
  assert.match(out, /#1=IFCDOOR\('2HZIdgNmz5bROhh9k9DLyK',\$,'D',\$,\$,\$,\$,\$,2100\.,900\.,\.DOOR\.,\$,\$\);/);
  assert.match(out, /#2=IFCPROPERTYSINGLEVALUE\('N',\$,IFCINTEGER\(3\),\$\);/);
  assert.match(out, /#3=IFCPROPERTYSINGLEVALUE\('B',\$,IFCLOGICAL\(\.U\.\),\$\);/);
  assert.match(out, /#4=IFCPIXELTEXTURE\(\.T\.,\.F\.,'TEXTURE',\$,\$,1,1,4,\("0FF000000"\)\);/);
});

test("ifcXML hexBinary gets STEP's leading digit; an ifcJSON {type, value} list item is unwrapped", () => {
  const schemas = resources().schemas;
  const M = new Model(sample("tiny-house.ifc"), schemas);
  // Two hand-made entities on top of a real model, as the ifcXML and
  // IFC.JAVA ifcJSON readers leave them.
  M.format = "ifcXML";
  M.entities.set(900, { id: 900, type: "IFCPIXELTEXTURE", args: [true, false, "TEXTURE", null, null, 1, 1, 4, [{ binary: "FF000000" }]] });
  M.entities.set(901, { id: 901, type: "IFCTRIANGULATEDFACESET", args: [{ ref: 902 }, null, false, [[{ type: "IfcPositiveInteger", value: 1 }, { type: "IfcPositiveInteger", value: 2 }, { type: "IfcPositiveInteger", value: 3 }]], null] });
  M.entities.set(902, { id: 902, type: "IFCCARTESIANPOINTLIST3D", args: [[[0, 0, 0], [1, 0, 0], [0, 1, 0]]] });
  const w = toStep(M);
  assert.deepEqual(w.notes, []);
  assert.match(w.text, /#900=IFCPIXELTEXTURE\(\.T\.,\.F\.,'TEXTURE',\$,\$,1,1,4,\("0FF000000"\)\);/);
  assert.match(w.text, /#901=IFCTRIANGULATEDFACESET\(#902,\$,\.F\.,\(\(1,2,3\)\),\$(,\$)*\);/);
  assert.match(w.text, /#902=IFCCARTESIANPOINTLIST3D\(\(\(0\.,0\.,0\.\),\(1\.,0\.,0\.\),\(0\.,1\.,0\.\)\)(,\$)*\);/);
});

test("a dangling reference is written and noted", () => {
  const M = new Model(sample("tiny-house.ifc"), resources().schemas);
  M.entities.set(990, { id: 990, type: "IFCRELAGGREGATES", args: ["0YvctVUKr0kugbFTf53O9X", null, null, null, { ref: 1 }, [{ ref: 12345 }]] });
  const w = toStep(M);
  assert.equal(w.notes.length, 1);
  assert.match(w.notes[0], /#12345/);
});

const ids = (specs) => `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;

test("fill takes an ifcXML model: written as STEP, filled, and the filled .ifc passes", () => {
  let seed = 7;
  const random = () => Uint8Array.from({ length: 16 }, () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255);
  const I = ids(`<specification name="fire" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName><value><simpleValue>REI60</simpleValue></value></property></requirements></specification>`);
  const xml = sample("tiny-house.ifcxml");
  assert.equal(check(I, parseModel(xml)).specs[0].status, "fail");
  const r = fillModel(I, xml, { ...resources(), random });
  assert.equal(r.convertedFrom, "ifcXML");
  assert.ok(r.written >= 1, `wrote ${r.written}`);
  assert.equal(r.after.pass, true);
  assert.match(r.text, /^ISO-10303-21;/);
  const F = parseModel(r.text);
  assert.equal(F.format, "STEP");
  assert.equal(check(I, F).specs[0].status, "pass");
});
