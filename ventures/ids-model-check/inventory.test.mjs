import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Model } from "./ids.mjs";
import { resources, check, readModel } from "./node.mjs";
import { modelInventory } from "./inventory.mjs";
import { modelSets, setsFor, importIds, stateToDoc, buildIds, blankSpec, blankReq, valueTypes, modelAttributes, modelCodes, modelValueOffer, valueChoices } from "./editor.mjs";
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

test("the inventory lists each property's values as the checker reads them, measures in SI units", async () => {
  const { modelValueOffer } = await import("./editor.mjs");
  const inv = modelInventory(new Model(house, R.schemas), R.measureUnits);
  const sets = modelSets(inv, ["IFCWALL"], setsFor(R.psets.IFC4, S4, "IFCWALL"));
  const prop = (set, name) => sets.find((s) => s.name === set).props.find((p) => p.name === name);
  assert.deepEqual(prop("Pset_WallCommon", "IsExternal").values, [["true", 2], ["false", 1]]);
  assert.deepEqual(prop("Pset_WallCommon", "FireRating").values, [["60 min", 1]]);
  // 6000 in a millimetre model is 6 m, the number an IDS range is compared with.
  const len = prop("Qto_WallBaseQuantities", "Length");
  assert.deepEqual([len.values, len.min, len.max], [[["6", 2]], 6, 6]);
  // Without the unit table the model's own numbers come back, as before.
  assert.equal(inventoryOf(house).classes.find((c) => c.cls === "IFCWALL").sets.find((s) => s.name === "Qto_WallBaseQuantities").props[0].max, 6000);

  // "Allow exactly these values" and "Use the model's range" write requirements this model passes.
  const fire = modelValueOffer(prop("Pset_WallCommon", "FireRating"), "text", null);
  assert.deepEqual(fire.oneOf, ["60 min"]);
  const range = modelValueOffer(len, "number", null);
  assert.deepEqual([range.min, range.max, range.rangeMin, range.rangeMax, range.oneOf], [6, 6, "6", "6", null]);
  const doc = { title: "From the model", schema: "IFC4", specs: [{ ...blankSpec(), name: "Walls", cls: "IFCWALL", withSub: false, reqs: [
    { ...blankReq(), set: "Pset_WallCommon", name: "FireRating", cardinality: "optional", mode: "oneOf", oneOf: fire.oneOf },
    { ...blankReq(), set: "Qto_WallBaseQuantities", name: "Length", cardinality: "optional", mode: "range", min: range.rangeMin, max: range.rangeMax },
  ] }] };
  const xml = buildIds(stateToDoc(doc, L4), S4);
  assert.match(xml, /<xs:enumeration value="60 min"\/>/);
  assert.deepEqual(auditIds(parseIds(xml), { schemas: { IFC4: S4 }, typeMap: R.typeMap, psets: R.psets }), []);
  const r = check(xml, house);
  assert.equal(r.specs[0].status, "pass");
  // ...and a wall with another rating fails it.
  const r2 = check(xml, house.replace("IFCLABEL('60 min')", "IFCLABEL('30 min')"));
  assert.equal(r2.specs[0].status, "fail");
});

test("modelValueOffer: values outside a standard's list, an incomplete list, and kinds that do not fit", async () => {
  const { modelValueOffer } = await import("./editor.mjs");
  const mp = { values: [["A", 5], ["Z", 1]], distinct: 2, more: false, min: null, max: null };
  const o = modelValueOffer(mp, "text", ["A", "B"]);
  assert.deepEqual([o.values, o.outside, o.oneOf], [[["A", 5]], [["Z", 1]], null], "a list limited to the standard's would fail the Z object");
  assert.deepEqual(modelValueOffer(mp, "text", null).oneOf, ["A", "Z"]);
  assert.equal(modelValueOffer({ ...mp, more: true }, "text", null).oneOf, null, "more values than were tracked");
  assert.equal(modelValueOffer({ ...mp, distinct: 60 }, "text", null).oneOf, null, "more values than were listed");
  assert.deepEqual(modelValueOffer({ values: [["0.2", 3], ["n/a", 1]], distinct: 2, min: 0.2, max: 0.2 }, "number", null).values, [["0.2", 3]]);
  assert.equal(modelValueOffer({ values: [], distinct: 0 }, "text", null), null);
  assert.equal(modelValueOffer(mp, null, null), null, "presence-only rows take no value");
});

test("an opened IDS listing free-text values opens as an editable one-of row and writes back the same", () => {
  const ids = `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
<specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
<requirements>
<property dataType="IFCLABEL"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName><value><xs:restriction base="xs:string"><xs:enumeration value="REI 60"/><xs:enumeration value="REI 90"/></xs:restriction></value></property>
<attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:enumeration value="W-01"/><xs:enumeration value="W-02"/></xs:restriction></value></attribute>
</requirements></specification></specifications></ids>`;
  const parsed = parseIds(ids);
  const r = importIds(parsed, () => L4);
  const reqs = r.state.specs[0].reqs;
  assert.deepEqual(reqs.map((x) => [x.fixed ? "kept" : x.mode, x.oneOf]), [["oneOf", ["REI 60", "REI 90"]], ["oneOf", ["W-01", "W-02"]]]);
  const back = parseIds(buildIds(stateToDoc(r.state, L4), S4));
  assert.deepEqual(back.specs[0].requirements.map((f) => f.describe()).sort(), parsed.specs[0].requirements.map((f) => f.describe()).sort());
});

test("the model's range is rounded outward: IDS ranges take no tolerance, and 0.254 m converted from inches is 0.25399999999999995", async () => {
  const { modelValueOffer, outwardBound } = await import("./editor.mjs");
  assert.equal(outwardBound(0.25399999999999995, -1), "0.253999");
  assert.equal(outwardBound(0.10795000000000012, 1), "0.107951");
  assert.equal(outwardBound(6, -1), "6");
  assert.equal(outwardBound(-2.5, 1), "-2.5");
  // 254 mm written as 0.25399999999999995 m in a metre model: the range offered passes it, the nominal one does not.
  const model = house.replace("#2=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);", "#2=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);").replace("6000.,$);", "0.25399999999999995,$);");
  const len = modelSets(modelInventory(new Model(model, R.schemas), R.measureUnits), ["IFCWALL"], []).find((s) => s.name === "Qto_WallBaseQuantities").props[0];
  const o = modelValueOffer(len, "number", null);
  assert.deepEqual([o.values, o.rangeMin, o.rangeMax], [[["0.254", 2]], "0.253999", "0.254"]);
  const ids = (min, max) => buildIds(stateToDoc({ title: "t", schema: "IFC4", specs: [{ ...blankSpec(), name: "Walls", cls: "IFCWALL", withSub: false, reqs: [{ ...blankReq(), set: "Qto_WallBaseQuantities", name: "Length", cardinality: "optional", mode: "range", min, max }] }] }, L4), S4);
  assert.equal(check(ids(o.rangeMin, o.rangeMax), model).specs[0].status, "pass");
  assert.equal(check(ids("0.254", "0.254"), model).specs[0].status, "fail");
});

test("the inventory lists attribute values (enumerations by name, no GlobalId) and each system's codes", () => {
  const inv = inventoryOf(house);
  const wall = inv.classes.find((c) => c.cls === "IFCWALL");
  const attr = (n) => wall.attrs.find((a) => a.name === n);
  assert.ok(!attr("GlobalId"), "an identifier per object is not offered");
  assert.deepEqual(attr("Name").values, [["P-01", 1], ["W-01", 1], ["W-02", 1]]);
  assert.deepEqual(attr("PredefinedType").values, [["SOLIDWALL", 2], ["PARTITIONING", 1]]);
  assert.equal(attr("Name").empty, 0);
  // Only the leaf code: EF_25_10_25, not its parent EF_25_10.
  assert.deepEqual(wall.codes, [{ system: "Uniclass 2015", count: 2, empty: 0, values: [["EF_25_10_25", 2]], distinct: 1, more: false }]);
  const merged = modelAttributes(inv, ["IFCWALL", "IFCSLAB"]).find((a) => a.name === "Name");
  assert.ok(merged.of >= 3 && merged.count >= 3);
});

// The tiny house with its partition wall given a Uniclass reference with no
// code, as Revit writes one when the assembly code is left blank.
const uncoded = house.replace(/ENDSEC;\s*END-ISO/, "#84=IFCCLASSIFICATIONREFERENCE($,'','',#80,$,$);\n#85=IFCRELASSOCIATESCLASSIFICATION('0Pq1Ww2Ee3Rr4Tt5Yy6Uu8',$,$,$,(#22),#84);\nENDSEC;\nEND-ISO");

test("attribute and code offers pass the model they came from; an uncoded reference is counted and fails a code check", () => {
  const ids = (reqs) => buildIds(stateToDoc({ title: "t", schema: "IFC4", specs: [{ ...blankSpec(), name: "Walls", cls: "IFCWALL", withSub: false, reqs }] }, L4), S4);
  const inv = inventoryOf(house);
  // Attribute: "Allow exactly these values" from the model passes it; drop one and that wall fails.
  const r = { ...blankReq(), kind: "attribute", name: "Name", cardinality: "optional" };
  const ch = valueChoices(L4, ["IFCWALL"], r);
  const o = modelValueOffer(modelAttributes(inv, ["IFCWALL"]).find((a) => a.name === "Name"), ch.kind, ch.enumVals);
  assert.deepEqual(o.oneOf, ["P-01", "W-01", "W-02"]);
  assert.equal(check(ids([{ ...r, mode: "oneOf", oneOf: o.oneOf }]), house).specs[0].status, "pass");
  assert.equal(check(ids([{ ...r, mode: "oneOf", oneOf: ["W-01", "W-02"] }]), house).specs[0].failed.length, 1);
  // An enumerated attribute: the offer is limited to the schema's values.
  const pt = { ...blankReq(), kind: "attribute", name: "PredefinedType", cardinality: "optional" };
  const cp = valueChoices(L4, ["IFCWALL"], pt);
  const op = modelValueOffer(modelAttributes(inv, ["IFCWALL"]).find((a) => a.name === "PredefinedType"), cp.kind, cp.enumVals);
  assert.deepEqual([op.oneOf, op.outside], [["PARTITIONING", "SOLIDWALL"], []]);
  assert.equal(check(ids([{ ...pt, mode: "oneOf", oneOf: op.oneOf }]), house).specs[0].status, "pass");

  // Codes: the uncoded partition wall is in the system but has no code.
  const inv2 = inventoryOf(uncoded);
  const k = modelCodes(inv2, ["IFCWALL"]).find((x) => x.system === "Uniclass 2015");
  assert.deepEqual([k.count, k.empty, k.of], [3, 1, 3]);
  const oc = modelValueOffer(k, "text", null);
  assert.deepEqual([oc.oneOf, oc.empty], [["EF_25_10_25"], 1]);
  const c = { ...blankReq(), kind: "classification", system: "Uniclass 2015" };
  assert.equal(check(ids([c]), uncoded).specs[0].status, "pass", "naming only the system passes the uncoded wall");
  const one = check(ids([{ ...c, mode: "oneOf", oneOf: oc.oneOf }]), uncoded).specs[0];
  assert.deepEqual([one.status, one.failed.length], ["fail", 1]);
  const any = check(ids([{ ...c, mode: "pattern", pattern: ".+" }]), uncoded).specs[0];
  assert.deepEqual([any.status, any.failed.length], ["fail", 1], "Require a code fails exactly the uncoded wall");
  assert.equal(check(ids([{ ...c, mode: "pattern", pattern: ".+" }]), house).specs[0].status, "fail", "the unclassified wall of the original fails a required classification");
});
