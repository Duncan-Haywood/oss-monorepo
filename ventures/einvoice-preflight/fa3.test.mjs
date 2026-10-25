import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFa3, looksLikeFa3, nipValid } from "./fa3.mjs";
import { preflightDocuments } from "./report.mjs";

const read = (f) => readFileSync(new URL(`./examples/${f}`, import.meta.url), "utf8");
const clean = read("fa3-invoice.xml");
const bad = read("fa3-invoice-with-defects.xml");
const rules = (xml) => checkFa3(xml).findings.map((f) => f.rule).sort();

test("NIP check digit", () => {
  assert.ok(nipValid("5260250995"));
  assert.ok(nipValid("5252344078"));
  assert.ok(!nipValid("5260250994"));
  assert.ok(!nipValid("526025099"));
});

test("the clean example is recognised and passes", () => {
  assert.ok(looksLikeFa3(clean));
  assert.ok(!looksLikeFa3("<Invoice xmlns=\"urn:oasis:names:specification:ubl:schema:xsd:Invoice-2\"/>"));
  assert.deepEqual(checkFa3(clean), { findings: [], skipped: [] });
});

test("planted defects are each found", () => {
  // bad NIP, line 2 net 250 against 2 x 100, P_13_1 / P_14_1 / P_15 off, unknown rate 9 on line 3
  assert.deepEqual(rules(bad), ["PL-002", "PL-004", "PL-005", "PL-006", "PL-006", "PL-007", "PL-008"]);
});

test("a foreign-currency invoice needs the tax in PLN", () => {
  const eur = clean.replace("<KodWaluty>PLN", "<KodWaluty>EUR");
  assert.deepEqual(rules(eur), ["PL-011", "PL-011"]);
});

test("correcting invoices skip the totals checks and say so", () => {
  const kor = clean.replace("<RodzajFaktury>VAT", "<RodzajFaktury>KOR").replace("<P_15>1584.00", "<P_15>1.00");
  const r = checkFa3(kor);
  assert.deepEqual(r.findings, []);
  assert.match(r.skipped[0], /correcting/);
});

test("report.mjs routes a FA(3) file to these rules, not the EN 16931 reader", async () => {
  const res = await preflightDocuments([{ name: "fa3.xml", source: bad }]);
  const rep = res.reports[0];
  assert.match(rep.envelope, /FA\(3\)/);
  assert.ok(rep.errors.some((e) => e.rule === "PL-002"));
});

// The schema gate (fa3-xsd.mjs, PL-012..PL-017), read from schemat_FA(3)_v1-0E.xsd by build-fa3-schema.mjs.
const rich = read("fa3-invoice-rich.xml");
const found = (xml) => checkFa3(xml).findings.filter((f) => /^PL-01[2-7]$/.test(f.rule));

test("the schema gate passes the clean and the rich example (both validate with xmllint)", () => {
  assert.deepEqual(checkFa3(rich), { findings: [], skipped: [] });
});

test("an unknown element, a second P_15 and a missing required element are each named", () => {
  assert.deepEqual(found(clean.replace("<P_15>", "<Extra>1</Extra><P_15>")).map((f) => f.rule), ["PL-012"]);
  assert.deepEqual(found(clean.replace("<P_15>1584.00</P_15>", "<P_15>1584.00</P_15><P_15>1584.00</P_15>")).map((f) => f.rule), ["PL-012"]);
  const noRodzaj = found(clean.replace("<RodzajFaktury>VAT</RodzajFaktury>", ""));
  assert.deepEqual(noRodzaj.map((f) => f.rule), ["PL-014"]);
  assert.match(noRodzaj[0].message, /RodzajFaktury is required in Fa/);
});

test("elements out of sequence are PL-013", () => {
  const swapped = clean.replace("<P_1>2026-03-02</P_1>\n    <P_2>FV/2026/03/001</P_2>", "<P_2>FV/2026/03/001</P_2>\n    <P_1>2026-03-02</P_1>");
  const r = found(swapped);
  assert.deepEqual(r.map((f) => f.rule), ["PL-013"]);
  assert.match(r[0].message, /out of place in Fa/);
});

test("values outside the schema's patterns, lengths, dates and code lists are PL-015 and are not echoed", () => {
  const cases = [
    ["<NIP>5260250995</NIP>", "<NIP>52602509</NIP>"],        // NIP pattern
    ["<KodWaluty>PLN", "<KodWaluty>pln"],                    // currency code list
    ["<P_1>2026-03-02</P_1>", "<P_1>2026-03</P_1>"],         // date
    ["<P_13_1>1200.00", "<P_13_1>1200.001"],                  // two decimals
    ["<P_2>FV/2026/03/001", `<P_2>${"X".repeat(300)}`],       // length
    ["<P_8B>10</P_8B>", "<P_8B>ten</P_8B>"],                 // not a number
  ];
  for (const [from, to] of cases) {
    const r = found(clean.replace(from, to));
    assert.deepEqual(r.map((f) => f.rule), ["PL-015"], to);
    assert.ok(!r[0].message.includes("5260") && !r[0].message.includes("ten"));
  }
});

test("the form code's fixed attributes are PL-016", () => {
  const r = found(clean.replace('wersjaSchemy="1-0E"', 'wersjaSchemy="1-0X"'));
  assert.deepEqual(r.map((f) => f.rule), ["PL-016"]);
  assert.deepEqual(found(clean.replace(' kodSystemowy="FA (3)"', "")).map((f) => f.rule), ["PL-016"]);
});

test("a cut-off file is PL-017 and skips the other checks", () => {
  const cut = clean.slice(0, clean.indexOf("</Fa>"));
  const r = checkFa3(cut);
  assert.deepEqual(r.findings.map((f) => f.rule), ["PL-017"]);
  assert.match(r.skipped[0], /cut off/);
});
