// A bare \w spelled out as a class every checker reads alike (xsdregex.mjs
// spellWordClass, fix.mjs wordClass, eval/word-class-2026-11-18.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spellWordClass, compileXsdRegex, parseXsdRegex } from "./xsdregex.mjs";
import { checkIds } from "./ids.mjs";
import { fixStructure } from "./fix.mjs";
import { resources } from "./node.mjs";

const m = (p, s) => compileXsdRegex(p).test(s);

test("xsd spelling keeps the XSD meaning exactly", () => {
  const p = spellWordClass("\\w+", "xsd");
  assert.equal(p, "[^\\p{P}\\p{Z}\\p{C}]+");
  for (const s of ["Wall", "Wall+", "90°", "€5", "Våtrom", "٣", "x²", "a-b", "a b", "", "a\tb", "_"]) assert.equal(m(p, s), m("\\w+", s), s);
  const W = spellWordClass("a\\Wb", "xsd");
  for (const s of ["a-b", "a b", "a+b", "aXb"]) assert.equal(m(W, s), m("a\\Wb", s), s);
});

test("letters spelling: letters, digits, underscore", () => {
  const p = spellWordClass("\\w+", "letters");
  assert.equal(p, "[\\p{L}\\p{Nd}_]+");
  assert.ok(m(p, "Våtrom") && m(p, "W_01") && m(p, "٣"));
  assert.ok(!m(p, "Wall+") && !m(p, "90°") && !m(p, "a-b"));
  assert.equal(spellWordClass("\\W", "letters"), "[^\\p{L}\\p{Nd}_]");
});

test("only a bare \\w changes: classes, escapes and subtraction stay", () => {
  assert.equal(spellWordClass("[\\w-]+", "xsd"), null);
  assert.equal(spellWordClass("\\\\w", "xsd"), null); // an escaped backslash, then "w"
  assert.equal(spellWordClass("IFC.*", "letters"), null);
  assert.equal(spellWordClass("[a-z-[\\w]]\\w", "letters"), "[a-z-[\\w]][\\p{L}\\p{Nd}_]");
  assert.equal(spellWordClass("\\[\\w", "letters"), "\\[[\\p{L}\\p{Nd}_]");
  assert.equal(spellWordClass("(\\w|\\d){2}", "xsd"), "([^\\p{P}\\p{Z}\\p{C}]|\\d){2}");
  assert.throws(() => spellWordClass("\\w", "python"));
  for (const r of ["xsd", "letters"]) assert.ok(parseXsdRegex(spellWordClass("\\w+\\.\\W?", r)).ok);
});

const ids = (pattern) => `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
<specification name="s" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="${pattern}"/></xs:restriction></value></attribute></requirements>
</specification></specifications></ids>`;
const model = readFileSync(new URL("./samples/tiny-house.ifc", import.meta.url), "utf8");

test("the audit warns, the repair leaves it unless asked, and either choice audits clean", () => {
  const t = ids("\\w+-\\w+");
  const before = checkIds(t, model, resources());
  assert.ok(before.audit.some((x) => x.code === "pattern-word-class" && x.level === "warning"));
  assert.equal(before.specs[0].status, "pass");
  const none = fixStructure(t);
  assert.equal(none.text, t);
  assert.deepEqual(none.fixes, []);
  for (const wordClass of ["xsd", "letters"]) {
    const r = fixStructure(t, { wordClass });
    assert.equal(r.fixes.length, 1);
    assert.equal(r.fixes[0].code, "pattern-word-class");
    const c = checkIds(r.text, model, resources());
    assert.equal(c.specs[0].status, "pass", wordClass);
    assert.equal(c.audit.length, 0, wordClass);
  }
});

test("with anchors too: one rewrite, both notes", () => {
  const r = fixStructure(ids("^\\w+-\\d{2}$"), { wordClass: "letters" });
  assert.deepEqual(r.fixes.map((x) => x.code).sort(), ["pattern-word-class", "pattern-xsd"]);
  assert.match(r.text, /<xs:pattern value="\[\\p\{L\}\\p\{Nd\}_\]\+-\\d\{2\}"\/>/);
  assert.equal(checkIds(r.text, model, resources()).specs[0].status, "pass");
});

test("cli --fix --word-class", () => {
  const d = mkdtempSync(join(tmpdir(), "wc-"));
  const f = join(d, "s.ids");
  writeFileSync(f, ids("\\w+-\\w+"));
  const out = execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "--fix", f, "--word-class", "xsd"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
  assert.match(out, /\[\^\\p\{P\}\\p\{Z\}\\p\{C\}\]\+-/);
  assert.throws(() => execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "--fix", f, "--word-class", "python"], { stdio: "pipe" }));
});

test("\\s: XSD's four characters, or any space", () => {
  const x = spellWordClass("\\d{2}\\s.*", "xsd"), l = spellWordClass("\\d{2}\\s.*", "letters");
  assert.equal(x, "\\d{2}[\\s].*");
  assert.equal(l, "\\d{2}[\\s\\p{Z}].*");
  for (const s of ["01 Begane grond", "01\tB", "01 Begane grond", "01 B", "01B"]) assert.equal(m(x, s), m("\\d{2}\\s.*", s), JSON.stringify(s));
  assert.ok(!m(x, "01 B") && m(l, "01 B") && m(l, "01 B") && !m(l, "01B"));
  assert.equal(spellWordClass("a\\Sb", "letters"), "a[^\\s\\p{Z}]b");
  assert.equal(spellWordClass("[\\s]", "xsd"), null);
});

test("the audit says XSD's \\w leaves out the underscore, and warns on a bare \\s", () => {
  const w = checkIds(ids("\\w+"), model, resources()).audit.find((x) => x.code === "pattern-word-class");
  assert.match(w.message, /"_"/);
  const s = checkIds(ids("W\\s?-.*"), model, resources()).audit.find((x) => x.code === "pattern-space-class");
  assert.equal(s.level, "warning");
  assert.match(s.message, /no-break space/);
  assert.ok(!m("\\w+", "W_01") && m(spellWordClass("\\w+", "letters"), "W_01"));
});
