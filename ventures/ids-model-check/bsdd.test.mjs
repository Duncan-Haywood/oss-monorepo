// bsdd.mjs: an IDS's bSDD links compared with a fake bSDD (no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBsdd, bsddLinks, dataTypeFits, ifcCandidate, linkKind, bsddReport } from "./bsdd.mjs";
import { resources } from "./node.mjs";

const IFC = "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3";
const NL = "https://identifier.buildingsmart.org/uri/bsnl/Omgevingswet-Ruimten/0.2.0";
const ENTRIES = {
  [`${IFC}/prop/IsExternal`.toLowerCase()]: { code: "IsExternal", name: "Is External", dataType: "Boolean", uri: `${IFC}/prop/IsExternal`, dictionaryUri: IFC, status: "Active", description: "Technical note: in IFC this property takes 'IfcBoolean' as value." },
  [`${IFC}/prop/FireRating`.toLowerCase()]: { code: "FireRating", name: "Fire Rating", dataType: "String", uri: `${IFC}/prop/FireRating`, dictionaryUri: IFC, status: "Active", description: "Technical note: in IFC this property takes 'IfcLabel' as value." },
  [`${IFC}/prop/Status`.toLowerCase()]: { code: "Status", name: "Status", dataType: "String", uri: `${IFC}/prop/Status`, dictionaryUri: IFC, status: "Active", allowedValues: [{ code: "NEW", value: "NEW" }, { code: "EXISTING", value: "EXISTING" }] },
  [`${NL}/class/Buitengebied`.toLowerCase()]: { code: "Buitengebied", referenceCode: "Buitengebied", name: "Buitengebied", uri: `${NL}/class/Buitengebied`, dictionaryUri: NL, status: "Active", classType: "Class", relatedIfcEntityNames: ["IFCEXTERNALSPATIALELEMENT", "IFCSPACE"] },
};
const DICTS = {
  [IFC.toLowerCase()]: { name: "IFC", code: "ifc", version: "4.3", uri: IFC, isLatestVersion: true },
  [NL.toLowerCase()]: { name: "Omgevingswet-Ruimten", code: "Omgevingswet-Ruimten", version: "0.2.0", uri: NL, isLatestVersion: false },
};
// bSDD reads links case-insensitively and accepts http and ifc-4.3.
const norm = (u) => u.replace(/^http:/i, "https:").replace("/ifc-4.3/", "/ifc/4.3/").toLowerCase();
const calls = [];
const fakeFetch = async (url) => {
  calls.push(url);
  const u = new URL(url);
  const uri = norm(u.searchParams.get("Uri"));
  const isDict = u.pathname.startsWith("/api/Dictionary");
  const hit = isDict ? DICTS[uri] && { dictionaries: [DICTS[uri]] } : ENTRIES[uri];
  const body = hit ? JSON.stringify(hit) : JSON.stringify({ message: `Property with namespace URI '${uri}' not found`, statusCode: 400 });
  return { ok: !!hit, status: hit ? 200 : 400, text: async () => body };
};

const ids = (facets, { entity = "IFCWALL", version = "IFC4X3_ADD2" } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema">
<info><title>t</title></info>
<specifications>
<specification name="S" ifcVersion="${version}">
<applicability><entity><name><simpleValue>${entity}</simpleValue></name></entity></applicability>
<requirements>
${facets}
</requirements>
</specification>
</specifications>
</ids>`;
const prop = (name, uri, dataType = "IFCBOOLEAN", value = "") => `<property dataType="${dataType}" uri="${uri}"><propertySet><simpleValue>Pset_WallCommon</simpleValue></propertySet><baseName><simpleValue>${name}</simpleValue></baseName>${value}</property>`;
const run = (text) => checkBsdd(text, { fetch: fakeFetch, schemas: resources().schemas });
const codes = (r) => r.findings.map((f) => `${f.level} ${f.code}`);

test("a link that agrees with bSDD raises nothing", async () => {
  const r = await run(ids(prop("IsExternal", `${IFC}/prop/IsExternal`)));
  assert.equal(r.uris, 1);
  assert.deepEqual(r.findings, []);
});

test("a link bSDD does not have is an error, with the IFC 4.3 entry when one exists", async () => {
  const r = await run(ids(prop("FireRating", "http://identifier.buildingsmart.org/uri/buildingsmart/ifc-2x3/prop/firerating", "IFCLABEL")));
  assert.deepEqual(codes(r), ["error bsdd-not-found"]);
  assert.equal(r.findings[0].suggest, `${IFC}/prop/FireRating`);
  assert.equal(r.findings[0].line, 8);
});

test("a dataType that cannot hold the dictionary's values is an error; the exact IFC type a warning", async () => {
  const r = await run(ids(prop("IsExternal", `${IFC}/prop/IsExternal`, "IFCLABEL")));
  assert.deepEqual(codes(r), ["error bsdd-datatype"]);
  assert.equal(r.findings[0].suggest, "IFCBOOLEAN");
  const r2 = await run(ids(prop("FireRating", `${IFC}/prop/FireRating`, "IFCTEXT")));
  assert.deepEqual(codes(r2), ["warning bsdd-datatype"]);
  assert.equal(r2.findings[0].suggest, "IFCLABEL");
});

test("a baseName other than the linked code is a warning; case alone is named as such", async () => {
  const r = await run(ids(prop("FireRating", `${IFC}/prop/IsExternal`)));
  assert.deepEqual(codes(r), ["warning bsdd-name"]);
  assert.match(r.findings[0].message, /not the linked bSDD property, "IsExternal"/);
  // FireRating is itself in the IFC dictionary: the uri was pasted from the next row.
  assert.equal(r.findings[0].suggest, `${IFC}/prop/FireRating`);
  assert.match(r.findings[0].message, /IFC has FireRating at /);
  const r2 = await run(ids(prop("isexternal", `${IFC}/prop/IsExternal`)));
  assert.match(r2.findings[0].message, /only in case/);
});

test("an older spelling of the link that resolves is a note with bSDD's own form", async () => {
  const r = await run(ids(prop("IsExternal", "http://identifier.buildingsmart.org/uri/buildingsmart/ifc-4.3/prop/isexternal")));
  assert.deepEqual(codes(r), ["note bsdd-form"]);
  assert.equal(r.findings[0].suggest, `${IFC}/prop/IsExternal`);
});

test("values outside the property's allowed values are warnings, with bSDD's spelling", async () => {
  const v = `<value><xs:restriction base="xs:string"><xs:enumeration value="NEW"/><xs:enumeration value="Existing"/></xs:restriction></value>`;
  const r = await run(ids(prop("Status", `${IFC}/prop/Status`, "IFCLABEL", v)));
  assert.deepEqual(codes(r), ["warning bsdd-value"]);
  assert.match(r.findings[0].message, /"Existing" \(bSDD "EXISTING"\)/);
});

test("classification: wrong kind, code, system, class, and an old dictionary version", async () => {
  const cls = (system, value, uri) => `<classification uri="${uri}"><value><simpleValue>${value}</simpleValue></value><system><simpleValue>${system}</simpleValue></system></classification>`;
  const ok = await run(ids(cls("Omgevingswet-Ruimten", "Buitengebied", `${NL}/class/Buitengebied`), { entity: "IFCSPACE" }));
  assert.deepEqual(codes(ok), ["note bsdd-old-version"]);
  const bad = await run(ids(cls("NL-SfB", "Binnen", `${NL}/class/Buitengebied`)));
  assert.deepEqual(codes(bad).sort(), ["note bsdd-old-version", "warning bsdd-entity", "warning bsdd-system", "warning bsdd-value"]);
  const kind = await run(ids(cls("IFC", "x", `${IFC}/prop/IsExternal`)));
  assert.equal(codes(kind)[0], "error bsdd-kind");
});

test("links outside bSDD are noted, not looked up; each distinct link is fetched once", async () => {
  calls.length = 0;
  const r = await run(ids(prop("IsExternal", "https://example.com/x") + prop("IsExternal", `${IFC}/prop/IsExternal`) + prop("IsExternal", `${IFC}/prop/isexternal`)));
  assert.deepEqual(codes(r), ["note bsdd-not-bsdd", "note bsdd-form"]);
  assert.equal(calls.filter((c) => c.includes("/Property/")).length, 1);
  assert.match(bsddReport(r), /3 uri\(s\), 1 distinct looked up; 0 error\(s\), 0 warning\(s\), 2 note\(s\)/);
});

test("bSDD not answering is a note, never a crash", async () => {
  const r = await checkBsdd(ids(prop("IsExternal", `${IFC}/prop/IsExternal`)), { fetch: async () => { throw new Error("offline"); } });
  assert.deepEqual(codes(r), ["note bsdd-unreachable"]);
});

test("helpers", () => {
  const S = resources().schemas.IFC4X3;
  assert.equal(dataTypeFits("Boolean", "IFCLOGICAL", S), true);
  assert.equal(dataTypeFits("Real", "IFCLENGTHMEASURE", S), true);
  assert.equal(dataTypeFits("Real", "IFCLABEL", S), false);
  assert.equal(dataTypeFits("Time", "IFCDATE", S), true);
  // IFC4's IfcCountMeasure is a NUMBER: it holds an Integer property.
  assert.equal(dataTypeFits("Integer", "IFCCOUNTMEASURE", resources().schemas.IFC4), true);
  assert.equal(dataTypeFits("String", "IFCNOSUCHTYPE", S), null);
  assert.equal(ifcCandidate("http://identifier.buildingsmart.org/uri/buildingsmart/ifc-2x3/prop/acousticrating"), `${IFC}/prop/acousticrating`);
  assert.equal(linkKind(`${NL}/class/Buitengebied`), "class");
  assert.equal(linkKind("https://www.igh.hr/en/reference/"), null);
  assert.equal(bsddLinks(ids(prop("A", "u"))).length, 1);
});

test("a 429 is retried after a wait, then answered", async () => {
  let n = 0;
  const waits = [];
  const flaky = async (url) => (++n <= 2 ? { ok: false, status: 429, headers: { get: () => null }, text: async () => "" } : fakeFetch(url));
  const r = await checkBsdd(ids(prop("IsExternal", `${IFC}/prop/IsExternal`)), { fetch: flaky, wait: async (ms) => { waits.push(ms); }, schemas: resources().schemas });
  assert.deepEqual(r.findings, []);
  assert.deepEqual(waits, [500, 1000]);
});
