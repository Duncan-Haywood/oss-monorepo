import { test } from "node:test";
import assert from "node:assert/strict";
import { isInventoryLog, parseInventory, partThree, costLines, sampleInventoryCsv } from "./inventory.mjs";
import { buildBooks, detectKind, sampleFiles, soldUnits, summaryText } from "./books.mjs";

const file = (text, name = "inventory.csv") => ({ name, text });
const sheet = (...rows) => ["SKU,Item,Qty,Unit cost,Date bought,Date sold,Status", ...rows].join("\n");

test("a sourcing sheet is recognised, and no marketplace export or trip log is taken for one", () => {
  assert.ok(isInventoryLog(sampleInventoryCsv()));
  assert.equal(detectKind(sampleInventoryCsv()), "inventory");
  assert.ok(isInventoryLog("Item,Purchase price,Purchase date\nLamp,4,2026-01-02"));
  assert.ok(!isInventoryLog("Item,Cost\nLamp,4"), "a cost list with no purchase date is step 2's cost list, not an inventory log");
  for (const f of sampleFiles().files) assert.notEqual(detectKind(f.text), "inventory", f.name);
});

test("rows are read with quantity, unit or total cost and dates; unreadable rows are skipped with a reason", () => {
  const { lots, skipped } = parseInventory([file([
    "Item,Quantity,Total cost,Purchase date",
    "Lamp,4,10.00,1/2/2026",
    "\"Mug, blue\",2,$7,2026-02-01",
    "Chair,0,5,2026-02-01",
    "Desk,1,abc,2026-02-01",
    "Rug,1,9,someday",
    "Total,7,17,",
  ].join("\n"))]);
  assert.equal(lots.length, 2);
  assert.deepEqual([lots[0].qty, lots[0].unitCost, lots[0].bought], [4, 2.5, "2026-01-02"]);
  assert.deepEqual([lots[1].item, lots[1].unitCost], ["Mug, blue", 3.5]);
  assert.deepEqual(skipped.map((s) => s.reason), ["quantity is not a whole number above zero", "cost not readable", "purchase date not readable", "total row"]);
});

test("Part III: FIFO matching, opening from the log, closing inventory, and 42 = 35 + 36 - 41", () => {
  const { lots } = parseInventory([file(sheet(
    "A1,Alpha,2,10,2025-12-01,,",
    "A1,Alpha,3,12,2026-03-01,,",
    "B1,Beta,1,50,2026-05-01,,",
    "C1,Gamma,1,8,2025-06-01,2025-09-01,",
    "D1,Delta,1,30,2027-01-05,,",
  ))]);
  const p = partThree(lots, [{ channel: "eBay", keys: ["A1"], units: 3 }], { year: 2026 });
  // Gamma sold in 2025 and Delta bought in 2027 are out of the year.
  assert.equal(p.line35, 20);
  assert.equal(p.line36, 86);
  assert.equal(p.line40, 106);
  // Oldest first: the two at 10, then one at 12. Left: two Alpha at 12 and Beta.
  assert.equal(p.matchedCost, 32);
  assert.equal(p.line41, 74);
  assert.equal(p.closingUnits, 3);
  assert.equal(p.line42, 32);
  assert.equal(p.line42, Math.round((p.line35 + p.line36 - p.line41) * 100) / 100);
  assert.equal(p.boughtAfter, 1);
});

test("an entered opening inventory is used for line 35 and the difference from the log is explained", () => {
  const { lots } = parseInventory([file(sheet("A1,Alpha,2,10,2025-12-01,,"))]);
  const p = partThree(lots, [], { year: 2026, opening: 25 });
  assert.equal(p.openingSource, "entered");
  assert.equal(p.line35, 25);
  assert.equal(p.openingFromLog, 20);
  assert.equal(p.line42, 5, "line 40 (25) less the 20 still on hand");
});

test("personal withdrawals reduce line 36; donations leave inventory; a row sold elsewhere is not on hand", () => {
  const { lots } = parseInventory([file(sheet(
    "A1,Alpha,1,10,2026-01-01,,personal",
    "B1,Beta,1,20,2026-01-01,,donated",
    "C1,Gamma,1,30,2026-01-01,2026-06-01,",
    "D1,Delta,1,40,2026-01-01,2027-02-01,",
  ))]);
  const p = partThree(lots, [], { year: 2026 });
  assert.equal(p.withdrawn, 10);
  assert.equal(p.line36, 90);
  assert.equal(p.removedOther, 20);
  assert.equal(p.elsewhereUnits, 1);
  assert.equal(p.line41, 40, "Delta, sold the next year, is still on hand at December 31");
  assert.equal(p.line42, 50);
});

test("a sale with no purchase in the log is named and never takes another item's cost", () => {
  const { lots } = parseInventory([file(sheet("A1,Alpha,1,10,2026-01-01,,"))]);
  const p = partThree(lots, [{ channel: "Poshmark", name: "Zeta", keys: ["Z9", "Zeta"], units: 1 }, { channel: "eBay", keys: ["A1"], units: 2 }], { year: 2026 });
  assert.equal(p.matchedUnits, 1);
  assert.equal(p.unmatchedUnits, 2);
  assert.deepEqual(p.unmatched.map((u) => [u.item, u.units, u.matchedAny]), [["Zeta", 1, false], ["A1", 1, true]]);
  assert.equal(p.line41, 0);
});

test("costLines gives the average unit cost per SKU and per title", () => {
  const { lots } = parseInventory([file(sheet("A1,Alpha,1,10,2026-01-01,,", "A1,Alpha,3,14,2026-02-01,,"))]);
  assert.deepEqual(costLines(lots).split("\n"), ["A1,13.00", "Alpha,13.00"]);
});

test("books with the example: the log costs eBay sales, fills Part III, and the worksheet carries it to line 4", () => {
  const s = sampleFiles();
  const ebayOnly = buildBooks([s.files[0], file(sampleInventoryCsv())]);
  const ebay = ebayOnly.channels[0];
  assert.notEqual(ebay.profit, null, "every eBay sale has a cost from the log alone");
  const p = ebayOnly.inventory;
  assert.equal(p.year, 2026);
  assert.equal(p.unmatchedUnits, 0);
  // 3 cameras at 142, 1 LEGO set, 4 jackets, 20 sleeve lots left (sample stock).
  assert.equal(p.line41, 1186);
  assert.equal(p.line42, Math.round((p.line35 + p.line36 - p.line41) * 100) / 100);
  assert.equal(p.line42, Math.round((p.matchedCost + p.elsewhereCost) * 100) / 100, "everything that left the shelf, and nothing else");
  const line4 = ebayOnly.schedule.find((r) => r.line === "4 / 42");
  assert.equal(line4.amount, p.line42);
  for (const l of ["Part III 35", "Part III 36", "Part III 40", "Part III 41", "Part III 42"]) assert.ok(ebayOnly.schedule.some((r) => r.line === l), l);
  assert.match(summaryText(ebayOnly), /Part III \(2026, at cost\)/);

  const all = buildBooks([...s.files, file(sampleInventoryCsv())], { costs: s.costs });
  assert.ok(all.inventory.unmatchedUnits > 0, "other channels' sales are not in the eBay-only log");
  assert.ok(all.findings.some((f) => f.severity === "high" && /no purchase in the inventory log/.test(f.title)));
});

test("Part III needs one tax year of reports", () => {
  const s = sampleFiles();
  const r = buildBooks([s.files[0], file(sampleInventoryCsv())]);
  const years = new Set(r.months.map((m) => m.month.slice(0, 4)));
  assert.equal(years.size, 1);
  // The same store a year earlier, as a second download: reports now span 2025 and 2026.
  const earlier = s.files[0].text.replace(/, 2026"/g, ', 2025"');
  const two = buildBooks([s.files[0], { name: "ebay-2025.csv", text: earlier }, file(sampleInventoryCsv())]);
  assert.equal(new Set(two.months.map((m) => m.month.slice(0, 4))).size, 2);
  assert.match(two.inventory.invalid, /one tax year/);
  assert.ok(!two.schedule.some((x) => x.line.startsWith("Part III")));
});

test("soldUnits reads every channel the books build", () => {
  const s = sampleFiles();
  const r = buildBooks(s.files, { costs: s.costs });
  const channels = new Set(soldUnits(r.details).map((u) => u.channel));
  for (const c of r.channels) if (c.label !== "Etsy") assert.ok(channels.has(c.label), c.label);
  // Etsy names its items only in the Sold Order Items file; without it the page says so.
  const inv = buildBooks([...s.files, file(sampleInventoryCsv())], { costs: s.costs }).inventory;
  assert.ok(inv.notes.some((n) => /Sold Order Items file/.test(n)));
});
