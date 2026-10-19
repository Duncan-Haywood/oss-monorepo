import test from "node:test";
import assert from "node:assert/strict";
import { loadItem, compareChannels } from "./calc.mjs";
import { SPECIALIST_CHANNELS, specialistRows, specialistPriceForProfit } from "./specialists.mjs";
import { feeFor as grailedFee } from "../grailed-fee-calculator/calc.mjs";
import { feeFor as tcgFee } from "../tcgplayer-fee-calculator/calc.mjs";
import { feeFor as mercariFee } from "../mercari-fee-calculator/calc.mjs";
import { feeFor as depopFee } from "../depop-fee-calculator/calc.mjs";
import { feeFor as discogsFee } from "../discogs-fee-calculator/calc.mjs";
import { calculateSale as poshmarkSale } from "../poshmark-fee-calculator/calc.mjs";
import { calculateReverbSale } from "../reverb-fee-calculator/calc.mjs";
import { calculateSale as whatnotSale } from "../whatnot-seller-payout/calc.mjs";
import { calculate as stockxSale } from "../stockx-seller-payout-calculator/calc.mjs";

const ids = (categoryId) => specialistRows(item({ categoryId })).map((r) => r.id).sort();

const item = (over) =>
  loadItem({ price: 100, shippingCharged: 10, itemCost: 40, shippingCost: 8, otherCost: 2, categoryId: "everything_else", ...over });

test("no specialist appears for a category none accepts", () => {
  assert.deepEqual(specialistRows(item({})), []);
});

test("each specialist appears only for its own category", () => {
  assert.deepEqual(specialistRows(item({ categoryId: "music_gear" })).map((r) => r.id), ["reverb"]);
  assert.deepEqual(ids("clothing"), ["depop", "grailed", "mercari", "poshmark", "stockx"]);
  assert.deepEqual(ids("records_media"), ["discogs"]);
  assert.deepEqual(ids("trading_cards"), ["tcgplayer", "whatnot"]);
});

test("fees agree with the sibling calculators", () => {
  for (const [price, ship] of [[20, 4], [119, 0], [120, 0], [800, 75], [1500, 20]]) {
    const it = item({ price, shippingCharged: ship });
    const by = Object.fromEntries(SPECIALIST_CHANNELS.map((c) => [c.id, c.fee(it)]));
    assert.ok(Math.abs(by.grailed - grailedFee({ itemPrice: price, buyerShipping: ship }).grailedFee) < 1e-9, `grailed ${price}`);
    assert.ok(Math.abs(by.mercari - mercariFee({ itemPrice: price, buyerShipping: ship }).mercariFee) < 1e-9, `mercari ${price}`);
    assert.ok(Math.abs(by.depop - depopFee({ itemPrice: price, buyerShipping: ship }).depopFee) < 1e-9, `depop ${price}`);
    assert.ok(Math.abs(by.discogs - discogsFee({ itemPrice: price, buyerShipping: ship }).discogsFee) < 1e-9, `discogs ${price}`);
    assert.ok(Math.abs(by.tcgplayer - tcgFee({ subtotal: price + ship }).tcgplayerFee) < 1e-9, `tcg ${price}`);
  }
});

test("reverb fee matches the sibling, including the $500 cap", () => {
  const ch = SPECIALIST_CHANNELS.find((c) => c.id === "reverb");
  for (const [price, ship] of [[80, 20], [800, 75], [10000, 0], [20000, 50]]) {
    const sib = calculateReverbSale({ shippingCharged: ship, shippingCost: 0, itemCost: 0, otherCost: 0 }, price);
    const mine = ch.fee(item({ price, shippingCharged: ship }));
    assert.ok(Math.abs(mine - sib.fees.total) < 1e-9, `reverb ${price}`);
  }
});

test("break-even price nets zero and the gap to the best general channel is reported", () => {
  const it = item({ categoryId: "clothing" });
  const row = specialistRows(it, 12).find((r) => r.id === "grailed");
  assert.ok(Math.abs(specialistPriceForProfit(SPECIALIST_CHANNELS[1], it, 0) - row.breakEvenPrice) < 1e-9);
  const atBE = specialistRows({ ...it, price: row.breakEvenPrice }).find((r) => r.id === "grailed");
  assert.ok(Math.abs(atBE.profit) < 0.01);
  assert.ok(Math.abs(row.vsBestGeneral - (row.profit - 12)) < 1e-9);
  assert.ok(compareChannels(it).length === 10, "the general ranking is unchanged");
});

test("Grailed shows its $120 cliff", () => {
  const below = specialistRows(item({ categoryId: "clothing", price: 119.99, shippingCharged: 0 })).find((r) => r.id === "grailed");
  const at = specialistRows(item({ categoryId: "clothing", price: 120, shippingCharged: 0 })).find((r) => r.id === "grailed");
  assert.ok(at.profit < below.profit);
});

test("Whatnot fee matches the sibling's trading-card preset, including the $1,500 commission cap", () => {
  const ch = SPECIALIST_CHANNELS.find((c) => c.id === "whatnot");
  for (const [price, ship] of [[20, 5], [250, 8], [1500, 10], [2400, 15]]) {
    const sib = whatnotSale({ salePrice: price, shippingCharged: ship, commissionRate: 8, commissionCap: 1500 });
    const mine = ch.fee(item({ price, shippingCharged: ship }));
    const sibFees = price - sib.payout;
    assert.ok(Math.abs(mine - sibFees) < 1e-6, `whatnot ${price}: ${mine} vs ${sibFees}`);
  }
});

test("StockX fee matches the sibling and the buyer's shipping never reaches the seller", () => {
  const ch = SPECIALIST_CHANNELS.find((c) => c.id === "stockx");
  for (const [price, ship] of [[90, 0], [150, 12], [600, 14]]) {
    const sib = stockxSale({ salePrice: price, itemCostBasis: 0, sellerFeePct: 9, fastShippingDiscountPct: 0, paymentProcessingFeePct: 3, shippingCost: 0 });
    const it = item({ price, shippingCharged: ship, itemCost: 0, shippingCost: 0, otherCost: 0, categoryId: "clothing" });
    const row = specialistRows(it).find((r) => r.id === "stockx");
    assert.ok(Math.abs(row.profit - sib.netPayout) < 1e-9, `stockx ${price}`);
  }
});

test("poshmark takes a flat fee under $15 and 20% from $15, and never keeps buyer shipping", () => {
  const ch = SPECIALIST_CHANNELS.find((c) => c.id === "poshmark");
  for (const price of [5, 14.99, 15, 80, 400]) {
    const sib = poshmarkSale({ salePrice: price, itemCost: 0, otherCost: 0 });
    const row = specialistRows(item({ categoryId: "clothing", price, shippingCharged: 0, itemCost: 0, otherCost: 0, shippingCost: 0 })).find((r) => r.id === "poshmark");
    assert.ok(Math.abs(row.channelFees - sib.commission) < 1e-9, `poshmark ${price}`);
  }
  // buyer-paid shipping is revenue the seller never sees
  const withShip = specialistRows(item({ categoryId: "clothing", price: 50, shippingCharged: 8, itemCost: 0, otherCost: 0, shippingCost: 0 })).find((r) => r.id === "poshmark");
  assert.ok(Math.abs(withShip.profit - 40) < 1e-9);
  assert.ok(ch.fee(item({ price: 14.99 })) > 0);
});
