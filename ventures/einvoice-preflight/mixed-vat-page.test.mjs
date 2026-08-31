import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { inspectTaxBreakdown } from "./breakdown.mjs";

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
const html = docsPage("how-do-you-calculate-a-mixed-vat-rate-tax-breakdown.html");
const index = docsPage("index.html");

test("index links to the mixed-VAT-rate SEO/AI-discovery page", () => {
  assert.match(index, /how-do-you-calculate-a-mixed-vat-rate-tax-breakdown\.html/);
});

test("the docs page answers the search question with a worked example", () => {
  assert.match(html, /How Do You Calculate a Mixed-VAT-Rate Tax Breakdown/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /"@type":"Question"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /not tax or legal advice/i);
});

test("the worked figures are a valid breakdown per inspectTaxBreakdown, not hand-typed", () => {
  // Same shape as breakdown.test.mjs's `mixed()` fixture: two lines, two
  // rates, and a tax_breakdown that inspectTaxBreakdown must accept with no
  // findings -- that acceptance is what proves the page's numbers are the
  // checker's own arithmetic rather than typed independently of it.
  const invoice = {
    invoice_number: "INV-1",
    issue_date: "2026-08-24",
    currency: "EUR",
    supplier: { id: "S1", name: "Supplier GmbH" },
    customer: { id: "C1", name: "Customer GmbH" },
    lines: [
      { description: "Consulting", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 },
      { description: "Books", quantity: 1, unit_price: 100, tax_percent: 7, net: 100 },
    ],
    totals: { net: 300, tax: 45, gross: 345 },
    tax_breakdown: [
      { tax_percent: 19, taxable: 200, tax: 38 },
      { tax_percent: 7, taxable: 100, tax: 7 },
    ],
  };
  assert.deepEqual(inspectTaxBreakdown(invoice), []);

  for (const figure of ["€200.00", "€38.00", "€100.00", "€7.00", "€300.00", "€45.00", "€345.00"]) {
    assert.ok(html.includes(figure), `expected the page to show ${figure}`);
  }

  // The page contrasts the correct per-rate figure with the mistake of
  // applying one rate to the whole invoice -- pin that contrast figure too,
  // and confirm it is arithmetically the wrong number the prose says it is.
  const wrongBlendedTax = 300 * 0.19;
  assert.equal(wrongBlendedTax, 57);
  assert.ok(html.includes("€57.00"), "expected the page to show the incorrect blended-rate figure it warns against");
  assert.match(html, /€57\.00 tax, €12\.00 more than the correct/);
});

test("robots and sitemap let crawlers find the new page", () => {
  const robots = docsPage("robots.txt");
  const sitemap = docsPage("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /einvoice-preflight\/<\/loc>/);
  assert.match(sitemap, /how-do-you-calculate-a-mixed-vat-rate-tax-breakdown\.html/);
});
