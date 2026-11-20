import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIds } from "./ids.mjs";
import { compileXsdRegex } from "./xsdregex.mjs";
import { compareLanguages, restrictionLanguage, languageWithin, languageEmpty, patternNfa } from "./pattern-lang.mjs";

const NS = "http://standards.buildingsmart.org/IDS";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const val = (inner) => parseIds(`<?xml version="1.0"?><ids xmlns="${NS}" xmlns:xs="http://www.w3.org/2001/XMLSchema"><info><title>t</title></info><specifications><specification name="v" ifcVersion="IFC4"><applicability minOccurs="1" maxOccurs="unbounded"><entity><name><simpleValue>IFCWALL</simpleValue></name></entity></applicability><requirements><attribute><name><simpleValue>Name</simpleValue></name><value>${inner}</value></attribute></requirements></specification></specifications></ids>`).specs[0].requirements[0].value;
const pat = (...ps) => val(`<xs:restriction base="xs:string">${ps.map((p) => `<xs:pattern value="${esc(p)}"/>`).join("")}</xs:restriction>`);
const enumv = (...vs) => val(`<xs:restriction base="xs:string">${vs.map((v) => `<xs:enumeration value="${esc(v)}"/>`).join("")}</xs:restriction>`);
const simple = (s) => val(`<simpleValue>${esc(s)}</simpleValue>`);
const cmp = (a, b) => compareLanguages(a, b);

test("a narrowed pattern asks more, with a value that used to pass", () => {
  const r = cmp(pat("D-[0-9]+"), pat("D-[0-9]{2}"));
  assert.equal(r.effect, "tighter");
  assert.equal(r.nowPasses, undefined);
  assert.match(r.nowFails, /^D-[0-9]$|^D-[0-9]{3,}$/);
  assert.ok(compileXsdRegex("D-[0-9]+").test(r.nowFails) && !compileXsdRegex("D-[0-9]{2}").test(r.nowFails));
  assert.equal(cmp(pat("D-[0-9]{2}"), pat("D-[0-9]+")).effect, "looser");
});

test("equal languages written differently are the same", () => {
  assert.equal(cmp(pat("[0-9][0-9]"), pat("[0-9]{2}")).effect, "same");
  assert.equal(cmp(pat("(a|b)*"), pat("(a*b*)*")).effect, "same");
  assert.equal(cmp(pat("a+"), pat("aa*")).effect, "same");
  assert.equal(cmp(pat("[a-z-[aeiou]]"), pat("[b-df-hj-np-tv-z]")).effect, "same");
  // Two pattern facets are alternatives, as ids.mjs reads them.
  assert.equal(cmp(pat("A", "B"), pat("[AB]")).effect, "same");
});

test("neither contains the other: examples both ways", () => {
  const r = cmp(pat("EI[0-9]+"), pat("REI[0-9]+"));
  assert.equal(r.effect, "changed");
  assert.equal(r.nowFails, "EI0");
  assert.equal(r.nowPasses, "REI0");
});

test("XSD meaning: dot is not a line end, \\d is any Unicode digit, ^ is a character", () => {
  assert.equal(cmp(val(""), pat(".*")).effect, "tighter");
  assert.equal(cmp(val(""), pat(".*")).nowFails, "\n");
  assert.equal(cmp(pat("[0-9]"), pat("\\d")).effect, "looser");
  assert.ok(/\p{Nd}/u.test(cmp(pat("[0-9]"), pat("\\d")).nowPasses));
  const r = cmp(pat("^A"), pat("A"));
  assert.equal(r.effect, "changed");
  assert.equal(r.nowFails, "^A");
});

test("Unicode categories and blocks", () => {
  assert.equal(cmp(pat("\\p{L}+"), pat("\\p{Lu}+")).effect, "tighter");
  assert.equal(cmp(pat("\\p{IsBasicLatin}"), pat("[a-z]")).effect, "tighter");
  assert.equal(cmp(pat("\\w"), pat("[^\\p{P}\\p{Z}\\p{C}]")).effect, "same");
  assert.equal(cmp(pat("\\S"), pat("[^ \\t\\n\\r]")).effect, "same");
});

test("enumerations, simple values and patterns compare with each other", () => {
  assert.equal(cmp(enumv("EI30", "EI60"), pat("EI[0-9]+")).effect, "looser");
  assert.equal(cmp(pat("EI[0-9]+"), enumv("EI30", "EI60")).effect, "tighter");
  assert.equal(cmp(simple("EI60"), pat("EI(30|60)")).effect, "looser");
  const r = cmp(enumv("EI30", "E90"), pat("EI[0-9]+"));
  assert.equal(r.effect, "changed");
  assert.equal(r.nowFails, "E90");
  // An enumeration and a pattern together: values in both.
  const both = val(`<xs:restriction base="xs:string"><xs:enumeration value="A1"/><xs:enumeration value="B1"/><xs:pattern value="A.*"/></xs:restriction>`);
  assert.equal(cmp(both, simple("A1")).effect, "same");
});

test("length facets", () => {
  const len = (inner) => val(`<xs:restriction base="xs:string">${inner}</xs:restriction>`);
  assert.equal(cmp(len(`<xs:maxLength value="10"/>`), len(`<xs:maxLength value="8"/>`)).effect, "tighter");
  assert.equal(cmp(len(`<xs:maxLength value="8"/>`), len(`<xs:maxLength value="8"/><xs:pattern value="[A-Z]+"/>`)).effect, "tighter");
  assert.equal(cmp(pat("[A-Z]{2,4}"), len(`<xs:pattern value="[A-Z]+"/><xs:minLength value="2"/><xs:maxLength value="4"/>`)).effect, "same");
  assert.equal(cmp(len(`<xs:length value="3"/>`), len(`<xs:minLength value="3"/><xs:maxLength value="3"/>`)).effect, "same");
});

test("not exact: bounds, numeric bases, non-XSD patterns", () => {
  assert.equal(restrictionLanguage(val(`<xs:restriction base="xs:double"><xs:minInclusive value="0"/></xs:restriction>`)), null);
  assert.equal(restrictionLanguage(val(`<xs:restriction base="xs:integer"><xs:pattern value="[0-9]+"/></xs:restriction>`)), null);
  assert.equal(restrictionLanguage(pat("(?:A)")), null);
  assert.equal(cmp(pat("(?:A)"), pat("A")), null);
  assert.equal(patternNfa("a\\"), null);
});

test("big counted repeats stay under the caps or give up", () => {
  assert.equal(cmp(pat("[0-9]{1,200}"), pat("[0-9]{1,199}")).effect, "tighter");
  assert.equal(cmp(pat("[0-9]{1,200}"), pat("[0-9]{1,199}")).nowFails, "0".repeat(200));
  assert.equal(restrictionLanguage(pat("((a{1,100}){1,100}){1,100}")), null);
});

test("an empty language is within anything", () => {
  const none = val(`<xs:restriction base="xs:string"><xs:enumeration value="A"/><xs:pattern value="B"/></xs:restriction>`);
  assert.equal(languageEmpty(restrictionLanguage(none)), true);
  assert.equal(languageEmpty(restrictionLanguage(pat("B"))), false);
  assert.deepEqual(languageWithin(restrictionLanguage(none), restrictionLanguage(pat("Z"))), { within: true });
});

test("examples agree with the XSD matcher on a pattern zoo", () => {
  const zoo = ["[A-Z]{2}-[0-9]{3}", "[A-Z]{2}-\\d{3}", "(EI|REI)[0-9]{2,3}", "[0-9]+(\\.[0-9]+)?", "\\p{Lu}\\p{Ll}*", "[^_]+", "[a-zA-Z0-9_\\-]+", ".{1,5}", "Wall.*|Muur.*", "\\i\\c*"];
  for (const a of zoo) for (const b of zoo) {
    const r = cmp(pat(a), pat(b));
    assert.ok(r, `${a} vs ${b}`);
    const ra = compileXsdRegex(a), rb = compileXsdRegex(b);
    if (r.nowFails !== undefined) assert.ok(ra.test(r.nowFails) && !rb.test(r.nowFails), `${a} -> ${b}: ${JSON.stringify(r.nowFails)}`);
    if (r.nowPasses !== undefined) assert.ok(!ra.test(r.nowPasses) && rb.test(r.nowPasses), `${a} -> ${b}: ${JSON.stringify(r.nowPasses)}`);
    if (a === b) assert.equal(r.effect, "same");
  }
});

test("random patterns against brute force over every short string", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
  const gen = (d) => {
    const k = d > 2 ? rnd(4) : rnd(9);
    if (k < 4) return ["a", "b", "[ab]", "[^a]", ".", "c"][rnd(6)];
    if (k === 4) return gen(d + 1) + gen(d + 1);
    if (k === 5) return "(" + gen(d + 1) + "|" + gen(d + 1) + ")";
    if (k === 6) return "(" + gen(d + 1) + ")" + ["*", "+", "?"][rnd(3)];
    if (k === 7) { const lo = rnd(3); return "(" + gen(d + 1) + "){" + lo + "," + (lo + rnd(3)) + "}"; }
    return gen(d + 1) + gen(d + 1) + gen(d + 1);
  };
  const strs = [""];
  for (let n = 1; n <= 5; n++) for (const s of strs.filter((x) => x.length === n - 1)) for (const c of "abc") strs.push(s + c);
  let pairs = 0;
  for (let k = 0; k < 400; k++) {
    const a = gen(0), b = gen(0);
    const ra = compileXsdRegex(a), rb = compileXsdRegex(b);
    const r = languageWithin({ nfas: [patternNfa(b)] }, { nfas: [patternNfa(a)] });
    assert.ok(r, `${b} in ${a}`);
    const witness = strs.find((s) => rb.test(s) && !ra.test(s));
    if (witness !== undefined) assert.equal(r.within, false, `${b} in ${a}: ${witness}`);
    if (!r.within) {
      assert.ok(rb.test(r.example) && !ra.test(r.example), `${b} in ${a}: ${JSON.stringify(r.example)}`);
      if (witness !== undefined) assert.ok([...r.example].length <= [...witness].length, "the example is a shortest one");
    }
    pairs++;
  }
  assert.equal(pairs, 400);
});
