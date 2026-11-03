import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeIsdoc, preflightDocuments, ISDOC_MESSAGE } from "./report.mjs";
import { readFileSync } from "node:fs";

const isdoc = '<?xml version="1.0" encoding="UTF-8"?>\n<Invoice xmlns="http://isdoc.cz/namespace/2013" version="6.0.2"><ID>1</ID></Invoice>';

test("ISDOC is recognised by its namespace, UBL is not", () => {
  assert.equal(looksLikeIsdoc(isdoc), true);
  assert.equal(looksLikeIsdoc(readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8")), false);
  assert.equal(looksLikeIsdoc("<Invoice><ID>1</ID></Invoice>"), false);
});

test("an ISDOC file gets a clear read error, not 'UBL field TaxAmount is missing'", async () => {
  const out = await preflightDocuments([{ name: "faktura.isdoc", source: isdoc }]);
  assert.equal(out.reports.length, 0);
  assert.equal(out.readErrors[0].error, ISDOC_MESSAGE);
  assert.ok(!/TaxAmount/.test(out.readErrors[0].error));
});

test("a UBL file in the same batch is still checked", async () => {
  const ubl = readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8");
  const out = await preflightDocuments([{ name: "a.isdoc", source: isdoc }, { name: "b.xml", source: ubl }]);
  assert.equal(out.readErrors.length, 1);
  assert.equal(out.reports.length, 1);
});
