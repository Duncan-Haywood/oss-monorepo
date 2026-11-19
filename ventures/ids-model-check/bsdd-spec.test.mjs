// bsdd-spec.mjs: an IDS from a bSDD class's property list (fake bSDD, no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { specFromBsddClass, bsddIds, ifcEntityOf, ifcTypeIn, isIfcDictionary } from "./bsdd-spec.mjs";
import { resources } from "./node.mjs";
import { parseIds } from "./ids.mjs";
import { auditIds } from "./audit.mjs";
import { checkBsdd, bsddLinks } from "./bsdd.mjs";
import { importIds, stateToDoc, buildIds } from "./editor.mjs";

const R = resources();
const S = R.schemas.IFC4X3;
const IFC = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3";
const NL = "https://identifier.buildingsmart.org/uri/bsnl/Omgevingswet-Ruimten/0.2.0";
const note = (t) => `Technical note: in IFC this property takes '${t}' as value.`;

const WALL = {
  code: "IfcWall", name: "Wall", uri: `${IFC}/class/IfcWall`, dictionaryUri: IFC, status: "Active", classType: "Class",
  parentClassReference: { code: "IfcBuiltElement" },
  classProperties: [
    { propertySet: "Attributes", propertyCode: "Tag", dataType: "String", propertyUri: `${IFC}/prop/Tag`, propertyDictionaryUri: IFC },
    { propertySet: "Attributes", propertyCode: "ElementType", dataType: "String", propertyUri: `${IFC}/prop/ElementType`, propertyDictionaryUri: IFC },
    { propertySet: "Pset_WallCommon", propertyCode: "IsExternal", dataType: "Boolean", description: note("IfcBoolean"), propertyUri: `${IFC}/prop/IsExternal`, propertyDictionaryUri: IFC },
    { propertySet: "Pset_WallCommon", propertyCode: "Status", dataType: "String", description: note("IfcLabel"), propertyUri: `${IFC}/prop/Status`, propertyDictionaryUri: IFC, allowedValues: [{ code: "NEW", value: "NEW" }, { code: "EXISTING", value: "EXISTING" }] },
    // No type note: bSDD says Real, the IFC templates IfcLengthMeasure.
    { propertySet: "Qto_WallBaseQuantities", propertyCode: "Height", dataType: "Real", propertyUri: `${IFC}/prop/Height`, propertyDictionaryUri: IFC },
    { propertySet: "Pset_Condition", propertyCode: "AssessmentMethod", propertyValueKind: "Complex", propertyUri: `${IFC}/prop/AssessmentMethod`, propertyDictionaryUri: IFC },
    { propertySet: "Pset_WallCommon", propertyCode: "Old", dataType: "String", propertyStatus: "Inactive", propertyUri: `${IFC}/prop/Old` },
  ],
};
const BED = {
  code: "Bedruimte", referenceCode: "Bedruimte", name: "Bedruimte", uri: `${NL}/class/Bedruimte`, dictionaryUri: NL, status: "Active", classType: "Class",
  relatedIfcEntityNames: ["IFCSPACE", "IFCZONE", "IFCNOSUCH"],
  classProperties: [
    { propertySet: "Attributes", propertyCode: "ObjectType", dataType: "String", isRequired: true, allowedValues: [{ code: "Bedruimte", value: "Bedruimte" }] },
    { propertySet: "Pset_SpaceOccupancyRequirements", propertyCode: "OccupancyNumber", dataType: "Integer", isRequired: true, description: "Instructions: aantal", propertyUri: `${IFC}/prop/OccupancyNumber`, propertyDictionaryUri: IFC },
    { propertyCode: "Oppervlakte", dataType: "Real", minInclusive: 0, maxExclusive: 1000, propertyUri: `${NL}/prop/Oppervlakte`, propertyDictionaryUri: NL },
  ],
};

test("helpers read bSDD's IFC conventions", () => {
  assert.equal(ifcTypeIn(note("IfcAreaMeasure")), "IFCAREAMEASURE");
  assert.equal(isIfcDictionary(IFC), true);
  assert.equal(isIfcDictionary(NL), false);
  assert.deepEqual(ifcEntityOf({ code: "IfcWall" }, S), { entity: "IFCWALL", predefinedType: null });
  assert.deepEqual(ifcEntityOf({ code: "IfcWallSHEAR", parentClassReference: { code: "IfcWall" } }, S), { entity: "IFCWALL", predefinedType: "SHEAR" });
  assert.equal(ifcEntityOf({ code: "IfcNoSuchThing" }, S), null);
});

test("an IFC class: entity applicability, typed property facets with the property's uri", () => {
  const { spec, notes } = specFromBsddClass(WALL, { schema: S, psets: R.psets.IFC4X3 });
  assert.deepEqual(spec.applicability, [{ kind: "entity", names: ["IFCWALL"], predefinedType: null }]);
  const by = Object.fromEntries(spec.requirements.map((f) => [f.name, f]));
  assert.equal(by.Tag.kind, "attribute");
  assert.equal(by.ElementType, undefined, "an attribute of IfcWallType, not IfcWall");
  assert.equal(by.IsExternal.dataType, "IFCBOOLEAN");
  assert.equal(by.IsExternal.uri, `${IFC}/prop/IsExternal`);
  assert.equal(by.IsExternal.cardinality, "optional");
  assert.deepEqual(by.Status.value, { oneOf: ["NEW", "EXISTING"] });
  assert.equal(by.Height.dataType, "IFCLENGTHMEASURE", "the template's type over bSDD's Real");
  assert.equal(by.AssessmentMethod, undefined, "a complex property is left out");
  assert.equal(by.Old, undefined);
  assert.ok(notes.some((n) => /complex property/.test(n)) && notes.some((n) => /Inactive/.test(n)) && notes.some((n) => /ElementType/.test(n)));
});

test("another dictionary's class: entity + classification, the class uri on a requirement", () => {
  const { spec, notes } = specFromBsddClass(BED, { schema: S, psets: R.psets.IFC4X3, dictionaryName: "Omgevingswet-Ruimten" });
  assert.deepEqual(spec.applicability[0], { kind: "entity", names: ["IFCSPACE", "IFCZONE"] });
  assert.deepEqual(spec.applicability[1], { kind: "classification", system: "Omgevingswet-Ruimten", value: { equals: "Bedruimte" } });
  const cls = spec.requirements.find((f) => f.kind === "classification");
  assert.equal(cls.uri, `${NL}/class/Bedruimte`);
  const occ = spec.requirements.find((f) => f.name === "OccupancyNumber");
  assert.equal(occ.dataType, "IFCCOUNTMEASURE", "the IFC template's type");
  assert.equal(occ.cardinality, "required");
  const opp = spec.requirements.find((f) => f.name === "Oppervlakte");
  assert.equal(opp.set, "Omgevingswet-Ruimten", "no set in bSDD: the dictionary's name");
  assert.equal(opp.dataType, "IFCREAL");
  assert.deepEqual(opp.value, { r: { enumeration: [], pattern: [], minInclusive: "0", maxExclusive: "1000" } });
  assert.ok(notes.some((n) => /IFCNOSUCH/.test(n)) && notes.some((n) => /no property set/.test(n)));
});

// A fake bSDD answering the two classes, their dictionary and every link.
const ENTRIES = new Map();
for (const c of [WALL, BED]) {
  ENTRIES.set(c.uri.toLowerCase(), c);
  for (const p of c.classProperties) if (p.propertyUri) ENTRIES.set(p.propertyUri.toLowerCase(), { code: p.propertyCode, name: p.propertyCode, uri: p.propertyUri, dataType: p.dataType, description: p.description || "", dictionaryUri: p.propertyDictionaryUri, status: "Active", allowedValues: p.allowedValues });
}
ENTRIES.get(`${IFC}/prop/OccupancyNumber`.toLowerCase()).description = note("IfcCountMeasure");
const DICTS = { [IFC.toLowerCase()]: { name: "IFC", code: "ifc", version: "4.3", uri: IFC, isLatestVersion: true }, [NL.toLowerCase()]: { name: "Omgevingswet-Ruimten", code: "Omgevingswet-Ruimten", version: "0.2.0", uri: NL, isLatestVersion: true } };
const calls = [];
const fakeFetch = async (url) => {
  calls.push(url);
  const u = new URL(url);
  const uri = u.searchParams.get("Uri").toLowerCase();
  const hit = u.pathname.startsWith("/api/Dictionary") ? DICTS[uri] && { dictionaries: [DICTS[uri]] } : ENTRIES.get(uri);
  return { ok: !!hit, status: hit ? 200 : 404, text: async () => JSON.stringify(hit || { message: "not found" }) };
};

test("bsddIds writes a valid IDS that the audit and the bSDD link check both pass", async () => {
  const r = await bsddIds([WALL.uri, BED.uri, `${NL}/class/Nope`], { fetch: fakeFetch, schemas: R.schemas, psets: R.psets, schema: S });
  assert.equal(r.specs.length, 2);
  assert.ok(r.notes.some((n) => /Nope: bSDD has no class/.test(n)));
  assert.match(r.text, /<classification uri="https:\/\/identifier\.buildingsmart\.org\/uri\/bsnl\/Omgevingswet-Ruimten\/0\.2\.0\/class\/Bedruimte">/);
  assert.match(r.text, /<property dataType="IFCBOOLEAN" uri="[^"]+\/prop\/IsExternal" cardinality="optional">/);
  // OccupancyNumber's IFC type came from the IFC dictionary's entry, asked once.
  assert.equal(calls.filter((c) => /OccupancyNumber/.test(c)).length, 1);
  const issues = auditIds(parseIds(r.text), { schemas: R.schemas, typeMap: R.typeMap, psets: R.psets });
  assert.deepEqual(issues.filter((x) => x.level === "error"), []);
  const b = await checkBsdd(r.text, { fetch: fakeFetch, schemas: R.schemas });
  assert.deepEqual(b.findings.filter((x) => x.level !== "note"), []);
});

test("sets narrows the properties", () => {
  const { spec } = specFromBsddClass(WALL, { schema: S, psets: R.psets.IFC4X3, sets: ["Pset_WallCommon"] });
  assert.deepEqual(spec.requirements.map((f) => f.name), ["IsExternal", "Status"]);
});

test("the editor opens a generated IDS and writes every bSDD link back", async () => {
  const r = await bsddIds([WALL.uri, BED.uri], { fetch: fakeFetch, schemas: R.schemas, psets: R.psets, schema: S });
  const loadFor = (id) => ({ S: R.schemas[id], psets: R.psets[id], tm: id === "IFC2X3" ? R.typeMap : null });
  const imp = importIds(parseIds(r.text), loadFor);
  const L = loadFor(imp.state.schema);
  const back = buildIds(stateToDoc(imp.state, L), L.S);
  const links = (t) => bsddLinks(t).map((l) => `${l.specName} ${l.kind} ${l.uri}`).sort();
  assert.ok(links(r.text).length >= 5);
  assert.deepEqual(links(back), links(r.text));
  assert.ok(imp.rows > 0, "the facets open as editable rows, not only kept as written");
});

test("a predefinedValue of \"None\" is no value; a set named as a pattern is written as one; no code, no facet", () => {
  const cls = { ...BED, classProperties: [
    { propertySet: "Pset_.*Common", propertyCode: "Kleur", dataType: "String", predefinedValue: "None", allowedValues: [{ value: "Rood" }, { value: "Blauw" }] },
    { propertySet: "Eigen", propertyCode: "Dikte", dataType: "Real", predefinedValue: "None" },
    { propertySet: "Eigen", propertyCode: "Vast", dataType: "String", predefinedValue: "A" },
    { propertySet: "Eigen", propertyCode: "", dataType: "String" },
  ] };
  const { spec, notes } = specFromBsddClass(cls, { schema: S, psets: R.psets.IFC4X3, dictionaryName: "NL" });
  const props = spec.requirements.filter((f) => f.kind === "property");
  assert.deepEqual(props.map((f) => f.name), ["Kleur", "Dikte", "Vast"]);
  assert.deepEqual(props[0].set, { pattern: "Pset_.*Common" });
  assert.deepEqual(props[0].value, { oneOf: ["Rood", "Blauw"] });
  assert.equal(props[1].value, undefined);
  assert.deepEqual(props[2].value, { equals: "A" });
  assert.ok(notes.some((n) => /no property code/.test(n)));
});
