import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { resources, check } from "./node.mjs";
import { classesWithSets, setsFor, propertiesOf, subclasses, predefinedTypes, buildIds, entityFacet, xsBase, PARTOF_RELATIONS } from "./editor.mjs";

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
