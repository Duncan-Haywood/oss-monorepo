// parseIfcXml(bytes) must read a model exactly as parseIfcXml(text) does
// (eval/ifcxml-bytes-2026-11-18.md): same entities in the same order, same
// arguments, same shallow arguments, same notes, lazy geometry read again
// from the bytes; and parseXml(bytes) builds the same tree as parseXml(text),
// apart from offsets, which are byte offsets on the bytes path.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseXml } from "./xml.mjs";
import { parseIfcXml, ifcXmlSchemaId, looksLikeXml } from "./ifcxml.mjs";
import { check, parseModel, readModel, resources } from "./node.mjs";

const { schemas } = resources();
const file = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const enc = (s) => Buffer.from(s, "utf8");
const plain = (s) => new Uint8Array(enc(s)); // a browser's Uint8Array, not a Buffer
const pos = (msgs) => msgs.map((m) => m.replace(/ at (character|byte) \d+/g, " at N"));

// The tree without offsets (at, end), which count characters or bytes.
const shape = (n) => ({ name: n.name, local: n.local, attrs: n.attrs, text: n.text, children: n.children.map(shape) });

function sameEntities(a, b) {
  assert.deepEqual([...b.entities.keys()], [...a.entities.keys()]);
  for (const [id, e] of a.entities) {
    const f = b.entities.get(id);
    assert.equal(f.type, e.type, `${id} type`);
    assert.equal(f.xmlId, e.xmlId, `${id} xmlId`);
    assert.deepEqual(f.shallowArgs, e.shallowArgs, `${id} shallow`);
    assert.deepEqual(f.args, e.args, `${id} args`);
    assert.deepEqual(f.args, e.args, `${id} args read again`);
  }
  assert.deepEqual(pos(b.errors), pos(a.errors));
  assert.equal(b.early, a.early);
}

function same(text, schema) {
  for (const eager of [false, true]) {
    const a = parseIfcXml(text, schema, { eager });
    for (const bytes of [enc(text), plain(text)]) sameEntities(a, parseIfcXml(bytes, schema, { eager }));
  }
}

// Every ifcXML model written out in ifcxml.test.mjs (those with no ${...}).
const fixtures = [...file("ifcxml.test.mjs").matchAll(/`(<\?xml[^`]*)`/g)].map((m) => m[1]).filter((s) => !s.includes("${") && /ifcXML|iso_10303_28/.test(s));

test("the ifcXML fixtures and the sample read the same from bytes as from text", () => {
  assert.ok(fixtures.length >= 5, `${fixtures.length} fixtures`);
  let n = 0;
  for (const xml of [file("samples/tiny-house.ifcxml"), ...fixtures]) {
    const id = ifcXmlSchemaId(xml);
    assert.equal(ifcXmlSchemaId(enc(xml)), id);
    assert.equal(looksLikeXml(enc(xml)), true);
    if (!id) continue;
    same(xml, schemas[id]);
    n++;
  }
  assert.ok(n >= 5, `${n} models compared`);
});

test("the nested IFC4 layout reads the same, and lazy geometry is read again from the bytes", async () => {
  const { writeIfc4Layout } = await import("./eval/ifc4-layout.mjs");
  const { parseStep } = await import("./step.mjs");
  const step = parseStep(file("samples/tiny-house.ifc"), { eager: true });
  const parts = [];
  writeIfc4Layout(step, schemas.IFC4, "IFC4", (s) => parts.push(s));
  const xml = parts.join("");
  same(xml, schemas.IFC4);
  // The IFC2X3 layout keeps top-level geometry as spans, read again from the bytes.
  const flat = fixtures.find((x) => /iso_10303_28/.test(x));
  const b = parseIfcXml(enc(flat), schemas.IFC2X3);
  const lazy = [...b.entities.values()].filter((e) => e._s !== undefined);
  assert.ok(lazy.length > 0, "some geometry is lazy");
  const a = parseIfcXml(flat, schemas.IFC2X3);
  for (const e of lazy) assert.deepEqual(e.args, a.entities.get(e.id).args, `${e.id}`);
});

const UNI = `\uFEFF<?xml version="1.0" encoding="utf-8"?>
<!-- a comment with ü and <tags> -->
<ifcXML xmlns="http://www.buildingsmart-tech.org/ifcXML/IFC4/final" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <IfcProject id="p1" GlobalId="0YvctVUKr0kugbFTf53O9L" Name="Café 日本 \u{1F3E0}" Description="a &amp; b &#x00FC; &#252;">
    <IsDecomposedBy><IfcRelAggregates id="r1" GlobalId="1YvctVUKr0kugbFTf53O9L"><RelatedObjects>
      <IfcSite id="s1" GlobalId="2YvctVUKr0kugbFTf53O9L" Name='Grundstück "Süd"' LongName="  spaced  ">
        <ObjectPlacement><IfcLocalPlacement id="lp1"><RelativePlacement><IfcAxis2Placement3D id="ax1"><Location><IfcCartesianPoint><Coordinates>1.5 2,5 3</Coordinates></IfcCartesianPoint></Location></IfcAxis2Placement3D></RelativePlacement></IfcLocalPlacement></ObjectPlacement>
      </IfcSite>
    </RelatedObjects></IfcRelAggregates></IsDecomposedBy>
  </IfcProject>
  <IfcWall id="w1" GlobalId="3YvctVUKr0kugbFTf53O9L" Name="Wand ß"><Description><![CDATA[x < y & ä]]></Description><ObjectPlacement ref="lp1" xsi:nil="true"/></IfcWall>
</ifcXML>`;

test("raw UTF-8, a byte order mark, entities, CDATA and comments read the same", () => {
  assert.deepEqual(shape(parseXml(enc(UNI))), shape(parseXml(UNI)));
  assert.equal(ifcXmlSchemaId(enc(UNI)), "IFC4");
  same(UNI, schemas.IFC4);
  const p = parseIfcXml(enc(UNI), schemas.IFC4);
  const names = [...p.entities.values()].map((e) => e.args[2]).filter((v) => typeof v === "string");
  assert.ok(names.includes("Café 日本 \u{1F3E0}") && names.includes('Grundstück "Süd"') && names.includes("Wand ß"), names.join(" | "));
});

test("byte offsets: a span is where its element's bytes are", () => {
  const b = enc(UNI);
  const root = parseXml(b, { spans: true });
  const walk = (n) => {
    if (n.at !== undefined) assert.equal(b.subarray(n.at, n.at + 1 + n.name.length).toString("utf8"), "<" + n.name);
    n.children.forEach(walk);
  };
  walk(root);
});

test("a file cut short fails the same way from bytes as from text", () => {
  const cuts = [];
  for (const xml of [UNI, fixtures[0]]) for (let k = 1; k < 60; k++) cuts.push(xml.slice(0, Math.floor((xml.length * k) / 60)));
  cuts.push("<a><!-- open", "<a><![CDATA[ open", "<?xml open", "<a b='x' <", "< a/>", "<a></b>", "plain text", "");
  for (const t of cuts) {
    let ta, tb;
    try { ta = shape(parseXml(t)); } catch (e) { ta = pos([e.message])[0]; }
    try { tb = shape(parseXml(enc(t))); } catch (e) { tb = pos([e.message])[0]; }
    assert.deepEqual(tb, ta, JSON.stringify(t.slice(-40)));
  }
});

test("parseModel, check and readModel take an .ifcxml's bytes", async () => {
  const text = file("samples/tiny-house.ifcxml");
  const m = parseModel(enc(text));
  assert.equal(m.format, "ifcXML");
  assert.equal(m.entities.size, parseModel(text).entities.size);
  const ids = file("samples/coordination-basics.ids.xml");
  const v = (r) => r.specs.map((s) => [s.name, s.status, s.applicable, s.passed, s.failed.length]);
  assert.deepEqual(v(check(ids, enc(text))), v(check(ids, text)));
  const r = await readModel(new URL("samples/tiny-house.ifcxml", import.meta.url).pathname);
  assert.deepEqual(v(check(ids, r.bytes)), v(check(ids, text)));
});
