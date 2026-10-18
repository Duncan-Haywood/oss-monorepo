import test from "node:test";
import assert from "node:assert/strict";
import { loadItem, compareChannels } from "./calc.mjs";
import { SPECIALIST_CHANNELS, specialistRows, specialistPriceForProfit } from "./specialists.mjs";
import { feeFor as grailedFee } from "../grailed-fee-calculator/calc.mjs";
import { feeFor as tcgFee } from "../tcgplayer-fee-calculator/calc.mjs";
import { calculateReverbSale } from "../reverb-fee-calculator/calc.mjs";

const item = (over) =>
  loadItem({ price: 100, shippingCharged: 10, itemCost: 40, shippingCost: 8, otherCost: 2, categoryId: "everything_else", ...over });

test("no specialist appears for a category none accepts", () => {
  assert.deepEqual(specialistRows(item({})), []);
});

test("each specialist appears only for its own category", () => {
  assert.deepEqual(specialistRows(item({ categoryId: "music_gear" })).map((r) => r.id), ["reverb"]);
  assert.deepEqual(specialistRows(item({ categoryId: "clothing" })).map((r) => r.id), ["grailed"]);
  assert.deepEqual(specialistRows(item({ categoryId: "trading_cards" })).map((r) => r.id), ["tcgplayer"]);
});

test("fees agree with the sibling calculators", () => {
  for (const [price, ship] of [[20, 4], [119, 0], [120, 0], [800, 75], [1500, 20]]) {
    const it = item({ price, shippingCharged: ship });
    const by = Object.fromEntries(SPECIALIST_CHANNELS.map((c) => [c.id, c.fee(it)]));
    assert.ok(Math.abs(by.grailed - grailedFee({ itemPrice: price, buyerShipping: ship }).grailedFee) < 1e-9, `grailed ${price}`);
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
  const [row] = specialistRows(it, 12);
  assert.ok(Math.abs(specialistPriceForProfit(SPECIALIST_CHANNELS[1], it, 0) - row.breakEvenPrice) < 1e-9);
  const atBE = specialistRows({ ...it, price: row.breakEvenPrice })[0];
  assert.ok(Math.abs(atBE.profit) < 0.01);
  assert.ok(Math.abs(row.vsBestGeneral - (row.profit - 12)) < 1e-9);
  assert.ok(compareChannels(it).length === 10, "the general ranking is unchanged");
});

test("Grailed shows its $120 cliff", () => {
  const below = specialistRows(item({ categoryId: "clothing", price: 119.99, shippingCharged: 0 }))[0];
  const at = specialistRows(item({ categoryId: "clothing", price: 120, shippingCharged: 0 }))[0];
  assert.ok(at.profit < below.profit);
});
