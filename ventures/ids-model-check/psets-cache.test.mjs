// The cached property-set reader (psetInfo, psetsOf sharing a set's props) and
// the property prefilter built from psetHolders must give what the uncached
// reader gave: eval/psets-cache-2026-11-18.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { psetsOf, psetHolders } from "./ids.mjs";
import { check, parseModel, parseIds } from "./node.mjs";

const HEAD = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('','',(),(),'','','');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n";
const ifc = (lines) => HEAD + lines.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
const ids = (specs) => `<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>${specs}</specifications></ids>`;

// The reader as it was before the cache (main at aebd459df), kept here as the reference.
function psetsOfUncached(model, e) {
  const out = new Map();
  const add = (pset) => {
    const name = model.attr(pset, "Name");
    if (typeof name !== "string") return;
    let slot = out.get(name);
    if (!slot) out.set(name, (slot = { props: new Map(), entities: [] }));
    slot.entities.push(pset);
    if (pset.type === "IFCPROPERTYSET" || pset.type === "IFCELEMENTQUANTITY" || pset.type === "IFCMATERIALPROPERTIES") {
      const listName = pset.type === "IFCELEMENTQUANTITY" ? "Quantities" : pset.type === "IFCPROPERTYSET" ? "HasProperties" : "Properties";
      for (const p of model.refs(pset, listName)) {
        const pn = model.attr(p, "Name");
        if (typeof pn === "string") slot.props.set(pn, p);
      }
    }
  };
  const ty = model.typeOf.get(e.id);
  if (ty) for (const p of model.refs(ty, "HasPropertySets")) add(p);
  if (model.isA(e, "IFCTYPEOBJECT")) for (const p of model.refs(e, "HasPropertySets")) add(p);
  for (const p of model.psetRels.get(e.id) || []) add(p);
  if (e.type === "IFCMATERIAL" || model.isA(e, "IFCMATERIALDEFINITION")) for (const p of model.materialProps.get(e.id) || []) add(p);
  return out;
}

const MODEL = ifc([
  "#1=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI30'),$);",
  "#2=IFCPROPERTYSINGLEVALUE('IsExternal',$,IFCBOOLEAN(.F.),$);",
  "#3=IFCPROPERTYSET('0aaaaaaaaaaaaaaaaaaaaa',$,'Pset_DoorCommon',$,(#1,#2));",
  "#4=IFCDOORTYPE('0bbbbbbbbbbbbbbbbbbbbb',$,'T',$,$,(#3),$,$,$,.DOOR.,.SINGLE_SWING_LEFT.,$,$);",
  "#5=IFCDOOR('0ccccccccccccccccccccc',$,'D1',$,$,$,$,$,$,$,$,$,$);",
  "#6=IFCDOOR('0ddddddddddddddddddddd',$,'D2',$,$,$,$,$,$,$,$,$,$);",
  // D3 has its type's sets only.
  "#19=IFCDOOR('0mmmmmmmmmmmmmmmmmmmmm',$,'D3',$,$,$,$,$,$,$,$,$,$);",
  "#7=IFCRELDEFINESBYTYPE('0eeeeeeeeeeeeeeeeeeeee',$,$,$,(#5,#6,#19),#4);",
  // D2 overrides one property of the type's set by an occurrence set of the same name.
  "#8=IFCPROPERTYSINGLEVALUE('FireRating',$,IFCLABEL('EI60'),$);",
  "#9=IFCPROPERTYSET('0fffffffffffffffffffff',$,'Pset_DoorCommon',$,(#8));",
  "#10=IFCRELDEFINESBYPROPERTIES('0ggggggggggggggggggggg',$,$,$,(#6),#9);",
  // A set with no name (skipped) and a custom one, both on D1.
  "#11=IFCPROPERTYSET('0hhhhhhhhhhhhhhhhhhhhh',$,$,$,(#1));",
  "#12=IFCPROPERTYSET('0iiiiiiiiiiiiiiiiiiiii',$,'Acme_Door',$,(#2));",
  "#13=IFCRELDEFINESBYPROPERTIES('0jjjjjjjjjjjjjjjjjjjjj',$,$,$,(#5),#11);",
  "#14=IFCRELDEFINESBYPROPERTIES('0kkkkkkkkkkkkkkkkkkkkk',$,$,$,(#5),#12);",
  // A material with its own properties, and a wall with none.
  "#15=IFCMATERIAL('Oak',$,$);",
  "#16=IFCMATERIALPROPERTIES('Pset_MaterialWood',$,(#2),#15);",
  "#17=IFCWALL('0lllllllllllllllllllll',$,'W',$,$,$,$,$,$);",
  "#18=IFCCARTESIANPOINT((0.,0.,0.));",
]);

const plain = (m) => JSON.stringify([...m].map(([n, s]) => [n, [...s.props].map(([pn, p]) => [pn, p.id])]));

test("psetsOf with cached sets equals the uncached reader on every entity, and leaves the shared sets unchanged", () => {
  const m = parseModel(MODEL);
  const before = plain(psetsOf(m, m.entities.get(5)));
  for (const e of m.entities.values()) assert.equal(plain(psetsOf(m, e)), plain(psetsOfUncached(m, e)), `#${e.id}`);
  // D2's override must not have written EI60 into the type's cached set.
  assert.equal(plain(psetsOf(m, m.entities.get(5))), before);
  assert.equal(psetsOf(m, m.entities.get(5)).get("Pset_DoorCommon").props.get("FireRating").id, 1);
  assert.equal(psetsOf(m, m.entities.get(6)).get("Pset_DoorCommon").props.get("FireRating").id, 8);
});

test("psetHolders names exactly the entities psetsOf gives a set of that name", () => {
  const m = parseModel(MODEL);
  const holders = psetHolders(m);
  const fromHolders = new Map();
  for (const [n, list] of holders) for (const e of list) (fromHolders.get(e.id) || fromHolders.set(e.id, new Set()).get(e.id)).add(n);
  for (const e of m.entities.values()) {
    const names = [...psetsOfUncached(m, e).keys()].sort();
    assert.deepEqual([...(fromHolders.get(e.id) || [])].sort(), names, `#${e.id}`);
  }
});

test("property specs on every entity give the same report with the holder prefilter", () => {
  const m = parseModel(MODEL);
  const prop = (ps, bn, card = "required") => `<property cardinality="${card}"><propertySet>${ps}</propertySet><baseName><simpleValue>${bn}</simpleValue></baseName></property>`;
  const sv = (x) => `<simpleValue>${x}</simpleValue>`;
  const pat = (x) => `<xs:restriction base="xs:string"><xs:pattern value="${x}"/></xs:restriction>`;
  const specs = [];
  for (const ps of [sv("Pset_DoorCommon"), sv("Acme_Door"), sv("Pset_MaterialWood"), pat("Pset_.*"), pat(".*"), sv("Nothing")])
    for (const card of ["required", "optional", "prohibited"]) {
      specs.push(`<specification name="req ${card}" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><attribute><name>${pat(".*")}</name></attribute></applicability><requirements>${prop(ps, "IsExternal", card)}</requirements></specification>`);
    }
  for (const ps of [sv("Pset_DoorCommon"), pat("Acme_.*"), sv("Nothing")])
    specs.push(`<specification name="app" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded">${prop(ps, "IsExternal")}</applicability><requirements><attribute><name>${sv("Name")}</name></attribute></requirements></specification>`);
  const r = check(ids(specs.join("")), m, { audit: false });
  // The reference: every entity through the facets' own tests, no prefilter.
  const doc = parseIds(ids(specs.join("")));
  for (const [i, sp] of doc.specs.entries()) {
    const ctx = { typeMap: null };
    const hits = [...m.entities.values()].filter((e) => sp.applicability.every((f) => f.test(e, m, ctx).ok));
    const f = sp.requirements[0];
    const pass = hits.filter((e) => {
      const t = f.test(e, m, ctx);
      return f.cardinality === "prohibited" ? !t.ok : f.cardinality === "optional" ? t.ok || !!t.absent : t.ok;
    });
    assert.equal(r.specs[i].applicable, hits.length, specs[i]);
    assert.equal(r.specs[i].passed, pass.length, specs[i]);
    assert.deepEqual(r.specs[i].failed.map((x) => x.id), hits.filter((e) => !pass.includes(e)).map((e) => e.id), specs[i]);
  }
  const app = r.specs.filter((s) => s.name === "app").map((s) => s.applicable);
  assert.deepEqual(app, [4, 1, 0], "D1, D2, D3 and the door type; Acme on D1 only; none");
  assert.deepEqual(r.specs.filter((s) => s.name === "req required").map((s) => s.passed), [4, 1, 1, 5, 5, 0]);
});
