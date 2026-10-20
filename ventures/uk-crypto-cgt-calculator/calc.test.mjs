import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_CSV, parseTransactions, parseDate, parseNumber, analyse, summarise, overview, taxYearOf, toDisposalsCsv, toPoolCsv, round2 } from "./calc.mjs";

const tx = (csv) => {
  const r = parseTransactions(csv);
  assert.deepEqual(r.warnings, []);
  return r.transactions;
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg ?? ""} ${a} vs ${b}`);
const HEAD = "date,type,asset,quantity,gbp value,fee,to asset,to quantity\n";

test("a plain pool: average cost across two purchases, then a part sale", () => {
  // 1 BTC for 10,000 then 1 BTC for 30,000: pool 2 BTC at 40,000. Sell 0.5 for 15,000.
  const a = analyse(tx(HEAD + "2022-06-01,buy,BTC,1,10000,,,\n2022-07-01,buy,BTC,1,30000,,,\n2022-08-01,sell,BTC,0.5,15000,,,\n"));
  assert.equal(a.disposals.length, 1);
  const d = a.disposals[0];
  assert.equal(d.rule, "pool");
  near(d.cost, 10000, "20,000 per BTC x 0.5");
  near(d.gain, 5000);
  near(a.pools.BTC.quantity, 1.5);
  near(a.pools.BTC.cost, 30000);
});

test("same-day rule beats the pool, and the pool keeps its own average", () => {
  const a = analyse(tx(HEAD + "2022-01-01,buy,BTC,1,10000,,,\n2022-09-09,sell,BTC,1,30000,,,\n2022-09-09,buy,BTC,0.4,14000,,,\n"));
  const rows = a.disposals;
  assert.deepEqual(rows.map((r) => r.rule), ["same-day", "pool"]);
  near(rows[0].quantity, 0.4); near(rows[0].proceeds, 12000); near(rows[0].cost, 14000); near(rows[0].gain, -2000);
  near(rows[1].quantity, 0.6); near(rows[1].proceeds, 18000); near(rows[1].cost, 6000); near(rows[1].gain, 12000);
  near(a.pools.BTC.quantity, 0.4);
  near(a.pools.BTC.cost, 4000);
});

test("30-day rule matches a repurchase and keeps it out of the pool", () => {
  // Pool 1 BTC at 10,000. Sell 1 on 1 Nov for 30,000. Buy 1 back on 20 Nov for 28,000.
  const a = analyse(tx(HEAD + "2022-01-01,buy,BTC,1,10000,,,\n2022-11-01,sell,BTC,1,30000,,,\n2022-11-20,buy,BTC,1,28000,,,\n"));
  assert.equal(a.disposals.length, 1);
  assert.equal(a.disposals[0].rule, "30-day");
  assert.equal(a.disposals[0].matchedWith, "2022-11-20");
  near(a.disposals[0].gain, 2000);
  // The old pool is untouched and the new coin is not double counted.
  near(a.pools.BTC.quantity, 1);
  near(a.pools.BTC.cost, 10000);
});

test("day 31 is outside the 30-day window, day 30 is inside", () => {
  const out = (buy) => analyse(tx(HEAD + `2022-01-01,buy,BTC,1,10000,,,\n2022-11-01,sell,BTC,1,30000,,,\n${buy},buy,BTC,1,28000,,,\n`)).disposals[0].rule;
  assert.equal(out("2022-12-01"), "30-day");
  assert.equal(out("2022-12-02"), "pool");
});

test("fees add to cost on purchases and come off proceeds on sales", () => {
  const a = analyse(tx(HEAD + "2022-01-01,buy,ETH,10,1000,50,,\n2022-02-01,sell,ETH,10,2000,30,,\n"));
  near(a.disposals[0].proceeds, 1970);
  near(a.disposals[0].cost, 1050);
  near(a.disposals[0].gain, 920);
});

test("a swap is a disposal of one asset and an acquisition of the other at the same value", () => {
  const a = analyse(tx(HEAD + "2022-01-01,buy,ETH,2,1000,,,\n2022-06-01,swap,ETH,1,1500,10,SOL,50\n2022-09-01,sell,SOL,50,2000,,,\n"));
  const eth = a.disposals.find((d) => d.asset === "ETH");
  near(eth.proceeds, 1490); near(eth.cost, 500); near(eth.gain, 990);
  const sol = a.disposals.find((d) => d.asset === "SOL");
  near(sol.cost, 1500); near(sol.gain, 500);
});

test("income (staking) enters the pool at its value and is listed", () => {
  const a = analyse(tx(HEAD + "2023-05-01,income,ETH,1,1800,,,\n2023-06-01,sell,ETH,1,2000,,,\n"));
  near(a.disposals[0].cost, 1800);
  assert.equal(a.income.length, 1);
  assert.equal(a.income[0].taxYear, "2023-24");
});

test("selling more than the pool holds warns and leaves the unmatched part without cost", () => {
  const a = analyse(tx(HEAD + "2022-01-01,buy,BTC,1,10000,,,\n2022-03-01,sell,BTC,1.5,30000,,,\n"));
  assert.equal(a.warnings.length, 1);
  assert.match(a.warnings[0], /0\.5 more than the pool held/);
  near(a.disposals[0].cost, 10000);
});

test("a donation to charity leaves the pool at cost with no gain row", () => {
  const a = analyse(tx(HEAD + "2022-01-01,buy,BTC,2,20000,,,\n2022-03-01,donate,BTC,1,0,,,\n"));
  assert.equal(a.disposals.length, 0);
  near(a.pools.BTC.quantity, 1); near(a.pools.BTC.cost, 10000);
});

test("tax years run 6 April to 5 April", () => {
  assert.equal(taxYearOf("2024-04-05"), "2023-24");
  assert.equal(taxYearOf("2024-04-06"), "2024-25");
  assert.equal(taxYearOf("2031-01-01"), "2030-31");
});

test("estimate: exempt amount, then the basic band shared with income", () => {
  const a = analyse(tx(HEAD + "2023-06-01,buy,BTC,1,10000,,,\n2023-12-01,sell,BTC,1,20000,,,\n"));
  // gain 10,000 in 2023-24: AEA 6,000, taxable 4,000.
  let s = summarise(a.disposals, "2023-24", { income: 20000 });
  near(s.estimate.taxable, 4000); near(s.estimate.tax, 400); // all inside the basic band at 10%
  s = summarise(a.disposals, "2023-24", { income: 50000 });
  near(s.estimate.tax, 800); // all at the 20% higher rate
  s = summarise(a.disposals, "2023-24", { income: 35700 });
  near(s.estimate.tax, 2000 * 0.1 + 2000 * 0.2); // 2,000 of room left
});

test("estimate: a loss in the same year is used before the exempt amount, brought-forward losses only as needed", () => {
  const csv = HEAD + "2024-06-01,buy,BTC,2,20000,,,\n2024-07-01,sell,BTC,1,15000,,,\n2024-08-01,sell,BTC,1,8000,,,\n";
  const a = analyse(tx(csv)); // gains 5,000 and losses 2,000 -> net 3,000
  let s = summarise(a.disposals, "2024-25", { lossesBroughtForward: 10000 });
  near(s.net, 3000);
  near(s.estimate.bfUsed, 0, "net is already within the exempt amount");
  near(s.estimate.tax, 0);
  near(s.estimate.lossCarried, 10000);
});

test("2024-25 splits at 30 October 2024 and reliefs go against the higher-rated gains first", () => {
  const csv = HEAD + "2024-05-01,buy,BTC,2,10000,,,\n2024-06-01,sell,BTC,1,15000,,,\n2024-12-01,sell,BTC,1,15000,,,\n";
  const a = analyse(tx(csv)); // gain 10,000 before the change, 10,000 after
  const s = summarise(a.disposals, "2024-25", { income: 100000 });
  // AEA 3,000 comes off the later (24%) gains: 7,000 x 24% + 10,000 x 20%
  near(s.estimate.tax, 7000 * 0.24 + 10000 * 0.2);
});

test("losses carry forward year to year in overview()", () => {
  const csv = HEAD + "2022-06-01,buy,BTC,2,40000,,,\n2022-07-01,sell,BTC,1,10000,,,\n2023-07-01,sell,BTC,1,60000,,,\n";
  const o = overview(tx(csv), { income: 0 });
  const [y1, y2] = o.summaries;
  near(y1.net, -10000);
  near(y1.estimate.lossCarried, 10000);
  near(y2.net, 40000);
  near(y2.estimate.bfUsed, 10000); // 40,000 - 6,000 AEA = 34,000 exposed, all 10,000 usable
  near(y2.estimate.taxable, 24000);
});

test("end-of-year pool statements", () => {
  const o = overview(tx(HEAD + "2022-01-01,buy,BTC,1,10000,,,\n2022-09-01,buy,BTC,1,30000,,,\n"));
  near(o.poolsByYear["2021-22"].BTC.quantity, 1);
  near(o.poolsByYear["2022-23"].BTC.cost, 40000);
});

test("parsing: aliases, UK dates, currency symbols, bad rows reported not guessed", () => {
  assert.equal(parseDate("05/03/2024"), "2024-03-05");
  assert.equal(parseDate("2024-03-05T10:15:00Z"), "2024-03-05");
  assert.equal(parseDate("31/02/2024"), null);
  assert.equal(parseNumber("£1,234.50"), 1234.5);
  assert.equal(parseNumber("(12.5)"), -12.5);
  assert.ok(Number.isNaN(parseNumber("abc")));
  const r = parseTransactions('Date,Transaction Type,Coin,Amount,Total\n01/02/2023,Buy,btc,0.5,"£5,000"\n01/02/2023,Frobnicate,btc,1,1\n99/99/2023,Buy,btc,1,1\n03/02/2023,Sell,BTC,0.1,\n');
  assert.equal(r.transactions.length, 1);
  assert.equal(r.transactions[0].asset, "BTC");
  assert.equal(r.transactions[0].value, 5000);
  assert.equal(r.warnings.length, 3);
  assert.match(r.warnings[2], /no GBP value/);
  assert.match(parseTransactions("a,b\n1,2\n").warnings[0], /Missing a "date" column/);
});

test("CSV export keeps the working and neutralises formulas", () => {
  const o = overview(tx(SAMPLE_CSV));
  const csv = toDisposalsCsv(o.disposals);
  assert.match(csv, /^tax year,disposal date,asset,rule,/);
  assert.equal(csv.trim().split("\n").length, o.disposals.length + 1);
  assert.match(toPoolCsv(o.pools), /^asset,pool quantity,pool allowable cost GBP\nBTC,/);
  const bad = toDisposalsCsv([{ taxYear: "2024-25", date: "2024-05-01", asset: "=CMD()", rule: "pool", quantity: 1, proceeds: 1, cost: 1, gain: 0 }]);
  assert.match(bad, /'=CMD\(\)/);
});

test("the sample matches the figures worked by hand in the guide", () => {
  const o = overview(tx(SAMPLE_CSV), { income: 30000 });
  const s = o.summaries.find((x) => x.year === "2024-25");
  near(s.proceeds, 36147); near(s.cost, 29343.5625);
  near(round2(s.net), 6803.44);
});
