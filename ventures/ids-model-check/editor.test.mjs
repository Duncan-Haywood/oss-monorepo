import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { resources, check } from "./node.mjs";
import { modelSubclassesLeftOut, modelSpec, classesWithSets, setsFor, propertiesOf, subclasses, predefinedTypes, buildIds, entityFacet, xsBase, PARTOF_RELATIONS, importIds, stateToDoc, idsSchema, idsSchemaChoices, auditSchemaIds, schemaIdsOf, importIdsAs, specClassNames, commonSets, setTypeLimit, commonAttributes, sameAttributeType, commonPredefinedTypes, parseClassList, valueChoices, attributeValueKind, modelAttributes, modelValueOffer, typeRow, appMatchCount, untypeRow, templateTypeRow, fileTypeRefused, fileTypeOf, nameSuggestion, renameSuggestion, renameRow, specBases, blankReq, blankSpec, classListBases, boxSubclasses, deprecatedFor, DEPRECATED, temporalType, modelSets, datePattern, numberValueProblem, NUMBER_ONEOF_MAX } from "./editor.mjs";
import { Model } from "./ids.mjs";
import { modelInventory } from "./inventory.mjs";

const R = resources();
const S4 = R.schemas.IFC4;
const audit = (xml, id = "IFC4") => auditIds(parseIds(xml), { schemas: { [id]: R.schemas[id] }, typeMap: R.typeMap, psets: R.psets });

test("a class is offered the sets of its own class, its ancestors and, for a type, its occurrence", () => {
  assert.ok(setsFor(R.psets.IFC4, S4, "IFCWALL").includes("Pset_WallCommon"));
  assert.ok(setsFor(R.psets.IFC4, S4, "IFCWALLSTANDARDCASE").includes("Pset_WallCommon"));
  assert.ok(setsFor(R.psets.IFC4, S4, "IFCWALLTYPE").includes("Pset_WallCommon"));
  assert.ok(setsFor(R.psets.IFC4, S4, "IFCWALL").includes("Qto_WallBaseQuantities"));
  assert.ok(!setsFor(R.psets.IFC4, S4, "IFCWALL").includes("Pset_DoorCommon"));
  const sets = setsFor(R.psets.IFC4, S4, "IFCWALL");
  assert.ok(sets.findIndex((s) => s.startsWith("Qto_")) > sets.findIndex((s) => s.startsWith("Pset_")), "property sets first");
  // IFC2X3 type-mapping names carry their type's sets.
  assert.ok(setsFor(R.psets.IFC2X3, R.schemas.IFC2X3, "IFCAIRTERMINAL", R.typeMap).some((s) => s.startsWith("Pset_AirTerminal")));
});

test("only concrete classes that can carry a standard set are offered", () => {
  const cls = classesWithSets(R.psets.IFC4, S4);
  assert.ok(cls.includes("IFCWALL") && cls.includes("IFCDOOR") && cls.includes("IFCSPACE"));
  assert.ok(!cls.includes("IFCBUILDINGELEMENT"), "abstract");
  assert.ok(!cls.includes("IFCCARTESIANPOINT"), "no set applies");
});

test("subclasses and predefined types come from the schema", () => {
  assert.deepEqual(subclasses(S4, "IFCWALL"), ["IFCWALLELEMENTEDCASE", "IFCWALLSTANDARDCASE"]);
  assert.ok(predefinedTypes(S4, "IFCWALL").includes("SHEAR"));
  assert.deepEqual(predefinedTypes(S4, "IFCPROJECT"), []);
  assert.deepEqual(entityFacet(S4, "IFCWALL", { withSubclasses: true }).names, ["IFCWALL", "IFCWALLELEMENTEDCASE", "IFCWALLSTANDARDCASE"]);
});

test("properties carry the template's data type and enumeration", () => {
  const p = Object.fromEntries(propertiesOf(R.psets.IFC4, S4, "Pset_WallCommon").map((x) => [x.name, x]));
  assert.equal(p.IsExternal.dataType, "IFCBOOLEAN");
  assert.equal(p.ThermalTransmittance.dataType, "IFCTHERMALTRANSMITTANCEMEASURE");
  assert.equal(xsBase(S4, "IFCBOOLEAN"), "xs:boolean");
  assert.equal(xsBase(S4, "IFCLENGTHMEASURE"), "xs:double");
  assert.equal(xsBase(S4, "IFCLABEL"), "xs:string");
  const door = Object.fromEntries(propertiesOf(R.psets.IFC4, S4, "Pset_DoorCommon").map((x) => [x.name, x]));
  assert.equal(door.FireRating.dataType, "IFCLABEL");
  assert.deepEqual(propertiesOf(R.psets.IFC4, S4, "Pset_NoSuchSet"), []);
});

test("the written IDS reads back, audits clean and orders facets as ids.xsd does", () => {
  const doc = { title: "R&D <walls>", schema: "IFC4", specs: [
    { name: "Walls \"external\"", description: "a & b", applicability: [entityFacet(S4, "IFCWALL", { withSubclasses: true })], requirements: [
      { kind: "material" },
      { kind: "property", set: "Pset_WallCommon", name: "IsExternal", dataType: "IFCBOOLEAN", value: { equals: "true" } },
      { kind: "partOf", relation: "IFCRELCONTAINEDINSPATIALSTRUCTURE", entity: "IFCBUILDINGSTOREY" },
      { kind: "attribute", name: "Name", value: { pattern: "W-[0-9]+" } },
      { kind: "classification", system: "Uniclass 2015", value: { oneOf: ["EF_25_10"] }, cardinality: "optional" },
      { kind: "property", set: "Qto_WallBaseQuantities", name: "Length", dataType: "IFCLENGTHMEASURE", value: { min: "0.5", max: "30" } },
    ] },
    { name: "No proxies", optionality: "prohibited", applicability: [entityFacet(S4, "IFCBUILDINGELEMENTPROXY")], requirements: [{ kind: "material" }] },
  ] };
  const xml = buildIds(doc, S4);
  const ids = parseIds(xml);
  assert.equal(ids.title, "R&D <walls>");
  assert.equal(ids.specs[0].name, "Walls \"external\"");
  assert.deepEqual(ids.specs[0].ifcVersion, ["IFC4"]);
  assert.deepEqual(ids.specs[0].requirements.map((f) => f.kind), ["partOf", "classification", "attribute", "property", "property", "material"]);
  assert.equal(ids.specs[0].requirements[1].cardinality, "optional");
  assert.equal(ids.specs[1].optionality, "prohibited");
  assert.equal(ids.specs[1].requirements.length, 0, "a prohibited specification gets no requirements");
  assert.deepEqual(audit(xml), []);
  assert.match(xml, /<xs:restriction base="xs:double"><xs:minInclusive value="0.5"\/><xs:maxInclusive value="30"\/><\/xs:restriction>/);
  assert.match(buildIds({ schema: "IFC4X3", specs: [{ name: "x", applicability: [entityFacet(R.schemas.IFC4X3, "IFCWALL")] }] }, R.schemas.IFC4X3), /ifcVersion="IFC4X3_ADD2"/);
});

test("every Pset_WallCommon and Pset_DoorCommon property, as the editor writes it, audits clean in all three schemas", () => {
  for (const id of ["IFC2X3", "IFC4", "IFC4X3"]) {
    const S = R.schemas[id];
    const specs = [];
    for (const [cls, set] of [["IFCWALL", "Pset_WallCommon"], ["IFCDOOR", "Pset_DoorCommon"]]) {
      for (const p of propertiesOf(R.psets[id], S, set)) specs.push({ name: `${set}.${p.name}`, applicability: [entityFacet(S, cls, { withSubclasses: true })], requirements: [{ kind: "property", set, name: p.name, dataType: p.dataType, value: p.enum ? { oneOf: [p.enum[0]] } : null }] });
    }
    assert.deepEqual(audit(buildIds({ schema: id, specs }, S), id), [], id);
  }
});

test("partOf through an opening: the IDS 1.0 token pair, in the editor, the audit and the checker", () => {
  assert.ok(Object.hasOwn(PARTOF_RELATIONS, "IFCRELVOIDSELEMENT IFCRELFILLSELEMENT"));
  assert.ok(!Object.hasOwn(PARTOF_RELATIONS, "IFCRELVOIDSELEMENT"));
  const head = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>`;
  const idsFor = (rel, whole = "IFCWALL") => `${head}<specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCDOOR</simpleValue></name></entity></applicability><requirements><partOf relation="${rel}"><entity><name><simpleValue>${whole}</simpleValue></name></entity></partOf></requirements></specification></specifications></ids>`;
  assert.deepEqual(audit(idsFor("IFCRELVOIDSELEMENT IFCRELFILLSELEMENT")), []);
  assert.equal(audit(idsFor("IFCRELFILLSELEMENT"))[0].code, "relation-voids-fills");
  assert.equal(audit(idsFor("IFCRELBOGUS"))[0].code, "relation-unknown");
  // A door that fills an opening in a wall, and one that fills nothing.
  const model = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('','',(),(),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n` + [
    "#1=IFCWALL('0aaaaaaaaaaaaaaaaaaaa1',$,'W1',$,$,$,$,$,$);",
    "#2=IFCOPENINGELEMENT('0aaaaaaaaaaaaaaaaaaaa2',$,'O1',$,$,$,$,$,$);",
    "#3=IFCDOOR('0aaaaaaaaaaaaaaaaaaaa3',$,'D1',$,$,$,$,$,$,$,$,$,$);",
    "#4=IFCRELVOIDSELEMENT('0aaaaaaaaaaaaaaaaaaaa4',$,$,$,#1,#2);",
    "#5=IFCRELFILLSELEMENT('0aaaaaaaaaaaaaaaaaaaa5',$,$,$,#2,#3);",
    "#6=IFCDOOR('0aaaaaaaaaaaaaaaaaaaa6',$,'D2',$,$,$,$,$,$,$,$,$,$);",
  ].join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
  const r = check(idsFor("IFCRELVOIDSELEMENT IFCRELFILLSELEMENT"), model);
  assert.equal(r.specs[0].status, "fail");
  assert.deepEqual(r.specs[0].failed.map((f) => f.id), [6]);
  // The opening is the path, not the whole.
  assert.deepEqual(check(idsFor("IFCRELVOIDSELEMENT IFCRELFILLSELEMENT", "IFCOPENINGELEMENT"), model).specs[0].failed.map((f) => f.id), [3, 6]);
});

test("a classification facet without a system is invalid, as ids.xsd has it", () => {
  const xml = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><classification/></requirements></specification></specifications></ids>`;
  assert.equal(audit(xml)[0].code, "classification-no-system");
});

test("the editor page loads only its own modules and schema tables, and carries the disclaimer", () => {
  const html = readFileSync(new URL("./editor.html", import.meta.url), "utf8");
  assert.match(html, /No warranty/);
  assert.match(html, /not a design review, a code-compliance check or professional advice/);
  assert.match(html, /Everything on this page runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  for (const m of html.matchAll(/fetch\(([^)]*)\)/g)) assert.match(m[1], /^"schema\/" \+ name$/, m[1]);
  assert.doesNotMatch(html, /XMLHttpRequest|sendBeacon/);
  for (const m of html.matchAll(/from "\.\/([a-z0-9-]+\.mjs)"/g)) assert.doesNotMatch(readFileSync(new URL("./" + m[1], import.meta.url), "utf8"), /from "node:/, m[1]);
  // Every requirement and specification control is labelled.
  for (const m of html.matchAll(/<(?:input|select) id="([^"]+)"/g)) assert.ok(html.includes(`<label for="${m[1]}"`), m[1]);
});

test("IFC2X3 type-mapping names carry their type's sets in the audit (IFCACTUATOR and Pset_ActuatorTypeCommon)", () => {
  const S = R.schemas.IFC2X3;
  const xml = buildIds({ schema: "IFC2X3", specs: [{ name: "a", applicability: [entityFacet(S, "IFCACTUATOR")], requirements: [{ kind: "property", set: "Pset_ActuatorTypeCommon", name: "ManualOverride", dataType: "IFCBOOLEAN" }] }] }, S);
  assert.deepEqual(audit(xml, "IFC2X3"), []);
  // A set for another type is still refused.
  const bad = buildIds({ schema: "IFC2X3", specs: [{ name: "b", applicability: [entityFacet(S, "IFCACTUATOR")], requirements: [{ kind: "property", set: "Pset_AirTerminalTypeCommon", name: "Shape", dataType: "IFCLABEL" }] }] }, S);
  assert.equal(audit(bad, "IFC2X3")[0].code, "pset-class");
});

const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
const reopen = (xml) => {
  const parsed = parseIds(xml);
  const imp = importIds(parsed, loadFor);
  const L = loadFor(imp.state.schema);
  return { parsed, imp, back: parseIds(buildIds(stateToDoc(imp.state, L), L.S)) };
};
const said = (spec) => [...spec.applicability, ...spec.requirements].map((f) => `${f.kind} ${f.cardinality} ${f.dataType || ""} ${f.describe()}`).sort();

test("an opened IDS becomes editable rows where the page can hold a facet, and is kept as written where it cannot", () => {
  const head = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>Opened</title><copyright>Someone</copyright><version>2</version><description>d</description><author>a@example.com</author><purpose>p</purpose></info><specifications>`;
  const xml = head + `
    <specification name="walls" ifcVersion="IFC4" description="why" instructions="how"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><xs:restriction base="xs:string"><xs:enumeration value="IFCWALL"/><xs:enumeration value="IFCWALLELEMENTEDCASE"/><xs:enumeration value="IFCWALLSTANDARDCASE"/></xs:restriction></name></entity></applicability>
      <requirements description="rd">
        <property dataType="IFCBOOLEAN"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>IsExternal</simpleValue></baseName><value><simpleValue>true</simpleValue></value></property>
        <property dataType="IFCLABEL"><propertySet><simpleValue>Acme_Wall</simpleValue></propertySet><baseName><simpleValue>Code</simpleValue></baseName></property>
        <property dataType="IFCTHERMALTRANSMITTANCEMEASURE" cardinality="optional"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>ThermalTransmittance</simpleValue></baseName><value><xs:restriction base="xs:double"><xs:maxExclusive value="0.3"/></xs:restriction></value></property>
        <attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="W-[0-9]+"/></xs:restriction></value></attribute>
      </requirements></specification>
    <specification name="named doors" ifcVersion="IFC2X3 IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><xs:restriction base="xs:string"><xs:pattern value="IFCDOOR.*"/></xs:restriction></name></entity><attribute><name><simpleValue>Name</simpleValue></name></attribute></applicability>
      <requirements><material/></requirements></specification>
    <specification name="no proxies" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="0"><entity><name><simpleValue>IFCBUILDINGELEMENTPROXY</simpleValue></name></entity></applicability><requirements><material/></requirements></specification>
  </specifications></ids>`;
  const { parsed, imp, back } = reopen(xml);
  const [w, d] = imp.state.specs;
  assert.equal(imp.state.schema, "IFC4");
  assert.equal(w.cls, "IFCWALL");
  assert.equal(w.withSub, true);
  assert.deepEqual(w.reqs.map((r) => (r.fixed ? "kept" : r.kind + ":" + r.mode)), ["property:true", "property:any", "property:range", "attribute:pattern"]);
  // A project's own set (Acme_Wall) is an editable row since 2026-11-16; an exclusive bound since 2026-11-17.
  assert.deepEqual([w.reqs[2].min, w.reqs[2].minEx, w.reqs[2].max, w.reqs[2].maxEx], ["", false, "0.3", true]);
  assert.deepEqual([w.reqs[1].custom, w.reqs[1].set, w.reqs[1].dataType], [true, "Acme_Wall", "IFCLABEL"]);
  assert.equal(d.cls, "");
  // The class pattern has no control; the Name condition beside it is an
  // editable applicability row since 2026-11-17.
  assert.deepEqual(d.fixedApp.map((f) => f.kind), ["entity"]);
  assert.deepEqual(d.app.map((r) => `${r.kind}:${r.name}:${r.mode}`), ["attribute:Name:any"]);
  assert.deepEqual(d.ifcVersion, ["IFC2X3", "IFC4"]);
  assert.equal(imp.dropped, 1);
  assert.deepEqual(imp.droppedIn, ["no proxies"]);
  // Written back, it asks for what it asked (bar the prohibited spec's requirement).
  assert.equal(back.title, "Opened");
  assert.deepEqual(back.info, parsed.info);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(said(back.specs[i]), said(parsed.specs[i]), parsed.specs[i].name);
    for (const k of ["name", "description", "instructions", "ifcVersion", "optionality", "requirementsDescription"]) assert.deepEqual(back.specs[i][k], parsed.specs[i][k], k);
  }
  assert.equal(back.specs[2].requirements.length, 0);
  assert.equal(back.specs[2].optionality, "prohibited");
});

test("the shipped samples open and write back unchanged in meaning", () => {
  for (const f of ["coordination-basics.ids.xml", "quantities-and-naming.ids.xml"]) {
    const { parsed, imp, back } = reopen(readFileSync(new URL("./samples/" + f, import.meta.url), "utf8"));
    assert.equal(back.specs.length, parsed.specs.length, f);
    parsed.specs.forEach((s, i) => assert.deepEqual(said(back.specs[i]), said(s), `${f}: ${s.name}`));
    assert.ok(imp.rows > 0, f);
  }
});

test("the schema an IDS is opened for is the one most of its specifications name", () => {
  const p = (vs) => ({ specs: vs.map((v) => ({ ifcVersion: v })) });
  assert.equal(idsSchema(p([["IFC2X3"], ["IFC2X3", "IFC4"], ["IFC4X3_ADD2"]])), "IFC2X3");
  assert.equal(idsSchema(p([["IFC4X3_ADD2"]])), "IFC4X3");
  assert.equal(idsSchema(p([])), "IFC4");
  assert.equal(idsSchema(p([["IFC2X3"], ["IFC4"]])), "IFC4");
});

test("a specification can apply to several classes; the page offers what every one shares", () => {
  const L = loadFor("IFC4");
  // Sets: Pset_WallCommon is a wall's alone; Pset_EnvironmentalImpactIndicators applies to both.
  const both = commonSets(L, ["IFCWALL", "IFCSLAB"]);
  assert.ok(!both.includes("Pset_WallCommon") && !both.includes("Pset_SlabCommon"));
  assert.ok(both.every((x) => setsFor(L.psets, L.S, "IFCWALL").includes(x) && setsFor(L.psets, L.S, "IFCSLAB").includes(x)));
  assert.deepEqual(commonSets(L, ["IFCWALL", "IFCNOTACLASS"]), []);
  // Attributes: PredefinedType is on both but of different enumerations, so no enumeration is offered.
  assert.ok(commonAttributes(L.S, ["IFCWALL", "IFCSLAB"]).includes("PredefinedType"));
  assert.equal(sameAttributeType(L.S, ["IFCWALL", "IFCSLAB"], "PredefinedType"), false);
  assert.equal(valueChoices(L, ["IFCWALL", "IFCSLAB"], { kind: "attribute", name: "PredefinedType" }).enumVals, null);
  assert.ok(valueChoices(L, ["IFCWALL"], { kind: "attribute", name: "PredefinedType" }).enumVals.includes("PARTITIONING"));
  // Predefined types: only those every class allows (USERDEFINED, NOTDEFINED).
  const pts = commonPredefinedTypes(L.S, ["IFCWALL", "IFCSLAB"]);
  assert.ok(pts.includes("USERDEFINED") && !pts.includes("PARTITIONING") && !pts.includes("FLOOR"));
  assert.deepEqual(parseClassList(" ifcslab, IFCBEAM;IFCBEAM  ifccolumn"), ["IFCSLAB", "IFCBEAM", "IFCCOLUMN"]);
  // Written: the first class (with its subclasses when asked) then the rest, as one enumeration.
  const names = specClassNames(L.S, { cls: "IFCWALL", withSub: true, also: ["IFCSLAB"] });
  assert.deepEqual(names, ["IFCWALL", ...subclasses(L.S, "IFCWALL"), "IFCSLAB"]);
  assert.deepEqual(specClassNames(L.S, { cls: "IFCWALL", withSub: false, also: ["IFCSLAB", "IFCWALL"] }), ["IFCWALL", "IFCSLAB"]);
  const doc = stateToDoc({ title: "t", schema: "IFC4", specs: [{ name: "n", optionality: "required", cls: "IFCSLAB", withSub: false, also: ["IFCBEAM", "IFCCOLUMN"], predefinedType: "", reqs: [{ kind: "property", custom: true, set: "Acme_Common", name: "Code", dataType: "IFCLABEL", cardinality: "required", mode: "any" }] }] }, L);
  const sp = parseIds(buildIds(doc, L.S)).specs[0];
  assert.deepEqual(sp.applicability[0].name.r.enumeration, ["IFCSLAB", "IFCBEAM", "IFCCOLUMN"]);
  assert.equal(sp.requirements[0].propertySet.simple, "Acme_Common");
});

test("an opened IDS naming several classes opens them as editable, and writes back what it asked", () => {
  const enumOf = (cs) => `<xs:restriction base="xs:string">${cs.map((c) => `<xs:enumeration value="${c}"/>`).join("")}</xs:restriction>`;
  const head = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>Several</title></info><specifications>`;
  const xml = head + `
    <specification name="structure" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name>${enumOf(["IFCSLAB", "IFCCOLUMN", "IFCBEAM", "IFCWALL"])}</name></entity></applicability>
      <requirements>
        <property dataType="IFCLABEL"><propertySet><simpleValue>Acme_Common</simpleValue></propertySet><baseName><simpleValue>Phase</simpleValue></baseName></property>
        <property dataType="IFCBOOLEAN"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>IsExternal</simpleValue></baseName></property>
        <attribute><name><simpleValue>PredefinedType</simpleValue></name></attribute>
        <attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="S-[0-9]+"/></xs:restriction></value></attribute>
      </requirements></specification>
    <specification name="user-defined" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name>${enumOf(["IFCSLAB", "IFCBEAM"])}</name><predefinedType><simpleValue>USERDEFINED</simpleValue></predefinedType></entity></applicability>
      <requirements><attribute><name><simpleValue>ObjectType</simpleValue></name></attribute></requirements></specification>
    <specification name="a misspelt class" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name>${enumOf(["IFCSLAB", "IFCBEEM"])}</name></entity></applicability>
      <requirements><attribute><name><simpleValue>Name</simpleValue></name></attribute></requirements></specification>
  </specifications></ids>`;
  const { parsed, imp, back } = reopen(xml);
  const [st, ud, bad] = imp.state.specs;
  assert.deepEqual([st.cls, st.withSub, st.also], ["IFCSLAB", false, ["IFCCOLUMN", "IFCBEAM", "IFCWALL"]]);
  assert.equal(st.fixedApp.length, 0);
  // The wall's own set is kept as written: not every class can carry it.
  assert.deepEqual(st.reqs.map((r) => (r.fixed ? "kept" : r.kind + ":" + r.mode)), ["property:any", "kept", "attribute:any", "attribute:pattern"]);
  assert.deepEqual([ud.cls, ud.also, ud.predefinedType], ["IFCSLAB", ["IFCBEAM"], "USERDEFINED"]);
  // A name the schema lacks keeps the whole class list as written.
  assert.equal(bad.cls, "");
  assert.equal(bad.fixedApp[0].kind, "entity");
  for (let i = 0; i < 3; i++) assert.deepEqual(said(back.specs[i]), said(parsed.specs[i]), parsed.specs[i].name);
});

test("a numeric attribute gets a range from the model, written as xs:double, that passes the model it came from", () => {
  const L = loadFor("IFC4");
  // OverallHeight is an IfcPositiveLengthMeasure: a number, so a range; Elevation too; Name stays text.
  assert.deepEqual(attributeValueKind(L.S, ["IFCDOOR"], "OverallHeight"), { kind: "number", enumVals: null, base: "xs:double" });
  assert.ok(valueChoices(L, ["IFCDOOR"], { kind: "attribute", name: "OverallHeight" }).modes.includes("range"));
  assert.ok(!valueChoices(L, ["IFCDOOR"], { kind: "attribute", name: "OverallHeight" }).modes.includes("pattern"));
  assert.equal(attributeValueKind(L.S, ["IFCBUILDINGSTOREY"], "Elevation").kind, "number");
  assert.equal(attributeValueKind(L.S, ["IFCDOOR"], "Name").kind, "text");
  assert.equal(attributeValueKind(L.S, ["IFCDOOR"], "PredefinedType").enumVals.includes("DOOR"), true);
  // A boolean attribute (IfcDoorType.ParameterTakesPrecedence) is asked true/false.
  assert.equal(attributeValueKind(L.S, ["IFCDOORTYPE"], "ParameterTakesPrecedence").kind, "bool");
  assert.deepEqual(valueChoices(L, ["IFCDOORTYPE"], { kind: "attribute", name: "ParameterTakesPrecedence" }).modes, ["any", "true", "false"]);

  // The sample house writes its door 2100 high in millimetres; attributes are compared as written.
  const text = readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8");
  const inv = modelInventory(new Model(text, R.schemas), R.measureUnits);
  const a = modelAttributes(inv, ["IFCDOOR"]).find((x) => x.name === "OverallHeight");
  const o = modelValueOffer(a, "number", null);
  assert.deepEqual([o.rangeMin, o.rangeMax], ["2100", "2100"]);
  const spec = (min, max) => ({ name: `door ${min}-${max}`, optionality: "required", cls: "IFCDOOR", withSub: false, also: [], predefinedType: "", reqs: [{ kind: "attribute", name: "OverallHeight", cardinality: "required", mode: "range", min, max, oneOf: [] }] });
  const xml = buildIds(stateToDoc({ title: "t", schema: "IFC4", specs: [spec(o.rangeMin, o.rangeMax), spec("2", "2.2")] }, L), L.S);
  assert.match(xml, /<attribute><name><simpleValue>OverallHeight<\/simpleValue><\/name><value><xs:restriction base="xs:double"><xs:minInclusive value="2100"\/><xs:maxInclusive value="2100"\/>/);
  assert.deepEqual(audit(xml).filter((i) => i.level === "error"), []);
  const res = check(xml, text);
  assert.deepEqual(res.specs.map((s) => s.status), ["pass", "fail"], "the model's own range passes; metres fail a millimetre model");

  // Reopened, the range is an editable row again and writes the same XML back.
  const { imp, parsed, back } = reopen(xml);
  assert.deepEqual(imp.state.specs[0].reqs.map((r) => (r.fixed ? "kept" : `${r.kind}:${r.mode}:${r.min}-${r.max}`)), ["attribute:range:2100-2100"]);
  assert.deepEqual(said(back.specs[0]), said(parsed.specs[0]));
  // A range written on xs:string (as some tools do) is kept as written, not rewritten to xs:double.
  const asString = xml.replace('base="xs:double"', 'base="xs:string"');
  assert.equal(reopen(asString).imp.state.specs[0].reqs[0].fixed.kind, "attribute");
});

test("a range bound can be exclusive: written as xs:minExclusive / xs:maxExclusive, checked, counted and reopened", () => {
  const L = loadFor("IFC4");
  const text = readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8");
  // The sample house's one door is 2100 (mm) high.
  const row = (min, max, minEx, maxEx) => ({ kind: "attribute", name: "OverallHeight", cardinality: "required", mode: "range", min, max, minEx, maxEx, oneOf: [] });
  const spec = (r, i) => ({ name: `door ${i}`, optionality: "required", cls: "IFCDOOR", withSub: false, also: [], predefinedType: "", reqs: [r] });
  const rows = [row("2000", "2100", true, false), row("2000", "2100", true, true), row("2100", "", true, false), row("", "2100.5", false, true)];
  const xml = buildIds(stateToDoc({ title: "t", schema: "IFC4", specs: rows.map(spec) }, L), L.S);
  assert.match(xml, /<xs:restriction base="xs:double"><xs:minExclusive value="2000"\/><xs:maxInclusive value="2100"\/><\/xs:restriction>/);
  assert.match(xml, /<xs:minExclusive value="2000"\/><xs:maxExclusive value="2100"\/>/);
  assert.deepEqual(audit(xml).filter((i) => i.level === "error"), []);
  // More than 2000, at most 2100 passes; less than 2100 fails at 2100; more than 2100 fails; less than 2100.5 passes.
  assert.deepEqual(check(xml, text).specs.map((s) => s.status), ["pass", "fail", "fail", "pass"]);
  // The model-match count of an applicability row agrees with the checker.
  const inv = modelInventory(new Model(text, R.schemas), R.measureUnits);
  const a = modelAttributes(inv, ["IFCDOOR"]).find((x) => x.name === "OverallHeight");
  const o = modelValueOffer(a, "number", null);
  assert.deepEqual(rows.map((r) => appMatchCount(a, o, r, "number")), [1, 0, 0, 1]);
  // Reopened, each is an editable row with the same bounds and writes the same IDS back.
  const { imp, parsed, back } = reopen(xml);
  assert.deepEqual(imp.state.specs.map((s) => s.reqs.map((r) => (r.fixed ? "kept" : `${r.minEx ? ">" : ">="}${r.min} ${r.maxEx ? "<" : "<="}${r.max}`))[0]), [">2000 <=2100", ">2000 <2100", ">2100 <=", ">= <2100.5"]);
  for (let i = 0; i < rows.length; i++) assert.deepEqual(said(back.specs[i]), said(parsed.specs[i]));
  // Two bounds on one side (minInclusive and minExclusive) have no single control: kept as written.
  const both = xml.replace('<xs:minExclusive value="2000"/><xs:maxInclusive', '<xs:minInclusive value="1900"/><xs:minExclusive value="2000"/><xs:maxInclusive');
  assert.equal(reopen(both).imp.state.specs[0].reqs[0].fixed.kind, "attribute");
});

test("a property value with no dataType opens as a row that keeps no dataType; typeRow writes the template's", () => {
  const L = loadFor("IFC4");
  const text = readFileSync(new URL("./samples/tiny-house.ifc", import.meta.url), "utf8");
  const prop = (set, name, value, dt = "") => `<property${dt ? ` dataType="${dt}"` : ""}><propertySet><simpleValue>${set}</simpleValue></propertySet><baseName><simpleValue>${name}</simpleValue></baseName><value>${value}</value></property>`;
  const sv = (v) => `<simpleValue>${v}</simpleValue>`;
  const spec = (app, req) => `<specification name="s" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity>${app}</applicability><requirements>${req}</requirements></specification>`;
  const doc = (...specs) => `<?xml version="1.0" encoding="UTF-8"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs.join("")}</specifications></ids>`;
  const xml = doc(
    spec(prop("Pset_WallCommon", "IsExternal", sv("TRUE")), prop("Pset_WallCommon", "FireRating", sv("60 min"))),
    spec("", prop("Acme_Wall", "Zone", `<xs:restriction base="xs:string"><xs:enumeration value="A"/><xs:enumeration value="B"/></xs:restriction>`)),
  );
  const { imp, parsed, back } = reopen(xml);
  const [s0, s1] = imp.state.specs;
  assert.deepEqual([...s0.app, ...s0.reqs, ...s1.reqs].map((r) => (r.fixed ? "kept" : `${r.set}.${r.name} untyped=${r.untyped} ${r.mode}`)),
    ["Pset_WallCommon.IsExternal untyped=true equals", "Pset_WallCommon.FireRating untyped=true equals", "Acme_Wall.Zone untyped=true oneOf"]);
  assert.equal(imp.kept, 0);
  assert.deepEqual(said(back.specs[0]), said(parsed.specs[0]));
  assert.deepEqual(said(back.specs[1]), said(parsed.specs[1]));
  const written = buildIds(stateToDoc(imp.state, L), L.S);
  assert.ok(!/dataType=/.test(written), "no dataType is added on the way back");
  // Untyped rows are offered text modes (no range, no enumeration list).
  assert.deepEqual(valueChoices(L, ["IFCWALL"], s0.app[0]).modes, ["any", "equals", "oneOf", "pattern"]);

  // typeRow: TRUE becomes the boolean true, a label keeps its text.
  const t1 = typeRow(L, s0.app[0]), t2 = typeRow(L, s0.reqs[0]);
  assert.deepEqual([t1.row.untyped, t1.row.mode, t1.dropped], [false, "true", false]);
  assert.deepEqual([t2.row.mode, t2.row.equals, t2.dropped], ["equals", "60 min", false]);
  // An own set takes the model's type only when the page offers it.
  assert.equal(typeRow(L, s1.reqs[0]), null);
  assert.equal(typeRow(L, s1.reqs[0], "IFCWALLTYPEENUM"), null);
  const t3 = typeRow(L, s1.reqs[0], "IFCLABEL");
  assert.deepEqual([t3.row.dataType, t3.row.mode, t3.row.oneOf], ["IFCLABEL", "oneOf", ["A", "B"]]);
  // A list on a number type cannot stay a one-of: any value, flagged.
  const t4 = typeRow(L, s1.reqs[0], "IFCLENGTHMEASURE");
  assert.deepEqual([t4.row.mode, t4.row.oneOf, t4.dropped], ["any", [], true]);

  // Typed, the condition means what its author meant: xs:boolean is written
  // true/false, so the untyped TRUE kept none of the sample's walls (the
  // specification checked nothing and, being required, failed) and the typed
  // true keeps the 2 external ones.
  s0.app[0] = t1.row; s0.reqs[0] = t2.row;
  const typed = buildIds(stateToDoc(imp.state, L), L.S);
  assert.match(typed, /<property dataType="IFCBOOLEAN"><propertySet><simpleValue>Pset_WallCommon<\/simpleValue><\/propertySet><baseName><simpleValue>IsExternal<\/simpleValue><\/baseName><value><simpleValue>true<\/simpleValue>/);
  const a = check(written, text).specs[0], b = check(typed, text).specs[0];
  assert.deepEqual([a.applicable, b.applicable], [0, 2]);
  assert.ok(!auditIds(parseIds(typed), { schemas: { IFC4: R.schemas.IFC4 }, typeMap: R.typeMap, psets: R.psets }).some((i) => i.code === "value-no-datatype" && /IsExternal|FireRating/.test(i.message)));
});

test("untypeRow: a standard property the model writes in another type is checked with no dataType", () => {
  const L = loadFor("IFC2X3");
  const row = { ...blankReq(), set: "Pset_WallCommon", name: "Reference" };
  // Not offered when the model writes the template's type, or for own sets.
  assert.equal(untypeRow(L, row, "IFCIDENTIFIER"), null);
  assert.equal(untypeRow(L, { ...row, custom: true }, "IFCLABEL"), null);
  assert.equal(untypeRow(L, row, null), null);
  const u = untypeRow(L, { ...row, mode: "equals", equals: "W-01" }, "IFCLABEL");
  assert.deepEqual([u.row.untyped, u.row.dataType, u.row.mode, u.row.equals, u.dropped, u.real], [true, "", "equals", "W-01", false, false]);
  // Written with no dataType; presence only audits clean, a value warns.
  const spec = (r) => ({ ...blankSpec(), name: "s", cls: "IFCWALL", withSub: false, reqs: [r] });
  const xml = (r) => buildIds(stateToDoc({ title: "t", schema: "IFC2X3", specs: [spec(r)] }, L), L.S);
  const pres = untypeRow(L, row, "IFCLABEL").row;
  assert.ok(!/dataType=/.test(xml(pres)));
  assert.deepEqual(audit(xml(pres), "IFC2X3").filter((i) => i.level !== "info").map((i) => i.code), []);
  assert.deepEqual(audit(xml(u.row), "IFC2X3").map((i) => i.code).filter((c) => c === "value-no-datatype"), ["value-no-datatype"]);
  // typeRow turns it back into the template's row.
  const back = typeRow(L, u.row);
  assert.deepEqual([back.row.untyped, back.row.mode, back.row.equals, back.dropped], [false, "equals", "W-01", false]);
  // A real number keeps only presence (checkers read the value apart); so does a range.
  const h = { ...blankReq(), set: "Pset_RailingCommon", name: "Height", mode: "range", min: "0.9", max: "1.2" };
  const uh = untypeRow(L, h, "IFCREAL");
  assert.deepEqual([uh.row.mode, uh.row.min, uh.dropped, uh.real], ["any", "", true, true]);
  const n = untypeRow(L, { ...blankReq(), set: "Pset_StairCommon", name: "NumberOfRiser", mode: "equals", equals: "17" }, "IFCINTEGER");
  assert.deepEqual([n.row.mode, n.row.equals, n.dropped], ["equals", "17", false]);
});

// A door with a warranty: Pset_Warranty.WarrantyStartDate (IFCDATE) and
// WarrantyPeriod (IFCDURATION), added to the sample house.
const warrantyHouse = () => readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8").replace(/ENDSEC;\s*END-ISO-10303-21;\s*$/, `#900=IFCPROPERTYSET('1Wty0000000000000000aa',$,'Pset_Warranty',$,(#901,#902));
#901=IFCPROPERTYSINGLEVALUE('WarrantyStartDate',$,IFCDATE('2024-05-01'),$);
#902=IFCPROPERTYSINGLEVALUE('WarrantyPeriod',$,IFCDURATION('P2Y'),$);
#903=IFCRELDEFINESBYPROPERTIES('1Wty0000000000000000ab',$,$,$,(#23),#900);
ENDSEC;
END-ISO-10303-21;
`);

test("a date or duration property takes a range, written on its XSD base, checked, counted and reopened", () => {
  const L = loadFor("IFC4");
  assert.deepEqual(["IFCDATE", "IFCDATETIME", "IFCTIME", "IFCDURATION", "IFCLABEL", null].map(temporalType), ["date", "dateTime", "time", "duration", null, null]);
  const text = warrantyHouse();
  assert.ok(check(`<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications/></ids>`, text));
  const row = (name, min, max, minEx = false, maxEx = false) => ({ ...blankReq(), kind: "property", set: "Pset_Warranty", name, mode: "range", min, max, minEx, maxEx });
  const ch = valueChoices(L, "IFCDOOR", row("WarrantyStartDate", "", ""));
  assert.equal(ch.temporal, "date");
  assert.ok(ch.modes.includes("range") && ch.modes.includes("pattern"), "a date keeps the text modes and gains a range");
  assert.ok(!valueChoices(L, "IFCDOOR", { ...row("", "", ""), set: "Pset_DoorCommon", name: "FireRating" }).modes.includes("range"), "plain text has no range");
  const rows = [
    row("WarrantyStartDate", "2024-01-01", ""),           // on or after 1 Jan 2024: pass
    row("WarrantyStartDate", "2024-05-01", "", true),     // after 1 May 2024: fail (it is 1 May)
    row("WarrantyStartDate", "2024-05-01", "2024-05-01"), // on 1 May exactly: pass
    row("WarrantyPeriod", "P1Y", ""),                      // at least a year: pass
    row("WarrantyPeriod", "", "P2Y", false, true),         // under two years: fail
    row("WarrantyPeriod", "P18M", "P730D"),                // 18 months to 730 days: pass (2 years is 730.485 days, so no)
  ];
  const spec = (r, i) => ({ name: `warranty ${i}`, optionality: "required", cls: "IFCDOOR", withSub: false, also: [], predefinedType: "", reqs: [r] });
  const xml = buildIds(stateToDoc({ title: "t", schema: "IFC4", specs: rows.map(spec) }, L), L.S);
  assert.match(xml, /<property dataType="IFCDATE">.*?<xs:restriction base="xs:date"><xs:minInclusive value="2024-01-01"\/><\/xs:restriction>/s);
  assert.match(xml, /<xs:restriction base="xs:duration"><xs:maxExclusive value="P2Y"\/><\/xs:restriction>/);
  assert.deepEqual(audit(xml).filter((i) => i.level === "error"), []);
  assert.deepEqual(check(xml, text).specs.map((s) => s.status), ["pass", "fail", "pass", "pass", "fail", "fail"]);
  // The applicability count agrees with the checker.
  const inv = modelInventory(new Model(text, R.schemas), R.measureUnits);
  const wset = modelSets(inv, ["IFCDOOR"]).find((x) => x.name === "Pset_Warranty");
  const counts = rows.map((r) => { const mp = wset.props.find((x) => x.name === r.name); return appMatchCount(mp, modelValueOffer(mp, "text", null), r); });
  assert.deepEqual(counts, [1, 0, 1, 1, 0, 0]);
  // A bound in another form (a date against a duration) matches nothing.
  assert.equal(appMatchCount({ count: 1 }, { complete: true, outside: [], values: [["P2Y", 1]] }, row("WarrantyPeriod", "2024-01-01", "")), 0);
  // Reopened, each is an editable range row and writes the same IDS back.
  const { imp, parsed, back } = reopen(xml);
  assert.deepEqual(imp.state.specs.map((s) => (s.reqs[0].fixed ? "kept" : `${s.reqs[0].minEx ? ">" : ">="}${s.reqs[0].min} ${s.reqs[0].maxEx ? "<" : "<="}${s.reqs[0].max}`)),
    [">=2024-01-01 <=", ">2024-05-01 <=", ">=2024-05-01 <=2024-05-01", ">=P1Y <=", ">= <P2Y", ">=P18M <=P730D"]);
  for (let i = 0; i < rows.length; i++) assert.deepEqual(said(back.specs[i]), said(parsed.specs[i]));
  // A date range written on xs:string (not the IDS DataTypes base) is kept as written.
  const onString = xml.replace('<xs:restriction base="xs:date"><xs:minInclusive value="2024-01-01"/>', '<xs:restriction base="xs:string"><xs:minInclusive value="2024-01-01"/>');
  assert.ok(reopen(onString).imp.state.specs[0].reqs[0].fixed);
});

test("a one-of on a date, date-time or duration is written on its XSD base and reopens as a row; one on xs:string stays on xs:string", () => {
  const L = loadFor("IFC4");
  const text = warrantyHouse();
  const prop = (name, oneOf) => ({ ...blankReq(), kind: "property", set: "Pset_Warranty", name, mode: "oneOf", oneOf });
  const spec = (cls, r, i) => ({ name: `one of ${i}`, optionality: "required", cls, withSub: false, also: [], predefinedType: "", reqs: [r] });
  const specs = [
    spec("IFCDOOR", prop("WarrantyStartDate", ["2024-05-01", "2025-01-01"]), 0),  // pass
    spec("IFCDOOR", prop("WarrantyStartDate", ["2024-05-01Z"]), 1),               // compared as written: fail
    spec("IFCDOOR", prop("WarrantyPeriod", ["P2Y"]), 2),                          // pass
    spec("IFCDOOR", prop("WarrantyPeriod", ["P24M"]), 3),                         // as written: fail
    spec("IFCWORKSCHEDULE", { ...blankReq(), kind: "attribute", name: "CreationDate", mode: "oneOf", oneOf: ["2024-05-01T09:00:00"] }, 4),
    spec("IFCDOOR", { ...prop("WarrantyStartDate", ["2024-05-01"]), oneOfBase: "xs:string" }, 5), // an opened file's base: pass
  ];
  const xml = buildIds(stateToDoc({ title: "t", schema: "IFC4", specs }, L), L.S);
  const bases = [...xml.matchAll(/<xs:restriction base="([^"]+)"><xs:enumeration/g)].map((m) => m[1]);
  assert.deepEqual(bases, ["xs:date", "xs:date", "xs:duration", "xs:duration", "xs:dateTime", "xs:string"]);
  assert.deepEqual(audit(xml).filter((i) => i.level === "error"), []);
  // (4: the house has no work schedule, and a required specification needs one.)
  assert.deepEqual(check(xml, text).specs.map((s) => s.status), ["pass", "fail", "pass", "fail", "fail", "pass"]);
  // The same file on xs:string throughout (what the editor wrote before) checks the same.
  const allString = xml.replace(/base="xs:(date|duration|dateTime)"/g, 'base="xs:string"');
  assert.deepEqual(check(allString, text).specs.map((s) => s.status), check(xml, text).specs.map((s) => s.status));
  // Reopened, every one is an editable row, written back byte for byte.
  for (const x of [xml, allString]) {
    const { imp, parsed, back } = reopen(x);
    assert.equal(imp.kept, 0);
    assert.equal(buildIds(stateToDoc(imp.state, L), L.S), x);
    for (let i = 0; i < specs.length; i++) assert.deepEqual(said(back.specs[i]), said(parsed.specs[i]));
  }
  // Dropping oneOfBase (the page's "Write on xs:date") moves an opened row to the DataTypes base.
  const { imp } = reopen(allString);
  assert.equal(imp.state.specs[0].reqs[0].oneOfBase, "xs:string");
  delete imp.state.specs[0].reqs[0].oneOfBase;
  assert.match(buildIds(stateToDoc(imp.state, L), L.S), /<baseName><simpleValue>WarrantyStartDate<\/simpleValue><\/baseName><value><xs:restriction base="xs:date"><xs:enumeration value="2024-05-01"\/>/);
  // A one-of on another base (xs:integer on a date) is still kept as written.
  assert.ok(reopen(xml.replace('<xs:restriction base="xs:date"><xs:enumeration value="2024-05-01"/><xs:enumeration value="2025-01-01"/>', '<xs:restriction base="xs:integer"><xs:enumeration value="2024-05-01"/><xs:enumeration value="2025-01-01"/>')).imp.state.specs[0].reqs[0].fixed);
  // A text property's one-of is unchanged: xs:string, no oneOfBase.
  const fr = buildIds(stateToDoc({ title: "t", schema: "IFC4", specs: [spec("IFCDOOR", { ...blankReq(), kind: "property", set: "Pset_DoorCommon", name: "FireRating", mode: "oneOf", oneOf: ["EI30", "EI60"] }, 0)] }, L), L.S);
  assert.match(fr, /<xs:restriction base="xs:string"><xs:enumeration value="EI30"\/>/);
  assert.equal(reopen(fr).imp.state.specs[0].reqs[0].oneOfBase, undefined);
});

test("a standard property asked for presence with no dataType opens as a row and writes no dataType back", () => {
  const xml = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
    <specification name="windows" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWINDOW</simpleValue></name></entity></applicability>
      <requirements><property><propertySet><simpleValue>Pset_WindowCommon</simpleValue></propertySet><baseName><simpleValue>ThermalTransmittance</simpleValue></baseName></property></requirements></specification></specifications></ids>`;
  const { imp, parsed, back } = reopen(xml);
  const r = imp.state.specs[0].reqs[0];
  assert.ok(!r.fixed);
  assert.deepEqual([r.set, r.name, r.untyped, r.mode], ["Pset_WindowCommon", "ThermalTransmittance", true, "any"]);
  assert.deepEqual(said(back.specs[0]), said(parsed.specs[0]));
  assert.equal(back.specs[0].requirements[0].dataType, null);
  // typeRow still writes the template's dataType when the author asks.
  const L = loadFor("IFC4");
  const typed = typeRow(L, r).row;
  assert.equal(typed.untyped, false);
  assert.match(buildIds(stateToDoc({ ...imp.state, specs: [{ ...imp.state.specs[0], reqs: [typed] }] }, L), L.S), /<property dataType="IFCTHERMALTRANSMITTANCEMEASURE">/);
});

test("datePattern: the pattern passes exactly the strings the checker passes on the range: days that exist, ASCII digits, zones placed by their instant", () => {
  const NS = "http://standards.buildingsmart.org/IDS";
  const rangeValue = (min, max, minEx, maxEx) => parseIds(`<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="v" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:date">${min ? `<xs:${minEx ? "minExclusive" : "minInclusive"} value="${min}"/>` : ""}${max ? `<xs:${maxEx ? "maxExclusive" : "maxInclusive"} value="${max}"/>` : ""}</xs:restriction></value></attribute></requirements></specification></specifications></ids>`).specs[0].requirements[0].value;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const cases = [["2024-01-01", ""], ["2024-05-01", "", true], ["", "2024-05-01", false, true], ["2023-12-31", "2024-12-31"], ["1999-12-31", "2000-01-01", true, true], ["2024-02-28", "2024-03-01", false, true], ["2010-06-15", "2031-01-09"], ["1896-01-01", "1904-12-31"], ["", "2024-02-29"]];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const day = () => iso(Date.parse("1890-01-01") + Math.floor(rnd() * 365 * 160) * 86400000);
  for (let k = 0; k < 60; k++) { let a = day(), b = day(); if (a > b) [a, b] = [b, a]; cases.push([rnd() < 0.15 ? "" : a, rnd() < 0.15 ? "" : b, rnd() < 0.3, rnd() < 0.3]); }
  const zones = ["", "Z", "+00:00", "-00:00", "+01:00", "-05:00", "+14:00", "-12:00", "+23:59", "+24:00"];
  let compared = 0;
  for (const c of cases) {
    const p = datePattern(...c);
    const v = rangeValue(...c);
    if (p === null) { assert.ok(!c[0] && !c[1] || (c[0] && c[1]), JSON.stringify(c)); continue; }
    const re = new RegExp(`^(?:${p})$`);
    const near = [c[0], c[1]].filter(Boolean).flatMap((d) => [-2, -1, 0, 1, 2].map((k) => iso(Date.parse(d) + k * 86400000)));
    for (let t = Date.parse("1880-01-01"); t < Date.parse("2060-01-01"); t += 86400000 * 37) near.push(iso(t));
    for (const d of near) for (const z of zones) { const s = d + z; assert.equal(re.test(s), v.match(s, "string"), `${JSON.stringify(c)} ${s}`); compared++; }
    for (const s of ["2024-02-30", "2023-02-29", "1900-02-29", "2000-02-29", "2024-04-31", "٢٠٢٤-03-01", " 2024-03-01 "]) assert.equal(re.test(s), v.match(s, "string"), `${JSON.stringify(c)} ${JSON.stringify(s)}`);
    assert.ok(!/\\d/.test(p), "ASCII digits only");
  }
  assert.ok(compared > 50000, String(compared));
  assert.equal(datePattern("2024-01-01T00:00:00", ""), null);
  assert.equal(datePattern("", ""), null);
  assert.equal(datePattern("2024-04-31", ""), null);
  assert.equal(datePattern("2024-05-02", "2024-05-01"), null);
  assert.equal(datePattern("2024-05-01", "2024-05-01"), "[ \\t\\r\\n]*(2024-05-01(Z|[+\\-]00:00)?)[ \\t\\r\\n]*");
  // The pattern audits clean on an IFCDATE property.
  const L = loadFor("IFC4");
  const xml = buildIds(stateToDoc({ title: "t", schema: "IFC4", specs: [{ name: "w", optionality: "required", cls: "IFCDOOR", withSub: false, also: [], predefinedType: "", reqs: [{ ...blankReq(), set: "Pset_Warranty", name: "WarrantyStartDate", mode: "pattern", pattern: datePattern("2024-01-01", "2024-12-31") }] }] }, L), L.S);
  assert.deepEqual(audit(xml).filter((i) => i.level === "error"), []);
  assert.equal(check(xml, warrantyHouse()).specs[0].status, "pass");
});

test("modelSubclassesLeftOut: the model's subclass objects a specification would not check", () => {
  const S = R.schemas.IFC2X3;
  const inv = [{ cls: "IFCWALL", count: 4 }, { cls: "IFCWALLSTANDARDCASE", count: 101 }, { cls: "IFCSLAB", count: 9 }];
  const spec = { ...blankSpec(), cls: "IFCWALL", withSub: false };
  assert.deepEqual(modelSubclassesLeftOut(S, spec, inv), [{ cls: "IFCWALLSTANDARDCASE", count: 101, via: "IFCWALL" }]);
  // With its subclasses, or the class listed under "also", nothing is left out.
  assert.deepEqual(modelSubclassesLeftOut(S, { ...spec, withSub: true }, inv), []);
  assert.deepEqual(modelSubclassesLeftOut(S, { ...spec, also: ["IFCWALLSTANDARDCASE"] }, inv), []);
  // An abstract parent checks nothing itself: every concrete class below it is offered.
  const be = modelSubclassesLeftOut(S, { ...spec, cls: "IFCBUILDINGELEMENT" }, inv);
  assert.deepEqual(be.map((x) => x.cls), ["IFCWALLSTANDARDCASE", "IFCSLAB", "IFCWALL"]);
  assert.deepEqual(modelSubclassesLeftOut(S, { ...spec, cls: "IFCSLAB" }, inv), []);
});

test("Add a specification from the model's class list names the model's own subclasses of the class", () => {
  // Schultz Residence counts (eval/corpus-crosscheck-2026-11-17.md): 4 IfcWall, 101 IfcWallStandardCase.
  const S = R.schemas.IFC2X3;
  const inv = [{ cls: "IFCWALL", count: 4 }, { cls: "IFCWALLSTANDARDCASE", count: 101 }, { cls: "IFCSLAB", count: 9 }];
  const w = modelSpec(S, "IFCWALL", inv);
  assert.equal(w.name, "Wall requirements");
  assert.deepEqual(w.also, ["IFCWALLSTANDARDCASE"]);
  assert.equal(w.withSub, false);
  assert.deepEqual(modelSubclassesLeftOut(S, w, inv), [], "no warning on the new specification");
  assert.deepEqual(specClassNames(S, w), ["IFCWALL", "IFCWALLSTANDARDCASE"]);
  // a class with no subclass objects in the model gets none, and the schema's others are not added
  assert.deepEqual(modelSpec(S, "IFCSLAB", inv).also, []);
  assert.deepEqual(modelSpec(S, "IFCWALL", [{ cls: "IFCWALL", count: 4 }]).also, []);
});

test("a specification with no class: its attribute and property facets open as rows and write back the same", () => {
  // As buildingSMART's IDS-Audit-tool RichFileAttribute_Ifc4.ids writes it:
  // applicability is an attribute alone, so any class with Version is checked.
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<ids:ids xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:ids="http://standards.buildingsmart.org/IDS">
<ids:info><ids:title>No class</ids:title></ids:info>
<ids:specifications>
<ids:specification ifcVersion="IFC4" name="Version exhibit">
<ids:applicability minOccurs="0" maxOccurs="unbounded"><ids:attribute><ids:name><ids:simpleValue>Version</ids:simpleValue></ids:name></ids:attribute></ids:applicability>
<ids:requirements><ids:attribute cardinality="required"><ids:name><ids:simpleValue>Version</ids:simpleValue></ids:name><ids:value><xs:restriction base="xs:string"><xs:enumeration value="innovation"/><xs:enumeration value="collaboration"/></xs:restriction></ids:value></ids:attribute></ids:requirements>
</ids:specification>
<ids:specification ifcVersion="IFC4" name="Anything external has a fire rating">
<ids:applicability minOccurs="1" maxOccurs="unbounded"><ids:property dataType="IFCBOOLEAN"><ids:propertySet><ids:simpleValue>Pset_WallCommon</ids:simpleValue></ids:propertySet><ids:baseName><ids:simpleValue>IsExternal</ids:simpleValue></ids:baseName><ids:value><ids:simpleValue>true</ids:simpleValue></ids:value></ids:property></ids:applicability>
<ids:requirements><ids:property dataType="IFCLABEL" cardinality="required"><ids:propertySet><ids:simpleValue>Pset_WallCommon</ids:simpleValue></ids:propertySet><ids:baseName><ids:simpleValue>FireRating</ids:simpleValue></ids:baseName></ids:property>
<ids:attribute cardinality="required"><ids:name><ids:simpleValue>OverallHeight</ids:simpleValue></ids:name><ids:value><xs:restriction base="xs:double"><xs:minInclusive value="2"/></xs:restriction></ids:value></ids:attribute></ids:requirements>
</ids:specification>
</ids:specifications></ids:ids>`;
  const parsed = parseIds(xml);
  const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: null });
  const { state, kept, rows } = importIds(parsed, loadFor);
  assert.equal(kept, 0);
  assert.equal(rows, 5);
  assert.equal(state.specs[0].cls, "");
  assert.equal(state.specs[0].reqs[0].mode, "oneOf");
  assert.equal(state.specs[1].reqs[1].mode, "range");
  const back = parseIds(buildIds(stateToDoc(state, loadFor("IFC4")), S4));
  const desc = (p) => p.specs.map((s) => [...s.applicability, ...s.requirements].map((f) => `${f.kind} ${f.cardinality} ${f.dataType || ""} ${f.describe()}`).sort()); // ids.xsd's facet order
  assert.deepEqual(desc(back), desc(parsed));
});

test("with no class, every standard set and every attribute some class has is offered, typed only when every class types it the same", () => {
  const L = { S: S4, psets: R.psets.IFC4 };
  const sets = commonSets(L, []);
  assert.ok(sets.includes("Pset_WallCommon") && sets.includes("Pset_DoorCommon") && sets.includes("Qto_WallBaseQuantities"));
  const attrs = commonAttributes(S4, []);
  assert.deepEqual(attrs.slice(0, 4), ["Name", "Description", "ObjectType", "Tag"]);
  assert.ok(attrs.includes("Version") && attrs.includes("OverallHeight"));
  assert.ok(!attrs.includes("FontFamily"), "a list on IFCTEXTSTYLEFONTMODEL: not comparable as one value");
  // OverallHeight is IFCPOSITIVELENGTHMEASURE wherever it occurs: a number.
  assert.equal(attributeValueKind(S4, [], "OverallHeight").kind, "number");
  assert.equal(attributeValueKind(S4, [], "OverallHeight").base, "xs:double");
  // Name is IFCSIUNITNAME on IFCSIUNIT, a label elsewhere: free text.
  assert.deepEqual(attributeValueKind(S4, [], "Name"), { kind: "text", enumVals: null, base: "xs:string" });
  // A class still narrows the lists as before.
  assert.ok(commonAttributes(S4, ["IFCWALL"]).length < attrs.length);
  assert.ok(!commonSets(L, ["IFCWALL"]).includes("Pset_DoorCommon"));
});

test("with no class, a number attribute derived on a subclass, or restricted on xs:integer where it is a NUMBER, opens as a row", () => {
  // As IDS-Audit-tool's RichFileAttribute files write them.
  const spec = (v, name, body) => `<ids:specification ifcVersion="${v}" name="${name}"><ids:applicability minOccurs="0" maxOccurs="unbounded"><ids:attribute><ids:name><ids:simpleValue>${name}</ids:simpleValue></ids:name></ids:attribute></ids:applicability><ids:requirements><ids:attribute cardinality="required"><ids:name><ids:simpleValue>${name}</ids:simpleValue></ids:name><ids:value>${body}</ids:value></ids:attribute></ids:requirements></ids:specification>`;
  const doc = (v, ...specs) => `<?xml version="1.0" encoding="utf-8"?><ids:ids xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:ids="http://standards.buildingsmart.org/IDS"><ids:info><ids:title>t</ids:title></ids:info><ids:specifications>${specs.join("")}</ids:specifications></ids:ids>`;
  const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
  // CoordinateSpaceDimension is IFCDIMENSIONCOUNT, stored on the context and
  // derived (*) on its subcontext: a number, with the subcontext named.
  const k = attributeValueKind(S4, [], "CoordinateSpaceDimension");
  assert.equal(k.kind, "number");
  assert.equal(k.base, "xs:integer");
  assert.deepEqual(k.derivedOn, ["IFCGEOMETRICREPRESENTATIONSUBCONTEXT"]);
  assert.equal(attributeValueKind(S4, [], "Precision").base, "xs:double");
  // A list on every class (TexCoordsList) is still not offered.
  assert.ok(!commonAttributes(S4, []).includes("TexCoordsList"));
  const xml = doc("IFC4",
    spec("IFC4", "CoordinateSpaceDimension", `<xs:restriction base="xs:integer"><xs:enumeration value="16"/></xs:restriction>`),
    spec("IFC4", "Precision", `<xs:restriction base="xs:double"><xs:enumeration value="17.086642968015973"/></xs:restriction>`),
    spec("IFC4", "CountValue", `<xs:restriction base="xs:integer"><xs:enumeration value="32"/></xs:restriction>`),
    spec("IFC4", "CountValue", `<xs:restriction base="xs:integer"><xs:minInclusive value="35"/></xs:restriction>`));
  const parsed = parseIds(xml);
  const { state, kept, rows } = importIds(parsed, loadFor);
  assert.equal(kept, 0);
  assert.equal(rows, 8);
  // CountValue is IFCCOUNTMEASURE, a NUMBER in IFC4: the row keeps xs:integer
  // and asks for whole numbers.
  const cv = state.specs[2].reqs[0];
  assert.equal(cv.numBase, "xs:integer");
  assert.equal(valueChoices(loadFor("IFC4"), [], cv).integer, true);
  assert.equal(state.specs[3].reqs[0].mode, "range");
  const backXml = buildIds(stateToDoc(state, loadFor("IFC4")), S4);
  const desc = (p) => p.specs.map((s) => [...s.applicability, ...s.requirements].map((f) => `${f.kind} ${f.cardinality} ${f.describe()} ${f.value && f.value.r ? f.value.r.base : ""}`).sort());
  assert.deepEqual(desc(parseIds(backXml)), desc(parsed));
  // A new CountValue row (no file base) is written on the type's own xs:double.
  const L = loadFor("IFC4");
  const fresh = buildIds(stateToDoc({ ...state, specs: [{ ...blankSpec(), name: "n", reqs: [{ ...blankReq(), kind: "attribute", name: "CountValue", mode: "oneOf", oneOf: ["3"] }] }] }, L), S4);
  assert.match(fresh, /<xs:restriction base="xs:double"><xs:enumeration value="3"\/>/);
  // IFC2X3's BarCount the same way.
  const x3 = doc("IFC2X3", spec("IFC2X3", "BarCount", `<xs:restriction base="xs:integer"><xs:enumeration value="27"/></xs:restriction>`));
  const i3 = importIds(parseIds(x3), loadFor);
  assert.equal(i3.kept, 0);
  assert.equal(i3.state.specs[0].reqs[0].numBase, "xs:integer");
});

test("with no class, a value on an attribute that is a list on every class is an audit warning, as on IDS-Audit-tool's files", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?><ids:ids xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:ids="http://standards.buildingsmart.org/IDS"><ids:info><ids:title>t</ids:title></ids:info><ids:specifications>
<ids:specification ifcVersion="IFC4" name="tex"><ids:applicability minOccurs="0" maxOccurs="unbounded"><ids:attribute><ids:name><ids:simpleValue>TexCoordsList</ids:simpleValue></ids:name></ids:attribute></ids:applicability><ids:requirements><ids:attribute cardinality="required"><ids:name><ids:simpleValue>TexCoordsList</ids:simpleValue></ids:name><ids:value><xs:restriction base="xs:double"><xs:enumeration value="35.9"/></xs:restriction></ids:value></ids:attribute></ids:requirements></ids:specification>
<ids:specification ifcVersion="IFC4" name="app"><ids:applicability minOccurs="0" maxOccurs="unbounded"><ids:attribute><ids:name><ids:simpleValue>DayComponent</ids:simpleValue></ids:name><ids:value><ids:simpleValue>3</ids:simpleValue></ids:value></ids:attribute></ids:applicability><ids:requirements><ids:attribute cardinality="required"><ids:name><ids:simpleValue>Name</ids:simpleValue></ids:name></ids:attribute></ids:requirements></ids:specification>
<ids:specification ifcVersion="IFC4" name="dim"><ids:applicability minOccurs="0" maxOccurs="unbounded"><ids:attribute><ids:name><ids:simpleValue>CoordinateSpaceDimension</ids:simpleValue></ids:name></ids:attribute></ids:applicability><ids:requirements><ids:attribute cardinality="required"><ids:name><ids:simpleValue>CoordinateSpaceDimension</ids:simpleValue></ids:name><ids:value><ids:simpleValue>3</ids:simpleValue></ids:value></ids:attribute></ids:requirements></ids:specification>
</ids:specifications></ids:ids>`;
  const is = audit(xml);
  assert.equal(is.filter((x) => x.level === "error").length, 0, "the IDS-Audit-tool accepts these files");
  const tex = is.find((x) => x.specName === "tex");
  assert.equal(tex.level, "warning");
  assert.match(tex.message, /TexCoordsList is a list on every class that has it \(IfcTextureVertexList\).*every object this checks fails it/);
  assert.match(is.find((x) => x.specName === "app").message, /DayComponent is a list .*this applicability selects nothing/);
  assert.ok(!is.some((x) => x.specName === "dim"), "a number where it is stored: no warning");
});

test("a one-of on numbers: offered, checked with IDS's tolerance on reals and exactly on integers, and reopened as a row", () => {
  const L = loadFor("IFC4");
  const door = valueChoices(L, ["IFCDOOR"], { kind: "attribute", name: "OverallHeight" });
  assert.ok(door.modes.includes("oneOf"));
  assert.equal(door.integer, false);
  const stair = valueChoices(L, ["IFCSTAIRFLIGHT"], { kind: "attribute", name: "NumberOfRisers" });
  assert.ok(stair.modes.includes("oneOf"));
  assert.equal(stair.integer, true);
  assert.ok(valueChoices(L, ["IFCWALL"], { ...blankReq(), kind: "property", set: "Pset_WallCommon", name: "ThermalTransmittance" }).modes.includes("oneOf"));
  // Literals as IDS reads them; the audit's rules.
  assert.equal(numberValueProblem("42.3"), null);
  assert.equal(numberValueProblem("1e-3"), null);
  assert.match(numberValueProblem("2,1"), /not a number/);
  assert.match(numberValueProblem("NaN"), /not a number/);
  assert.match(numberValueProblem("3.0", true), /digits only \(3\)/);
  assert.match(numberValueProblem("2.5", true), /not an integer/);
  assert.equal(numberValueProblem("-12", true), null);

  // The sample house's door is 2100 high (millimetres, attributes as written).
  const text = readFileSync(new URL("samples/tiny-house.ifc", import.meta.url), "utf8");
  const inv = modelInventory(new Model(text, R.schemas), R.measureUnits);
  const o = modelValueOffer(modelAttributes(inv, ["IFCDOOR"]).find((x) => x.name === "OverallHeight"), "number", null);
  assert.deepEqual(o.oneOf, ["2100"]);
  const row = (name, oneOf) => ({ ...blankReq(), kind: "attribute", name, mode: "oneOf", oneOf });
  const spec = (cls, r, i) => ({ name: `one of ${i}`, optionality: "optional", cls, withSub: false, also: [], predefinedType: "", reqs: [r] });
  const specs = [
    spec("IFCDOOR", row("OverallHeight", ["2100", "2400"]), 0),  // pass
    spec("IFCDOOR", row("OverallHeight", ["2100.001"]), 1),      // within a millionth of 2100 (2100 x 1e-6 + 1e-6): pass
    spec("IFCDOOR", row("OverallHeight", ["2.1", "2.4"]), 2),    // metres on a millimetre model: fail
    spec("IFCSTAIRFLIGHT", row("NumberOfRisers", ["12", "14"]), 3),
  ];
  const xml = buildIds(stateToDoc({ title: "t", schema: "IFC4", specs }, L), L.S);
  assert.match(xml, /<name><simpleValue>OverallHeight<\/simpleValue><\/name><value><xs:restriction base="xs:double"><xs:enumeration value="2100"\/><xs:enumeration value="2400"\/>/);
  assert.match(xml, /<name><simpleValue>NumberOfRisers<\/simpleValue><\/name><value><xs:restriction base="xs:integer"><xs:enumeration value="12"\/>/);
  assert.deepEqual(audit(xml).filter((i) => i.level === "error"), []);
  assert.deepEqual(check(xml, text).specs.map((s) => s.status), ["pass", "pass", "fail", "pass"]);
  // Reopened: every one an editable row, written back byte for byte.
  const { imp, parsed, back } = reopen(xml);
  assert.equal(imp.kept, 0);
  assert.equal(buildIds(stateToDoc(imp.state, L), L.S), xml);
  for (let i = 0; i < specs.length; i++) assert.deepEqual(said(back.specs[i]), said(parsed.specs[i]));
  // A list the row could not write (a comma, an integer with a point) is kept as written.
  assert.ok(reopen(xml.replace('<xs:enumeration value="2400"/>', '<xs:enumeration value="2,4"/>')).imp.state.specs[0].reqs[0].fixed);
  assert.ok(reopen(xml.replace('<xs:enumeration value="12"/>', '<xs:enumeration value="12.0"/>')).imp.state.specs[3].reqs[0].fixed);

  // A short list of a model's numbers is offered as a one-of, sorted by value; a long one is not.
  // It names each value as the model holds it (`exact`), not at the 12 digits
  // the tally shows: IfcTester 0.9.0 compares a listed number exactly.
  const mp = (vals, exact = [...vals].sort((x, y) => x - y)) => ({ count: vals.length, values: vals.map((v) => [v, 1]), distinct: vals.length, more: false, min: Math.min(...vals.map(Number)), max: Math.max(...vals.map(Number)), exact });
  assert.deepEqual(modelValueOffer(mp(["10", "9.5", "100"]), "number").oneOf, ["9.5", "10", "100"]);
  assert.deepEqual(modelValueOffer(mp(["2.8", "2.80000000012"], ["2.799999999886494", "2.8", "2.8000000001193297"]), "number").oneOf, ["2.799999999886494", "2.8", "2.8000000001193297"]);
  assert.equal(modelValueOffer(mp(["1", "2"], null), "number").oneOf, null, "no exact list, no offer");
  assert.equal(modelValueOffer(mp(Array.from({ length: NUMBER_ONEOF_MAX + 1 }, (_, i) => String(i))), "number").oneOf, null);

  // typeRow: a list of numbers on a property with no dataType keeps its values when typed.
  const untyped = { ...blankReq(), kind: "property", set: "Pset_WallCommon", name: "ThermalTransmittance", untyped: true, mode: "oneOf", oneOf: ["0.25", "0.3"] };
  assert.deepEqual([typeRow(L, untyped).row.mode, typeRow(L, untyped).row.oneOf, typeRow(L, untyped).dropped], ["oneOf", ["0.25", "0.3"], false]);
  assert.equal(typeRow(L, { ...untyped, oneOf: ["0,25"] }).dropped, true);
});

test("an IDS whose specifications all name IFC2X3 and IFC4 opens in the schema that edits most, and is audited in both", () => {
  const spec = (v, name, set, prop, dt) => `<ids:specification ifcVersion="${v}" name="${name}">
<ids:applicability minOccurs="1" maxOccurs="unbounded"><ids:entity><ids:name><ids:simpleValue>IFCSPACE</ids:simpleValue></ids:name></ids:entity></ids:applicability>
<ids:requirements><ids:property dataType="${dt}" cardinality="required"><ids:propertySet><ids:simpleValue>${set}</ids:simpleValue></ids:propertySet><ids:baseName><ids:simpleValue>${prop}</ids:simpleValue></ids:baseName></ids:property></ids:requirements>
</ids:specification>`;
  const doc = (...specs) => `<?xml version="1.0" encoding="UTF-8"?>
<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><ids:info><ids:title>NL-style</ids:title></ids:info><ids:specifications>
${specs.join("\n")}
</ids:specifications></ids:ids>`;
  const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
  // Qto_SpaceBaseQuantities is an IFC4 set IFC2X3's templates lack (as in the
  // Dutch NL-BIM Basis ILS files, written for "IFC2X3 IFC4").
  const xml = doc(spec("IFC2X3 IFC4", "Spaces have a net floor area", "Qto_SpaceBaseQuantities", "NetFloorArea", "IFCAREAMEASURE"),
    spec("IFC2X3 IFC4", "Spaces have a name", "Pset_SpaceCommon", "Reference", "IFCIDENTIFIER"));
  const parsed = parseIds(xml);
  assert.deepEqual(schemaIdsOf(["IFC2X3", "IFC4X3_ADD2"]), ["IFC2X3", "IFC4X3"]);
  assert.equal(idsSchema(parsed), "IFC2X3", "the first named, as before");
  assert.deepEqual(idsSchemaChoices(parsed), ["IFC2X3", "IFC4"]);
  const old = importIdsAs(parsed, loadFor, "IFC2X3");
  assert.equal(old.state.specs[0].reqs[0].fixed !== undefined, true, "IFC2X3 holds the IFC4 quantity set as written");
  const imp = importIds(parsed, loadFor);
  assert.equal(imp.state.schema, "IFC4");
  assert.ok(imp.rows > old.rows);
  assert.deepEqual(Object.keys(imp.schemaRows).sort(), ["IFC2X3", "IFC4"]);
  assert.equal(imp.state.specs[0].reqs[0].set, "Qto_SpaceBaseQuantities");
  assert.deepEqual(imp.state.specs[0].ifcVersion, ["IFC2X3", "IFC4"], "each specification keeps its versions");
  // Written back, it asks the same and names the same versions.
  const L = loadFor("IFC4");
  const back = parseIds(buildIds(stateToDoc(imp.state, L), L.S));
  assert.deepEqual(back.specs.map((s) => s.ifcVersion), parsed.specs.map((s) => s.ifcVersion));
  // The page audits in every schema a specification names, in the CLI's order,
  // so the IFC4 set is no error; IFC2X3 alone calls it a custom Pset.
  assert.deepEqual(auditSchemaIds(imp.state), ["IFC2X3", "IFC4"]);
  const errs = (ids) => auditIds(back, { schemas: Object.fromEntries(ids.map((id) => [id, R.schemas[id]])), typeMap: R.typeMap, psets: R.psets }).filter((x) => x.level === "error").map((x) => x.code);
  assert.deepEqual(errs(["IFC2X3"]), ["pset-custom"]);
  assert.deepEqual(errs(auditSchemaIds(imp.state)), []);
  assert.deepEqual(errs(auditSchemaIds(imp.state)), auditIds(parsed, R).filter((x) => x.level === "error").map((x) => x.code), "the CLI's audit");
  // Specifications with no schema in common keep the usual pick.
  const mixed = parseIds(doc(spec("IFC2X3", "a", "Pset_SpaceCommon", "Reference", "IFCIDENTIFIER"), spec("IFC4", "b", "Pset_SpaceCommon", "Reference", "IFCIDENTIFIER"), spec("IFC4", "c", "Pset_SpaceCommon", "Reference", "IFCIDENTIFIER")));
  assert.deepEqual(idsSchemaChoices(mixed), []);
  assert.equal(importIds(mixed, loadFor).state.schema, "IFC4");
  assert.equal(importIds(mixed, loadFor).schemaRows, undefined);
  assert.deepEqual(auditSchemaIds(importIds(mixed, loadFor).state), ["IFC2X3", "IFC4"]);
});

test("a standard property in a dataType the template refuses opens as a row keeping it, and Use the template's type fixes the audit error", () => {
  const prop = (set, name, dt, value = "") => `<property dataType="${dt}"><propertySet><simpleValue>${set}</simpleValue></propertySet><baseName><simpleValue>${name}</simpleValue></baseName>${value}</property>`;
  // As the public files write them: DfE's SerialNumber as IFCTEXT with a
  // pattern (template IFCIDENTIFIER), Spain's GrossFloorArea as IFCREAL.
  const xml = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
    <specification name="assets" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCPUMP</simpleValue></name></entity></applicability>
      <requirements>${prop("Pset_ManufacturerOccurrence", "SerialNumber", "IFCTEXT", `<value><xs:restriction base="xs:string"><xs:pattern value="[A-Z0-9]+"/></xs:restriction></value>`)}</requirements></specification>
    <specification name="spaces" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCSPACE</simpleValue></name></entity></applicability>
      <requirements>${prop("Qto_SpaceBaseQuantities", "GrossFloorArea", "IFCREAL", `<value><xs:restriction base="xs:double"><xs:minInclusive value="2"/></xs:restriction></value>`)}</requirements></specification></specifications></ids>`;
  const { imp, parsed, back } = reopen(xml);
  const L = loadFor("IFC4");
  const [sn, gfa] = imp.state.specs.map((s) => s.reqs[0]);
  assert.ok(!sn.fixed && !gfa.fixed, "both open as rows");
  assert.deepEqual([sn.fileType, sn.mode, sn.pattern], ["IFCTEXT", "pattern", "[A-Z0-9]+"]);
  assert.deepEqual([gfa.fileType, gfa.mode, gfa.min], ["IFCREAL", "range", "2"]);
  assert.deepEqual(back.specs.map(said), parsed.specs.map(said), "written back as the file had it");
  assert.ok(fileTypeRefused(L, sn) && fileTypeRefused(L, gfa));
  const codes = (st) => auditIds(parseIds(buildIds(stateToDoc(st, L), L.S)), R).filter((x) => x.code === "pset-datatype").length;
  assert.equal(codes(imp.state), 2);
  // The row offers the file's type's values: a range on IFCREAL, a pattern on IFCTEXT.
  assert.ok(valueChoices(L, "IFCSPACE", gfa).modes.includes("range"));
  assert.ok(valueChoices(L, "IFCPUMP", sn).modes.includes("pattern"));
  // The fix: the template's type, the value carried over, no audit error.
  const t1 = templateTypeRow(L, sn), t2 = templateTypeRow(L, gfa);
  assert.deepEqual([t1.dataType, t1.dropped, t1.row.mode, t1.row.fileType], ["IFCIDENTIFIER", false, "pattern", undefined]);
  assert.deepEqual([t2.dataType, t2.dropped, t2.row.mode, t2.row.min], ["IFCAREAMEASURE", false, "range", "2"]);
  const fixed = { ...imp.state, specs: [{ ...imp.state.specs[0], reqs: [t1.row] }, { ...imp.state.specs[1], reqs: [t2.row] }] };
  assert.equal(codes(fixed), 0);
  const out = buildIds(stateToDoc(fixed, L), L.S);
  assert.match(out, /<property dataType="IFCIDENTIFIER">/);
  assert.match(out, /<property dataType="IFCAREAMEASURE">/);
});

test("Use the template's type drops a value the template's type cannot hold, and keeps true/false on a boolean", () => {
  const L = loadFor("IFC4");
  const row = (o) => ({ ...blankReq(), set: "Pset_SpaceCommon", name: "IsExternal", fileType: "IFCLABEL", ...o });
  // OpenAEC writes IsExternal as IFCLABEL.
  assert.equal(fileTypeOf(L, "Pset_SpaceCommon", "IsExternal", "IFCLABEL"), "IFCLABEL");
  assert.equal(fileTypeOf(L, "Pset_SpaceCommon", "IsExternal", "IFCBOOLEAN"), null, "the template's own type is no file type");
  assert.equal(fileTypeOf(L, "Pset_SpaceCommon", "IsExternal", "IFCNOSUCHTYPE"), null);
  const t = templateTypeRow(L, row({ mode: "equals", equals: "TRUE" }));
  assert.deepEqual([t.dataType, t.row.mode, t.dropped], ["IFCBOOLEAN", "true", false]);
  const d = templateTypeRow(L, row({ mode: "equals", equals: "outside" }));
  assert.deepEqual([d.row.mode, d.row.equals, d.dropped], ["any", "", true]);
  // A text value moved to a number type is dropped; a number moved to another number type stays.
  const area = { ...blankReq(), set: "Qto_SpaceBaseQuantities", name: "GrossFloorArea" };
  assert.equal(templateTypeRow(L, { ...area, fileType: "IFCLABEL", mode: "equals", equals: "big" }).dropped, true);
  assert.equal(templateTypeRow(L, { ...area, fileType: "IFCREAL", mode: "oneOf", oneOf: ["10", "12.5"] }).dropped, false);
  // Not a file-type row: no fix.
  assert.equal(templateTypeRow(L, area), null);
  // Changing the row to no dataType drops the file type.
  const u = untypeRow(L, { ...area, fileType: "IFCREAL" }, "IFCREAL");
  assert.ok(u && u.row.untyped && u.row.fileType === undefined);
});

test("a property one slip from the template's name gets the audit's 'did you mean', and Use Length fixes it", () => {
  const prop = (set, name, dt, value = "") => `<property${dt ? ` dataType="${dt}"` : ""}><propertySet><simpleValue>${set}</simpleValue></propertySet><baseName><simpleValue>${name}</simpleValue></baseName>${value}</property>`;
  const spec = (cls, req) => `<specification name="${cls}" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>${cls}</simpleValue></name></entity></applicability><requirements>${req}</requirements></specification>`;
  // As the public files write them: Portugal's Lenght with a dataType (kept on
  // open), Rotterdam's AkousticRating with none (an editable row), a set typo,
  // and words that are no slip (Pset_DoorCommon Mark).
  const xml = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
    ${spec("IFCDUCTSEGMENT", prop("Qto_DuctSegmentBaseQuantities", "Lenght", "IFCLENGTHMEASURE", `<value><xs:restriction base="xs:double"><xs:minInclusive value="0.5"/></xs:restriction></value>`))}
    ${spec("IFCWALL", prop("Pset_WallCommon", "AkousticRating"))}
    ${spec("IFCWALL", prop("Pset_WallComon", "FireRating", "IFCLABEL"))}
    ${spec("IFCDOOR", prop("Pset_DoorCommon", "Mark", "IFCLABEL"))}
    ${spec("IFCRAILING", prop("Qto_RailingBaseQuantities", "Lenght", "IFCPOSITIVELENGTHMEASURE"))}</specifications></ids>`;
  const L = loadFor("IFC4");
  const imp = importIds(parseIds(xml), loadFor);
  const [len, ak, setTypo, mark, rail] = imp.state.specs.map((s) => s.reqs[0]);
  const classes = (i) => specBases(imp.state.specs[i]);
  assert.ok(len.fixed && !ak.fixed && setTypo.fixed && mark.fixed);
  assert.deepEqual(renameSuggestion(L, classes(0), len), { set: "Qto_DuctSegmentBaseQuantities", name: "Length", fromSet: "Qto_DuctSegmentBaseQuantities", fromName: "Lenght", row: len.rename.row, fixed: len.rename.fixed });
  assert.deepEqual(renameSuggestion(L, classes(1), ak), { set: "Pset_WallCommon", name: "AcousticRating", fromSet: "Pset_WallCommon", fromName: "AkousticRating" });
  assert.equal(renameSuggestion(L, classes(2), setTypo).set, "Pset_WallCommon");
  assert.equal(renameSuggestion(L, classes(3), mark), null, "Mark is no slip");
  // The fixes: Length opens as an editable range row, AcousticRating keeps no dataType.
  const r0 = renameRow(L, classes(0), len), r1 = renameRow(L, classes(1), ak), r2 = renameRow(L, classes(2), setTypo);
  assert.deepEqual([r0.fixed, r0.name, r0.mode, r0.min], [undefined, "Length", "range", "0.5"]);
  assert.deepEqual([r1.name, r1.untyped], ["AcousticRating", true]);
  assert.deepEqual([r2.set, r2.name, r2.fixed], ["Pset_WallCommon", "FireRating", undefined]);
  // Fixed, the name faults are gone; the railing's file type now reads as its
  // own fault (pset-datatype), which Use the template's type fixes.
  const r4 = renameRow(L, classes(4), rail);
  assert.deepEqual([r4.name, r4.fileType, fileTypeRefused(L, r4)], ["Length", "IFCPOSITIVELENGTHMEASURE", true]);
  const st = { ...imp.state, specs: imp.state.specs.map((s, i) => ({ ...s, reqs: [[r0, r1, r2, mark, templateTypeRow(L, r4).row][i]] })) };
  const found = auditIds(parseIds(buildIds(stateToDoc(st, L), L.S)), R).filter((x) => /^pset-(property|name|datatype)$/.test(x.code));
  assert.deepEqual(found.map((x) => x.message), ["Pset_DoorCommon has no standard property Mark (it has Reference, Status, FireRating, AcousticRating, SecurityRating, DurabilityRating, ...)"]);
  // nameSuggestion on a standard set the class cannot carry: none.
  assert.equal(nameSuggestion(L, ["IFCWALL"], { kind: "property", propertySet: { present: true, simple: "Pset_DoorCommon" }, baseName: { present: true, simple: "FireRatng" } }), null);
});

test("the audit reads a swapped pair of letters as one slip (Lenght: did you mean Length?)", () => {
  const xml = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>t</title></info><specifications><specification name="d" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCDUCTSEGMENT</simpleValue></name></entity></applicability><requirements><property dataType="IFCLENGTHMEASURE"><propertySet><simpleValue>Qto_DuctSegmentBaseQuantities</simpleValue></propertySet><baseName><simpleValue>Lenght</simpleValue></baseName></property></requirements></specification></specifications></ids>`;
  assert.match(audit(xml).map((x) => x.message).join(" "), /no standard property Lenght; did you mean Length\?/);
});

test("each further class has its own subclass box: a list of classes with their subclasses opens as those classes, ticked", () => {
  // IFCWALL and IFCSLAB each with every concrete subclass, IFCBEAM alone,
  // and IFCBEAMSTANDARDCASE exact (IFCBEAM's other subclass is missing).
  const walls = ["IFCWALL", ...subclasses(S4, "IFCWALL")], slabs = ["IFCSLAB", ...subclasses(S4, "IFCSLAB")];
  assert.ok(subclasses(S4, "IFCSLAB").length >= 2);
  assert.deepEqual(classListBases(S4, [...walls, ...slabs, "IFCBEAMSTANDARDCASE", "IFCDOOR"]),
    [{ cls: "IFCWALL", withSub: true }, { cls: "IFCSLAB", withSub: true }, { cls: "IFCBEAMSTANDARDCASE", withSub: false }, { cls: "IFCDOOR", withSub: false }]);
  // A subclass group inside a larger one is not ticked twice.
  const flows = ["IFCFLOWTERMINAL", ...subclasses(S4, "IFCFLOWTERMINAL")];
  const tops = classListBases(S4, ["IFCDISTRIBUTIONFLOWELEMENT", ...subclasses(S4, "IFCDISTRIBUTIONFLOWELEMENT"), ...flows]);
  assert.deepEqual(tops, [{ cls: "IFCDISTRIBUTIONFLOWELEMENT", withSub: true }]);
  // The written class list is the same set either way.
  const spec = { cls: "IFCWALL", withSub: true, also: ["IFCSLAB", "IFCDOOR"], alsoSub: ["IFCSLAB"] };
  assert.deepEqual(new Set(specClassNames(S4, spec)), new Set([...walls, ...slabs, "IFCDOOR"]));
  assert.deepEqual(specClassNames(S4, { ...spec, alsoSub: [] }), [...walls, "IFCSLAB", "IFCDOOR"]);
  // Opened from a file: the page lists IFCWALL and IFCSLAB, both ticked, and
  // writes back the same classes.
  const enumOf = (cs) => `<xs:restriction base="xs:string">${cs.map((c) => `<xs:enumeration value="${c}"/>`).join("")}</xs:restriction>`;
  const xml = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>Groups</title></info><specifications>
    <specification name="walls and slabs" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name>${enumOf([...walls, "IFCDOOR", ...slabs])}</name></entity></applicability>
      <requirements><attribute><name><simpleValue>Name</simpleValue></name></attribute></requirements></specification>
  </specifications></ids>`;
  const { parsed, imp, back } = reopen(xml);
  const [sp] = imp.state.specs;
  assert.deepEqual([sp.cls, sp.withSub, sp.also, sp.alsoSub], ["IFCWALL", true, ["IFCDOOR", "IFCSLAB"], ["IFCSLAB"]]);
  assert.deepEqual(said(back.specs[0]), said(parsed.specs[0]));
  // A blank specification starts with no further class ticked.
  assert.deepEqual(blankSpec().alsoSub, []);
});

test("in IFC4X3 a ticked subclass box leaves out the classes IFC 4.3 deprecates, and names them", () => {
  const S43 = R.schemas.IFC4X3;
  assert.equal(S43.name, "IFC4X3_ADD2");
  // Every listed class is still in the schema (so a model may carry one).
  for (const c of DEPRECATED.IFC4X3_ADD2) assert.ok(S43.entities[c], c);
  // IFCWALL's only subclass is deprecated: the box writes IFCWALL alone.
  assert.deepEqual(boxSubclasses(S43, "IFCWALL", {}), { subs: [], left: ["IFCWALLSTANDARDCASE"] });
  const ctrl = boxSubclasses(S43, "IFCFLOWCONTROLLER", {});
  assert.deepEqual(ctrl.left, ["IFCELECTRICDISTRIBUTIONBOARD"]);
  assert.ok(ctrl.subs.includes("IFCDISTRIBUTIONBOARD") && ctrl.subs.length === subclasses(S43, "IFCFLOWCONTROLLER").length - 1);
  const built = boxSubclasses(S43, "IFCBUILTELEMENT", {});
  assert.ok(built.left.includes("IFCWALLSTANDARDCASE") && !built.subs.includes("IFCWALLSTANDARDCASE"));
  // IFC4 deprecates none of its subclasses here: IFC4 exports still write IFCWALLSTANDARDCASE.
  assert.deepEqual(boxSubclasses(S4, "IFCWALL", {}).left, []);
  assert.ok(boxSubclasses(S4, "IFCWALL", {}).subs.includes("IFCWALLSTANDARDCASE"));
  // A specification that also names IFC4 keeps them, even edited in IFC4X3.
  assert.equal(deprecatedFor(S43, { ifcVersion: ["IFC4", "IFC4X3_ADD2"] }).size, 0);
  assert.equal(deprecatedFor(S43, { ifcVersion: ["IFC4X3_ADD2"] }).size, 3);
  assert.ok(specClassNames(S43, { cls: "IFCBUILTELEMENT", withSub: true, also: [], ifcVersion: ["IFC4", "IFC4X3_ADD2"] }).includes("IFCWALLSTANDARDCASE"));
  assert.ok(!specClassNames(S43, { cls: "IFCBUILTELEMENT", withSub: true, also: [] }).includes("IFCWALLSTANDARDCASE"));
  // A list naming every subclass but the deprecated one opens ticked
  // (the bSDD templates); one that names the deprecated class keeps it as an
  // exact class, so writing back names the same set.
  const builtAll = ["IFCBUILTELEMENT", ...built.subs];
  assert.deepEqual(classListBases(S43, [...builtAll, "IFCSPACE"]), [{ cls: "IFCBUILTELEMENT", withSub: true }, { cls: "IFCSPACE", withSub: false }]);
  assert.deepEqual(classListBases(S43, [...builtAll, "IFCWALLSTANDARDCASE"]), [{ cls: "IFCBUILTELEMENT", withSub: true }, { cls: "IFCWALLSTANDARDCASE", withSub: false }]);
  const enumOf = (cs) => `<xs:restriction base="xs:string">${cs.map((c) => `<xs:enumeration value="${c}"/>`).join("")}</xs:restriction>`;
  for (const list of [builtAll, [...builtAll, "IFCWALLSTANDARDCASE"], ["IFCWALL", "IFCWALLSTANDARDCASE"]]) {
    const xml = `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>Dep</title></info><specifications>
      <specification name="built" ifcVersion="IFC4X3_ADD2"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name>${enumOf(list)}</name></entity></applicability>
        <requirements><attribute><name><simpleValue>Name</simpleValue></name></attribute></requirements></specification>
    </specifications></ids>`;
    const { parsed, imp, back } = reopen(xml);
    assert.equal(imp.state.schema, "IFC4X3");
    const sp = imp.state.specs[0];
    if (list === builtAll) assert.deepEqual([sp.cls, sp.withSub, sp.also], ["IFCBUILTELEMENT", true, []]);
    if (list.length === 2) assert.deepEqual([sp.cls, sp.withSub, sp.also], ["IFCWALL", false, ["IFCWALLSTANDARDCASE"]]);
    assert.deepEqual(said(back.specs[0]), said(parsed.specs[0]), list.join(" ").slice(-60));
  }
});

test("sets the standard gives only some predefined types: named, and left out once another type is chosen", () => {
  for (const id of ["IFC4", "IFC4X3"]) {
    const L = loadFor(id);
    assert.deepEqual(setTypeLimit(L, "Pset_ActuatorTypeElectricActuator", ["IFCACTUATOR"]), ["ELECTRICACTUATOR"]);
    assert.deepEqual(setTypeLimit(L, "Pset_ActuatorTypeElectricActuator", ["IFCACTUATORTYPE"]), ["ELECTRICACTUATOR"]);
    assert.equal(setTypeLimit(L, "Pset_ActuatorTypeCommon", ["IFCACTUATOR"]), null);
    const any = commonSets(L, ["IFCACTUATOR"]);
    assert.ok(any.includes("Pset_ActuatorTypeElectricActuator") && any.includes("Pset_ActuatorTypePneumaticActuator"));
    const el = commonSets(L, ["IFCACTUATOR"], "ELECTRICACTUATOR");
    assert.ok(el.includes("Pset_ActuatorTypeElectricActuator") && el.includes("Pset_ActuatorTypeCommon"));
    assert.ok(!el.includes("Pset_ActuatorTypePneumaticActuator"));
    // The specification the page writes once it takes the set's type audits clean.
    const doc = { schema: id, specs: [{ ...blankSpec(), name: "a", cls: "IFCACTUATOR", predefinedType: "ELECTRICACTUATOR", reqs: [{ ...blankReq(), kind: "property", set: "Pset_ActuatorTypeElectricActuator", name: "ActuatorInputPower", dataType: "IFCPOWERMEASURE" }] }] };
    const issues = auditIds(parseIds(buildIds(stateToDoc({ title: "t", ...doc }, L), L.S)), resources());
    assert.deepEqual(issues.map((x) => x.code), []);
  }
  // IFC4's IfcMaterial/Concrete is a category, not a type: no limit.
  assert.equal(setTypeLimit(loadFor("IFC4"), "Pset_MaterialConcrete", ["IFCMATERIAL"]), null);
});

test("template types: occurrence sets are not offered on type objects, performance sets are offered on IFCPERFORMANCEHISTORY", () => {
  for (const id of ["IFC4", "IFC4X3"]) {
    const S = R.schemas[id], ps = R.psets[id];
    assert.ok(setsFor(ps, S, "IFCFAN").includes("Pset_FanOccurrence"), id);
    assert.ok(!setsFor(ps, S, "IFCFANTYPE").includes("Pset_FanOccurrence"), id);
    assert.ok(setsFor(ps, S, "IFCFANTYPE").includes("Pset_FanTypeCommon"), id);
    assert.ok(!setsFor(ps, S, "IFCFAN").includes("Pset_FanPHistory"), id);
    assert.ok(setsFor(ps, S, "IFCPERFORMANCEHISTORY").includes("Pset_FanPHistory"), id);
    assert.ok(classesWithSets(ps, S).includes("IFCPERFORMANCEHISTORY"), id);
  }
  assert.ok(!setsFor(R.psets.IFC4X3, R.schemas.IFC4X3, "IFCAIRTERMINALTYPE").includes("Pset_AirTerminalOccurrence"));
});
