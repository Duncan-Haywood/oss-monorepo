// Structural tests for the gift-card vs sell-now page.
//
// calc.test.mjs never looks at the HTML, so it stays green if the page
// drops a column, forgets to render a advertised figure, or formats null
// with .toFixed. Kept dependency-free so CI stays `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareGiftCard } from "./calc.mjs";

const html = readFileSync(new URL("./should-i-sell-gift-cards-on-shopify.html", import.meta.url), "utf8");
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
const rowTemplate = scriptSource.match(/<tr class="\$\{row\.id !== "expected"[\s\S]*?<\/tr>/);

test("every raw-text element is closed", () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test("the page imports the comparison it claims to run", () => {
  assert.match(scriptSource, /compareGiftCard/);
  assert.match(scriptSource, /gift_card_compared/);
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
    ["gift card vs selling the SKU now", /result\.sell|result\.redeem/],
    ["second swipe after the face is applied", /result\.remainderFees/],
    ["promo discount on face value", /giftCardPrice|result\.promoDiscount|result\.cardPrice/],
    ["expected leftover at a typed redemption rate", /result\.expected/],
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
  const comparison = compareGiftCard({
    price: 48,
    shippingCharged: 6,
    paymentsRate: 2.9,
    paymentsFixed: 0.3,
    costOfGoods: 14,
    shippingCost: 5,
    packagingCost: 1,
    monthlyPlan: 39,
    monthlyOrders: 100,
    paymentMethod: "shopify_payments",
  });
  assert.equal(comparison.winner, "sell");
  assert.ok(Math.abs(comparison.sell.kept - 31.744) < 1e-6);
  assert.ok(Math.abs(comparison.redeem.kept - 31.444) < 1e-6);
  assert.ok(Math.abs(comparison.expected.kept - 34.7272) < 1e-6);
  assert.match(html, /id="giftCardFace"[^>]*value="50"/);
  assert.match(html, /id="giftCardPrice"[^>]*value="50"/);
  assert.match(html, /id="giftCardRedemptionPct"[^>]*value="80"/);
  assert.match(html, /\$31\.74/);
  assert.match(html, /\$31\.44/);
  assert.match(html, /\$34\.73/);
  assert.match(html, /\$26\.59/);
  assert.match(html, /\$5\.16/);
  assert.match(html, /\$47\.86/);
});

test("hosted surface carries the no-SLA sentence the playbook requires", () => {
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /github.com\/sponsors\/Duncan-Haywood/);
});

test("index and sitemap point at the gift-card comparison", () => {
  assert.match(index, /should-i-sell-gift-cards-on-shopify\.html/);
  assert.match(sitemap, /should-i-sell-gift-cards-on-shopify\.html/);
});
