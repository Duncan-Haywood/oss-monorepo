// Structural tests for the Walmart Connect ads page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareWalmartAds, walmartAdsNote } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-run-walmart-connect-ads.html", import.meta.url), "utf8");
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
  monthlyUnits: 60,
  acosPct: 15,
  extraAdUnits: 12,
  attributedOrganicPct: 40,
  highAcosPct: 25,
  highExtraAdUnits: 22,
  highAttributedOrganicPct: 50,
};

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareWalmartAds/);
  assert.match(scriptSource, /walmartAdsNote/);
  assert.match(scriptSource, /ads_compared/);
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
    "organic leftover with ads skipped",
    "Sponsored Products leftover after ACOS on last-click billed units",
    "higher-ACOS campaign leftover",
    "ACOS ceiling that still matches skip",
    "extra-unit floor that still matches skip",
  ]) {
    assert.ok(featureList[1].includes(claim), `featureList is missing "${claim}"`);
  }
  assert.match(scriptSource, /row\.acosPct/);
  assert.match(scriptSource, /row\.extraAdUnits/);
  assert.match(scriptSource, /row\.adSpend/);
  assert.match(scriptSource, /row\.cash/);
  assert.match(scriptSource, /extraSponsoredVsSkip/);
});

test("FAQ default leftover matches the live comparison", () => {
  const result = compareWalmartAds(defaults);
  assert.equal(result.winner, "skip");
  assert.match(html, /\$31\.15 more/);
  assert.match(html, /\$518\.99 vs \$487\.84/);
  assert.match(html, /11\.5%/);
  assert.match(html, /\$31\.83/);
  assert.match(walmartAdsNote(result), /keeps \$31\.15 more/);
});

test("the sitemap and main calculator point at this page", () => {
  assert.match(sitemap, /should-i-run-walmart-connect-ads\.html/);
  assert.match(index, /should-i-run-walmart-connect-ads\.html/);
});

test("disclaimer and no-SLA clause are rendered markup", () => {
  assert.match(markup, /<strong>No warranty\.<\/strong>/);
  assert.match(markup, /Best-effort hosting, no SLA/);
});
