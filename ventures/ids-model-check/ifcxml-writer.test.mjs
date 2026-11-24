import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { parseIfcXml } from "./ifcxml.mjs";
import { parseModel, check } from "./node.mjs";
import { writeIfcXml, ifcXmlSchemaFor, ifcXmlTarget } from "./ifcxml-writer.mjs";

const sample = (f) => readFileSync(new URL("./samples/" + f, import.meta.url), "utf8");
const write = (text, id) => {
  const step = parseStep(text, { eager: true });
  const parts = [];
  const stats = writeIfcXml(step, id || ifcXmlSchemaFor(step.schema), (s) => parts.push(s), { timeStamp: "2026-11-24T00:00:00" });
  return { step, xml: parts.join(""), stats };
};
// Every entity's arguments read back from the XML equal the STEP reader's
// (references by STEP number; RelatedObjects compared as sets).
const readsBack = (step, xml, id) => {
  const schema = ifcXmlTarget(id).schema;
  const x = parseIfcXml(xml, schema, { eager: true });
  assert.deepEqual(x.errors, []);
  const byXml = new Map([...x.entities.values()].map((e) => [e.xmlId, e]));
  const stepNo = (n) => Number(x.entities.get(n).xmlId.slice(1));
  const norm = (v, map) => Array.isArray(v) ? v.map((y) => norm(y, map)) : v && v.ref !== undefined ? { ref: map(v.ref) } : v && v.typed ? { typed: v.typed, value: norm(v.value, map) } : v;
  const sets = (args, type) => args.map((v, i) => (Array.isArray(v) && /^Related/.test(schema.attrs(type)[i].name) ? v.map((r) => JSON.stringify(r)).sort() : v));
  for (const e of step.entities.values()) {
    const r = byXml.get("i" + e.id);
    assert.ok(r, `#${e.id} written`);
    assert.equal(r.type, e.type);
    assert.deepEqual(sets(norm(r.args, stepNo), r.type), sets(norm(e.args, (n) => n), e.type), `#${e.id} ${e.type}`);
  }
};

test("the sample reads back entity for entity, with nothing kept outside the XSD", () => {
  const { step, xml, stats } = write(sample("tiny-house.ifc"));
  assert.equal(stats.entities, step.entities.size);
  assert.equal(stats.keptPointers, 0);
  readsBack(step, xml, "IFC4");
});

test("the spatial tree hangs from the project, pointers back left out as the XSD does", () => {
  const { xml } = write(sample("tiny-house.ifc"));
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<ifcXML xmlns="http:\/\/www\.buildingsmart-tech\.org\/ifcXML\/IFC4\/Add2"/);
  // One top-level element holds the project and, under it, site, building,
  // storey and walls.
  const top = xml.split("\n").filter((l) => /^<Ifc/.test(l));
  assert.match(top[0], /^<IfcProject /);
  assert.match(top[0], /<IsDecomposedBy><IfcRelAggregates [^>]*><RelatedObjects><IfcSite /);
  assert.match(top[0], /<ContainsElements><IfcRelContainedInSpatialStructure [^>]*><RelatedElements><IfcWall /);
  // The XSD has no RelatingObject, RelatingStructure, RelatedObjects of a
  // property relationship, or RelatingBuildingElement element.
  for (const n of ["RelatingObject", "RelatingStructure", "RelatingBuildingElement", "RelatingOpeningElement"]) assert.doesNotMatch(xml, new RegExp(`<${n}[ >]`), n);
  assert.doesNotMatch(xml, /<IfcRelDefinesByProperties [^>]*>(?:(?!<\/IfcRelDefinesByProperties>).)*<RelatedObjects>/);
  // A property set shared by two walls: in full under the first, by href
  // under the second.
  assert.equal(xml.split('<IfcRelDefinesByProperties id="i62"').length, 2);
  assert.match(xml, /<IfcRelDefinesByProperties xsi:nil="true" href="i62"\/><\/IsDefinedBy>/);
});

test("element order follows the XSD: supertype levels first, each level's own in order", () => {
  const { xml } = write(sample("tiny-house.ifc"));
  const wall = xml.match(/<IfcWall [^>]*id="i21"[^>]*>(.*?)<\/IfcWall>/)[1];
  // IfcObject's IsDefinedBy before IfcElement's HasOpenings.
  assert.ok(wall.indexOf("<IsDefinedBy>") < wall.indexOf("<HasOpenings "));
  // On the project, IfcObjectDefinition's IsDecomposedBy comes before
  // IfcContext's own UnitsInContext.
  const project = xml.split("\n").find((l) => l.startsWith("<IfcProject "));
  assert.ok(project.indexOf("<IsDecomposedBy>") < project.indexOf("<UnitsInContext "));
  // HasOpenings is the relationship itself, not a list of them.
  assert.match(wall, /<HasOpenings id="i32" GlobalId="[^"]+"><RelatedOpeningElement xsi:type="IfcOpeningElement" /);
});

test("a wall's second opening keeps its pointer: IFC4's XSD allows one HasOpenings", () => {
  const text = sample("tiny-house.ifc").replace("ENDSEC;\nEND-ISO", "#900=IFCOPENINGELEMENT('2Tq1j8wW1E5wNB5u9F9K5b',$,'Opening 2',$,$,$,$,$,.OPENING.);\n#901=IFCRELVOIDSELEMENT('1WbUE2k3T6Ou9S7rM0Fq3e',$,$,$,#21,#900);\nENDSEC;\nEND-ISO");
  const { step, xml, stats } = write(text);
  assert.ok(step.entities.has(901));
  assert.equal(stats.keptPointers, 1);
  assert.deepEqual(stats.keptPointerTypes, { "IfcRelVoidsElement.RelatingBuildingElement": 1 });
  assert.match(xml, /<IfcRelVoidsElement id="i901"[^>]*>.*<RelatingBuildingElement xsi:type="IfcWall" xsi:nil="true" href="i21"\/><\/IfcRelVoidsElement>/);
  readsBack(step, xml, "IFC4");
});

test("IFC4X3 models are written in IFC4X3 ADD2's namespace and read back", () => {
  const text = sample("tiny-house.ifc").replace("FILE_SCHEMA(('IFC4'))", "FILE_SCHEMA(('IFC4X3_ADD2'))");
  const { step, xml, stats } = write(text);
  assert.equal(ifcXmlSchemaFor(step.schema), "IFC4X3");
  assert.match(xml, /<ifcXML xmlns="https:\/\/standards\.buildingsmart\.org\/IFC\/RELEASE\/IFC4\/3\/ADD2"/);
  assert.equal(stats.keptPointers, 0);
  readsBack(step, xml, "IFC4X3");
});

test("IFC2X3 and the IFC4X1/X2 drafts are not written", () => {
  assert.equal(ifcXmlSchemaFor("IFC2X3"), null);
  assert.equal(ifcXmlSchemaFor("IFC4X2"), null);
  assert.equal(ifcXmlSchemaFor("IFC4"), "IFC4");
  assert.equal(ifcXmlSchemaFor("IFC4X3_ADD2"), "IFC4X3");
});

test("the checker gives the same report on the export as on the STEP file", () => {
  const ids = sample("coordination-basics.ids.xml");
  const { xml } = write(sample("tiny-house.ifc"));
  const strip = (r) => JSON.stringify(r.specs.map((s) => [s.name, s.status, s.applicable, s.passed, s.failed.length]));
  const a = check(ids, parseModel(sample("tiny-house.ifc")));
  const b = check(ids, parseModel(xml));
  assert.equal(strip(b), strip(a));
});

test("layout tables cover every entity of their schema", () => {
  for (const id of ["IFC4", "IFC4X3"]) {
    const { schema, layout } = ifcXmlTarget(id);
    for (const e of Object.values(schema.entities)) assert.ok(layout.entities[e.name], `${id} ${e.name}`);
    assert.ok(layout.types.IFCLENGTHMEASURE === "IfcLengthMeasure");
  }
});

test("an IFC4X3 export is opened by the checker in IFC4X3, as its STEP file is", () => {
  const text = sample("tiny-house.ifc").replace("FILE_SCHEMA(('IFC4'))", "FILE_SCHEMA(('IFC4X3_ADD2'))");
  const { xml } = write(text);
  const m = parseModel(xml);
  assert.equal(m.format, "ifcXML");
  assert.equal(m.schemaId, parseModel(text).schemaId);
  assert.equal(m.entities.size, 50);
});

test("lists of lists go flat with ifc:arraySize, as the XSD's \"list list\" says, and read back as rows", () => {
  const text = sample("tiny-house.ifc").replace("ENDSEC;\nEND-ISO", "#910=IFCSTRUCTURALLOADLINEARFORCE('Nominal',$,$,-100.,$,$,$);\n#911=IFCSTRUCTURALLOADCONFIGURATION('Cfg',(#910,#910),((0.),(2.5)));\n#912=IFCINDEXEDPOLYGONALFACEWITHVOIDS((1,2,3,4),((5,6,7),(8,9,10)));\nENDSEC;\nEND-ISO");
  const { step, xml, stats } = write(text);
  assert.match(xml, /<Locations ifc:arraySize="2 1"><IfcLengthMeasure-wrapper>0<\/IfcLengthMeasure-wrapper><IfcLengthMeasure-wrapper>2\.5<\/IfcLengthMeasure-wrapper><\/Locations>/);
  // Rows stay wrapped where the XSD wraps them.
  assert.match(xml, /<InnerCoordIndices><Seq-IfcPositiveInteger-wrapper>5 6 7<\/Seq-IfcPositiveInteger-wrapper><Seq-IfcPositiveInteger-wrapper>8 9 10<\/Seq-IfcPositiveInteger-wrapper><\/InnerCoordIndices>/);
  assert.equal(stats.raggedLists, 0);
  readsBack(step, xml, "IFC4");
});

test("STEP binary loses its unused-bits digit for xs:hexBinary; a simple value is an element's text", () => {
  const text = sample("tiny-house.ifc").replace("ENDSEC;\nEND-ISO", "#920=IFCBLOBTEXTURE(.T.,.T.,'TEXTURE',$,$,'PNG',\"089504E47\");\nENDSEC;\nEND-ISO");
  const { xml, stats } = write(text);
  assert.match(xml, /<IfcBlobTexture id="i920" RepeatS="true" RepeatT="true" Mode="TEXTURE" RasterFormat="PNG"><RasterCode>89504E47<\/RasterCode><\/IfcBlobTexture>/);
  assert.equal(stats.binaryBits, 0);
});

test("a reference to an entity the file lacks is left out and counted", () => {
  const text = sample("tiny-house.ifc").replace("ENDSEC;\nEND-ISO", "#930=IFCPRODUCTDEFINITIONSHAPE($,$,(#999));\nENDSEC;\nEND-ISO");
  const { xml, stats } = write(text);
  assert.equal(stats.danglingRefs, 1);
  assert.match(xml, /<IfcProductDefinitionShape id="i930"><Representations><\/Representations><\/IfcProductDefinitionShape>/);
});
