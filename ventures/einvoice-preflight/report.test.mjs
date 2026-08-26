import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, buildJsonReport, buildMarkdown, preflightDocuments } from "./report.mjs";

const VALID = {
  invoice_number: "INV-1",
  issue_date: "2026-08-24",
  currency: "EUR",
  supplier: { id: "S1", name: "Supplier" },
  customer: { id: "C1", name: "Customer" },
  lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
  totals: { net: 200, tax: 38, gross: 238 },
};

test("preflight catches a gross mismatch and keeps the filename", async () => {
  const broken = structuredClone(VALID);
  broken.totals.gross = 200;
  const result = await preflightDocuments([{ name: "invoice.json", source: JSON.stringify(broken) }]);
  assert.equal(result.reports[0].errors[0].rule, "INV-017");
  assert.equal(result.reports[0].file, "invoice.json");
});

test("checklist redacts calculated amounts and invoice numbers", async () => {
  const broken = structuredClone(VALID);
  broken.totals.gross = 200;
  const result = await preflightDocuments([{ name: "invoice.json", source: JSON.stringify(broken) }]);
  const checklist = buildChecklist(result);
  assert.match(checklist, /Status: FAIL/);
  assert.match(checklist, /INV-017/);
  assert.doesNotMatch(checklist, /INV-1/);
  assert.doesNotMatch(checklist, /238/);
  assert.match(checklist, /\[value\]/);
});

test("markdown and JSON reports stay privacy-safe for invoice numbers", async () => {
  const broken = structuredClone(VALID);
  broken.totals.gross = 200;
  const result = await preflightDocuments([{ name: "invoice.json", source: JSON.stringify(broken) }]);
  const markdown = buildMarkdown(result);
  const json = buildJsonReport(result);
  assert.match(markdown, /Overall: \*\*FAIL\*\*/);
  assert.doesNotMatch(markdown, /INV-1/);
  assert.equal(json.status, "fail");
  assert.equal(json.errors[0].rule, "INV-017");
  assert.doesNotMatch(JSON.stringify(json), /INV-1/);
});

test("unreadable JSON is a read error, not a silent pass", async () => {
  const result = await preflightDocuments([{ name: "broken.json", source: "{not-json" }]);
  assert.equal(result.reports.length, 0);
  assert.equal(result.readErrors.length, 1);
  assert.equal(result.readErrors[0].file, "broken.json");
});

test("duplicate invoice numbers become INV-019 without disclosing the number", async () => {
  const second = structuredClone(VALID);
  second.lines[0].description = "Different work";
  const result = await preflightDocuments([
    { name: "first.json", source: JSON.stringify(VALID) },
    { name: "second.json", source: JSON.stringify(second) },
  ]);
  const rules = result.reports.flatMap((report) => report.errors.map((error) => error.rule));
  assert.deepEqual(rules, ["INV-019", "INV-019"]);
  assert.doesNotMatch(JSON.stringify(result), /INV-1/);
});

test("oversized input is refused before parsing", async () => {
  const result = await preflightDocuments(
    [{ name: "large.json", source: JSON.stringify(VALID) }],
    { maxBytes: 10 },
  );
  assert.equal(result.reports.length, 0);
  assert.match(result.readErrors[0].error, /exceeds 10 bytes/);
});
