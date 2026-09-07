// Structural tests for index.html.
//
// calc.test.mjs imports calc.mjs directly and never looks at the page, so it
// stays green for a whole class of defect this page is exposed to: a
// featureList claim that the DOM never renders, a comparison table whose
// header count does not match the row template, or a null figure formatted
// with .toFixed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

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
const scriptSource = scripts.join("\n");

test("every raw-text element is closed", () => {
  assert.equal(
    unclosed,
    null,
    `<${unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`,
  );
});

test("the page renders a first result without counting a bounce as usage", () => {
  assert.match(scriptSource, /\bpaint\(\);/);
  assert.doesNotMatch(
    scriptSource,
    /count\([^)]+\);\s*paint\(\);?\s*$/,
    "the initial paint() must not sit behind a count() — that was the academy-tools bounce-as-usage bug",
  );
});

test("organic vs affiliate table headers match the two rendered rows", () => {
  const table = markup.match(/Organic vs affiliate[\s\S]*?<table>[\s\S]*?<\/table>/);
  assert.ok(table, "organic vs affiliate table missing from markup");
  const headers = [...table[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)];
  assert.equal(headers.length, 4, `expected 4 headers, found ${headers.length}`);
  const rowCells = [...scriptSource.matchAll(/<tr>[\s\S]*?<\/tr>/g)]
    .filter((row) => row[0].includes("Organic listing") || row[0].includes("Affiliate-sourced"));
  assert.equal(rowCells.length, 2, "expected one organic row and one affiliate row");
  for (const row of rowCells) {
    const cells = row[0].match(/<t[hd][\s>]/g) || [];
    assert.equal(cells.length, 4, `row has ${cells.length} cells, table has 4 headers`);
  }
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  const claims = [
    ["Organic vs affiliate profit", /paths\.organic\.expectedProfit/],
    ["expected profit after returns", /result\.expectedProfit/],
    ["TikTok referral fee", /result\.referralFee/],
    ["creator facilitation fee", /result\.facilitationFee/],
    ["affiliate commission kept on returns", /affiliateRefundedOnReturn/],
    ["break-even price", /breakEvenPrice/],
    ["target-margin price", /targetMarginPrice/],
    ["current vs October 2026 fee schedule", /compareFeeSchedules/],
    ["monthly P&L", /result\.monthlyProfit/],
    ["charge vs free shipping leftover", /compareFreeShipping/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"; update this test or restore the claim`,
    );
    assert.match(
      scriptSource,
      rendered,
      `featureList advertises "${claim}" but the page script never uses ${rendered}`,
    );
  }
});

test("null figures are rendered defensively", () => {
  assert.match(
    scriptSource,
    /result\.expectedMargin === null/,
    "expectedMargin is null when every order returns; do not call .toFixed on null",
  );
  assert.match(
    scriptSource,
    /bePrice === null/,
    "break-even can be unsatisfiable; render a placeholder instead of money(null) alone",
  );
  assert.match(
    scriptSource,
    /targetPrice === null/,
    "target-margin price can be unsatisfiable; render a placeholder",
  );
});

test("the verdict banner never calls .toFixed on expectedMargin directly", () => {
  // expectedMargin is null on a 100% return rate, which does not imply
  // belowBreakEven (a SKU with no per-order costs to lose breaks exactly
  // even). The verdict banner used to interpolate
  // result.expectedMargin.toFixed(1) straight into that branch and threw
  // an uncaught TypeError -- every occurrence must instead route through a
  // null-checked local.
  const verdictBlock = scriptSource.match(/const verdict = el\("verdict"\);[\s\S]*?\n      \}\n/);
  assert.ok(verdictBlock, "verdict banner block not found");
  // The one legitimate use is the null-checked local itself
  // (`expectedMargin === null ? "n/a" : ...expectedMargin.toFixed...`);
  // strip that assignment before checking the three innerHTML branches below
  // it never call .toFixed on the raw field.
  const afterGuard = verdictBlock[0].replace(/const marginText = result\.expectedMargin === null[^\n]*\n/, "");
  assert.doesNotMatch(
    afterGuard,
    /result\.expectedMargin\.toFixed/,
    "expectedMargin.toFixed is called without a null check in the verdict banner",
  );
  assert.match(
    verdictBlock[0],
    /marginText = result\.expectedMargin === null/,
    "expected the verdict banner to render expectedMargin through a null-checked marginText local",
  );
});

test("the landing copy names the affiliate-return problem in the first screen", () => {
  assert.match(markup, /The 6% is not what you keep/);
  assert.match(markup, /affiliate-commission-on-returns\.html/);
  assert.match(markup, /should-i-offer-free-shipping-on-tiktok-shop\.html/);
  assert.match(markup, /id="freeShipTable"/);
  assert.match(scriptSource, /compareFreeShipping/);
  assert.match(scriptSource, /freeShippingNote/);
  assert.match(scriptSource, /free_shipping_compared/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
});

test("the calculator's free-shipping table renders one cell per column", () => {
  const table = markup.match(/<table id="freeShipTable">[\s\S]*?<\/table>/);
  assert.ok(table, "index.html is missing the free-shipping table");
  const columns = table[0].match(/<th\b/g).length;
  const row = scriptSource.match(/shipping\.paths\.map\([\s\S]*?<\/tr>`\)/);
  assert.ok(row, "free-shipping row template not found");
  const cells = row[0].match(/<t[hd]\b/g).length;
  assert.equal(cells, columns, "free-shipping row emits a different cell count than the header");
});

test("scenario sharing is local and restores entered assumptions", () => {
  assert.match(markup, /id="copyScenario"/);
  assert.match(scriptSource, /URLSearchParams/);
  assert.match(scriptSource, /restoreScenario/);
  assert.match(scriptSource, /navigator\.clipboard\.writeText/);
  assert.match(scriptSource, /scenario_shared/);
});

test("an invalid input clears the stale order economics, comparison tables, and verdict, not just the headline", () => {
  // Before this fix, paint()'s catch block only overwrote #expectedProfit
  // and #profitLabel with the error sentence (plus the free-shipping
  // sub-panel). Referral/facilitation/affiliate fees, kept/returned profit,
  // margin, break-even and target-margin prices, max buy cost, monthly
  // profit, the organic-vs-affiliate table, the fee-schedule table, and the
  // verdict banner all kept showing the last valid order. A visitor who
  // missed the one-line message could easily read those stale figures as
  // the answer for the invalid inputs now on screen.
  const catchMatch = scriptSource.match(/\} catch \(error\) \{([\s\S]*?)\n\s*return;\n\s*\}/);
  assert.ok(catchMatch, "paint()'s catch block was not found");
  const body = catchMatch[1];
  assert.match(body, /el\("expectedProfit"\)\.textContent = error\.message/, "the error message is never shown");
  const clearedListMatch = body.match(/\[([^\]]+)\]\.forEach\(\(id\) => \{\s*el\(id\)\.textContent = "";\s*\}\)/);
  assert.ok(clearedListMatch, "no batch-cleared id list found in the catch block");
  const clearedIds = [...clearedListMatch[1].matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
  for (const id of ["referralFee", "facilitationFee", "affiliateFee", "keptProfit", "returnedProfit", "expectedMargin", "breakEvenPrice", "targetMarginPrice", "maxBuy", "monthlyProfit", "affiliateNote"]) {
    assert.ok(clearedIds.includes(id), `#${id} is not cleared in the catch block`);
  }
  assert.match(body, /el\("affiliateCompare"\)\.innerHTML = ""/, "the stale organic-vs-affiliate table is not cleared");
  assert.match(body, /el\("scheduleCompare"\)\.innerHTML = ""/, "the stale fee-schedule table is not cleared");
  assert.match(body, /el\("verdict"\)\.hidden = true/, "the stale verdict banner is not hidden");
});

// A page missing og:* renders as a bare link with no preview when shared —
// PRODUCT_PLAYBOOK.md 5e requires Open Graph tags "so a shared link renders".
// affiliate-commission-on-returns.html was linked from index.html and in the
// sitemap, but shipped with no og:* tags at all.
test('the result panel is announced to screen readers when it updates', () => {
  // paint() rewrites the hero number, the <dl> breakdown, and the
  // affiliate/fee-schedule tables in place on every keystroke, with no page
  // reload. Before this fix the only aria-live element on the page was
  // #copyStatus (a share-link message render() never touches), so a
  // screen-reader user changing an input got no announcement that the
  // readout had changed.
  assert.match(
    html,
    /<section class="result" aria-live="polite">/,
    'the result section is not a live region, so updates are never announced',
  );
});

test("every published page carries Open Graph tags", () => {
  const dir = new URL("./", import.meta.url);
  const pages = readdirSync(dir).filter((name) => name.endsWith(".html"));
  assert.ok(pages.length >= 5, "expected at least the 5 known pages in this venture");
  for (const page of pages) {
    const source = readFileSync(new URL(page, dir), "utf8");
    assert.match(source, /<meta property="og:title" content="[^"]+">/, `${page} is missing og:title`);
    assert.match(source, /<meta property="og:description" content="[^"]+">/, `${page} is missing og:description`);
  }
});

// marketplace-fee-compare already deep-links here for fees a headline
// referral rate cannot carry; without a crawlable link back, a visitor on
// TikTok Shop never reaches the six-channel triage (same orphan class as #3637).
test("index links to the marketplace fee comparison", () => {
  assert.match(html, /href="\.\.\/marketplace-fee-compare\/"/);
});
