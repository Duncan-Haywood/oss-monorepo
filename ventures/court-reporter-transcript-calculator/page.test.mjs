import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

// The FAQ tests below used to assert `html.includes(answerText)` against the
// whole file. That can never fail: the JSON-LD block is itself part of `html`,
// so every answer trivially "appears". The check that matters -- and the one
// Google's structured-data policy actually enforces -- is that the answer text
// appears in the *rendered* prose a visitor reads. So strip the JSON-LD block
// first, then the tags, then decode the entities the markup uses (`&mdash;`)
// but the JSON spells literally, and compare on normalised whitespace.
const visibleText = (html) =>
  html
    .replace(/<script type="application\/ld\+json">.*?<\/script>/gs, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&larr;/g, "←")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Assert every JSON-LD FAQ answer in `html` is prose a visitor can actually read. */
const assertFaqMatchesVisibleProse = (html, minQuestions) => {
  const match = html.match(
    /<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s,
  );
  assert.ok(match, "expected a FAQPage JSON-LD block");
  const data = JSON.parse(match[1]);
  assert.ok(data.mainEntity.length >= minQuestions);
  const visible = visibleText(html);
  for (const q of data.mainEntity) {
    const answer = q.acceptedAnswer.text.replace(/\s+/g, " ").trim();
    assert.ok(
      visible.includes(answer),
      `FAQ answer for "${q.name}" must appear verbatim in the visible page, not only inside the JSON-LD`,
    );
    const name = q.name.replace(/\s+/g, " ").trim();
    assert.ok(
      visible.includes(name),
      `FAQ question "${q.name}" must appear verbatim in the visible page, not only inside the JSON-LD`,
    );
  }
};

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
  assertFaqMatchesVisibleProse(page("index.html"), 4);
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

// --- "What is a good per-page rate?" explainer ------------------------------
//
// The question a reporter types before they know this tool exists. It is the
// organic entry point for the agency offer check: the honest answer to "is
// $4.50 a page good?" is that the rate alone cannot say, which is exactly the
// division `computeAgencyOfferCheck` performs.

const RATE_PAGE = "what-is-a-good-per-page-rate-for-a-court-reporter.html";

test("the per-page-rate explainer carries the disclaimer, sponsor link, and a route back to the tool", () => {
  const html = page(RATE_PAGE);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal or financial advice/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="\.\/"/, "must link back to the calculator itself");
});

test("the explainer's FAQPage JSON-LD answer text matches its visible prose exactly", () => {
  const html = page(RATE_PAGE);
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s);
  assert.ok(match, "expected a FAQPage JSON-LD block");
  const data = JSON.parse(match[1]);
  assert.ok(data.mainEntity.length >= 3);
  for (const q of data.mainEntity) {
    assert.ok(
      html.includes(q.acceptedAnswer.text),
      `FAQ answer for "${q.name}" must appear verbatim in the visible page`,
    );
  }
});

// --- vs-spreadsheet-or-guessing.html ----------------------------------------

test("index links the vs-spreadsheet-or-guessing comparison page", () => {
  assert.match(
    page("index.html"),
    /href="\.\/vs-spreadsheet-or-guessing\.html"/,
  );
});

test("the comparison page is reachable from the sitemap", () => {
  assert.match(page("sitemap.xml"), /vs-spreadsheet-or-guessing\.html/);
});

test("the comparison page carries the required disclaimer and sponsor link", () => {
  const html = page("vs-spreadsheet-or-guessing.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal or financial advice/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /Nothing leaves your browser/);
});

test("the comparison page links back to the calculator", () => {
  assert.match(page("vs-spreadsheet-or-guessing.html"), /href="\.\/"/);
});

test("the comparison page's FAQPage JSON-LD answer text matches the visible FAQ prose exactly", () => {
  assertFaqMatchesVisibleProse(page("vs-spreadsheet-or-guessing.html"), 5);
});

test("the index links the explainer, so it is reachable without the sitemap", () => {
  assert.match(
    page("index.html"),
    new RegExp(`href="${RATE_PAGE.replace(/[.]/g, "\\.")}"`),
    "index must link the explainer -- the published site is served from a subpath where sitemap auto-discovery does not happen, so a crawl path is the only route to it",
  );
});

// The figures in the explainer are not illustrative decoration: they are what
// the venture's own calculator returns. Pinning them here means a change to
// `computeAgencyOfferCheck` cannot silently make the page's worked examples
// wrong, which is the failure mode a prose page has and a calculator does not.
test("the explainer's worked figures are what computeAgencyOfferCheck actually returns", async () => {
  const { computeAgencyOfferCheck } = await import("./calculator.mjs");
  const html = page(RATE_PAGE);

  const slow = computeAgencyOfferCheck({
    pages: 120, agencyPageRate: 4.5, agencyAppearanceFee: 75,
    hoursWorked: 9, targetHourlyRate: 85,
  });
  assert.equal(slow.agencyTotalPay, 615);
  assert.equal(slow.effectiveHourlyRate, 68.33);
  assert.equal(slow.hourlyShortfall, 16.67);
  assert.equal(slow.meetsTarget, false);

  const quick = computeAgencyOfferCheck({
    pages: 120, agencyPageRate: 4.5, agencyAppearanceFee: 75,
    hoursWorked: 5.5, targetHourlyRate: 85,
  });
  assert.equal(quick.effectiveHourlyRate, 111.82);
  assert.equal(quick.meetsTarget, true);

  // The counter-intuitive one: a 39% higher page rate that pays $140 less in
  // total and $25/hour less, because the page count halved.
  const higherRate = computeAgencyOfferCheck({
    pages: 60, agencyPageRate: 6.25, agencyAppearanceFee: 100,
    hoursWorked: 5.5, targetHourlyRate: 85,
  });
  assert.equal(higherRate.agencyTotalPay, 475);
  assert.equal(higherRate.effectiveHourlyRate, 86.36);
  assert.ok(higherRate.effectiveHourlyRate < quick.effectiveHourlyRate);

  for (const figure of ["$615", "$68.33", "$111.82", "$475", "$86.36", "$16.67"]) {
    assert.ok(html.includes(figure), `the page must state ${figure} as computed`);
  }
});
