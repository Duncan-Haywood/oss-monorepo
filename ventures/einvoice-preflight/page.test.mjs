import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const robots = readFileSync(new URL("./robots.txt", import.meta.url), "utf8");

test("browser page is discoverable and names the user job", () => {
  assert.match(page, /<title>E-invoice Preflight/);
  assert.match(page, /meta name="description"/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /Catch invoice defects before you submit/);
  assert.match(page, /INV-022 through INV-027/);
  assert.match(page, /INV-028 and INV-029/);
  assert.match(page, /INV-030 and INV-031/);
  assert.match(page, /INV-032 through INV-034/);
  assert.match(page, /INV-035 and INV-036/);
  assert.match(page, /INV-037 and INV-038/);
  assert.match(page, /INV-039 through INV-041/);
  assert.match(page, /INV-042 and INV-043/);
  assert.match(page, /INV-044 through INV-046/);
  assert.match(page, /INV-047 through INV-049/);
  assert.match(page, /INV-050 through INV-052/);
  assert.match(page, /INV-053 and INV-054/);
  assert.match(page, /Load a credit note without a reference/);
  assert.match(page, /Load a 0% line without a reason/);
  assert.match(page, /Load mixed rates without a breakdown/);
  assert.match(page, /Load a buyer GLN that fails its check/);
  assert.match(page, /Load a period that ends before it starts/);
  assert.match(page, /Load a SEPA transfer without an IBAN/);
  assert.match(page, /Load a PO that repeats the invoice number/);
  assert.match(page, /Load a header discount that does not match its percent/);
  assert.match(page, /Load terms days that do not match the due date/);
  assert.match(page, /Factur-X \.pdf/);
  assert.match(page, /Factur-X \/ ZUGFeRD \/ XRechnung PDF unwrap/);
  assert.match(page, /Factur-X \/ ZUGFeRD \/ XRechnung PDF with an embedded invoice/);
  assert.match(page, /accept="[^"]*\.pdf/);
  assert.match(page, /arrayBuffer\(\)/);
  assert.match(page, /report\.envelope/);
  assert.match(page, /Unwrapped factur-x\.xml \(CII\) from the PDF/);
});

test("browser page can download the grouped remediation CSV", () => {
  assert.match(page, /id="downloadRemediationCsv"/);
  assert.match(page, /Download remediation CSV/);
  assert.match(page, /buildRemediationCsv/);
  assert.match(page, /einvoice-preflight-remediation\.csv/);
});

test("copy checklist falls back when the Clipboard API is denied", () => {
  assert.match(page, /function fallbackCopy/);
  assert.match(page, /execCommand\("copy"\)/);
  assert.match(page, /async function copyText/);
  assert.match(page, /await copyText\(text\)/);
});

test("disclaimer and optional sponsors are visible", () => {
  assert.match(page, /No warranty/);
  assert.match(page, /not legal, tax, financial, or accounting advice/i);
  assert.match(page, /github.com\/sponsors\/Duncan-Haywood/);
  assert.match(page, /never changes what the tool does/);
});

test("sitemap and robots list the browser page", () => {
  assert.match(sitemap, /einvoice-preflight\/index.html/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: sitemap.xml/);
});

// Regression: sitemap.xml carried a trailing entry pointing at README.md (a
// raw github.com/blob URL, not a servable page) even after the venture had
// real HTML pages. A crawler following it wastes a fetch on prose instead of
// the product, and every .html page the venture actually ships should be
// reachable from the sitemap it publishes.
test("sitemap does not point at README.md and lists every shipped html page", () => {
  assert.doesNotMatch(sitemap, /README\.md/);
  const htmlFiles = readdirSync(new URL("./", import.meta.url)).filter((name) => name.endsWith(".html"));
  for (const name of htmlFiles) {
    assert.match(sitemap, new RegExp(name.replace(/\./g, "\\.")), `${name} is missing from sitemap.xml`);
  }
});

test("links to the FIFO pick evidence tool", () => {
  assert.match(page, /href="\.\.\/fifo-pick-evidence\/"/, "the sibling-tool link is missing");
});
