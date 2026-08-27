// Structural tests for the Shopify Shipping vs own-label page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareShippingLabels } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-buy-shopify-shipping-labels.html", import.meta.url), "utf8");
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
  assert.match(scriptSource, /compareShippingLabels/);
  assert.match(scriptSource, /shipping_labels_compared/);
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
    ["Shopify Shipping vs own label", /result\.shopify|result\.own/],
    ["charge Shopify quote buy own label", /result\.chargeShopifyBuyOwn/],
    ["label spread after card fees", /result\.extraKeptOnOwn/],
    ["monthly postage gap", /result\.monthlyExtraOnOwn/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the page never renders it`);
  }
});

test("default inputs on the page match the worked example", () => {
  const comparison = compareShippingLabels({
    price: 48,
    shippingCharged: 6,
    shopifyLabelCost: 5.49,
    ownLabelCost: 4.25,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    packagingCost: 1,
    monthlyPlan: 39,
    monthlyOrders: 100,
    paymentMethod: "shopify_payments",
  });
  assert.equal(comparison.winner, "own");
  assert.ok(Math.abs(comparison.extraKeptOnOwn - 1.24) < 1e-9);
  assert.match(html, /id="shopifyLabelCost"[^>]*value="5.49"/);
  assert.match(html, /id="ownLabelCost"[^>]*value="4.25"/);
});

test("hosted surface carries the no-SLA sentence the playbook requires", () => {
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /No warranty/);
});

test("index and sitemap point at the label comparison", () => {
  assert.match(index, /should-i-buy-shopify-shipping-labels\.html/);
  assert.match(sitemap, /should-i-buy-shopify-shipping-labels\.html/);
});

test("index surfaces compareShippingLabels on the order itself", () => {
  assert.match(index, /compareShippingLabels/);
  assert.match(index, /id="labelCompare"/);
  assert.match(index, /id="labelHeadline"/);
  assert.match(index, /shipping_labels_compared/);
  assert.match(index, /id="shopifyLabelCost"/);
  assert.match(index, /id="ownLabelCost"/);
  const table = index.match(/<table id="labelTable">[\s\S]*?<\/table>/);
  assert.ok(table, "index.html is missing the shipping-label comparison table");
  const columns = table[0].match(/<th\b/g).length;
  const cells = (index.match(/labels\.rows\.map[\s\S]*?<\/td><\/tr>`/) || [""])[0].match(/<t[hd]\b/g) || [];
  assert.equal(cells.length, columns, "label row emits a different cell count than the header");
});
