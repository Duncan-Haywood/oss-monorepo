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

test("index page states this is not legal advice", () => {
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

// Reciprocal of the link in str-host-payout-calculator's footer: the same
// property owner, the other letting model.
test("index links one hop to the str-host-payout-calculator sibling", () => {
  assert.match(
    page("index.html"),
    /href="\.\.\/str-host-payout-calculator\/"/,
    "index must link ../str-host-payout-calculator/ so a reader comparing letting models reaches it in one hop",
  );
});

// --- Copy itemized statement -----------------------------------------------

test("the deposit report offers a copy of the itemized statement", () => {
  const html = page("index.html");
  assert.match(html, /id="copy-statement"/);
  assert.match(html, /Copy itemized statement/);
  assert.match(html, /formatItemizedStatement/);
});

// The clipboard API is absent over plain http and in some embedded webviews.
// Without a fallback the button would be inert exactly where it fails, with
// no way to reach the statement at all -- so the textarea is required, not
// decorative.
test("a blocked clipboard still leaves the statement reachable in a labelled textarea", () => {
  const html = page("index.html");
  assert.match(html, /id="statement-fallback"[^>]*hidden/);
  assert.match(html, /<label class="note" for="statement-text">/);
  assert.match(html, /<textarea id="statement-text"[^>]*readonly/);
  assert.match(html, /catch \{/);
});

// A copy taken after Clear, or after editing an input without recalculating,
// must not hand out figures the screen is no longer showing.
test("the statement is served from the last calculated settlement, and Clear drops it", () => {
  const html = page("index.html");
  assert.match(html, /let lastSettlement = null;/);
  assert.match(html, /lastSettlement = \{ settlement: result, depositAmount:/);
  assert.match(html, /if \(!lastSettlement\)/);
  // Clear resets it rather than leaving the previous tenant's numbers behind.
  const clearBlock = html.slice(html.indexOf('$("#clear-deposit")'));
  assert.match(clearBlock.slice(0, 500), /lastSettlement = null;/);
});

test("copying the statement is counted as its own usage event", () => {
  assert.match(page("index.html"), /record\("statement_copied"\)/);
});
