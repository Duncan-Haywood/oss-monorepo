// The attribute shape kept in the verdict cache (ids.mjs attributeVerdict,
// eval/attribute-shape-2026-11-18.md): attribute facets that differ only in
// their value share one per-entity reading of which attributes the name takes,
// which are set, empty or not comparable by value. It must not change a
// verdict or a report.
import { test } from "node:test";
import assert from "node:assert/strict";
import { check, parseModel, readModel } from "./node.mjs";
import { AttributeFacet, cachedVerdict } from "./ids.mjs";
import { parseXml } from "./xml.mjs";

const NS = `xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"`;
const sv = (x) => `<simpleValue>${x}</simpleValue>`;
const pat = (x) => `<xs:restriction base="xs:string"><xs:pattern value="${x}"/></xs:restriction>`;
const anyName = `<name>${pat(".*")}</name>`;
const attr = (name, value = "", card = "") => `<attribute${card}>${name}${value ? `<value>${value}</value>` : ""}</attribute>`;
const named = (n) => `<name>${sv(n)}</name>`;

// Names with and without a pattern, each with no value and several values:
// strings that match some entities, a pattern matching every scalar, an enum,
// a number, and a fixed name that is a list, a reference or no attribute.
const FACETS = [
  attr(anyName), attr(anyName, sv("W-01")), attr(anyName, pat(".*")), attr(anyName, pat("Tiny.*")), attr(anyName, sv("ELEMENT")),
  attr(named("Name")), attr(named("Name"), sv("W-01")), attr(named("Name"), pat("D.*")),
  attr(`<name>${pat("Name|Description|ObjectType")}</name>`), attr(`<name>${pat("Name|Description|ObjectType")}</name>`, pat(".*")),
  attr(named("PredefinedType")), attr(named("PredefinedType"), sv("NOTDEFINED")),
  attr(named("Elevation")), attr(named("Elevation"), sv("0")),
  attr(named("Coordinates")), attr(named("Coordinates"), sv("0")),
  attr(named("OwnerHistory")), attr(named("OwnerHistory"), sv("x")),
  attr(named("NoSuchAttribute")), attr(named("NoSuchAttribute"), sv("x")),
  attr(named("Dimensions")), attr(`<name>${pat("Dimensions|UnitType|Name")}</name>`, pat(".*")),
];

const codeOf = (r) => (r.ok ? 1 : r.absent ? 2 : 3);

// The starter sample, and a small IFC4 file with what it lacks: empty strings,
// unset, derived and empty-list attributes, geometry, and walls whose set
// attributes are all comparable scalars.
const HEAD = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('','',(),(),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n`;
const SYNTHETIC = HEAD + [
  "#1=IFCCARTESIANPOINT((0.,1.,2.));",
  "#2=IFCCARTESIANPOINT(());",
  "#3=IFCPOLYLOOP((#1,#2));",
  "#4=IFCWALL('2O2Fr$t4X7Zf8NOew3FLOH',$,'W-01',$,$,$,$,$,$);",
  "#5=IFCWALL('3O2Fr$t4X7Zf8NOew3FLOH',$,'',$,$,$,$,$,$);",
  "#6=IFCWALL('1O2Fr$t4X7Zf8NOew3FLOH',$,'Door',$,'',$,$,$,.NOTDEFINED.);",
  "#7=IFCWALL('0O2Fr$t4X7Zf8NOew3FLOH',$,$,$,$,$,$,$,$);",
  "#8=IFCBUILDINGSTOREY('4O2Fr$t4X7Zf8NOew3FLOH',$,'Tiny storey',$,$,$,$,$,.ELEMENT.,0.);",
  "#9=IFCDIRECTION((1.,0.,0.));",
  "#10=IFCCARTESIANPOINTLIST3D((()),());",
  // Dimensions is derived in IfcSIUnit; a value written there is not set.
  "#11=IFCSIUNIT(#12,.LENGTHUNIT.,$,.METRE.);",
  "#12=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);",
].join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
const texts = async () => [(await readModel(new URL("samples/tiny-house.ifc", import.meta.url).pathname)).text, SYNTHETIC];

test("the shape cache gives every entity the verdict test() gives, for every facet, twice", async () => {
  const seen = new Set();
  for (const text of await texts()) {
  const m = parseModel(text);
  const ctx = { typeMap: null };
  const fs = FACETS.map((x) => new AttributeFacet(parseXml(x)));
  for (let pass = 0; pass < 2; pass++)
    for (const f of fs)
      for (const e of m.entities.values()) {
        const want = codeOf(f.test(e, m, ctx));
        assert.equal(cachedVerdict(f, e, m, ctx), want, `${f.describe()} on #${e.id} ${e.type}, pass ${pass}`);
        if (pass === 0) seen.add(f.shape(e, m));
      }
  // More facets than verdict slots: evicted slots leave their name's siblings.
  const c = m._appliesCache;
  assert.equal([...c.byName.values()].reduce((n, x) => n + x.size, 0), c.verdicts.size, "every kept slot, and only those, listed by name");
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5], "every shape occurs");
});

test("specifications on every entity give the uncached report", async () => {
  for (const text of await texts()) {
  const specs = [];
  for (const f of FACETS) for (const card of ["", ` cardinality="optional"`, ` cardinality="prohibited"`])
    specs.push(`<specification name="s" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded">${attr(anyName)}</applicability><requirements>${f.replace("<attribute>", `<attribute${card}>`)}</requirements></specification>`);
  const idsText = `<?xml version="1.0"?><ids ${NS}><info><title>t</title></info><specifications>${specs.join("")}</specifications></ids>`;
  const strip = (r) => { delete r.seconds; return r; };
  const shared = parseModel(text);
  const a = strip(check(idsText, shared)), b = strip(check(idsText, parseModel(text), { facetCache: false }));
  assert.deepEqual(a, b);
  assert.ok([...shared._appliesCache.verdicts.values()].some((sl) => sl.nameKey && sl.bytes.some((b) => b >> 2)), "shapes were kept");
  assert.ok(a.specs.some((s) => s.failed.length) && a.specs.some((s) => s.passed), "the cases both pass and fail");
  }
});
