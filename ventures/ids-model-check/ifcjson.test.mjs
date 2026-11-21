import { test } from "node:test";
import assert from "node:assert/strict";
import { check, parseModel } from "./node.mjs";
import { compressGuid, looksLikeJson, ifcJsonSchemaId } from "./ifcjson.mjs";
import { pickModel } from "./zip.mjs";

// UUIDs as ifcJSON writes them; the 22-character forms are what IFC's own
// compression gives (the first pair is the ifcJSON repository's hello-wall
// project, 0YvctVUKr0kugbFTf53O9L in its STEP twin).
const P = "22e66ddf-794d-40bb-8aa5-3dda450d8255";
const W = "f92c2898-fd68-44ef-9178-3348e340017b";
const B = "3ca7e585-4e3e-4969-a86f-f049f4fbde52";

const ids = (specs) => `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <info><title>t</title></info>
  <specifications>${specs}</specifications>
</ids>`;
const wallSpecs = ids(`
    <specification name="external" ifcVersion="IFC2X3 IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
      <requirements><property dataType="IFCBOOLEAN"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>IsExternal</simpleValue></baseName><value><simpleValue>true</simpleValue></value></property></requirements>
    </specification>
    <specification name="named" ifcVersion="IFC2X3 IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
      <requirements><attribute><name><simpleValue>Name</simpleValue></name><value><simpleValue>my wall</simpleValue></value></attribute></requirements>
    </specification>
    <specification name="on a building" ifcVersion="IFC2X3 IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
      <requirements><partOf relation="IFCRELCONTAINEDINSPATIALSTRUCTURE"><entity><name><simpleValue>IFCBUILDING</simpleValue></name></entity></partOf></requirements>
    </specification>
    <specification name="guid" ifcVersion="IFC2X3 IFC4">
      <applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
      <requirements><attribute><name><simpleValue>GlobalId</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="[0-9A-Za-z_$]{22}"/></xs:restriction></value></attribute></requirements>
    </specification>`);

test("a UUID becomes IFC's 22-character GlobalId", () => {
  assert.equal(compressGuid(P), "0YvctVUKr0kugbFTf53O9L");
  assert.equal(compressGuid("00000000-0000-0000-0000-000000000000"), "0000000000000000000000");
  assert.equal(compressGuid("ffffffff-ffff-ffff-ffff-ffffffffffff"), "3$$$$$$$$$$$$$$$$$$$$$");
  assert.equal(compressGuid("0YvctVUKr0kugbFTf53O9L"), "0YvctVUKr0kugbFTf53O9L");
});

// IfcOpenShell's ifc2json: header, rooted objects at the top, {"ref"} links,
// bare simple values, select values wrapped.
const flat = {
  type: "ifcJSON", version: "0.0.1", schemaIdentifier: "IFC4",
  data: [
    { type: "IfcProject", globalId: P, name: "p", isDecomposedBy: [{ type: "IfcRelAggregates", ref: "a0000000-0000-0000-0000-000000000001" }] },
    { type: "IfcBuilding", globalId: B, name: "b" },
    { type: "IfcWall", globalId: W, name: "my wall", predefinedType: "SOLIDWALL", ownerHistory: { type: "IfcOwnerHistory", ref: "a0000000-0000-0000-0000-000000000009" } },
    { type: "IfcOwnerHistory", globalId: "a0000000-0000-0000-0000-000000000009", changeAction: "ADDED", creationDate: 1217620436 },
    { type: "IfcPropertySet", globalId: "a0000000-0000-0000-0000-000000000002", name: "Pset_WallCommon", hasProperties: [
      { type: "IfcPropertySingleValue", name: "IsExternal", nominalValue: { type: "IfcBoolean", value: true } }] },
    { type: "IfcRelAggregates", globalId: "a0000000-0000-0000-0000-000000000001", relatingObject: { type: "IfcProject", ref: P }, relatedObjects: [{ type: "IfcBuilding", ref: B }] },
    { type: "IfcRelContainedInSpatialStructure", globalId: "a0000000-0000-0000-0000-000000000003", relatingStructure: { type: "IfcBuilding", ref: B }, relatedElements: [{ type: "IfcWall", ref: W }] },
    { type: "IfcRelDefinesByProperties", globalId: "a0000000-0000-0000-0000-000000000004", relatedObjects: [{ type: "IfcWall", ref: W }], relatingPropertyDefinition: { type: "IfcPropertySet", ref: "a0000000-0000-0000-0000-000000000002" } },
  ],
};

test("IfcOpenShell's ifcJSON reads into the checker's model", () => {
  const text = JSON.stringify(flat, null, 2);
  assert.ok(looksLikeJson(text));
  assert.equal(ifcJsonSchemaId(text), "IFC4");
  const m = parseModel(text);
  assert.equal(m.format, "ifcJSON");
  assert.equal(m.schemaId, "IFC4");
  assert.deepEqual(m.parseErrors, []);
  const wall = m.ofKind("IFCWALL")[0];
  assert.equal(m.attr(wall, "GlobalId"), compressGuid(W));
  assert.deepEqual(m.attr(wall, "PredefinedType"), { enum: "SOLIDWALL" });
  assert.deepEqual(m.attr(m.get(m.attr(wall, "OwnerHistory")), "ChangeAction"), { enum: "ADDED" });
  // The owner history's globalId is the converter's, not an attribute.
  assert.equal(m.attr(m.get(m.attr(wall, "OwnerHistory")), "GlobalId"), undefined);
  const r = check(wallSpecs, m);
  assert.deepEqual(r.specs.map((s) => [s.name, s.status, s.applicable]), [["external", "pass", 1], ["named", "pass", 1], ["on a building", "pass", 1], ["guid", "pass", 1]]);
});

// IFC.JAVA's Jackson output: no header, nested from the project down, every
// value wrapped, relationships under inverse attributes with no pointer back,
// a second use of an object as its bare id.
const nested = {
  type: "IfcProject", globalId: P, name: { type: "IfcLabel", value: "p" }, phase: { type: "IfcLabel" },
  unitsInContext: { units: [{ type: "IfcSIUnit", unitType: "LENGTHUNIT", prefix: "MILLI", name: "METRE", dimensions: { lengthExponent: 1 } }] },
  isDecomposedBy: { type: "IfcRelAggregates", globalId: "b0000000-0000-0000-0000-000000000001", relatedObjects: [{
    type: "IfcBuilding", globalId: B,
    containsElements: [{ type: "IfcRelContainedInSpatialStructure", globalId: "b0000000-0000-0000-0000-000000000002", relatedElements: [{
      type: "IfcWall", globalId: W, name: { type: "IfcLabel", value: "my wall" },
      isDefinedBy: [{ type: "IfcRelDefinesByProperties", globalId: "b0000000-0000-0000-0000-000000000003", relatingPropertyDefinition: {
        type: "IfcPropertySet", globalId: "b0000000-0000-0000-0000-000000000004", name: { type: "IfcLabel", value: "Pset_WallCommon" },
        hasProperties: [{ type: "IfcPropertySingleValue", name: { type: "IfcIdentifier", value: "IsExternal" }, nominalValue: { type: "IfcBoolean", value: true } }] } }],
    }, { type: "IfcWall", globalId: "c0000000-0000-0000-0000-000000000005", name: { type: "IfcLabel", value: "other" } }] }],
  }] },
  declares: [{ type: "IfcRelAssignsToGroup", globalId: "b0000000-0000-0000-0000-000000000006", relatedObjects: [W], relatingGroup: { type: "IfcGroup", globalId: "b0000000-0000-0000-0000-000000000007" } }],
};

test("IFC.JAVA's nested ifcJSON: pointers back restored, bare ids resolved", () => {
  const m = parseModel(JSON.stringify(nested));
  assert.equal(m.schemaId, "IFC4");
  assert.match(m.parseErrors.join(" "), /no schemaIdentifier in the file; read as IFC4/);
  const project = m.ofKind("IFCPROJECT")[0];
  assert.equal(m.attr(project, "Phase"), "", "an empty wrapper is STEP's ''");
  assert.equal(m.refs(m.get(m.attr(project, "UnitsInContext")), "Units")[0].type, "IFCSIUNIT");
  const walls = m.ofKind("IFCWALL");
  assert.equal(walls.length, 2, "a bare id is a reference, not a new wall");
  const r = check(wallSpecs, m);
  const by = Object.fromEntries(r.specs.map((s) => [s.name, [s.status, s.applicable, s.failed.length]]));
  assert.deepEqual(by["on a building"], ["pass", 2, 0]);
  assert.deepEqual(by.external, ["fail", 2, 1]);
  assert.deepEqual(by.named, ["fail", 2, 1]);
  // A relationship of another kind under an inverse key is still read (its
  // pointer back has no slot there), and its bare-id member resolves.
  const grp = m.ofKind("IFCRELASSIGNSTOGROUP")[0];
  assert.equal(m.refs(grp, "RelatedObjects")[0].id, walls.find((w) => m.attr(w, "Name") === "my wall").id);
});

test("with no header, the schema that knows the class names is used", () => {
  const m = parseModel(JSON.stringify([{ type: "IfcWallStandardCase", globalId: W }, { type: "IfcElectricDistributionPoint", globalId: B }]));
  assert.equal(m.schemaId, "IFC2X3");
  const m4 = parseModel(JSON.stringify([{ type: "IfcWall", globalId: W }, { type: "IfcAlignment", globalId: B }]));
  assert.equal(m4.schemaId, "IFC4X3");
});

test("JSON that is not ifcJSON says why", () => {
  assert.throws(() => parseModel("{ not json"), /ifcJSON model not read: not valid JSON/);
  assert.throws(() => parseModel('{"hello": 1}'), /no ifcJSON objects found/);
});

test("an .ifczip holding ifcJSON picks the JSON file", () => {
  assert.equal(pickModel([{ name: "readme.txt" }, { name: "model.json" }]).name, "model.json");
  assert.equal(pickModel([{ name: "model.json" }, { name: "model.ifc" }]).name, "model.ifc");
});
