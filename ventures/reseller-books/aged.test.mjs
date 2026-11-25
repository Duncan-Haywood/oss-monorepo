import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInventory, partThree, agedStock, sampleInventoryCsv } from "./inventory.mjs";
import { buildBooks, sampleFiles, toCsv, summaryText } from "./books.mjs";

const sheet = (...rows) => [{ name: "inventory.csv", text: ["SKU,Item,Qty,Unit cost,Date bought,Date sold,Status", ...rows].join("\n") }];

// Hand-worked example. Ages are counted to Dec 31 2026:
//   Feb 15 -> Dec 31 = 13 + 306 = 319 days; Apr 2 -> Dec 31 = 273; Nov 30 2024 -> Dec 31 2026 = 761.
const lots = parseInventory(sheet(
  "J1,Jacket,6,18,2025-10-10,,",
  "J1,Jacket,20,20,2026-02-15,,",
  "J1,Jacket,1,20,2026-02-15,,personal",
  "C1,Camera,1,120,2025-12-01,,",
  "C1,Camera,3,130,2026-04-02,,",
  "L1,Lamp,2,15,2024-11-30,,",
  "U1,Mug,1,5,,,",
)).lots;
const p = partThree(lots, [{ channel: "eBay", keys: ["J1"], units: 15 }, { channel: "eBay", keys: ["C1"], units: 2 }], { year: 2026 });
const a = agedStock(p);

test("stock on hand by age adds up to line 41, bucket by bucket, from hand-counted days", () => {
  // Jackets 11 x 20 = 220, cameras 2 x 130 = 260, lamps 2 x 15 = 30, mug 5.
  assert.equal(p.line41, 515);
  assert.equal(a.total, p.line41);
  assert.equal(a.units, 16);
  const by = Object.fromEntries(a.buckets.map((b) => [b.label, [b.units, b.cost]]));
  assert.deepEqual(by, {
    "0 to 90 days": [0, 0],
    "91 to 180 days": [0, 0],
    "181 to 365 days": [13, 480],
    "Over a year": [2, 30],
    "No purchase date": [1, 5],
  });
  assert.equal(Math.round(a.buckets.reduce((s, b) => s + b.cost, 0) * 100) / 100, p.line41);
  // Cost-weighted over dated stock: (220*319 + 260*273 + 30*761) / 510 = 321.55.
  assert.equal(a.avgAgeDays, 322);
});

test("items are listed longest-waiting money first, with sell-through of what was available", () => {
  assert.deepEqual(a.items.map((i) => i.item), ["Camera", "Jacket", "Lamp", "Mug"]);
  const by = Object.fromEntries(a.items.map((i) => [i.item, i]));
  assert.equal(by.Camera.avgAgeDays, 273);
  assert.equal(by.Jacket.avgAgeDays, 319);
  assert.equal(by.Lamp.oldestDays, 761);
  assert.equal(by.Mug.avgAgeDays, null);
  // Jackets: 6 + 20 available (the one kept for personal use is not), 15 sold.
  assert.equal(by.Jacket.sellThrough, 15 / 26);
  assert.equal(by.Camera.sellThrough, 0.5);
  assert.equal(by.Lamp.sellThrough, 0);
});

test("units marked sold elsewhere count as sold, not as stock", () => {
  const q = partThree(parseInventory(sheet("B1,Bin,3,10,2026-03-01,2026-06-01,")).lots, [], { year: 2026 });
  const b = agedStock(q);
  assert.equal(b.units, 0);
  assert.deepEqual(b.items, []);
});

test("the books flag stock over a year old, and the CSV and summary carry the age table", () => {
  const s = sampleFiles();
  const inv = sampleInventoryCsv() + "\nOLD-1,Old brass lamp,2,15.00,2024-11-30,,";
  const r = buildBooks([...s.files, { name: "inventory-log.csv", text: inv }], { costs: s.costs });
  const aged = r.inventory.aged;
  assert.equal(aged.total, r.inventory.line41);
  const f = r.findings.find((x) => /bought over a year before December 31, 2026/.test(x.title));
  assert.ok(f, "finding for stock over a year old");
  assert.match(f.title, /^\$30\.00 of stock \(2 unit\(s\)/);
  assert.match(f.detail, /Old brass lamp/);
  const csv = toCsv(r);
  assert.match(csv, /stock_age_at_2026-12-31,units,cost,share_of_closing_inventory/);
  assert.match(csv, /"Over a year",2,30\.00,/);
  assert.match(csv, /"Old brass lamp","OLD-1",2,30\.00,2024-11-30,761,0\.0000/);
  assert.match(summaryText(r), /Stock on hand at 2026-12-31: 30 unit\(s\)/);
});

test("the page renders the age tables", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  for (const id of ["aged-wrap", "aged-buckets", "aged-items", "aged-note"]) assert.match(html, new RegExp(`id="${id}"`));
});
