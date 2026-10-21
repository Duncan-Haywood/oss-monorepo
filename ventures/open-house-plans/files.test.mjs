import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32 as zlibCrc } from "node:zlib";
import { designFiles } from "./engine.mjs";
import { zip, crc32 } from "./zip.mjs";
import { guid } from "./ifc.mjs";

const r = designFiles({ beds: 3, baths: 2, garage: 1, style: "craftsman", foundation: "crawl" });
const f = r.files;

test("a plan set has every file, each non-empty", () => {
  for (const name of ["sheet.svg", "plan.svg", "elevations.svg", "view.svg", "plan.dxf", "model.ifc", "model.obj", "model.mtl", "bom.csv", "openings.csv", "cost.csv", "rooms.csv", "design.json", "LICENSE.txt", "README.md"]) {
    assert.ok(f[name] && f[name].length > 100, name);
  }
});

test("SVGs are well-formed documents and say not for construction on the sheet", () => {
  for (const name of ["sheet.svg", "plan.svg", "elevations.svg", "view.svg"]) {
    const s = f[name];
    assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(s.trim(), /<\/svg>$/);
    assert.doesNotMatch(s, /NaN|undefined|Infinity/, name);
    // balanced tags for the elements we write
    for (const tag of ["g", "svg"]) assert.equal((s.match(new RegExp(`<${tag}[ >]`, "g")) || []).length, (s.match(new RegExp(`</${tag}>`, "g")) || []).length, `${name} <${tag}>`);
  }
  assert.match(f["sheet.svg"], /NOT FOR CONSTRUCTION/);
});

test("the IFC file is IFC4 STEP with spaces for every room, windows and doors", () => {
  const s = f["model.ifc"];
  assert.match(s, /^ISO-10303-21;/);
  assert.match(s, /FILE_SCHEMA\(\('IFC4'\)\);/);
  assert.match(s, /END-ISO-10303-21;\s*$/);
  const design = JSON.parse(f["design.json"]);
  assert.equal((s.match(/=IFCSPACE\(/g) || []).length, design.geometry.rooms.length);
  assert.ok((s.match(/=IFCWINDOW\(/g) || []).length >= 8);
  assert.ok((s.match(/=IFCDOOR\(/g) || []).length >= 2);
  assert.equal((s.match(/=IFCROOF\(/g) || []).length, 1);
  // every reference points at a defined entity
  const defined = new Set([...s.matchAll(/^#(\d+)=/gm)].map((m) => m[1]));
  for (const m of s.matchAll(/#(\d+)/g)) assert.ok(defined.has(m[1]), `#${m[1]} is not defined`);
  assert.doesNotMatch(s, /NaN|undefined/);
  // GlobalIds are unique, 22 characters of the IFC alphabet
  const ids = [...s.matchAll(/\('([0-9A-Za-z_$]{22})',\$/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(guid("x").length, 22);
});

test("the OBJ references only vertices it defines and names its materials", () => {
  let v = 0;
  for (const line of f["model.obj"].split("\n")) {
    if (line.startsWith("v ")) v++;
    if (line.startsWith("f ")) for (const t of line.split(" ").slice(1)) assert.ok(Number(t) >= 1 && Number(t) <= v);
  }
  assert.ok(v > 1000);
  const used = new Set([...f["model.obj"].matchAll(/^usemtl (\w+)/gm)].map((m) => m[1]));
  for (const m of used) assert.match(f["model.mtl"], new RegExp(`newmtl ${m}\\b`));
});

test("the DXF is R12 with layers, entities and an EOF", () => {
  const s = f["plan.dxf"];
  assert.match(s, /^0\nSECTION\n2\nHEADER/);
  assert.match(s, /AC1009/);
  assert.match(s, /\n0\nEOF\n$/);
  for (const layer of ["A-WALL", "A-DOOR", "A-GLAZ", "A-ANNO-TEXT"]) assert.match(s, new RegExp(`\\n2\\n${layer}\\n`));
  assert.ok((s.match(/\n0\nPOLYLINE\n/g) || []).length > 20);
});

test("CSVs have headers and the bill of materials covers framing to fixtures", () => {
  const bom = f["bom.csv"];
  assert.match(bom.split("\n")[0], /^Section,Item,Specification,Quantity,Unit,Note$/);
  for (const sec of ["Walls", "Roof", "Floor", "Foundation", "Insulation", "Interior", "Plumbing"]) assert.match(bom, new RegExp(`^${sec},`, "m"), sec);
  assert.match(bom, /Floor joists/);
  assert.match(f["openings.csv"], /Window, casement \(egress\)/);
  const cost = f["cost.csv"].trim().split("\n");
  assert.ok(cost.length >= 9);
});

test("design.json round-trips the brief and carries the licence", () => {
  const d = JSON.parse(f["design.json"]);
  assert.equal(d.brief.style, "craftsman");
  assert.equal(d.generator.license, "CC0 1.0 Universal (public domain dedication)");
  assert.ok(d.geometry.walls.length > 10 && d.geometry.openings.length > 10);
  const again = designFiles(d.brief).files["design.json"];
  assert.equal(again, f["design.json"]);
});

test("README and LICENSE state CC0 and the not-for-construction limits", () => {
  assert.match(f["LICENSE.txt"], /CC0 1\.0 Universal/);
  assert.match(f["LICENSE.txt"], /not a warranty/);
  assert.match(f["README.md"], /\*\*Not for construction\.\*\*/);
  assert.match(f["README.md"], /\| pass \|/);
});

test("the zip writer makes a valid stored archive", () => {
  const enc = new TextEncoder();
  assert.equal(crc32(enc.encode("hello world")), zlibCrc("hello world"));
  const bytes = zip([{ name: "a/b.txt", data: "hello" }, { name: "a/c.svg", data: f["view.svg"] }]);
  const dv = new DataView(bytes.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  const end = bytes.length - 22;
  assert.equal(dv.getUint32(end, true), 0x06054b50);
  assert.equal(dv.getUint16(end + 10, true), 2);
  // walk the central directory and check each entry's data and crc
  let p = dv.getUint32(end + 16, true);
  for (let i = 0; i < 2; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 24, true), nameLen = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true);
    const lnl = dv.getUint16(off + 26, true);
    const data = bytes.subarray(off + 30 + lnl, off + 30 + lnl + size);
    assert.equal(crc32(data), crc);
    p += 46 + nameLen;
  }
});
