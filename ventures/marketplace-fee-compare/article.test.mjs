// Pins the worked example in the SEO article to the model that powers the tool.
//
// An explainer page that quotes numbers is a liability the moment a fee default
// changes: the article keeps saying "$5.30" long after the calculator says
// something else, and a visitor who reads both loses trust in whichever one
// they check second. So the figures in the article are asserted against
// `calc.mjs` rather than proofread, and a rate change fails here instead of
// shipping a page that contradicts the tool one click away.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareChannels, loadItem } from "./calc.mjs";

const article = readFileSync(
  new URL("./which-marketplace-has-the-lowest-fees.html", import.meta.url),
  "utf8",
);

// The item the article works through: $40, $18 of landed cost, 50 orders/month.
const BASE = {
  price: 40,
  shippingCharged: 0,
  itemCost: 12,
  shippingCost: 5,
  otherCost: 1,
  monthlyOrders: 50,
};

const fees = (categoryId) => {
  const rows = compareChannels(loadItem({ ...BASE, categoryId }));
  return Object.fromEntries(rows.map((row) => [row.id, row.channelFees]));
};

const electronics = fees("electronics");
const jewelry = fees("jewelry");
const money = (value) => `$${value.toFixed(2)}`;

test("the article's fee table matches what the calculator computes", () => {
  const expected = [
    ["tiktok", electronics.tiktok, jewelry.tiktok],
    ["walmart", electronics.walmart, jewelry.walmart],
    ["amazon", electronics.amazon, jewelry.amazon],
    ["etsy", electronics.etsy, jewelry.etsy],
    ["ebay", electronics.ebay, jewelry.ebay],
  ];
  for (const [id, elec, jewel] of expected) {
    assert.ok(
      article.includes(`<td>${money(elec)}</td><td>${money(jewel)}</td>`),
      `${id}: the article does not carry the row ${money(elec)} / ${money(jewel)}`,
    );
  }
});

test("the article's stated gaps are the gaps the model produces", () => {
  // Collapsed whitespace: the prose is hard-wrapped, and a reflow of the
  // paragraph must not fail a check that is about the arithmetic.
  const prose = article.replace(/\s+/g, " ");
  assert.ok(
    prose.includes(`${money(electronics.ebay - electronics.amazon)} an order less than eBay`),
    "the electronics gap in the article does not match the model",
  );
  assert.ok(
    prose.includes(`${money(jewelry.amazon - jewelry.ebay)} <em>more</em> than eBay`),
    "the jewelry gap against eBay does not match the model",
  );
  assert.ok(
    prose.includes(`${money(jewelry.amazon - jewelry.etsy)} more than Etsy`),
    "the jewelry gap against Etsy does not match the model",
  );
});

test("the claim that Etsy was dearer than Amazon on electronics still holds", () => {
  // The article's punchline depends on the order flipping between categories.
  // If a rate change makes both comparisons point the same way, the paragraph
  // stops being true and has to be rewritten rather than silently left up.
  assert.ok(electronics.etsy > electronics.amazon, "Etsy is no longer dearer on electronics");
  assert.ok(jewelry.amazon > jewelry.etsy, "Amazon is no longer dearer on jewelry");
});

test("the article links back to the tool and out to every deep calculator", () => {
  assert.ok(article.includes('href="."'), "no link back to the comparison tool");
  for (const slug of [
    "amazon-fba-calculator",
    "etsy-profit-calculator",
    "ebay-fee-calculator",
    "tiktok-shop-fee-calculator",
    "shopify-fee-calculator",
    "walmart-marketplace-calculator",
    "faire-wholesale-calculator",
    "whatnot-seller-payout",
  ]) {
    assert.ok(article.includes(`../${slug}/`), `the article does not link ${slug}`);
  }
});

test("the article carries the rate and liability disclaimers", () => {
  const prose = article.replace(/\s+/g, " ");
  assert.match(prose, /not a live fee schedule/);
  assert.match(prose, /not tax, financial, or business advice/);
  assert.match(prose, /accept no liability/);
});
