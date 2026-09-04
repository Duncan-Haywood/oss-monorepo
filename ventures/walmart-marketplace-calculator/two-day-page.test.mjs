// Structural tests for the Walmart 2-day vs WFS page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareTwoDay, twoDayNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-offer-two-day-shipping-on-walmart.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{winner[\s\S]*?<\/tr>/);

const defaults = {
  salePrice: 24.99,
  referralRate: 15,
  length: 8,
  width: 6,
  height: 2,
  weightLb: 0.75,
  costOfGoods: 7,
  inboundPerUnit: 1.1,
  packagingCost: 0.5,
  sellerShippingCost: 4.5,
  monthlyUnits: 60,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareTwoDay/);
  assert.match(scriptSource, /twoDayNote/);
  assert.match(scriptSource, /two_day_compared/);
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
  for (const claim of [
    "WFS leftover with 2-day included",
    "seller-fulfilled 2-day leftover after a faster label and pack time",
    "standard seller-fulfilled leftover without 2-day",
    "expected leftover per session",
    "2-day label ceiling that still matches WFS",
  ]) {
    assert.ok(featureList[1].includes(claim), `featureList is missing "${claim}"`);
  }
  assert.match(scriptSource, /row\.completedProfit/);
  assert.match(scriptSource, /twoDayShippingCost|twoDayMinutes/);
  assert.match(scriptSource, /expectedProfit/);
  assert.match(scriptSource, /extraTwoDayVsWfs/);
});

test("FAQ default leftover matches the live comparison", () => {
  const result = compareTwoDay(defaults);
  assert.equal(result.winner, "wfs");
  assert.match(html, /\$4\.83 more per session/);
  assert.match(html, /\$6\.92 vs \$2\.09/);
  assert.match(html, /\$2\.06/);
  assert.match(twoDayNote(result), /WFS keeps \$4\.83 more per session/);
});

test("the sitemap and main calculator point at this page", () => {
  assert.match(sitemap, /should-i-offer-two-day-shipping-on-walmart\.html/);
  assert.match(index, /should-i-offer-two-day-shipping-on-walmart\.html/);
});

test("disclaimer and no-SLA clause are rendered markup", () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/);
  assert.match(markup, /Best-effort hosting, no SLA/);
});
