import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { resources, check } from "./node.mjs";
import { classesWithSets, setsFor, propertiesOf, subclasses, predefinedTypes, buildIds, entityFacet, xsBase, PARTOF_RELATIONS, importIds, stateToDoc, idsSchema, specClassNames, commonSets, commonAttributes, sameAttributeType, commonPredefinedTypes, parseClassList, valueChoices, attributeValueKind, modelAttributes, modelValueOffer, typeRow, appMatchCount } from "./editor.mjs";
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
