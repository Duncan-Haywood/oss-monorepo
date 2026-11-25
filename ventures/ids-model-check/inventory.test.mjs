import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Model } from "./ids.mjs";
import { resources, check, readModel } from "./node.mjs";
import { modelInventory } from "./inventory.mjs";
import { modelSets, setsFor, importIds, stateToDoc, buildIds, blankSpec, blankReq, valueTypes, modelAttributes, modelCodes, modelValueOffer, valueChoices, appMatchCount, mixedModelTypes, untypeOwnRow } from "./editor.mjs";
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
  assert.deepEqual([reqs[4].fixed, reqs[4].untyped, reqs[4].dataType, reqs[4].mode, reqs[4].equals], [undefined, true, "", "equals", "X"], "a value with no dataType is a row that keeps no dataType");
  assert.ok(!buildIds(stateToDoc(r.state, L4), S4).includes('<property dataType=""'));
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
  assert.deepEqual([range.min, range.max, range.rangeMin, range.rangeMax, range.oneOf], [6, 6, "6", "6", ["6"]], "a short list of numbers is offered as a one-of too");
  assert.deepEqual(len.exact, ["6"], "the exact numbers held, for a one-of a checker without tolerance passes");
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

// Applicability beyond the class (2026-11-17): a row narrows which elements a
// specification is about. The page counts the model's matches from the
// inventory; the count must be the checker's own `applicable`, or null.
test("an applicability row's model count is the checker's applicable count, or null when the tally cannot say", () => {
  const inv = inventoryOf(uncoded);
  const run = (app, reqs = []) => check(buildIds(stateToDoc({ title: "t", schema: "IFC4", specs: [{ ...blankSpec(), name: "Walls", cls: "IFCWALL", withSub: false, reqs, app }] }, L4), S4), uncoded).specs[0];
  const tallyFor = (r) => {
    if (r.kind === "property") return modelSets(inv, ["IFCWALL"]).find((m) => m.name === r.set)?.props.find((q) => q.name === r.name) || null;
    if (r.kind === "attribute") return modelAttributes(inv, ["IFCWALL"]).find((a) => a.name === r.name) || null;
    return modelCodes(inv, ["IFCWALL"]).find((x) => x.system === r.system) || null;
  };
  const rows = [
    { kind: "property", set: "Pset_WallCommon", name: "IsExternal", mode: "true" },
    { kind: "property", set: "Pset_WallCommon", name: "IsExternal", mode: "false" },
    { kind: "property", set: "Pset_WallCommon", name: "IsExternal", mode: "any" },
    { kind: "property", set: "Pset_WallCommon", name: "LoadBearing", mode: "true" },
    { kind: "property", set: "Pset_WallCommon", name: "FireRating", mode: "equals", equals: "60 min" },
    { kind: "attribute", name: "PredefinedType", mode: "equals", equals: "SOLIDWALL" },
    { kind: "attribute", name: "Name", mode: "pattern", pattern: "W-[0-9]+" },
    { kind: "attribute", name: "Name", mode: "oneOf", oneOf: ["P-01", "W-02"] },
    { kind: "attribute", name: "Description", mode: "any" },
    { kind: "classification", system: "Uniclass 2015", mode: "any" },
    { kind: "classification", system: "Uniformat", mode: "any" },
  ].map((r) => ({ ...blankReq(), ...r }));
  const seen = [];
  for (const r of rows) {
    const ch = valueChoices(L4, ["IFCWALL"], r);
    const mp = tallyFor(r);
    const n = appMatchCount(mp, modelValueOffer(mp, ch.kind, ch.enumVals), r, ch.kind || "text");
    const got = run([r]);
    assert.equal(n, got.applicable, `${r.kind} ${r.name || r.system} ${r.mode}`);
    seen.push(n);
  }
  assert.deepEqual(seen, [2, 1, 3, 1, 1, 2, 2, 2, 0, 3, 0]);
  // A code value: one object may carry several codes, so no count is claimed.
  const code = { ...blankReq(), kind: "classification", system: "Uniclass 2015", mode: "equals", equals: "EF_25_10_25" };
  assert.equal(appMatchCount(tallyFor(code), modelValueOffer(tallyFor(code), "text", null), code), null);
  // The narrowed specification checks only those walls: external walls must have a fire rating.
  const fr = run([rows[0]], [{ ...blankReq(), set: "Pset_WallCommon", name: "FireRating" }]);
  assert.deepEqual([fr.applicable, fr.failed.length], [2, 1]);
  // Written with no cardinality, and the document audits clean.
  const xml = buildIds(stateToDoc({ title: "t", schema: "IFC4", specs: [{ ...blankSpec(), name: "Walls", cls: "IFCWALL", app: rows }] }, L4), S4);
  assert.ok(!/<applicability[^]*cardinality=[^]*<\/applicability>/.test(xml));
  const a = auditIds(parseIds(xml), { schemas: { IFC4: S4 }, typeMap: R.typeMap, psets: R.psets });
  assert.deepEqual(a.filter((f) => f.level === "error"), []);
});

test("an opened IDS's applicability facets beyond the class open as editable rows and write back the same", () => {
  const xml = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
    <specification name="external walls" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
      <classification><system><simpleValue>Uniclass 2015</simpleValue></system></classification>
      <attribute><name><simpleValue>PredefinedType</simpleValue></name><value><simpleValue>SOLIDWALL</simpleValue></value></attribute>
      <property dataType="IFCBOOLEAN"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>IsExternal</simpleValue></baseName><value><simpleValue>true</simpleValue></value></property>
      <property><propertySet><simpleValue>Acme_Wall</simpleValue></propertySet><baseName><simpleValue>Zone</simpleValue></baseName></property>
      <property dataType="IFCLENGTHMEASURE"><propertySet><simpleValue>Qto_WallBaseQuantities</simpleValue></propertySet><baseName><simpleValue>Height</simpleValue></baseName><value><xs:restriction base="xs:double"><xs:minExclusive value="3"/></xs:restriction></value></property>
    </applicability><requirements><property><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>FireRating</simpleValue></baseName></property></requirements></specification>
  </specifications></ids>`;
  const parsed = parseIds(xml);
  const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: R.typeMap });
  const imp = importIds(parsed, loadFor);
  const [s] = imp.state.specs;
  assert.deepEqual(s.app.map((r) => `${r.kind}:${r.mode}`), ["classification:any", "attribute:equals", "property:true", "property:any", "property:range"]);
  assert.ok(s.app[3].custom, "a project's own set");
  // An exclusive bound is a range row with "more than" since 2026-11-17 (it was kept as written).
  assert.deepEqual([s.app[4].min, s.app[4].minEx, s.app[4].max, s.app[4].maxEx], ["3", true, "", false]);
  assert.deepEqual(s.fixedApp, []);
  const back = parseIds(buildIds(stateToDoc(imp.state, loadFor("IFC4")), S4));
  const said = (sp) => sp.applicability.map((f) => `${f.kind} ${f.dataType || ""} ${f.describe()}`).sort();
  assert.deepEqual(said(back.specs[0]), said(parsed.specs[0]));
  // Run on the model, the narrowed specification applies to the external solid walls only.
  const got = check(xml.replace(/<property><propertySet><simpleValue>Acme_Wall[^]*?<\/property>\s*<property dataType="IFCLENGTHMEASURE"[^]*?<\/property>/, ""), uncoded).specs[0];
  assert.equal(got.applicable, 2);
});

// A model of `n` doors (and `w` windows) with Pset_Warranty dates spread over
// several years, and a warranty period on each: more values than the
// inventory lists (MAX_LISTED) or tracks (MAX_TRACKED), so the earliest and
// latest must come from every value, not the listed ones.
function warrantyModel(n, w = 0, odd = null) {
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const gid = (k) => ("3Wty" + String(k).padStart(18, "0")).slice(0, 22);
  let out = "", id = 5000;
  for (let i = 0; i < n + w; i++) {
    const start = Date.parse("2022-01-01") + ((i * 37) % 1826) * 86400000 + (i === 7 ? -400 * 86400000 : 0);
    const e = id++, ps = id++, a = id++, p = id++, rel = id++;
    out += i < n ? `#${e}=IFCDOOR('${gid(e)}',$,'D-${i}',$,$,$,$,$,2100.,900.,.DOOR.,.SINGLE_SWING_LEFT.,$);\n`
      : `#${e}=IFCWINDOW('${gid(e)}',$,'W-${i}',$,$,$,$,$,1200.,900.,.WINDOW.,.SINGLE_PANEL.,$);\n`;
    out += `#${ps}=IFCPROPERTYSET('${gid(ps)}',$,'Pset_Warranty',$,(#${a},#${p}));\n`;
    const v = odd && i === n + w - 1 ? odd : `IFCDATE('${i === n + w - 1 && w ? "2031-02-03" : iso(start)}')`;
    out += `#${a}=IFCPROPERTYSINGLEVALUE('WarrantyStartDate',$,${v},$);\n`;
    out += `#${p}=IFCPROPERTYSINGLEVALUE('WarrantyPeriod',$,IFCDURATION('P${1 + (i % 4)}Y${i === 3 ? "6M" : ""}'),$);\n`;
    out += `#${rel}=IFCRELDEFINESBYPROPERTIES('${gid(rel)}',$,$,$,(#${e}),#${ps});\n`;
  }
  return house.replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `${out}ENDSEC;\nEND-ISO-10303-21;\n`);
}

test("Use the model's range on dates and durations: the earliest and latest of every value, and the range passes the model", async () => {
  const { temporalType } = await import("./editor.mjs");
  const text = warrantyModel(600);
  const inv = modelInventory(new Model(text, R.schemas), R.measureUnits);
  const sets = modelSets(inv, ["IFCDOOR"], setsFor(R.psets.IFC4, S4, "IFCDOOR"));
  const prop = (name) => sets.find((s) => s.name === "Pset_Warranty").props.find((p) => p.name === name);
  const start = prop("WarrantyStartDate");
  assert.ok(start.more && start.values.length <= 50, "more values than are listed or tracked");
  // Door 7 is moved 400 days earlier, to the earliest; worked out here from
  // every door's date, apart from the inventory.
  const all = [...text.matchAll(/'WarrantyStartDate',\$,IFCDATE\('([^']+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual([all.length, all[0], all.at(-1)], [600, "2021-08-13", "2026-12-30"]);
  assert.deepEqual([start.tkind, start.tmin, start.tmax], ["date", "2021-08-13", "2026-12-30"]);
  const o = modelValueOffer(start, "text", null, temporalType("IFCDATE"));
  assert.deepEqual([o.tmin, o.tmax, o.oneOf], ["2021-08-13", "2026-12-30", null]);
  // A row of another form gets no range, and a text row none at all.
  assert.deepEqual([modelValueOffer(start, "text", null, "dateTime").tmin, modelValueOffer(start, "text", null).tmin], [null, null]);
  const period = modelValueOffer(prop("WarrantyPeriod"), "text", null, temporalType("IFCDURATION"));
  assert.deepEqual([period.tmin, period.tmax], ["P1Y", "P4Y6M"], "door 3 holds P4Y6M, the longest");
  assert.deepEqual(period.oneOf, ["P1Y", "P2Y", "P3Y", "P4Y", "P4Y6M"], "a complete list keeps its one-of offer too");

  const row = (name, o2, extra = {}) => ({ ...blankReq(), set: "Pset_Warranty", name, cardinality: "optional", mode: "range", min: o2.tmin, max: o2.tmax, ...extra });
  const doc = { title: "warranty", schema: "IFC4", specs: [{ ...blankSpec(), name: "Doors", cls: "IFCDOOR", withSub: false, reqs: [row("WarrantyStartDate", o), row("WarrantyPeriod", period)] }] };
  const xml = buildIds(stateToDoc(doc, L4), S4);
  assert.match(xml, /<xs:restriction base="xs:date">\s*<xs:minInclusive value="2021-08-13"\/>\s*<xs:maxInclusive value="2026-12-30"\/>/);
  assert.deepEqual(auditIds(parseIds(xml), { schemas: { IFC4: S4 }, typeMap: R.typeMap, psets: R.psets }).filter((w) => w.severity === "error"), []);
  const r = check(xml, text);
  assert.equal(r.specs[0].status, "pass", "every one of the 600 doors passes (the sample house's own door has no warranty: optional) the model's own range");
  // A door one day past the latest fails it.
  assert.equal(check(xml, text.replace("IFCDATE('2026-12-30')", "IFCDATE('2026-12-31')")).specs[0].status, "fail");
  // The applicability count agrees: the range keeps every door.
  assert.equal(appMatchCount(start, modelValueOffer(start, "text", null, "date"), { kind: "property", mode: "range", min: o.tmin, max: o.tmax }), null, "an incomplete list cannot be counted");
  const small = modelInventory(new Model(warrantyModel(12), R.schemas), R.measureUnits);
  const sp = modelSets(small, ["IFCDOOR"], []).find((s) => s.name === "Pset_Warranty").props.find((p) => p.name === "WarrantyStartDate");
  const so = modelValueOffer(sp, "text", null, "date");
  assert.equal(appMatchCount(sp, so, { kind: "property", mode: "range", min: so.tmin, max: so.tmax }), 12);
});

test("the model's date range merges across classes, and a value of another form leaves no range", () => {
  const inv = modelInventory(new Model(warrantyModel(10, 3), R.schemas), R.measureUnits);
  const both = modelSets(inv, ["IFCDOOR", "IFCWINDOW"], []).find((s) => s.name === "Pset_Warranty").props.find((p) => p.name === "WarrantyStartDate");
  assert.deepEqual([both.tkind, both.tmin, both.tmax], ["date", "2021-08-13", "2031-02-03"], "the latest is a window's");
  const doors = modelSets(inv, ["IFCDOOR"], []).find((s) => s.name === "Pset_Warranty").props.find((p) => p.name === "WarrantyStartDate");
  assert.equal(doors.tmax < "2031", true);
  // One window writes its start as a label, not a date: no range passes it.
  const mixed = modelInventory(new Model(warrantyModel(10, 3, "IFCLABEL('TBC')"), R.schemas), R.measureUnits);
  const m = modelSets(mixed, ["IFCDOOR", "IFCWINDOW"], []).find((s) => s.name === "Pset_Warranty").props.find((p) => p.name === "WarrantyStartDate");
  assert.deepEqual([m.tkind, m.tmin], ["mixed", null]);
  assert.equal(modelValueOffer(m, "text", null, "date").tmin, null);
  // ...while the doors alone still have theirs.
  const d = modelSets(mixed, ["IFCDOOR"], []).find((s) => s.name === "Pset_Warranty").props.find((p) => p.name === "WarrantyStartDate");
  assert.equal(d.tkind, "date");
});

test("the inventory keeps each number exactly as held, beside its 12-digit tally, up to MAX_EXACT", async () => {
  const { MAX_EXACT } = await import("./inventory.mjs");
  const { modelAttributes } = await import("./editor.mjs");
  // Door heights as unit round trips leave them: 2.4000000000000004 is 2.4 at 12 digits.
  const doors = ["2.4", "2.4000000000000004", "2.8000000001193297"].map((h, i) => `#${900 + i}=IFCDOOR('0Door${i}xxxxxxxxxxxxxxx',$,'D${i}',$,$,$,$,$,${h},1.,$,$,$);`).join("\n");
  const text = house.replace(/ENDSEC;\s*END-ISO/, doors + "\nENDSEC;\nEND-ISO");
  assert.notEqual(text, house);
  const inv = modelInventory(new Model(text, R.schemas));
  const h = modelAttributes(inv, ["IFCDOOR"]).find((a) => a.name === "OverallHeight");
  assert.ok(h.values.some(([v, n]) => v === "2.4" && n === 2), "2.4 and 2.4000000000000004 share a 12-digit tally");
  for (const x of ["2.4", "2.4000000000000004", "2.8000000001193297"]) assert.ok(h.exact.includes(x), x);
  assert.ok(MAX_EXACT >= 24);
});

// ARK_NUS's Revit export writes Constraints.Level as IFCLABEL on 162 rooms and
// IFCTEXT on 145: a one-of with the commonest dataType failed the 145, in this
// checker and IfcTester (eval/mixed-type-own-props-2026-11-24.md).
test("an own property written in two data types: counted per type, and offered with no dataType so every object passes", () => {
  const extra = [
    "#9101=IFCPROPERTYSET('1mXa0Lv5n0GQ6_kuh4Wa3J',$,'Acme_Wall',$,(#9102));",
    "#9102=IFCPROPERTYSINGLEVALUE('Zone',$,IFCLABEL('North'),$);",
    "#9103=IFCRELDEFINESBYPROPERTIES('2mXa0Lv5n0GQ6_kuh4Wa3J',$,$,$,(#20,#21),#9101);",
    "#9104=IFCPROPERTYSET('3mXa0Lv5n0GQ6_kuh4Wa3J',$,'Acme_Wall',$,(#9105));",
    "#9105=IFCPROPERTYSINGLEVALUE('Zone',$,IFCTEXT('South'),$);",
    "#9106=IFCRELDEFINESBYPROPERTIES('0nXa0Lv5n0GQ6_kuh4Wa3J',$,$,$,(#22),#9104);",
  ].join("\n");
  const text = house.replace("ENDSEC;\nEND-ISO", `${extra}\nENDSEC;\nEND-ISO`);
  const inv = inventoryOf(text);
  const wall = inv.classes.find((c) => c.cls === "IFCWALL");
  const zone = wall.sets.find((s) => s.name === "Acme_Wall").props.find((p) => p.name === "Zone");
  assert.deepEqual(zone.typeCounts, [["IFCLABEL", 2], ["IFCTEXT", 1]]);
  const q = modelSets(inv, ["IFCWALL"]).find((m) => m.name === "Acme_Wall").props.find((p) => p.name === "Zone");
  assert.equal(q.dataType, "IFCLABEL");
  assert.deepEqual(mixedModelTypes(q), [["IFCLABEL", 2], ["IFCTEXT", 1]]);
  const o = modelValueOffer(q, "text", null);
  const typed = { ...blankReq(), custom: true, set: "Acme_Wall", name: "Zone", dataType: "IFCLABEL", cardinality: "optional", mode: "oneOf", oneOf: o.oneOf };
  const u = untypeOwnRow(S4, typed, q);
  assert.equal(u.text, true);
  assert.equal(u.dropped, false);
  assert.equal(u.row.dataType, "");
  assert.equal(u.row.untyped, true);
  assert.deepEqual(u.row.oneOf, ["North", "South"]);
  const run = (req) => {
    const ids = buildIds(stateToDoc({ title: "t", schema: "IFC4", specs: [{ ...blankSpec(), name: "zone", cls: "IFCWALL", withSub: false, reqs: [req] }] }, L4), S4);
    return check(ids, text).specs[0];
  };
  const before = run(typed);
  assert.equal(before.status, "fail");
  assert.equal(before.failed.length, 1, "the one wall written as IFCTEXT");
  assert.equal(run(u.row).status, "pass");
  // One type: nothing to offer.
  const one = modelSets(inventoryOf(house), ["IFCWALL"]).find((m) => m.name === "Pset_WallCommon").props.find((p) => p.name === "IsExternal");
  assert.equal(mixedModelTypes(one), null);
  assert.equal(untypeOwnRow(S4, { ...typed, set: "Pset_WallCommon", name: "IsExternal" }, one), null);
});

test("untypeOwnRow keeps only presence when a boolean or number is among the types", () => {
  const q = { name: "ADA Compliant", dataType: "IFCBOOLEAN", typeCounts: [["IFCBOOLEAN", 10], ["IFCLABEL", 8]] };
  const r = { ...blankReq(), custom: true, set: "PSet_Revit_Type_Identity Data", name: "ADA Compliant", dataType: "IFCBOOLEAN", mode: "true" };
  const u = untypeOwnRow(S4, r, q);
  assert.equal(u.text, false);
  assert.equal(u.dropped, true);
  assert.equal(u.row.mode, "any");
  assert.equal(untypeOwnRow(S4, { ...r, custom: false }, q), null, "standard rows go through untypeRow");
  assert.equal(untypeOwnRow(S4, { ...r, untyped: true }, q), null);
});
