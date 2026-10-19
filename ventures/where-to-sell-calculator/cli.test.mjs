import test from "node:test";
import assert from "node:assert/strict";
import { main, parseItems, sampleItems } from "./cli.mjs";
import { CHANNEL_PRESETS, compareChannels } from "./calc.mjs";

const io = (text) => ({ read: async () => text, stdin: async () => text });

test("the CLI's winner and keep match the library on the same item", async () => {
  const item = { price: 48, itemCost: 14, shippingCharged: 0, shippingCost: 0, packagingCost: 0.5 };
  const on = CHANNEL_PRESETS.filter((p) => p.enabled !== false && p.id !== "local");
  const lib = compareChannels(on, { monthlyOrders: 100, ...item });
  const best = lib.results.find((r) => r.isBest);
  const res = await main(["x", "--json"], io("item,price,cost,shippingCharged,shippingCost,packagingCost\nJacket,48,14,0,0,0.5\n"));
  const row = JSON.parse(res.out).rows[0];
  assert.equal(res.code, 0);
  assert.equal(row.best, best.id);
  assert.equal(row.keep, Math.round(best.expectedProfit * 100) / 100);
});

test("a fee-free direct sale is left out unless asked for", async () => {
  const csv = "price,itemCost\n40,10\n";
  const plain = JSON.parse((await main(["x", "--json"], io(csv))).out);
  assert.ok(!plain.rows[0].channels.some((c) => c.id === "local"));
  const asked = JSON.parse((await main(["x", "--json", "--also", "local"], io(csv))).out);
  assert.equal(asked.rows[0].best, "local");
});

test("--channels restricts the comparison and --also adds an off-by-default channel", async () => {
  const csv = "price,itemCost\n40,10\n";
  const only = JSON.parse((await main(["x", "--json", "--channels", "ebay,etsy"], io(csv))).out);
  assert.deepEqual(only.rows[0].channels.map((c) => c.id).sort(), ["ebay", "etsy"]);
  const plus = JSON.parse((await main(["x", "--json", "--also", "poshmark"], io(csv))).out);
  assert.ok(plus.rows[0].channels.some((c) => c.id === "poshmark"));
});

test("routing never keeps less than the best single channel", async () => {
  const r = JSON.parse((await main(["--example", "--json", "--also", "poshmark,depop,mercari"])).out);
  assert.ok(r.uplift >= 0);
  assert.equal(r.rows.length, 5);
});

test("bad rows are skipped and named, bad input is refused", async () => {
  const parsed = parseItems("item,price,cost\nA,10,3\nB,abc,3\nC,,3\n");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.warnings.length, 2);
  assert.match(parseItems("item,price\nA,10\n").error, /itemCost/);
  assert.equal((await main(["x", "--channels", "nope"], io(sampleItems()))).code, 2);
  assert.equal((await main(["x", "--rank-by", "luck"], io(sampleItems()))).code, 2);
  assert.equal((await main([])).code, 2);
});

test("quoted labels with commas survive and --csv escapes them", async () => {
  const res = await main(["x", "--csv"], io('item,price,cost\n"Mug, blue",20,5\n'));
  assert.match(res.out, /^"Mug, blue",/m);
});

test("--no-returns ranks on completed-sale profit", async () => {
  const csv = "price,itemCost\n40,10\n";
  const r = JSON.parse((await main(["x", "--json", "--no-returns"], io(csv))).out);
  assert.equal(r.includeReturns, false);
});
