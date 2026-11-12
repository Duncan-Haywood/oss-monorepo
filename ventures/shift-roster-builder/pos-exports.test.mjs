// Square and Toast item exports (2026-11-12). Both header rows are written from memory of the vendors' help pages
// (squareup.com and doc.toasttab.com refused this host), and every row is made up: no real export has been read yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSales, hourlySales } from "./demand.mjs";

const SQUARE_HEAD = "Date,Time,Time Zone,Category,Item,Qty,Price Point Name,SKU,Modifiers Applied,Gross Sales,Discounts,Net Sales,Tax,Transaction ID,Payment ID,Device Name,Notes,Details,Event Type,Location,Dining Option,Customer ID,Customer Name,Customer Reference ID,Unit,Count,Itemization Type";
const sq = (date, time, gross, disc, net, tx, ev = "Payment") => `${date},${time},Eastern Time (US & Canada),Coffee,Latte,1,Regular,,,${gross},${disc},${net},$0.50,${tx},P${tx},iPad,,,${ev},Main St,,,,,,,Physical Item`;
const TOAST_HEAD = "Location,Order Id,Order #,Sent Date,Order Date,Check Id,Server,Table,Dining Area,Service,Dining Option,Item Selection Id,Item Id,Master Id,SKU,PLU,Menu Item,Menu Subgroup(s),Menu Group,Menu,Sales Category,Gross Price,Discount,Net Price,Qty,Tax,Void?,Deferred,Tax Exempt,Tax Inclusion Option,Dining Option Tax,Tab Name";
const tt = (order, stamp, item, net, voided = "false") => `Main St,${order},${order % 100},${stamp},${stamp},C${order},Sam,4,Patio,Lunch,Dine In,S${order}${item},I1,,,,${item},,Mains,Food,Food,${net},0.00,${net},1,1.00,${voided},false,false,,,`;

test("Square: Net Sales is used, not the Gross Sales column ahead of it", () => {
  const r = readSales([SQUARE_HEAD, sq("2026-03-05", "14:03:22", "$10.00", "-$2.00", "$8.00", "T1")].join("\n"));
  assert.equal(r.rows, 1);
  assert.equal(r.entries[0].amount, 8);
  assert.deepEqual([r.entries[0].day, r.entries[0].hour], [3, 14]);
});

test("Square: an Event Type of Refund is left out even when written positive, and counted as a refund", () => {
  const r = readSales([SQUARE_HEAD,
    sq("2026-03-05", "14:03:22", "$10.00", "$0.00", "$10.00", "T1"),
    sq("2026-03-05", "15:10:00", "$4.00", "$0.00", "$4.00", "T1", "Refund"),
    sq("2026-03-05", "15:20:00", "-$4.00", "$0.00", "-$4.00", "T2", "Refund")].join("\n"));
  assert.equal(r.rows, 1);
  assert.deepEqual(r.refunds, { n: 2, amount: -8 });
});

test("Toast: a line with Void? true is left out and noted; the order still counts once by Order Id", () => {
  const csv = [TOAST_HEAD,
    tt(1001, "3/5/26 2:03 PM", "Burger", "15.00"),
    tt(1001, "3/5/26 2:03 PM", "Fries", "5.00", "true"),
    tt(1002, "3/5/26 2:40 PM", "Salad", "9.00", "TRUE")].join("\n");
  const r = readSales(csv);
  assert.equal(r.rows, 1);
  assert.equal(r.entries[0].amount, 15);
  assert.deepEqual(r.voids, { n: 2, amount: 14 });
  const h = hourlySales(csv);
  assert.ok(h.notes.some((n) => /2 voided lines \(14 in all\) left out/.test(n)), JSON.stringify(h.notes));
  // Counting customers: order 1002 had only a voided line, so one customer, not two.
  const t = readSales(csv, { count: "tickets" });
  assert.equal(t.rows, 1);
  assert.equal(t.voids.n, 2);
});

test("files without a void or event column read as before; a generic Status of Completed is a sale", () => {
  assert.equal(readSales("Date Time,Gross Sales\n2026-03-05 14:00,10\n").entries[0].amount, 10);
  const r = readSales("Date Time,Status,Sales\n2026-03-05 14:00,Completed,10\n2026-03-05 15:00,Cancelled,7\n");
  assert.equal(r.rows, 1);
  assert.equal(r.refunds.n, 1);
});

test("CLI: two weeks of a made-up Toast export become shift lines with the voids noted on stderr", () => {
  const rows = [TOAST_HEAD];
  let id = 2000;
  for (const date of ["3/5/26", "3/12/26"]) for (const [clock, n] of [["11:15 AM", 3], ["12:15 PM", 6], ["1:15 PM", 4]]) for (let k = 0; k < n; k++) rows.push(tt(id++, `${date} ${clock}`, "Burger", "20.00", k === 0 && clock === "12:15 PM" ? "true" : "false"));
  const dir = mkdtempSync(join(tmpdir(), "toast-"));
  writeFileSync(join(dir, "t.csv"), rows.join("\n"));
  const r = spawnSync("node", [new URL("./cli.mjs", import.meta.url).pathname, "--from-sales", join(dir, "t.csv"), "--splh", "40", "--half-life", "none"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Thu/);
  assert.match(r.stderr, /2 voided lines \(40 in all\) left out/);
});
