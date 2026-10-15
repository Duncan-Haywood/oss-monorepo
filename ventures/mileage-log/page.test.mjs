import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

test("index page carries the disclaimer, privacy line, and sponsor link", () => {
  const html = page("index.html");
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, or financial advice/);
  assert.match(html, /Everything runs in your browser/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /<script type="application\/ld\+json">/);
});

test("every form control has a label and the page never sends trips anywhere", () => {
  const html = page("index.html");
  for (const id of ["year", "odo-start", "odo-end", "rate-business", "rate-medical", "rate-charity", "t-date", "t-cat", "t-from", "t-to", "t-purpose", "t-client", "t-vehicle", "t-odo-start", "t-odo-end", "t-miles", "t-tolls", "t-parking"]) {
    assert.match(html, new RegExp(`<label for="${id}">`), id);
  }
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test("page states the model, the backup caveat and that GPS only runs while open", () => {
  const html = page("index.html");
  assert.match(html, /Not modelled/);
  assert.match(html, /clearing browser data clears the log/);
  assert.match(html, /only works while this page is open/);
  assert.match(html, /confirm rates and rules at irs\.gov/);
});

test("footer links the mileage method calculator and the gig driver calculator", () => {
  const html = page("index.html");
  assert.match(html, /href="\.\.\/mileage-deduction-method-calculator\/"/);
  assert.match(html, /href="\.\.\/gig-driver-net-pay-calculator\/"/);
});

test("robots and sitemap let crawlers find the page", () => {
  assert.match(page("robots.txt"), /Allow: \//);
  assert.match(page("sitemap.xml"), /index\.html/);
});

test("page wires vehicles, repeat trips and the preparer report, all client-side", () => {
  const html = page("index.html");
  for (const id of ["routes", "vehicles", "preparer"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /preparerReportHtml/);
  assert.match(html, /frequentRoutes/);
});

test("privacy policy page exists, is in the sitemap and makes no tracking claims it cannot keep", () => {
  const html = page("privacy.html");
  assert.match(html, /no analytics/);
  assert.match(html, /Nothing\./);
  assert.doesNotMatch(html, /<script(?![^>]*application\/ld\+json)|fetch\(/); // JSON-LD is data, not code
  assert.match(page("sitemap.xml"), /privacy\.html/);
});
