import assert from "node:assert/strict";
import test from "node:test";
import { checkGstin, checkDocumentNumber, financialYear, irn, gstinCheckChar } from "./india.mjs";

test("check character matches two GSTINs from public guides", () => {
  assert.equal(gstinCheckChar("27AAPFU0939F1Z"), "V");
  assert.equal(gstinCheckChar("29AAFCC9980M1Z"), "R");
});

test("accepts a well-formed GSTIN and names a one-character typo", () => {
  assert.equal(checkGstin("27aapfu0939f1zv").ok, true);
  const bad = checkGstin("27AAPFU0939F1ZW");
  assert.equal(bad.ok, false);
  assert.match(bad.problems[0], /Check character should be V/);
  assert.match(checkGstin("27AAPFU0939F1Z").problems[0], /15 characters/);
  assert.match(checkGstin("00AAPFU0939F1ZV").problems[0], /State code 00/);
});

test("document number rule", () => {
  assert.equal(checkDocumentNumber("2019-20/KA/1").ok, true);
  assert.equal(checkDocumentNumber("0001").ok, false);
  assert.equal(checkDocumentNumber("A".repeat(17)).ok, false);
  assert.equal(checkDocumentNumber("INV 1").ok, false);
});

test("financial year runs April to March", () => {
  assert.equal(financialYear("2026-03-31"), "2025-26");
  assert.equal(financialYear("2026-04-01"), "2026-27");
  assert.equal(financialYear("2099-12-31"), "2099-00");
  assert.equal(financialYear("nonsense"), null);
});

test("IRN reproduces the worked sample in a public guide", async () => {
  const h = await irn({ gstin: "29AAFCC9980M1ZR", financialYear: "2019-20", docType: "INV", docNumber: "2019-20/KA/1" });
  assert.equal(h, "23f498ee41441ecad30f72ba5b9907506c3df70a17b0e0dff46b76a786400662");
});
