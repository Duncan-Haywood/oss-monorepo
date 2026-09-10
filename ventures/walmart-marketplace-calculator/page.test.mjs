// Structural tests for index.html.
//
// calc.test.mjs imports calc.mjs directly and never looks at the page. These
// checks catch markup that silently swallows the app (an unclosed textarea,
// script, or style) and script lookups that point at missing ids.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const vsWfsSeo = readFileSync(new URL("./vs-wfs-cost-estimator.html", import.meta.url), "utf8");

const RAW_TEXT_ELEMENTS = ["textarea", "script", "style"];

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = "";
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, "i").exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === "script") scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const declaredIds = new Set([...markup.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
const scriptSource = scripts.join("\n");

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, "gi")) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test("the module script survives parsing and would actually execute", () => {
  assert.match(markup, /<script type="module">/, "the app script tag is missing or was swallowed by an earlier element");
  assert.match(scriptSource, /calculateListing/, "the app script did not parse as a script element");
});

test("every element the script reaches for exists in the markup", () => {
  const wanted = new Set([
    ...[...scriptSource.matchAll(/getElementById\(\s*"([\w-]+)"\s*\)/g)].map((m) => m[1]),
    ...[...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
  ]);
  assert.ok(wanted.size > 0, "no element lookups found; the script probably did not parse");
  const missing = [...wanted].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, [], `script queries ids that no element declares: ${missing.join(", ")}`);
});

test("inputs and result fields for the primary journey are present", () => {
  for (const id of [
    "category", "salePrice", "matchPrice", "referralRate", "referralMinimum",
    "costOfGoods", "profit", "compare", "matchResult", "usageOptOut",
    "twoDayShippingCost", "twoDayCompare", "twoDayNote",
    "returnRatePct", "returnsCompare", "returnsNote",
    "leftoverUnits", "agedCompare", "agedNote",
    "acosPct", "adsCompare", "adsNote",
    "holdTakePct", "matchTakeCompare", "matchTakeNote",
  ]) {
    assert.ok(declaredIds.has(id), `#${id} is missing from index.html`);
  }
});

test("the liability disclaimer and privacy note are real markup, not swallowed text", () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/, "liability disclaimer is missing from the rendered page");
  assert.match(markup, /Best-effort hosting, no SLA/, "no-SLA hosting clause is missing from the rendered page");
  assert.match(markup, /never uploaded/, "privacy note is missing from the rendered page");
});

test("WFS and seller-fulfilled paths are both offered", () => {
  assert.match(markup, /value="wfs"/);
  assert.match(markup, /value="seller"/);
});

test("the 2-day take table is wired to the comparison", () => {
  assert.match(scriptSource, /compareTwoDay/);
  assert.match(scriptSource, /twoDayNote/);
  assert.match(scriptSource, /two_day_compared/);
  assert.match(markup, /should-i-offer-two-day-shipping-on-walmart\.html/);
});

test("the returns mix table is wired to the comparison", () => {
  assert.match(scriptSource, /compareReturns/);
  assert.match(scriptSource, /returnsNote/);
  assert.match(scriptSource, /returns_compared/);
  assert.match(markup, /should-i-use-wfs-with-walmart-returns\.html/);
});

test("the aged leftover table is wired to the comparison", () => {
  assert.match(scriptSource, /compareAgedWfs/);
  assert.match(scriptSource, /agedWfsNote/);
  assert.match(scriptSource, /aged_wfs_compared/);
  assert.match(markup, /should-i-pull-aged-wfs-inventory\.html/);
});

test("the Walmart Connect ads table is wired to the comparison", () => {
  assert.match(scriptSource, /compareWalmartAds/);
  assert.match(scriptSource, /walmartAdsNote/);
  assert.match(scriptSource, /ads_compared/);
  assert.match(markup, /should-i-run-walmart-connect-ads\.html/);
});

test("the Buy Box match-take table is wired to the comparison", () => {
  assert.match(scriptSource, /compareMatchTake/);
  assert.match(scriptSource, /matchTakeNote/);
  assert.match(scriptSource, /match_take_compared/);
  assert.match(markup, /should-i-match-the-walmart-buy-box\.html/);
});

test("the incumbent-comparison page links back, names Walmart's own tool honestly, and gives no unverifiable Walmart numbers", () => {
  assert.match(markup, /vs-wfs-cost-estimator\.html/);
  assert.match(vsWfsSeo, /<a href="\.\/">/);
  // Names Walmart's own tool and links to Walmart's own domains so a reader
  // can check the source directly -- this page must never claim a number
  // for Walmart's estimator that only Walmart's own live schedule could
  // confirm.
  assert.match(vsWfsSeo, /seller\.walmart\.com/);
  assert.match(vsWfsSeo, /marketplacelearn\.walmart\.com/);
  assert.doesNotMatch(vsWfsSeo, /Walmart('s)? (charges|fee is|costs?) \$/i);
  assert.match(vsWfsSeo, /not affiliated with, endorsed by, or sponsored by Walmart/i);
  assert.match(vsWfsSeo, /trademarks of Walmart Inc\./i);
});

test("the incumbent-comparison page carries the standard disclaimer and sponsor link", () => {
  assert.match(vsWfsSeo, /No warranty/);
  assert.match(vsWfsSeo, /Best-effort hosting, no SLA/);
  assert.match(vsWfsSeo, /github\.com\/sponsors\/Duncan-Haywood/);
});

// marketplace-fee-compare already deep-links here for fees a headline
// referral rate cannot carry; without a crawlable link back, a visitor on
// Walmart never reaches the six-channel triage (same orphan class as #3637).
test("index links to the marketplace fee comparison", () => {
  assert.match(html, /href="\.\.\/marketplace-fee-compare\/"/);
});

// Closest sibling: another marketplace seller comparing take rates on the
// same SKU. Related-tool chrome rotates inside the marketplace subcategory,
// so without an explicit one-hop a crawler landing here may never reach the
// TikTok Shop calculator (platform/pages/siblings.mjs --check orphan class).
test("index links one hop to the tiktok-shop-fee-calculator sibling", () => {
  assert.match(
    html,
    /href="\.\.\/tiktok-shop-fee-calculator\/"/,
    'index must link ../tiktok-shop-fee-calculator/ so crawlers reach the TikTok Shop calculator in one hop',
  );
  assert.match(html, /TikTok Shop fee calculator/i);
});
