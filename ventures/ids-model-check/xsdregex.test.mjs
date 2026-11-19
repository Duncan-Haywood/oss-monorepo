// XML Schema regex reading of IDS patterns (xsdregex.mjs), the audit's
// pattern findings and the repair (eval/xsd-regex-2026-11-18.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseXsdRegex, compileXsdRegex, repairXsdRegex } from "./xsdregex.mjs";
import { checkIds } from "./ids.mjs";
import { fixStructure } from "./fix.mjs";
import { resources } from "./node.mjs";

const m = (p, s) => compileXsdRegex(p).test(s);

test("XSD meaning: whole value, ^ and $ are characters, . skips line breaks", () => {
  assert.ok(m("IFC.*SYSTEM", "IFCPIPESYSTEM"));
  assert.ok(!m("IFC.*", "xIFCWALL"));
  assert.ok(!m("^IFC.*SYSTEM", "IFCPIPESYSTEM"));
  assert.ok(m("^IFC.*SYSTEM", "^IFCPIPESYSTEM"));
  assert.ok(m("a$", "a$"));
  assert.ok(!m(".", "\n"));
  assert.ok(m("a|b", "b") && !m("a|b", "ab"));
});

test("XSD classes: \\d any digit, \\w the XSD set, \\s, \\i \\c, subtraction, blocks", () => {
  assert.ok(m("\\d", "٣"));
  assert.ok(m("\\w+", "Våtrom") && m("\\w+", "Wall+") && !m("\\w", "-"));
  assert.ok(m("\\s", " ") && !m("\\s", " "));
  assert.ok(m("\\i\\c*", "_a-1.b") && !m("\\i", "1"));
  assert.ok(m("[a-z-[aeiou]]+", "xyz") && !m("[a-z-[aeiou]]", "e"));
  assert.ok(m("\\p{IsGreek}+", "Ωμ") && !m("\\p{IsGreek}", "a"));
  assert.ok(m("\\p{Lu}\\P{Lu}", "Ab"));
  assert.ok(m("[a-]", "-") && m("[-a]", "-"));
  assert.ok(m("x{2,3}", "xxx") && !m("x{2}", "xxx") && m("x{2,}", "xxxxx"));
});

test("not XSD: each with the place and what to write", () => {
  for (const [p, re] of [["(?:a|b)", /non-capturing/], ["a*?", /lazy/], ["a{,3}", /\{0,3\}/], ["\\bab", /word boundary/], ["(a)\\1", /back-reference/],
    ["[abc", /not closed/], ["a)", /no "\("/], ["[]", /empty/], ["[z-a]", /backwards/], ["\\p{Foo}", /not an XSD category/], ["[a-c-d]", /middle/], ["*a", /nothing before/], ["a{3,1}", /below/], ["\\x41", /hex/]]) {
    const r = parseXsdRegex(p);
    assert.equal(r.ok, false, p);
    assert.match(r.error, re, p);
  }
});

test("escaped punctuation XSD 1.0 lacks reads as the character, with a note", () => {
  const r = parseXsdRegex("n\\/a");
  assert.ok(r.ok);
  assert.ok(m("n\\/a", "n/a"));
  assert.deepEqual(r.notes.map((n) => n.code), ["pattern-escape"]);
});

test("repair: anchors, (?: groups, needless backslashes, {,n}", () => {
  assert.equal(repairXsdRegex("^IFC.*SYSTEM"), "IFC.*SYSTEM");
  assert.equal(repairXsdRegex("^a|b$"), "a|b");
  assert.equal(repairXsdRegex("^(?:a|b)$"), "(a|b)");
  assert.equal(repairXsdRegex("n\\/a"), "n/a");
  assert.equal(repairXsdRegex("a{,2}"), "a{0,2}");
  assert.equal(repairXsdRegex("a\\$"), null);
  assert.equal(repairXsdRegex("IFC.*"), null);
});

const ids = (pattern) => `<?xml version="1.0" encoding="UTF-8"?>
<ids xmlns="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications>
<specification name="s" ifcVersion="IFC4"><applicability minOccurs="0" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability>
<requirements><attribute><name><simpleValue>Name</simpleValue></name><value><xs:restriction base="xs:string"><xs:pattern value="${pattern}"/></xs:restriction></value></attribute></requirements>
</specification></specifications></ids>`;
const model = readFileSync(new URL("./samples/tiny-house.ifc", import.meta.url), "utf8");
const run = (p) => checkIds(ids(p), model, resources());

test("checker: same verdicts as IfcTester 0.9.0 on tiny-house walls (W-01, W-02, P-01)", () => {
  // IfcTester: "(?:.*)" raises; "^W.*" and "^.*$" fail; "[WP]-.*" passes.
  const a = run("(?:.*)");
  assert.equal(a.specs[0].status, "invalid");
  assert.ok(a.audit.some((x) => x.code === "pattern-not-xsd" && x.fix === "(.*)"));
  const b = run("^W.*");
  assert.equal(b.specs[0].status, "fail");
  assert.ok(b.audit.some((x) => x.code === "pattern-anchor" && x.level === "warning" && x.fix === "W.*"));
  assert.equal(run("[WP]-.*").specs[0].status, "pass");
  assert.equal(run("[WP]-.*").audit.length, 0);
});

test("fixStructure rewrites the pattern and the result audits clean", () => {
  const r = fixStructure(ids("^(?:W-01|W-02|P-01)$"));
  assert.ok(r.fixes.some((x) => x.code === "pattern-xsd"));
  assert.match(r.text, /<xs:pattern value="\(W-01\|W-02\|P-01\)"\/>/);
  const c = checkIds(r.text, model, resources());
  assert.equal(c.specs[0].status, "pass");
  assert.equal(c.audit.length, 0);
});
