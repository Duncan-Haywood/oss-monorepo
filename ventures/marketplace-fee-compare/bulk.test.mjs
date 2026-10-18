import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCatalog, compareCatalog, catalogCsv, SAMPLE_CATALOG, MAX_ROWS } from "./bulk.mjs";
import { compareChannels } from "./calc.mjs";

test("parses the sample catalogue with category labels and header aliases", () => {
  const { items, errors } = parseCatalog(SAMPLE_CATALOG);
  assert.deepEqual(errors, []);
  assert.equal(items.length, 5);
  assert.equal(items[1].item.categoryId, "jewelry");
  assert.equal(items[1].item.monthlyOrders, 40);
});

test("accepts tab-separated paste, currency symbols and quoted commas", () => {
  const tsv = 'title\tlist price\tcost\n"Lamp, brass"\t$1,200.50\t$300';
  const { items, errors } = parseCatalog(tsv.replace("list price", "price"));
  assert.deepEqual(errors, []);
  assert.equal(items[0].name, "Lamp, brass");
  assert.equal(items[0].item.price, 1200.5);
});

test("reports bad rows by line number and keeps the good ones", () => {
  const { items, errors } = parseCatalog("name,price,cost,category\nA,10,2,jewelry\nB,-5,2,\nC,10,2,spaceships\nD,0,1,");
  assert.equal(items.length, 1);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /^Line 3:/);
  assert.match(errors[1], /Unknown category "spaceships"/);
});

test("needs price and cost columns", () => {
  assert.match(parseCatalog("name,price\nA,10").errors[0], /price.*cost/);
  assert.equal(parseCatalog("").items.length, 0);
});

test("caps rows", () => {
  const rows = Array.from({ length: MAX_ROWS + 5 }, () => "x,10,2").join("\n");
  const { items, errors } = parseCatalog(`name,price,cost\n${rows}`);
  assert.equal(items.length, MAX_ROWS);
  assert.match(errors[0], /Only the first/);
});

test("per-item winner matches the single-item comparison and never picks own store", () => {
  const { items } = parseCatalog(SAMPLE_CATALOG);
  const result = compareCatalog(items, "ebay");
  result.rows.forEach((row, i) => {
    const ranked = compareChannels(items[i].item);
    const expected = ranked.find((r) => r.demandIncluded);
    assert.equal(row.bestId, expected.id);
    assert.notEqual(row.bestId, "shopify");
  });
});

test("gain is zero and nothing moves when the baseline already wins", () => {
  const { items } = parseCatalog(SAMPLE_CATALOG);
  const result = compareCatalog(items, "ebay");
  for (const row of result.rows) {
    if (row.bestId === "ebay") {
      assert.equal(row.gain, 0);
      assert.equal(row.moves, false);
    }
  }
  assert.ok(result.monthlyGain >= 0);
  assert.equal(Object.values(result.wins).reduce((a, b) => a + b, 0), items.length);
});

test("monthly gain weights each item by its own order volume", () => {
  const ring = (orders) =>
    compareCatalog(parseCatalog(`name,price,cost,category,orders\nRing,28,5,jewelry,${orders}`).items, "amazon");
  const a = ring(10);
  const b = ring(20);
  assert.ok(a.rows[0].moves);
  assert.ok(a.rows[0].gain > 0);
  assert.ok(Math.abs(a.monthlyGain - a.rows[0].gain * 10) < 1e-9);
  // Not linear in volume: the baseline's subscription is spread over the orders.
  assert.ok(Math.abs(b.monthlyGain - b.rows[0].gain * 20) < 1e-9);
});

test("rejects an unknown baseline", () => {
  assert.throws(() => compareCatalog([], "nope"), /Unknown baseline/);
});

test("CSV export neutralises spreadsheet formulas and quotes commas", () => {
  const { items } = parseCatalog('name,price,cost\n"=HYPERLINK(""x"")",30,5\n"Lamp, brass",30,5');
  const csv = catalogCsv(compareCatalog(items));
  const lines = csv.split("\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith(`"'=HYPERLINK(""x"")"`));
  assert.ok(lines[2].startsWith('"Lamp, brass"'));
});
