// INV-065 in the Flux 10 and CDAR readers: a number or date holding a no-break space.
// Added 2026-11-17; eval/french-whitespace-2026-11-17.md (on 12 Flux 10 copies FNFE's
// rules stop SaxonC on the whole file; the plain route said only G1.14, with no field).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flux10Findings, readFlux10 } from "./flux10.mjs";
import { cdarFindings, readCdar } from "./cdar.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const inv065 = (findings) => findings.filter((f) => f.rule === "INV-065");
const once = (text, from, to) => {
  assert.equal(text.split(from).length, 2, `exactly one ${from}`);
  return text.replace(from, to);
};
const flux = (xml) => flux10Findings(readFlux10(xml));
const cdar = (xml) => cdarFindings(readCdar(xml)).findings;
const B2C = read("./fixtures/flux10/b2c-transactions.xml");
const CDV = read("./fixtures/fr-fnfe/cdar/UC2_F202500004_02-CDV-213_Rejetee.xml");

test("the fixtures draw no INV-065", () => {
  for (const f of ["b2c-transactions", "international-invoices", "payments"]) assert.deepEqual(inv065(flux(read(`./fixtures/flux10/${f}.xml`))), [], f);
  assert.deepEqual(inv065(cdar(CDV)), []);
});

test("Flux 10: a no-break space in an amount is named, with its path", () => {
  for (const space of [" ", "&#160;", " "]) {
    const got = inv065(flux(once(B2C, "<TaxableAmount>1000.00<", `<TaxableAmount>1000.00${space}<`)));
    assert.equal(got.length, 1, JSON.stringify(space));
    assert.match(got[0].path, /\/TaxableAmount\[1\]$/);
    assert.match(got[0].message, /TaxableAmount "1000\.00\[U\+[0-9A-F]{4}\]"/);
    assert.match(got[0].message, /may stop on the whole file or reject the value/);
    assert.equal(got[0].source, "flux10");
  }
});

test("CDAR: a percent or boolean is named; identifiers and format-204 date-times are not", () => {
  assert.equal(inv065(cdar(once(CDV, "<udt:Indicator>false<", "<udt:Indicator>false <"))).length, 1);
  assert.deepEqual(inv065(cdar(CDV.replaceAll(">100000009</ram:GlobalID>",">100000009 </ram:GlobalID>"))), []);
  assert.deepEqual(inv065(cdar(once(CDV, ">20250701161500<", ">20250701161500 <"))), []);
});

test("an ordinary trailing space is not INV-065", () => {
  assert.deepEqual(inv065(flux(once(B2C, "<TaxableAmount>1000.00<", "<TaxableAmount>1000.00 <"))), []);
});
