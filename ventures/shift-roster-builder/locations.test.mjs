// Several shops in one sales export (2026-11-13). The header rows are the real Square item-sales and Toast
// ItemSelectionDetails headers (eval/real-pos-exports.mjs reads four real files, each with a Location column);
// every data row and location name here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readSales, demandShifts, backtestSales } from "./demand.mjs";

const SQUARE_HEAD = "Date,Time,Time Zone,Category,Item,Qty,Price Point Name,SKU,Modifiers Applied,Gross Sales,Discounts,Net Sales,Tax,Transaction ID,Payment ID,Device Name,Notes,Details,Event Type,Location,Dining Option,Customer ID,Customer Name,Customer Reference ID,Unit,Count,Itemization Type";
const sq = (date, time, net, loc, item = "Latte") => `${date},${time},Eastern Time (US & Canada),Coffee,${item},1,Regular,,,${net},$0.00,${net},$0.50,T${time},P${time},iPad,,,Payment,${loc},,,,,,,Physical Item`;
const TOAST_HEAD = "Location,Order Id,Order #,Sent Date,Order Date,Check Id,Server,Table,Dining Area,Service,Dining Option,Item Selection Id,Item Id,Master Id,SKU,PLU,Menu Item,Menu Subgroup(s),Menu Group,Menu,Sales Category,Gross Price,Discount,Net Price,Qty,Tax,Void?,Deferred,Tax Exempt,Tax Inclusion Option,Dining Option Tax,Tab Name";
const tt = (loc, order, stamp, net) => `${loc},${order},${order % 100},${stamp},${stamp},C${order},Sam,4,Patio,Lunch,Dine In,S${order},I1,,,,Burger,,Mains,Food,Food,${net},0.00,${net},1,1.00,false,false,false,,,`;

// Two weeks: Main St open 7-15 every day busy all day; Harbour open 11-19 on Fri-Sun only.
function twoShops() {
  const rows = [SQUARE_HEAD];
  for (let d = 2; d <= 15; d++) {
    const date = `2026-11-${String(d).padStart(2, "0")}`;
    const wd = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;
    for (let h = 7; h < 15; h++) rows.push(sq(date, `${String(h).padStart(2, "0")}:10:00`, "$130.00", "Main St"));
    if (wd >= 4) for (let h = 11; h < 19; h++) rows.push(sq(date, `${String(h).padStart(2, "0")}:20:00`, "$50.00", "Harbour"));
  }
  return rows.join("\n");
}

test("locations are listed with row counts, busiest first, and planned as one with a note when none is picked", () => {
  const r = readSales(twoShops());
  assert.deepEqual(r.locations, [{ name: "Main St", rows: 112 }, { name: "Harbour", rows: 48 }]);
  assert.equal(r.rows, 160);
  assert.ok(r.notes.some((n) => n.startsWith("The file has 2 locations (Main St: 112 rows; Harbour: 48 rows); they were planned as one shop.")));
});

test("o.location keeps one site (case and punctuation ignored) and says how many rows were left out", () => {
  const r = readSales(twoShops(), { location: "harbour" });
  assert.equal(r.rows, 48);
  assert.equal(r.location, "Harbour");
  assert.deepEqual(r.locations.map((l) => l.name), ["Main St", "Harbour"]);
  assert.ok(r.notes.includes("Only Harbour: 112 rows at other locations left out."));
  assert.ok(r.entries.every((e) => e.day >= 4 && e.hour >= 11));
  assert.equal(readSales(twoShops(), { location: "MAIN-ST" }).rows, 112);
});

test("an unknown location reads nothing and names the ones in the file", () => {
  const r = readSales(twoShops(), { location: "Airport" });
  assert.equal(r.rows, 0);
  assert.ok(r.notes.includes('No rows at location "Airport". Locations in the file: Main St; Harbour.'));
});

test("planned alone, each site gets its own hours: Harbour's week has no Monday and no 7am", () => {
  const all = demandShifts(twoShops(), { splh: 60 });
  const harbour = demandShifts(twoShops(), { splh: 60, location: "Harbour" });
  const main = demandShifts(twoShops(), { splh: 60, location: "Main St" });
  assert.deepEqual(harbour.days.slice(0, 4).map((d) => d.needed), [0, 0, 0, 0]);
  assert.ok(harbour.days.slice(4).every((d) => d.needed === 8));
  assert.ok(main.days.every((d) => d.needed === 24));
  // As one shop, the weekend hours 11-15 add both sites' sales together and Harbour's 15-19 hang off Main St's day.
  assert.ok(all.days[5].needed > main.days[5].needed);
  assert.deepEqual(harbour.locations.map((l) => l.name), ["Main St", "Harbour"]);
  assert.equal(harbour.location, "Harbour");
});

test("the backtest and the labour standard honour the location too", () => {
  const b = backtestSales(twoShops(), { splh: 60, location: "Harbour", warmup: 1 });
  assert.equal(b.location, "Harbour");
  assert.ok(b.notes.includes("Only Harbour: 112 rows at other locations left out."));
  const st = readSales(twoShops(), { location: "Harbour", standard: "2/ticket" });
  assert.equal(st.rows, 48);
});

test("Toast: the leading Location column is read the same way", () => {
  const text = [TOAST_HEAD, tt("Downtown", 1, "11/3/26 12:05 PM", "12.00"), tt("Uptown", 2, "11/3/26 12:15 PM", "9.00"), tt("Downtown", 3, "11/3/26 1:05 PM", "15.00")].join("\n");
  const r = readSales(text);
  assert.deepEqual(r.locations, [{ name: "Downtown", rows: 2 }, { name: "Uptown", rows: 1 }]);
  assert.equal(readSales(text, { location: "uptown" }).entries[0].amount, 9);
});

test("one location: no note, nothing left out", () => {
  const text = [SQUARE_HEAD, sq("2026-11-02", "09:00:00", "$10.00", "Main St"), sq("2026-11-02", "10:00:00", "$12.00", "Main St")].join("\n");
  const r = readSales(text);
  assert.deepEqual(r.locations, [{ name: "Main St", rows: 2 }]);
  assert.ok(!r.notes.some((n) => /locations/.test(n)));
});

test("a row shifted by an unquoted comma (O&#039,Toole, as in a real Square file) keeps its location", () => {
  const text = [SQUARE_HEAD,
    sq("2026-11-02", "09:00:00", "$10.00", "Main St"),
    sq("2026-11-02", "09:30:00", "$10.00", "Main St"),
    sq("2026-11-02", "10:00:00", "$12.00", "Main St", "O&#039,Toole CD"),
    sq("2026-11-02", "11:00:00", "$8.00", "Harbour")].join("\n");
  const r = readSales(text);
  assert.deepEqual(r.locations, [{ name: "Main St", rows: 3 }, { name: "Harbour", rows: 1 }]);
  assert.ok(r.notes.some((n) => n.startsWith("1 row has shifted cells")));
  assert.equal(readSales(text, { location: "Main St" }).rows, 3);
  // Without the shift, "Payment" would have been a third location of one row.
  assert.ok(!r.locations.some((l) => l.name === "Payment"));
});

test("no location column: a picked location says so and the whole file is read", () => {
  const r = readSales("datetime,sales\n2026-11-02 09:00,10\n2026-11-02 10:00,12", { location: "Main St" });
  assert.equal(r.rows, 2);
  assert.deepEqual(r.locations, []);
  assert.ok(r.notes.some((n) => n.startsWith('No location column found')));
});

test("CLI: --location plans one site, --each-location one plan per site under # Location headers", () => {
  const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), "loc-")), f = join(dir, "sales.csv");
  writeFileSync(f, twoShops());
  const one = spawnSync(process.execPath, [CLI, "--from-sales", f, "--splh", "60", "--location", "Harbour", "--half-life", "none"], { encoding: "utf8" });
  assert.equal(one.status, 0, one.stderr);
  assert.match(one.stdout, /^Fri\/Sat\/Sun, 11:00, 19:00, 1$/m);
  assert.doesNotMatch(one.stdout, /Mon/);
  const each = spawnSync(process.execPath, [CLI, "--from-sales", f, "--splh", "60", "--each-location", "--half-life", "none"], { encoding: "utf8" });
  assert.equal(each.status, 0, each.stderr);
  const blocks = each.stdout.split(/^# Location: /m).filter(Boolean);
  assert.deepEqual(blocks.map((b) => b.split("\n")[0]), ["Main St", "Harbour"]);
  assert.match(each.stderr, /^\[Harbour\] Only Harbour: 112 rows/m);
  const bad = spawnSync(process.execPath, [CLI, "--from-sales", f, "--splh", "60", "--each-location", "--location", "Harbour"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
});
