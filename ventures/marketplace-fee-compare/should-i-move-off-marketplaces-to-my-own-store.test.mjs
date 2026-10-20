// Pins the worked example in the low-vs-moderate-volume guide to the model
// that powers the tool, the same way article.test.mjs pins
// which-marketplace-has-the-lowest-fees.html. A rate or amortisation change in
// calc.mjs must fail here instead of shipping a guide that quotes stale
// numbers next to the calculator that would now disagree with it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareChannels, loadItem } from "./calc.mjs";

const article = readFileSync(
  new URL("./should-i-move-off-marketplaces-to-my-own-store.html", import.meta.url),
  "utf8",
);

// The item the article works through: $60, $28 landed cost, home category.
const BASE = {
  price: 60,
  shippingCharged: 0,
  itemCost: 20,
  shippingCost: 6,
  otherCost: 2,
  categoryId: "home",
};

// The article ranks the seven channels the page launched with; Depop and
// Facebook Marketplace were added to the tool later and are not in its tables.
const ARTICLE_CHANNELS = new Set(["ebay", "etsy", "amazon", "walmart", "tiktok", "mercari", "shopify"]);
const rowsAt = (monthlyOrders) =>
  compareChannels(loadItem({ ...BASE, monthlyOrders })).filter((row) => ARTICLE_CHANNELS.has(row.id));
const byId = (rows, id) => rows.find((row) => row.id === id);
const money = (value) => `$${value.toFixed(2)}`;

const low = rowsAt(5);
const moderate = rowsAt(60);

test("the article's five-orders-a-month table matches what the calculator computes", () => {
  for (const row of low) {
    assert.ok(
      article.includes(`<td>${money(row.profit)}</td>`),
      `${row.id}: the five-orders table does not carry ${money(row.profit)}`,
    );
  }
});

test("the article's sixty-orders-a-month table matches what the calculator computes", () => {
  for (const row of moderate) {
    assert.ok(
      article.includes(`<td>${money(row.profit)}</td>`),
      `${row.id}: the sixty-orders table does not carry ${money(row.profit)}`,
    );
  }
});

test("the claim that Shopify moves from sixth to first still holds", () => {
  const rankLow = low.findIndex((row) => row.id === "shopify");
  const rankModerate = moderate.findIndex((row) => row.id === "shopify");
  assert.equal(rankLow, 5, "Shopify is no longer sixth at five orders a month");
  assert.equal(rankModerate, 0, "Shopify is no longer first at sixty orders a month");
});

test("the stated gaps match the model", () => {
  const prose = article.replace(/\s+/g, " ");
  const shopifyLow = byId(low, "shopify");
  const shopifyModerate = byId(moderate, "shopify");
  const tiktokModerate = byId(moderate, "tiktok");
  assert.ok(
    prose.includes(`${money(shopifyModerate.profit - tiktokModerate.profit)} ahead of TikTok Shop`),
    "the sixty-orders gap to TikTok Shop does not match the model",
  );
  assert.ok(
    prose.includes(`${money(shopifyModerate.profit - shopifyLow.profit)} ahead of where it stood at five orders`),
    "the five-to-sixty gap for Shopify does not match the model",
  );
  assert.ok(
    prose.includes(`${money(shopifyLow.subscriptionPerOrder)} an order`),
    "the five-orders Shopify subscription-per-order figure does not match the model",
  );
  assert.ok(
    prose.includes(`${money(byId(low, "amazon").subscriptionPerOrder)} an order`),
    "the five-orders Amazon subscription-per-order figure does not match the model",
  );
});

test("the article links back to the tool", () => {
  assert.ok(article.includes('href="."'), "no link back to the comparison tool");
});

test("the article carries the rate and liability disclaimers", () => {
  const prose = article.replace(/\s+/g, " ");
  assert.match(prose, /not a live fee schedule/);
  assert.match(prose, /not tax, financial, or business advice/);
  assert.match(prose, /accept no liability/);
  assert.match(prose, /no warranty/i);
});
