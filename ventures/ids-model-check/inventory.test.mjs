import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Model } from "./ids.mjs";
import { resources, check, readModel } from "./node.mjs";
import { modelInventory } from "./inventory.mjs";
import { modelSets, setsFor, importIds, stateToDoc, buildIds, blankSpec, blankReq, valueTypes } from "./editor.mjs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";

const R = resources();
const S4 = R.schemas.IFC4;
const house = readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8");
const inventoryOf = (text) => modelInventory(new Model(text, R.schemas));
const L4 = { S: S4, psets: R.psets.IFC4, tm: null };

test("the inventory counts each class, its sets and properties, with the data type the model writes", () => {
  const inv = inventoryOf(house);
  assert.equal(inv.schema, "IFC4");
  const wall = inv.classes.find((c) => c.cls === "IFCWALL");
  assert.equal(wall.count, 3);
  assert.deepEqual(wall.predefinedTypes, [["SOLIDWALL", 2], ["PARTITIONING", 1]]);
  const pset = wall.sets.find((s) => s.name === "Pset_WallCommon");
  assert.equal(pset.count, 3);
  assert.deepEqual(pset.props.map((p) => [p.name, p.count, p.dataType]), [["IsExternal", 3, "IFCBOOLEAN"], ["LoadBearing", 2, "IFCBOOLEAN"], ["FireRating", 1, "IFCLABEL"]]);
  const qto = wall.sets.find((s) => s.name === "Qto_WallBaseQuantities");
  assert.deepEqual(qto.props.map((p) => [p.name, p.dataType]), [["Length", "IFCLENGTHMEASURE"]]);
  assert.deepEqual(inv.systems, [["Uniclass 2015", 2]]);
  assert.equal(wall.withMaterial, 2);
  assert.ok(!inv.classes.some((c) => c.cls.startsWith("IFCREL") || c.cls === "IFCPROPERTYSET"), "only object definitions");
  assert.doesNotThrow(() => JSON.stringify(inv), "a worker can post it");
});

test("STEP, ifcXML and .ifczip copies of a model give the same inventory", async () => {
  const strip = (inv) => JSON.stringify({ ...inv, format: null, entityCount: null });
  const a = inventoryOf(house);
  const xml = inventoryOf(readFileSync(new URL("samples/tiny-house.ifcxml", import.meta.url), "utf8"));
  const zip = inventoryOf((await readModel(new URL("samples/tiny-house.ifczip", import.meta.url).pathname)).text);
  assert.equal(xml.format, "ifcXML");
  assert.equal(strip(xml), strip(a));
  assert.equal(strip(zip), strip(a));
});

test("modelSets merges a class and its subclasses and marks the standard sets", () => {
  const inv = inventoryOf(house.replace(/'Pset_WallCommon'/, "'Acme_Wall'"));
  const std = setsFor(R.psets.IFC4, S4, "IFCWALL");
  const sets = modelSets(inv, ["IFCWALL", "IFCWALLSTANDARDCASE"], std);
  assert.deepEqual(sets.map((s) => [s.name, s.count, s.of, s.standard]), [["Pset_WallCommon", 2, 3, true], ["Qto_WallBaseQuantities", 2, 3, true], ["Acme_Wall", 1, 3, false]]);
  assert.deepEqual(sets.find((s) => s.name === "Acme_Wall").props.map((p) => [p.name, p.dataType]), [["IsExternal", "IFCBOOLEAN"], ["LoadBearing", "IFCBOOLEAN"]]);
  assert.deepEqual(modelSets(null, ["IFCWALL"]), []);
  assert.deepEqual(modelSets(inv, ["IFCDOOR"], []), []);
});

test("a row for the model's own set writes an IDS that audits clean and passes on that model", () => {
  const model = house.replace(/'Pset_WallCommon'/g, "'Acme_Wall'");
  const inv = inventoryOf(model);
  const own = modelSets(inv, ["IFCWALL"], setsFor(R.psets.IFC4, S4, "IFCWALL")).find((s) => !s.standard);
  const prop = own.props.find((p) => p.name === "IsExternal");
  const doc = { title: "Own sets", schema: "IFC4", specs: [{ ...blankSpec(), name: "Walls", cls: "IFCWALL", withSub: false, reqs: [{ ...blankReq(), custom: true, set: own.name, name: prop.name, dataType: prop.dataType }] }] };
  const xml = buildIds(stateToDoc(doc, L4), S4);
  assert.match(xml, /<property dataType="IFCBOOLEAN"><propertySet><simpleValue>Acme_Wall<\/simpleValue><\/propertySet><baseName><simpleValue>IsExternal<\/simpleValue>/);
  assert.deepEqual(auditIds(parseIds(xml), { schemas: { IFC4: S4 }, typeMap: R.typeMap, psets: R.psets }), []);
  const r = check(xml, model);
  assert.equal(r.specs[0].status, "pass");
  assert.equal(r.specs[0].passed, 3);
  // With a value: walls must be external. One of three is not.
  doc.specs[0].reqs[0].mode = "true";
  const r2 = check(buildIds(stateToDoc(doc, L4), S4), model);
  assert.equal(r2.specs[0].status, "fail");
  assert.equal(r2.specs[0].failed.length, 1);
});

test("an opened IDS with a project's own set becomes an editable row and writes back the same", () => {
  const ids = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
<specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
<requirements>
<property dataType="IFCLABEL"><propertySet><simpleValue>Acme_Wall</simpleValue></propertySet><baseName><simpleValue>FireCompartment</simpleValue></baseName><value><simpleValue>FC-01</simpleValue></value></property>
<property dataType="IFCLENGTHMEASURE" cardinality="optional"><propertySet><simpleValue>Acme_Wall</simpleValue></propertySet><baseName><simpleValue>Cover</simpleValue></baseName><value><xs:restriction base="xs:double"><xs:minInclusive value="0.02"/><xs:maxInclusive value="0.05"/></xs:restriction></value></property>
<property><propertySet><simpleValue>Acme_Wall</simpleValue></propertySet><baseName><simpleValue>Note</simpleValue></baseName></property>
<property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommonn</simpleValue></propertySet><baseName><simpleValue>Reference</simpleValue></baseName></property>
<property><propertySet><simpleValue>Acme_Wall</simpleValue></propertySet><baseName><simpleValue>Code</simpleValue></baseName><value><simpleValue>X</simpleValue></value></property>
</requirements></specification></specifications></ids>`;
  const parsed = parseIds(ids);
  const r = importIds(parsed, () => L4);
  const reqs = r.state.specs[0].reqs;
  assert.deepEqual(reqs.slice(0, 3).map((x) => [x.custom, x.set, x.name, x.dataType, x.mode]), [[true, "Acme_Wall", "FireCompartment", "IFCLABEL", "equals"], [true, "Acme_Wall", "Cover", "IFCLENGTHMEASURE", "range"], [true, "Acme_Wall", "Note", "", "any"]]);
  assert.ok(reqs[3].fixed, "a misspelt Pset_ name stays as written (the audit flags it)");
  assert.ok(reqs[4].fixed, "a value with no dataType stays as written");
  const back = parseIds(buildIds(stateToDoc(r.state, L4), S4));
  assert.deepEqual(back.specs[0].requirements.map((f) => f.describe()).sort(), parsed.specs[0].requirements.map((f) => f.describe()).sort());
});

test("own-set rows offer the schema's comparable defined types, common ones first", () => {
  const t = valueTypes(S4);
  assert.equal(t[0], "IFCLABEL");
  assert.ok(t.includes("IFCLENGTHMEASURE") && t.includes("IFCBOOLEAN"));
  assert.ok(!t.includes("IFCWALLTYPEENUM") && !t.includes("IFCVALUE"), "no enums or selects");
});

test("the reserved prefixes are case-sensitive, as in the audit: Revit's PSet_Revit_* sets are a project's own", async () => {
  const { ownSetName } = await import("./editor.mjs");
  assert.equal(ownSetName("PSet_Revit_Dimensions"), true);
  assert.equal(ownSetName("Pset_WallCommonn"), false);
  assert.equal(ownSetName("Qto_Mine"), false);
  assert.equal(ownSetName(" "), false);
  const doc = { title: "t", schema: "IFC4", specs: [{ ...blankSpec(), name: "s", cls: "IFCWALL", reqs: [{ ...blankReq(), custom: true, set: "PSet_Revit_Dimensions", name: "Length", dataType: "IFCLENGTHMEASURE" }] }] };
  assert.deepEqual(auditIds(parseIds(buildIds(stateToDoc(doc, L4), S4)), { schemas: { IFC4: S4 }, typeMap: R.typeMap, psets: R.psets }), []);
});
