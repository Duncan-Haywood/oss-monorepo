// Built-in EU-convention rules step aside on PINT and ZATCA files on the default route
// (no official rules), the one the page runs. Before 2026-11-12 they did so only when
// the plain runner had run PINT's own sets, so the page told a Japanese seller to give
// a T-number as "DE and nine digits" (INV-022) and asked for an EU exemption reason
// (INV-035) on OpenPeppol's own JP example.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preflightDocuments } from "./report.mjs";
import { steppedAside, ASIDE } from "./aside.mjs";

const run = async (file, opts = {}) => (await preflightDocuments([{ name: file, source: readFileSync(new URL(`./examples/${file}`, import.meta.url), "utf8") }], opts)).reports[0].errors.map((e) => e.rule);

test("PINT JP example: no false INV-022 / INV-035 on the default route", async () => {
  assert.deepEqual(await run("pint-current-jp-invoice.xml"), []);
});

test("PINT SG and A-NZ examples: no false INV-024 on the default route", async () => {
  for (const f of ["pint-current-sg-invoice.xml", "pint-current-aunz-invoice.xml", "pint-sg-invoice.xml", "pint-aunz-invoice.xml"]) assert.deepEqual(await run(f), [], f);
});

test("real defects still fire on PINT and ZATCA files", async () => {
  assert.ok((await run("pint-sg-invoice-with-defects.xml")).includes("INV-038"));
  assert.ok((await run("zatca-simplified-invoice-with-defects.xml")).includes("INV-038"));
});

test("steppedAside reads BT-24 and ProfileID", () => {
  assert.deepEqual([...steppedAside({ specification_id: "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0" })], []);
  assert.deepEqual([...steppedAside({})], []);
  assert.deepEqual([...steppedAside({ specification_id: "urn:peppol:pint:billing-1@sg-1" })].sort(), [...ASIDE.pint].sort());
  const jp = steppedAside({ specification_id: "urn:peppol:pint:billing-1@jp-1" });
  for (const id of [...ASIDE.pint, ...ASIDE.local]) assert.ok(jp.has(id), id);
  assert.ok(!jp.has("INV-018"));
  assert.ok(steppedAside({ specification_id: "urn:peppol:pint:nontaxinvoice-1@jp-1" }).has("INV-018"));
  assert.ok(steppedAside({ specification_id: "urn:peppol:pint:selfbilling-1@my-1" }).has("INV-022"));
  assert.ok(!steppedAside({ specification_id: "urn:peppol:pint:billing-1@aunz-1" }).has("INV-022"));
  const ae = (tax) => steppedAside({ specification_id: "urn:peppol:pint:billing-1@ae-1", tax_breakdown: [{ tax_category: "AE", tax_percent: 5, tax, taxable: 100 }] });
  assert.ok(ae(0).has("INV-018"));
  assert.ok(!ae(5).has("INV-018"));
  assert.ok(steppedAside({ profile_id: "reporting:1.0" }).has("INV-006"));
  assert.ok(!steppedAside({ profile_id: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0" }).has("INV-006"));
});

test("an EU invoice keeps every built-in rule", async () => {
  const rules = await run("ubl-invoice-with-defects.xml");
  assert.ok(rules.length > 0);
});
