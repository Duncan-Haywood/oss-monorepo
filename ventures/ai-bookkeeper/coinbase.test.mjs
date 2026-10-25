import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement as readBankCsv } from "./bank.mjs";

// Layout from memory of Coinbase's transaction-history CSV; rows made up.
const CSV = `Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes
2024-03-02T14:05:11Z,Buy,BTC,0.001,USD,62000.00,$62.00,$63.25,$1.25,Bought 0.001 BTC for $63.25 USD
2024-03-09T10:00:00Z,Sell,ETH,0.5,USD,3900.00,$1950.00,$1940.00,$10.00,Sold 0.5 ETH for $1940.00 USD
2024-03-10T10:00:00Z,Convert,ETH,0.1,USD,3900.00,$390.00,$388.00,$2.00,Converted 0.1 ETH to BTC
2024-03-11T10:00:00Z,Staking Income,SOL,0.02,USD,150.00,$3.00,$3.00,,Received 0.02 SOL
`;

test("Coinbase export: total is the amount, type gives the sign, converts are skipped", () => {
  const r = readBankCsv(CSV);
  assert.deepEqual(r.rows.map((x) => x.cents), [-6325, 194000, 300]);
  assert.equal(r.rows[0].date, "2024-03-02");
  assert.ok(r.problems.some((p) => /Convert/.test(p)));
});

// The newer layout: a "Transactions / User" preamble, a leading ID column, "Price at Transaction" and "UTC" timestamps.
const NEW = `Transactions
User,Jane Doe,abc-123

ID,Timestamp,Transaction Type,Asset,Quantity Transacted,Price Currency,Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes
65f1,2024-03-02 14:05:11 UTC,Advanced Trade Buy,BTC,0.001,USD,$62000.00,$62.00,$63.25,$1.25,Bought 0.001 BTC for $63.25 USD
65f2,2024-03-09 10:00:00 UTC,Advanced Trade Sell,ETH,0.5,USD,$3900.00,$1950.00,$1940.00,$10.00,Sold
65f3,2024-03-11 10:00:00 UTC,Learning Reward,SOL,0.02,USD,$150.00,$3.00,$3.00,,Received
`;

test("Coinbase export with the ID column and preamble is recognised too", () => {
  const r = readBankCsv(NEW);
  assert.deepEqual(r.rows.map((x) => x.cents), [-6325, 194000, 300]);
  assert.deepEqual(r.problems, []);
});
