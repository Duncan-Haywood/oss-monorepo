import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTransactions, parseDate, parseNumber, analyse, overview, summarise, toDispositionsCsv, toPoolCsv, SAMPLE_CSV } from "./calc.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg ?? ""} ${a} vs ${b}`);
const tx = (rows) => parseTransactions(`date,type,asset,quantity,cad value,fee,to asset,to quantity\n${rows}`);

test("dates: ISO and year-first slashes only; ambiguous day/month orders are refused", () => {
  assert.equal(parseDate("2024-05-02"), "2024-05-02");
  assert.equal(parseDate("2024/5/2"), "2024-05-02");
  assert.equal(parseDate("2024-05-02T10:00:00Z"), "2024-05-02");
  assert.equal(parseDate("03/05/2024"), null);
  assert.equal(parseDate("2024-02-30"), null);
});

test("numbers: dollar signs, commas, brackets", () => {
  assert.equal(parseNumber("C$1,234.50"), 1234.5);
  assert.equal(parseNumber("CA$10"), 10);
  assert.equal(parseNumber("(12.5)"), -12.5);
  assert.ok(Number.isNaN(parseNumber("abc")));
});

test("average cost: a sale uses its share of the whole holding, not a chosen lot", () => {
  const { transactions } = tx("2023-01-10,buy,BTC,1,20000,0,,\n2023-06-10,buy,BTC,1,40000,0,,\n2024-02-01,sell,BTC,1,50000,0,,");
  const a = analyse(transactions);
  assert.equal(a.dispositions.length, 1);
  close(a.dispositions[0].acb, 30000);
  close(a.dispositions[0].gain, 20000);
  close(a.pools.BTC.cost, 30000);
  assert.equal(a.pools.BTC.quantity, 1);
});

test("fees: purchase fees raise the ACB, sale fees come off the proceeds", () => {
  const { transactions } = tx("2023-01-10,buy,ETH,2,4000,50,,\n2024-02-01,sell,ETH,1,3000,30,,");
  const d = analyse(transactions).dispositions[0];
  close(d.acb, 2025);
  close(d.proceeds, 2970);
  close(d.gain, 945);
});

test("a loss with no purchase in the 61-day window is allowed in full", () => {
  const { transactions } = tx("2023-01-10,buy,BTC,1,60000,0,,\n2024-02-01,sell,BTC,1,40000,0,,\n2024-06-01,buy,BTC,1,45000,0,,");
  const d = analyse(transactions).dispositions[0];
  close(d.gain, -20000);
  assert.equal(d.denied, 0);
  assert.equal(d.superficial, null);
});

test("superficial loss: bought back within 30 days and still held, the loss is denied and added to ACB", () => {
  const { transactions } = tx("2023-01-10,buy,BTC,1,60000,0,,\n2024-02-01,sell,BTC,1,40000,0,,\n2024-02-15,buy,BTC,1,41000,0,,");
  const a = analyse(transactions);
  const d = a.dispositions[0];
  close(d.gain, -20000);
  close(d.denied, 20000);
  close(d.allowedGain, 0);
  assert.equal(d.superficial.share, 1);
  // Reacquired unit costs 41,000 plus the 20,000 denied loss: no loss vanishes.
  close(a.pools.BTC.cost, 61000);
});

test("superficial loss: a purchase 30 days before the sale also counts, 31 days does not", () => {
  const before = tx("2024-01-02,buy,BTC,1,60000,0,,\n2024-02-01,sell,BTC,1,40000,0,,");
  // 30 days earlier (Jan 2 -> Feb 1) but the earlier purchase is the unit sold, so nothing is held after: not superficial.
  assert.equal(analyse(before.transactions).dispositions[0].denied, 0);
  const held = tx("2023-01-10,buy,BTC,2,120000,0,,\n2024-01-02,buy,BTC,1,60000,0,,\n2024-02-01,sell,BTC,1,40000,0,,");
  const d = analyse(held.transactions).dispositions[0];
  assert.ok(d.denied > 0, "bought 30 days before and still held");
  const far = tx("2023-01-10,buy,BTC,2,120000,0,,\n2024-01-01,buy,BTC,1,60000,0,,\n2024-02-01,sell,BTC,1,40000,0,,");
  assert.equal(analyse(far.transactions).dispositions[0].denied, 0, "31 days before is outside the window");
});

test("superficial loss: partial, limited by the units bought back", () => {
  const { transactions } = tx("2023-01-10,buy,BTC,1,60000,0,,\n2024-02-01,sell,BTC,1,40000,0,,\n2024-02-10,buy,BTC,0.25,10000,0,,");
  const d = analyse(transactions).dispositions[0];
  assert.equal(d.superficial.share, 0.25);
  close(d.denied, 5000);
  close(d.allowedGain, -15000);
});

test("superficial loss: bought back but sold again before day 30 ends is not denied", () => {
  const { transactions } = tx("2023-01-10,buy,BTC,1,60000,0,,\n2024-02-01,sell,BTC,1,40000,0,,\n2024-02-10,buy,BTC,1,41000,0,,\n2024-02-20,sell,BTC,1,42000,0,,");
  const a = analyse(transactions);
  const first = a.dispositions[0];
  assert.equal(first.denied, 0);
  close(first.gain, -20000);
});

test("a gain is never touched by the superficial loss rule", () => {
  const { transactions } = tx("2023-01-10,buy,BTC,1,20000,0,,\n2024-02-01,sell,BTC,1,40000,0,,\n2024-02-05,buy,BTC,1,41000,0,,");
  const d = analyse(transactions).dispositions[0];
  assert.equal(d.denied, 0);
  close(d.allowedGain, 20000);
});

test("swap: disposition of the coin given up, acquisition of the coin received, both at the CAD value", () => {
  const { transactions } = tx("2023-01-10,buy,ETH,2,4000,0,,\n2024-03-01,swap,ETH,1,3000,10,SOL,20");
  const a = analyse(transactions);
  close(a.dispositions[0].acb, 2000);
  close(a.dispositions[0].proceeds, 2990);
  close(a.pools.SOL.cost, 3000);
  assert.equal(a.pools.SOL.quantity, 20);
});

test("income is added to ACB at its value when received and listed separately", () => {
  const { transactions } = tx("2024-02-14,income,ETH,1,3000,0,,\n2024-08-01,sell,ETH,1,3500,0,,");
  const a = analyse(transactions);
  assert.equal(a.income.length, 1);
  close(a.income[0].value, 3000);
  close(a.dispositions[0].gain, 500);
});

test("selling more than held warns and does not invent a cost", () => {
  const { transactions } = tx("2023-01-10,buy,BTC,1,20000,0,,\n2024-02-01,sell,BTC,2,70000,0,,");
  const a = analyse(transactions);
  assert.ok(a.warnings.some((w) => /more than you held/.test(w)));
  close(a.dispositions[0].acb, 20000);
});

test("rows that cannot be read are skipped with a reason, never guessed", () => {
  const r = tx("03/05/2024,buy,BTC,1,100,0,,\n2024-01-01,hodl,BTC,1,100,0,,\n2024-01-01,buy,BTC,0,100,0,,\n2024-01-01,buy,BTC,1,,0,,\n2024-01-01,transfer,BTC,1,100,0,,\n2024-01-01,swap,ETH,1,100,0,,\n2024-01-01,buy,BTC,1,100,0,,");
  assert.equal(r.transactions.length, 1);
  assert.equal(r.warnings.length, 6);
  assert.ok(r.warnings.some((w) => /transfer between your own wallets/.test(w)));
});

test("missing required column is reported", () => {
  const r = parseTransactions("date,type,asset,quantity\n2024-01-01,buy,BTC,1");
  assert.deepEqual(r.transactions, []);
  assert.match(r.warnings[0], /cad value/i);
});

test("sample: the figures the guide quotes", () => {
  const a = analyse(parseTransactions(SAMPLE_CSV).transactions);
  const btc = a.dispositions.filter((d) => d.asset === "BTC");
  close(btc[0].gain, 3657.5);
  close(btc[1].gain, -776.75);
  close(btc[1].denied, 582.5625);
  close(btc[1].allowedGain, -194.1875);
  close(a.pools.BTC.cost, 10803.3125);
  assert.equal(a.pools.BTC.quantity, 0.35);
});

test("year summary: 50% inclusion, losses carried and applied, optional tax estimate", () => {
  const { transactions } = tx("2022-01-10,buy,BTC,2,100000,0,,\n2022-12-01,sell,BTC,1,30000,0,,\n2024-03-01,sell,BTC,1,90000,0,,");
  const o = overview(transactions, { marginalRate: 0.4 });
  assert.deepEqual(o.years, ["2022", "2024"]);
  const y22 = o.summaries[0], y24 = o.summaries[1];
  close(y22.net, -20000);
  close(y22.netCapitalLoss, 10000);
  close(y22.lossCarried, 10000);
  close(y24.net, 40000);
  close(y24.taxableGain, 20000);
  close(y24.bfUsed, 10000);
  close(y24.taxableAfterLosses, 10000);
  close(y24.tax, 4000);
});

test("inclusion rate and brought-forward losses are inputs", () => {
  const { transactions } = tx("2023-01-10,buy,BTC,1,10000,0,,\n2024-03-01,sell,BTC,1,20000,0,,");
  const a = analyse(transactions);
  const s = summarise(a.dispositions, "2024", { inclusionRate: 2 / 3, netCapitalLossesBroughtForward: 1000 });
  close(s.taxableGain, 6666.67);
  close(s.taxableAfterLosses, 5666.67);
});

test("conservation: ACB of units sold plus ACB still held equals every cost put in, with no loss denied", () => {
  const { transactions } = tx("2023-01-01,buy,BTC,1,100,3,,\n2023-02-01,buy,BTC,2,350,0,,\n2023-03-01,sell,BTC,1.5,400,2,,\n2023-04-01,income,BTC,0.5,90,0,,\n2023-05-01,sell,BTC,1,200,0,,");
  const a = analyse(transactions);
  const costIn = 103 + 350 + 90;
  const costOut = a.dispositions.reduce((s, d) => s + d.acb, 0);
  close(costOut + a.pools.BTC.cost, costIn);
});

test("conservation with superficial losses: ACB used plus ACB held equals cost in plus the denied loss moved into ACB", () => {
  const { transactions } = tx("2023-01-10,buy,BTC,1,60000,0,,\n2024-02-01,sell,BTC,0.5,10000,0,,\n2024-02-10,buy,BTC,0.5,10000,0,,");
  const a = analyse(transactions);
  const d = a.dispositions[0];
  close(d.gain, -20000);
  close(d.denied, 20000);
  close(d.acb + a.pools.BTC.cost, 70000 + d.denied);
});

test("CSV out neutralises spreadsheet formulas and carries the superficial loss note", () => {
  const a = analyse(parseTransactions(SAMPLE_CSV).transactions);
  const csv = toDispositionsCsv(a.dispositions);
  assert.match(csv, /superficial loss: 0\.15 bought/);
  assert.match(csv, /^year,date,coin,units/);
  const evil = analyse(tx("2023-01-01,buy,=CMD,1,10,0,,\n2024-01-01,sell,=CMD,1,20,0,,").transactions);
  assert.match(toDispositionsCsv(evil.dispositions), /'=CMD/);
  assert.match(toPoolCsv(a.pools), /^coin,units held,total ACB CAD,ACB per unit CAD/);
});
