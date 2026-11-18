// White space between elements is skipped; a leaf element's text is kept
// exactly (xml.mjs header, eval/xml-whitespace-2026-11-18.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseXml, parseXmlBytes } from "./xml.mjs";
import { parseIfcXml } from "./ifcxml.mjs";
import { parseModel, resources } from "./node.mjs";

const { schemas } = resources();

const both = (s, opts) => [parseXml(s, opts), parseXmlBytes(Buffer.from(s, "utf8"), opts)];

test("a leaf keeps white-space-only text; a parent drops it", () => {
  for (const r of both("<a>\n  <b> </b>\n  <c>\t\n</c>\n  <d/>\n</a>")) {
    assert.equal(r.text, "");
    assert.equal(r.children[0].text, " ");
    assert.equal(r.children[1].text, "\t\n");
    assert.equal(r.children[2].text, "");
  }
});

test("text with content, CDATA and character references are kept", () => {
  for (const r of both("<a>x<b/> <c/> y<d/><![CDATA[ ]]><e/>&#32;</a>")) {
    assert.equal(r.text, "x y  "); // "x", " y", the CDATA space, the &#32; space
  }
  for (const r of both("<a> <b/></a>")) assert.equal(r.text, "");
  for (const r of both("<a> x <b/></a>")) assert.equal(r.text, " x ");
});

test("white space after a child is skipped even when onClose dropped the child", () => {
  const onClose = (n, stack) => stack.length === 2; // drop every child of the root element
  for (const r of both("<a>\n<b>1</b>\n<b>2</b>\n<b> </b>\n</a>", { onClose })) {
    assert.equal(r.children.length, 0);
    assert.equal(r.text, "");
  }
});

test("an indented ifcXML model reads as the same model written flat", () => {
  const ind = readFileSync(new URL("./samples/tiny-house.ifcxml", import.meta.url), "utf8");
  const flat = ind.replace(/>[ \t\r\n]+</g, "><");
  for (const eager of [false, true]) {
    const a = parseIfcXml(flat, schemas.IFC4, { eager });
    const b = parseIfcXml(Buffer.from(ind), schemas.IFC4, { eager });
    assert.deepEqual([...b.entities.keys()], [...a.entities.keys()]);
    for (const [id, e] of a.entities) {
      assert.deepEqual(b.entities.get(id).args, e.args, `#${id}`);
      assert.deepEqual(b.entities.get(id).shallowArgs, e.shallowArgs, `#${id} shallow`);
    }
  }
});

test("an indented ifcXML entity keeps its leaf texts and drops the indentation", () => {
  const x = `<uos>
    <IfcWall id="i1">
      <GlobalId>0abcdefghijklmnopqrstu</GlobalId>
      <Name>  </Name>
      <Description>
      </Description>
    </IfcWall>
  </uos>`;
  for (const r of both(x)) {
    const w = r.children[0];
    assert.equal(r.text, "");
    assert.equal(w.text, "");
    assert.deepEqual(w.children.map((c) => c.text), ["0abcdefghijklmnopqrstu", "  ", "\n      "]);
  }
  // The model reading is unchanged: ifcxml.mjs reads a white-space-only string as "", as before.
  const m = parseModel(Buffer.from(readFileSync(new URL("./samples/tiny-house.ifcxml", import.meta.url))));
  assert.ok(m.entities.size > 0);
});
