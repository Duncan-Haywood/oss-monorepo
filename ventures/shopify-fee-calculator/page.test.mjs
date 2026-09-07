// Structural tests for the POS vs online page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./shopify-pos-vs-online-fees.html", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");

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
const rowTemplate = scriptSource.match(/<tr class="\$\{row\.profit === bestProfit[\s\S]*?<\/tr>/);

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareOnlineVsPos/);
  assert.match(scriptSource, /pos_online_compared/);
});

test("every results column has a cell, and every cell has a column", () => {
  assert.ok(rowTemplate, "could not find the per-path <tr> template");
  const headers = [...markup.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((m) =>
    m[1].replace(/\s+/g, " ").trim());
  const cells = (rowTemplate[0].match(/<t[hd][\s>]/g) || []).length;
  assert.equal(
    cells,
    headers.length,
    `table declares ${headers.length} columns (${headers.join(" | ")}) but the row emits ${cells} cells`,
  );
});

test("figures named in schema.org featureList are actually rendered", () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, "no schema.org featureList found");
  const claims = [
    ["same-ticket in-person rate gap", /result\.inPersonSameTicket|result\.extraKeptOnSameTicket/],
    ["in-person pickup profit", /result\.inPersonPickup/],
    ["card reader recovery orders", /result\.ordersToRecoverHardware/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the page never renders it`);
  }
});

test("null reader recovery is rendered as a placeholder, not .toFixed on null", () => {
  assert.match(scriptSource, /ordersToRecoverHardware === null/);
});

test("hosted surface carries the no-SLA sentence the playbook requires", () => {
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /No warranty/);
});

test("index and sitemap point at the POS comparison", () => {
  assert.match(index, /shopify-pos-vs-online-fees\.html/);
  assert.match(sitemap, /shopify-pos-vs-online-fees\.html/);
});

test("index surfaces compareOnlineVsPos on the order itself", () => {
  assert.match(index, /compareOnlineVsPos/);
  assert.match(index, /id="posCompare"/);
  assert.match(index, /id="posHeadline"/);
  assert.match(index, /pos_online_compared/);
  assert.match(index, /id="posPaymentsRate"/);
  const table = index.match(/<table id="posTable">[\s\S]*?<\/table>/);
  assert.ok(table, "index.html is missing the POS comparison table");
  const columns = table[0].match(/<th\b/g).length;
  const cells = (index.match(/posRows\.map[\s\S]*?<\/td><\/tr>`/) || [""])[0].match(/<t[hd]\b/g) || [];
  assert.equal(cells.length, columns, "POS row emits a different cell count than the header");
});

test("the result panel is announced to screen readers when it updates", () => {
  // The result section re-renders the hero profit number, the <dl>
  // breakdown, and the compare/promo tables in place on every keystroke,
  // with no page reload. Before this fix the only aria-live element on the
  // page was #shareStatus (a share-link message the update handlers never
  // touch), so a screen-reader user changing an input got no announcement
  // that the readout had changed.
  assert.match(
    index,
    /<section class="result" aria-live="polite">/,
    "the result section is not a live region, so updates are never announced",
  );
});

test("the result panel is announced to screen readers when it updates", () => {
  // The result section re-renders its hero figure and breakdown in place
  // on every keystroke, with no page reload, but had no aria-live -- so a
  // screen-reader user changing an input got no announcement that the
  // result had changed. Same gap already fixed fleet-wide (see #3125-#3127
  // and prior sessions' aria-live commits).
  assert.match(
    html,
    /<section class="result" aria-live="polite">/,
    "the result section is not a live region, so updates are never announced",
  );
});

// marketplace-fee-compare already deep-links here for plan-tier fees a
// headline rate cannot carry; without a crawlable link back, a visitor on
// Shopify never reaches the six-channel triage (same orphan class as #3637).
test("index links to the marketplace fee comparison", () => {
  assert.match(index, /href="\.\.\/marketplace-fee-compare\/"/);
});
