// Shapes seen in the first real Square and Toast exports read (2026-11-13; public files, not committed, see README
// "Real Square and Toast exports"). Every row below is made up; only the shapes are copied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSales, demandShifts } from "./demand.mjs";
import { csvLines } from "./import-staff.mjs";
import { importShiftsCsv } from "./import-shifts.mjs";

// Square's header before and after it added Commission and Employee part-way through 2026 (both seen in one shop's files).
const OLD = "Date,Time,Time Zone,Category,Item,Qty,Price Point Name,SKU,Modifiers Applied,Gross Sales,Discounts,Net Sales,Tax,Transaction ID,Payment ID,Device Name,Notes,Details,Event Type,Location,Dining Option,Customer ID,Customer Name,Customer Reference ID,Unit,Count,GTIN,Itemization Type,Fulfillment Note,Channel,Token,Card Brand,PAN Suffix";
const NEW = "Date,Time,Time Zone,Category,Item,Qty,Price Point Name,SKU,Modifiers Applied,Gross Sales,Discounts,Net Sales,Tax,Transaction ID,Payment ID,Device Name,Notes,Details,Event Type,Location,Dining Option,Customer ID,Customer Name,Customer Reference ID,Unit,Count,GTIN,Itemization Type,Commission,Employee,Fulfillment Note,Channel,Token,Card Brand,PAN Suffix";
const row = (head, { date, time, net, tok, notes = "", ev = "Payment" }) => {
  const v = { Date: date, Time: time, "Time Zone": "Eastern Time (US & Canada)", Item: "Mug", Qty: "1.0", "Gross Sales": net, Discounts: "$0.00", "Net Sales": net, Tax: "$0.00", "Transaction ID": "T" + tok, "Payment ID": "P" + tok, Notes: notes, "Event Type": ev, Location: "Stall", Commission: "$0.00", Employee: "Sam", Token: tok };
  return head.split(",").map((h) => (v[h] === undefined ? "" : /[",\n]/.test(v[h]) ? `"${v[h].replace(/"/g, '""')}"` : v[h])).join(",");
};

test("csvLines: a newline inside a quoted cell does not end the row", () => {
  assert.deepEqual(csvLines('a,b\n1,"two\nlines"\r\n3,x\n'), ["a,b", '1,"two lines"', "3,x"]);
  assert.deepEqual(csvLines('a,b\n1,"""quoted""\nstill"\n'), ["a,b", '1,"""quoted"" still"']);
  // A quote never closed: line by line, as before, rather than one row swallowing the rest of the file.
  assert.deepEqual(csvLines('a,b\n1,5" pin\n2,x'), ["a,b", '1,5" pin', "2,x"]);
});

test("Square: a description over several lines in Notes is one row, with no skipped-row noise", () => {
  const csv = [OLD,
    row(OLD, { date: "2026-08-01", time: "10:15:00", net: "$20.00", tok: "A", notes: "Pewter pin.\nFastens below the shoulder.\n\nHand made." }),
    row(OLD, { date: "2026-08-01", time: "11:30:00", net: "$5.00", tok: "B" })].join("\n");
  const r = readSales(csv);
  assert.equal(r.rows, 2);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.entries.map((e) => [e.hour, e.amount]), [[10, 20], [11, 5]]);
});

test("pasted files: header copies are dropped, a moved column is matched by name, an overlap row counts once", () => {
  // File 2 has the newer header, so Net Sales and the rest sit in the same place but Token moves two cells right.
  const f1 = [OLD, row(OLD, { date: "2026-06-06", time: "09:10:00", net: "$10.00", tok: "A" }), row(OLD, { date: "2026-06-13", time: "09:20:00", net: "$12.00", tok: "B" })];
  const f2 = [NEW, row(NEW, { date: "2026-06-13", time: "09:20:00", net: "$12.00", tok: "B" }), row(NEW, { date: "2026-06-20", time: "09:30:00", net: "$7.00", tok: "C" })];
  const r = readSales([...f1, ...f2].join("\n"));
  assert.equal(r.rows, 3);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.entries.map((e) => [e.key, e.amount]), [["2026-6-6", 10], ["2026-6-13", 12], ["2026-6-20", 7]]);
  assert.ok(r.notes.some((n) => /^2 files pasted together.*1 of them has a different header row/.test(n)), r.notes.join(" | "));
  assert.ok(r.notes.some((n) => /^1 row repeats a row of an earlier file/.test(n)), r.notes.join(" | "));
});

test("pasted files: identical lines inside one file are two sales, not a repeat", () => {
  const same = row(OLD, { date: "2026-06-06", time: "09:10:00", net: "$3.00", tok: "" });
  const r = readSales([OLD, same, same].join("\n"));
  assert.equal(r.rows, 2);
  assert.equal(r.entries.reduce((a, e) => a + e.amount, 0), 6);
  assert.ok(!r.notes.some((n) => /pasted together|repeat/.test(n)));
});

test("pasted files: a column missing from a later file reads as empty, not shifted", () => {
  // Newer header first this time: the older file lacks Commission and Employee.
  const r = readSales([NEW, row(NEW, { date: "2026-06-06", time: "09:10:00", net: "$10.00", tok: "A" }),
    OLD, row(OLD, { date: "2026-06-13", time: "14:00:00", net: "$4.00", tok: "B", ev: "Refund" }), row(OLD, { date: "2026-06-13", time: "15:00:00", net: "$6.00", tok: "C" })].join("\n"));
  assert.deepEqual(r.entries.map((e) => [e.hour, e.amount]), [[9, 10], [15, 6]]);
  assert.equal(r.refunds.n, 1);
});

test("left-unstaffed note groups the same hour: one entry with a range of people", () => {
  // One day, a 1-hour spike to 6 heads after 4 hours at 1: five 1-hour runs that a 4-hour shift would not pay for.
  const rows = ["datetime,sales"];
  for (const [h, v] of [[10, 50], [11, 50], [12, 50], [13, 50], [14, 360]]) rows.push(`2026-08-01 ${h}:00,${v}`);
  const s = demandShifts(rows.join("\n"), { splh: 60 });
  const note = s.notes.find((n) => n.startsWith("Left unstaffed"));
  assert.ok(note, s.notes.join(" | "));
  assert.match(note, /Sat 14:00-15:00 \(people 2-6\)\.$/);
});

test("published-schedule import: a note over two lines does not split the shift", () => {
  const r = importShiftsCsv('Date,Start,End,Position,Notes\n2026-11-02,9:00,17:00,Server,"cover for\nAna"\n2026-11-03,9:00,17:00,Server,\n');
  assert.deepEqual(r.skipped, []);
  assert.match(r.shiftsText, /Mon.*9:00.*17:00/);
});
