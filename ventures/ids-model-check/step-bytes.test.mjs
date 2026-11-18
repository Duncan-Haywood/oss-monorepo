// parseStep(bytes) must read a file exactly as parseStep(text) does
// (eval/step-bytes-2026-11-18.md): same entities in the same order, same
// arguments, same shallow arguments, same errors apart from their positions,
// which are byte offsets on the bytes path.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStep } from "./step.mjs";
import { parseModel, readModel } from "./node.mjs";
import { stepLines } from "./ci.mjs";

const enc = (s) => Buffer.from(s, "utf8");
const pos = (msgs) => msgs.map((m) => m.replace(/ at \d+/g, " at N"));

function same(text, opts = {}) {
  const a = parseStep(text, opts), b = parseStep(enc(text), opts);
  assert.equal(b.schema, a.schema);
  assert.deepEqual([...b.entities.keys()], [...a.entities.keys()]);
  for (const [id, e] of a.entities) {
    const f = b.entities.get(id);
    assert.equal(f.type, e.type, `#${id} type`);
    assert.deepEqual(f.args, e.args, `#${id} args`);
    if ("shallowArgs" in e) assert.deepEqual(f.shallowArgs, e.shallowArgs, `#${id} shallow`);
  }
  assert.deepEqual(pos(b.errors), pos(a.errors));
  return b;
}

const HEAD = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n";

test("the sample models read the same from bytes", () => {
  for (const f of ["samples/tiny-house.ifc"]) {
    const text = readFileSync(new URL(f, import.meta.url), "utf8");
    same(text);
    same(text, { eager: true });
  }
});

test("comments, complex instances, escapes and non-ASCII text", () => {
  const text = HEAD + [
    "/* #9=IFCWALL('commented out'); */",
    "#1=IFCWALL('2O2Fr$t4X7Zf8NOew3FLOH',$,'Wand \\X2\\00FC\\X0\\ und Tür ünd 日本 😀',.T.,(#2,#3),*,.NOTDEFINED.,-1.5E-3);",
    "#2 = IFCLABEL ( 'a''b' ) ;",
    "#3=(IFCA('#4=IFCB(1);')IFCB(2));",
    "#5=IFCPROPERTYSINGLEVALUE('x\\S\\'',$,IFCLABEL('§ ok'),$);",
    "#6=IFCCARTESIANPOINT((0.,1.,2.));",
    "##7=IFCX(1);",
    "#12345678901234567=IFCY(1);",
    "#8=ifcwall($);",
  ].join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n";
  const b = same(text);
  assert.equal(b.entities.get(1).args[2], "Wand ü und Tür ünd 日本 😀");
  assert.equal(b.entities.has(4), false, "not mined from the complex instance");
  assert.equal(b.entities.has(9), false, "not mined from the comment");
  assert.equal(b.entities.get(8).type, "IFCWALL");
  same(text, { eager: true });
});

test("a file cut short and broken records", () => {
  same(HEAD + "#1=IFCWALL('a',(1,2);\n#2=IFCWALL(#,1);\n#3=IFCWALL('open");
  same(HEAD + "#1=IFCWALL(1)\n#2=IFCWALL(2)");
  same(HEAD + "#1=IFCWALL(1);\n/* never closed");
  assert.throws(() => parseStep(enc("ISO-10303-21;\nHEADER;ENDSEC;\n#1=X(1);")), /no DATA section/);
});

test("a plain Uint8Array reads as a Buffer does", () => {
  const text = HEAD + "#1=IFCWALL('Tür',$);\n";
  const u = new Uint8Array(enc(text));
  assert.equal(parseStep(u).entities.get(1).args[0], "Tür");
});

test("readModel's bytes: same report, ifcXML and .ifczip too", async () => {
  for (const f of ["samples/tiny-house.ifc", "samples/tiny-house.ifcxml", "samples/tiny-house.ifczip"]) {
    const m = await readModel(new URL(f, import.meta.url).pathname);
    assert.ok(m.bytes instanceof Uint8Array);
    const a = parseModel(m.text), b = parseModel(m.bytes);
    assert.equal(b.format, a.format, f);
    assert.equal(b.entities.size, a.entities.size, f);
    assert.deepEqual([...b.byType.keys()], [...a.byType.keys()], f);
  }
});

test("stepLines reads the same lines from bytes", () => {
  const text = HEAD + "#1=IFCWALL($);\n  #22 = IFCDOOR($);\n#3=IFCX('ü');\n#4=IFCY($);\n";
  const ids = [1, 22, 4, 99];
  assert.deepEqual([...stepLines(enc(text), ids)], [...stepLines(text, ids)]);
  assert.deepEqual([...stepLines(enc(text), ids)].length, 3);
});
