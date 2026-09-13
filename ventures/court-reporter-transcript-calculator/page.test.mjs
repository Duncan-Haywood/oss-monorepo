import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the required disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

// Reciprocal of the link added in notary-trip-quote's footer: same shape of
// solo-professional per-job pricing, different billing structure.
test("index links one hop to the notary-trip-quote sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/notary-trip-quote\/"/,
    "index must link ../notary-trip-quote/ so a reader comparing solo-professional quote tools reaches it in one hop",
  );
});

test("index page states this is not legal or financial advice", () => {
  const html = page("index.html");
  assert.match(html, /not legal or financial advice/);
});

test("robots and sitemap let crawlers find the page", () => {
  const robots = page("robots.txt");
  const sitemap = page("sitemap.xml");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /index\.html/);
});

test("the FAQPage JSON-LD answer text matches the visible FAQ prose exactly", () => {
  const html = page("index.html");
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s);
  assert.ok(match, "expected a FAQPage JSON-LD block");
  const data = JSON.parse(match[1]);
  assert.ok(data.mainEntity.length >= 4);
  for (const q of data.mainEntity) {
    assert.ok(
      html.includes(q.acceptedAnswer.text),
      `FAQ answer for "${q.name}" must appear verbatim in the visible page`,
    );
  }
});

// --- Deposition transcript invoice -----------------------------------------

test("the invoice section covers page rate, turnaround, copies, exhibits, realtime, and travel", () => {
  const html = page("index.html");
  assert.match(html, /id="page-rate"/);
  assert.match(html, /id="turnaround"/);
  assert.match(html, /id="multiplier"/);
  assert.match(html, /id="copies"/);
  assert.match(html, /id="exhibit-rate"/);
  assert.match(html, /id="realtime-requested"/);
  assert.match(html, /id="travel-miles"/);
  assert.match(html, /id="mileage-rate"/);
  assert.match(html, /id="hours-worked"/);
});

test("the turnaround select changes the editable multiplier field", () => {
  const html = page("index.html");
  assert.match(html, /turnaroundEl\.addEventListener\("change"/);
  assert.match(html, /multiplierEl\.value = tier\.multiplier/);
});

test("the invoice report offers a copy of the plain-text summary", () => {
  const html = page("index.html");
  assert.match(html, /id="copy-summary"/);
  assert.match(html, /Copy invoice summary/);
  assert.match(html, /formatInvoiceSummary/);
});

// The clipboard API is absent over plain http and in some embedded webviews.
// Without a fallback the button would be inert exactly where it fails.
test("a blocked clipboard still leaves the summary reachable in a labelled textarea", () => {
  const html = page("index.html");
  assert.match(html, /id="summary-fallback"[^>]*hidden/);
  assert.match(html, /<label class="note" for="summary-text">/);
  assert.match(html, /<textarea id="summary-text"[^>]*readonly/);
  assert.match(html, /catch \{/);
});

// A copy taken after Clear, or after editing an input without recalculating,
// must not hand out figures the screen is no longer showing.
test("the summary is served from the last calculated invoice, and Clear drops it", () => {
  const html = page("index.html");
  assert.match(html, /let lastInvoice = null;/);
  assert.match(html, /lastInvoice = \{ result, pages: input\.pages, turnaroundLabel \};/);
  assert.match(html, /if \(!lastInvoice\)/);
  const clearBlock = html.slice(html.indexOf('$("#clear-invoice")'));
  assert.match(clearBlock.slice(0, 900), /lastInvoice = null;/);
});

test("copying the invoice summary is counted as its own usage event", () => {
  assert.match(page("index.html"), /record\("summary_copied"\)/);
});

test("calculating the invoice is counted as its own usage event", () => {
  assert.match(page("index.html"), /record\("invoice_calculated"\)/);
});

// --- Agency offer check ------------------------------------------------------

test("the agency offer section takes pages, rate, appearance fee, hours, and a target rate", () => {
  const html = page("index.html");
  assert.match(html, /id="agency-pages"/);
  assert.match(html, /id="agency-page-rate"/);
  assert.match(html, /id="agency-appearance-fee"/);
  assert.match(html, /id="agency-hours"/);
  assert.match(html, /id="target-rate"/);
  assert.match(html, /computeAgencyOfferCheck/);
});

test("checking the agency offer is counted as its own usage event, distinct from the invoice calculator", () => {
  assert.match(page("index.html"), /record\("agency_offer_checked"\)/);
});

test("Clear on the agency section resets its own fields without touching the invoice calculator's", () => {
  const html = page("index.html");
  const clearBlock = html.slice(html.indexOf('$("#clear-agency")'));
  const body = clearBlock.slice(0, clearBlock.indexOf("});"));
  assert.match(body, /agencyEls\.pages/);
  assert.match(body, /agencyEls\.target/);
  assert.doesNotMatch(body, /invoiceEls\./);
});

test("a usage opt-out control is present and reflects an already-opted-out state", () => {
  const html = page("index.html");
  assert.match(html, /id="optout"/);
  assert.match(html, /setUsageOptOut\(true\)/);
  assert.match(html, /usageOptedOut\(\)/);
});
