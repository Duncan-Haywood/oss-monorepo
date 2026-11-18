// Copilot Money exports (eval/aggregator-exports.mjs, 2026-11-15). Rows made up; the two real
// files are fetched at run time and never copied.
import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";
import { suggest, buildMemory } from "./categorize.mjs";
import { hideColumn } from "./eval/mercury-exports.mjs";

const copilot = `date,name,amount,status,category,parent category,excluded,tags,type,account,account mask,note,recurring
2026-03-01,Joe's Diner,41.10,posted,Restaurants,Food,false,,regular,Sapphire Preferred,4455,,
2026-03-02,Acme Payroll,-2800.00,posted,Income,,false,,income,Checking,9911,,
2026-03-03,Online Store Refund,-22.99,posted,Shopping,,false,,regular,Sapphire Preferred,4455,,
2026-03-04,Payment To Sapphire,500.00,posted,miscellaneous,,true,,internal transfer,Checking,9911,,
2026-03-04,Payment From Checking,-500.00,posted,miscellaneous,,true,,internal transfer,Sapphire Preferred,4455,,
2026-03-05,Corner Cafe,12.00,pending,Restaurants,Food,false,,regular,Sapphire Preferred,4455,,
`;
const cold = (txn) => suggest(txn, { rules: [], codes: null, memory: buildMemory([]), classifier: { n: 0 }, newPayee: null });

test("Copilot Money: named, money out read from positive amounts, income and refunds in", () => {
  const r = readStatement(copilot);
  assert.equal(r.bank, "copilot-money");
  assert.match(r.inferred, /Copilot Money/);
  assert.deepEqual(r.rows.map((x) => x.cents), [-4110, 280000, 2299, -50000, 50000]);
  assert.deepEqual(r.accountNames, ["Sapphire Preferred", "Checking"]);
  assert.ok(r.problems.some((p) => /pending/.test(p)), "the pending row is skipped and said so");
});

test("Copilot Money: an internal transfer is labelled one whatever its category, and filed as a transfer", () => {
  const r = readStatement(copilot);
  assert.equal(r.rows[0].bankCat, "Restaurants");
  assert.equal(r.rows[3].bankCat, "Internal Transfer");
  assert.equal(r.rows[4].bankCat, "Internal Transfer");
  for (const x of r.rows.slice(3, 5)) assert.equal(cold({ desc: x.desc, cents: x.cents, bankCat: x.bankCat }).account, "transfer");
  // The label speaks only through the bank-category layer: a chart with no "transfer" code still gets it.
  const m = { rules: [], codes: new Set(["6130"]), memory: buildMemory([]), classifier: { n: 0 }, newPayee: null };
  assert.equal(suggest({ desc: "Payment To Sapphire", cents: -50000, bankCat: "Internal Transfer" }, m).account, "transfer");
});

test("Copilot Money: the older layout with a description column, and a hand-trimmed one", () => {
  const a = readStatement(`"date","description","amount","status","category","parent category","excluded","tags","type","account","account mask","note","recurring"
"2024-11-08","Cafe Uno",10.00,"posted","Restaurants",,false,,"regular","Card","5734",,""
"2024-11-09","Employer",-900.00,"posted",,,false,,"income","Checking","1234",,""
`);
  assert.equal(a.bank, "copilot-money");
  assert.deepEqual(a.rows.map((x) => x.cents), [-1000, 90000]);
  const b = readStatement(`date,name,amount,category,parent category,tags,account,account mask,note
1/15/26,Shawarma King,36.36,Eat out,,,Credit Card,1234,
1/14/26,Warehouse Club,285.50,Groceries,,,Credit Card,1234,
`);
  assert.equal(b.bank, "copilot-money");
  assert.deepEqual(b.rows.map((x) => x.cents), [-3636, -28550]);
});

test("hideColumn: a note with a line break does not shift the labels after it", () => {
  const csv = `date,name,amount,status,category,parent category,excluded,tags,type,account,account mask,note,recurring
2026-03-01,Store A,10.00,posted,Groceries,,false,,regular,Card,1,"two
lines",
2026-03-02,Streaming Co,9.00,posted,Subscriptions,,false,,regular,Card,1,,
`;
  const { text, labels } = hideColumn(csv, "category");
  const rows = readStatement(text).rows;
  assert.deepEqual(rows.map((r) => labels[r.line - 1]), ["Groceries", "Subscriptions"]);
  assert.ok(!/Subscriptions|Groceries/.test(text), "the column is blanked");
});

test("Copilot keywords: AI and cloud tools, a fuel brand, parking, a Florida toll and two power companies", () => {
  const cases = [
    ["Ext Credit Card Debit Claude.ai Subscription", "6060"], ["Otter.ai", "6060"], ["Google One", "6060"],
    ["Marathon 257444 Merritt Islanfl", "6160"], ["Marathon", "6160"], ["Justpark", "6160"], ["Ach Debit Nissan - Auto Lease", "6160"],
    ["Cfx -e-pass Retail", "6120"], ["Fpl Direct Debit Elec Pymti", "6140"], ["Dukeenergy Bill Pay", "6140"],
  ];
  for (const [d, want] of cases) assert.equal(cold({ desc: d, cents: -1000 }).account, want, d);
  // Left for a person: a race entry, streaming, ebooks and a tax payment to the IRS.
  for (const d of ["Marathon Registration Fee", "Netflix", "Kindle Unltd*ey4jf0g83", "Us Treas Tax Pymt 00franklin"]) assert.equal(cold({ desc: d, cents: -1000 }).account, null, d);
});
