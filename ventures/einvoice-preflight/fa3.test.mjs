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
