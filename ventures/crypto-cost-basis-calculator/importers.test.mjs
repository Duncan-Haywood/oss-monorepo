import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFormat, convertExchangeCsv, convertMany, krakenAsset, OUT_HEADER } from "./importers.mjs";
import { analyze, parseTransactions } from "./calc.mjs";

const COINBASE = `Transactions
User,Invented Person,abc
Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes
2023-01-10T10:00:00Z,Buy,BTC,0.5,USD,20000,10000,10010,10,Bought 0.5 BTC for $10010 USD
2023-06-15T10:00:00Z,Buy,BTC,0.5,USD,30000,15000,15015,15,Bought 0.5 BTC for $15015 USD
2024-03-05T10:00:00Z,Staking Income,ETH,2,USD,2500,5000,5000,0,
2024-04-01T10:00:00Z,Send,BTC,0.1,USD,60000,6000,6000,0,Sent 0.1 BTC to 0xabc
2024-09-20T10:00:00Z,Sell,BTC,0.6,USD,60000,36000,35964,36,Sold 0.6 BTC for $35964 USD
2024-10-01T10:00:00Z,Convert,ETH,1,USD,3300,3300,3300,0,Converted 1 ETH to 0.05 BTC
`;

const KRAKEN = `"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance"
"L1","T1","2023-02-01 09:00:00","trade","","currency","ZUSD","-5000.0000","10.0000","0"
"L2","T1","2023-02-01 09:00:00","trade","","currency","XXBT","0.2500000000","0.0000000000","0.25"
"L3","T2","2024-05-01 09:00:00","trade","","currency","XXBT","-0.1000000000","0.0001000000","0.15"
"L4","T2","2024-05-01 09:00:00","trade","","currency","ZUSD","7000.0000","14.0000","7000"
"L5","T3","2024-06-01 09:00:00","trade","","currency","XETH","-1.0000000000","0.0000000000","0"
"L6","T3","2024-06-01 09:00:00","trade","","currency","XXBT","0.0500000000","0.0000000000","0.2"
"L7","S1","2024-07-01 09:00:00","staking","","currency","DOT.S","0.5000000000","0.0000000000","0.5"
"L8","D1","2024-07-02 09:00:00","deposit","","currency","ZUSD","1000.0000","0.0000","1000"
`;

test("detects formats", () => {
  assert.equal(detectFormat(COINBASE), "coinbase");
  assert.equal(detectFormat(KRAKEN), "kraken");
  assert.equal(detectFormat("date,type,asset,quantity,total\n"), "generic");
});

test("generic input passes through untouched", () => {
  const t = "date,type,asset,quantity,total\n2024-01-01,buy,BTC,1,100\n";
  assert.deepEqual(convertExchangeCsv(t), { format: "generic", csv: t, notes: [] });
});

test("Coinbase: preamble skipped, buys/sell/income/convert mapped, send ignored", () => {
  const r = convertExchangeCsv(COINBASE);
  assert.equal(r.format, "coinbase");
  const lines = r.csv.trim().split("\n");
  assert.equal(lines[0], OUT_HEADER);
  assert.equal(lines.length, 1 + 6); // 2 buys, income, sell, convert (sell+buy)
  assert.ok(lines.includes("2023-01-10,buy,BTC,0.5,10000,10,Coinbase"));
  assert.ok(lines.includes("2024-03-05,income,ETH,2,5000,0,Coinbase"));
  assert.ok(lines.includes("2024-10-01,sell,ETH,1,3300,0,Coinbase"));
  assert.ok(lines.includes("2024-10-01,buy,BTC,0.05,3300,0,Coinbase"));
  assert.ok(r.notes.some((n) => /1 Send row/.test(n)));
});

test("Coinbase export feeds the lot matcher end to end", () => {
  const r = convertExchangeCsv(COINBASE);
  const parsed = parseTransactions(r.csv);
  assert.deepEqual(parsed.errors, []);
  const a = analyze(r.csv, { method: "FIFO", year: 2024 });
  // FIFO: 0.5 BTC @ 10010 basis (10000+10) fully used, 0.1 BTC of the second lot (15015 * 0.2 = 3003)
  const sale = a.rows.filter((x) => x.sold === "2024-09-20");
  const proceeds = sale.reduce((s, x) => s + x.proceeds, 0);
  const basis = sale.reduce((s, x) => s + x.basis, 0);
  assert.ok(Math.abs(proceeds - 35964) < 0.02);
  assert.ok(Math.abs(basis - (10010 + 3003)) < 0.02);
});

test("Coinbase non-USD rows are skipped with a note", () => {
  const t = COINBASE.replace("2023-01-10T10:00:00Z,Buy,BTC,0.5,USD", "2023-01-10T10:00:00Z,Buy,BTC,0.5,EUR");
  const r = convertExchangeCsv(t);
  assert.ok(r.notes.some((n) => /EUR/.test(n)));
  assert.ok(!r.csv.includes("2023-01-10"));
});

test("Kraken asset codes normalise", () => {
  assert.equal(krakenAsset("XXBT"), "BTC");
  assert.equal(krakenAsset("XBT"), "BTC");
  assert.equal(krakenAsset("XETH"), "ETH");
  assert.equal(krakenAsset("ZUSD"), "USD");
  assert.equal(krakenAsset("ZEUR"), "EUR");
  assert.equal(krakenAsset("DOT.S"), "DOT");
  assert.equal(krakenAsset("SOL"), "SOL");
  assert.equal(krakenAsset("XTZ"), "XTZ"); // not a Kraken X-prefixed legacy pair
});

test("Kraken: USD trades paired by refid; fees placed correctly", () => {
  const r = convertExchangeCsv(KRAKEN);
  const lines = r.csv.trim().split("\n");
  assert.ok(lines.includes("2023-02-01,buy,BTC,0.25,5000,10,Kraken"));
  // sell: crypto fee adds to the quantity given up, fiat fee is the fee
  assert.ok(lines.includes("2024-05-01,sell,BTC,0.1001,7000,14,Kraken"));
});

test("Kraken: crypto-for-crypto swap is left for the user to price; staking income unpriced", () => {
  const r = convertExchangeCsv(KRAKEN);
  const lines = r.csv.trim().split("\n");
  assert.ok(lines.includes("2024-06-01,sell,ETH,1,,0,Kraken"));
  assert.ok(lines.includes("2024-06-01,buy,BTC,0.05,,0,Kraken"));
  assert.ok(lines.includes("2024-07-01,income,DOT,0.5,,0,Kraken"));
  assert.ok(r.notes.some((n) => /ETH to BTC swap has no USD value/.test(n)));
  assert.ok(r.notes.some((n) => /staking reward/.test(n)));
  assert.ok(r.notes.some((n) => /deposit, withdrawal/.test(n)));
  // the unpriced rows surface as errors in the matcher, not as silent zero-basis lots
  const parsed = parseTransactions(r.csv);
  assert.equal(parsed.errors.length, 3);
});

test("Kraken: stablecoin leg prices a swap", () => {
  const t = `"txid","refid","time","type","subtype","aclass","asset","amount","fee","balance"
"a","T9","2024-08-01 00:00:00","trade","","currency","XETH","-1.0","0","0"
"b","T9","2024-08-01 00:00:00","trade","","currency","USDC","3000.0","0","3000"
`;
  const r = convertExchangeCsv(t);
  assert.ok(r.csv.includes("2024-08-01,sell,ETH,1,3000,0,Kraken"));
  assert.ok(r.csv.includes("2024-08-01,buy,USDC,3000,3000,0,Kraken"));
});

test("convertMany merges files under one header", () => {
  const r = convertMany([{ name: "cb.csv", text: COINBASE }, { name: "kr.csv", text: KRAKEN }]);
  const lines = r.csv.trim().split("\n");
  assert.equal(lines.filter((l) => l === OUT_HEADER).length, 1);
  assert.ok(lines.some((l) => l.endsWith("Coinbase")) && lines.some((l) => l.endsWith("Kraken")));
  assert.deepEqual(r.formats, ["coinbase", "kraken"]);
  assert.ok(r.notes.every((n) => /^(cb|kr)\.csv: /.test(n)));
});

const BINANCEUS = `User_Id,Time,Category,Operation,Order_Id,Transaction_Id,Primary_Asset,Realized_Amount_For_Primary_Asset,Realized_Amount_For_Primary_Asset_In_USD_Value,Base_Asset,Realized_Amount_For_Base_Asset,Realized_Amount_For_Base_Asset_In_USD_Value,Quote_Asset,Realized_Amount_For_Quote_Asset,Realized_Amount_For_Quote_Asset_In_USD_Value,Fee_Asset,Realized_Amount_For_Fee_Asset,Realized_Amount_For_Fee_Asset_In_USD_Value,Payment_Method,Withdrawal_Method,Additional_Note
1,2023-03-01 10:00:00,Spot Trading,Buy,o1,t1,BTC,0.5,10000,BTC,0.5,10000,USD,10000,10000,USD,10,10,,,
1,2023-09-01 10:00:00,Spot Trading,Sell,o2,t2,BTC,0.2,6000,BTC,0.2,6000,USD,6000,6000,USD,6,6,,,
1,2024-01-05 10:00:00,Staking,Staking Rewards,,t3,DOT,3,,,,,,,,,,,,,
1,2024-01-06 10:00:00,Deposit,USD Deposit,,t4,USD,1000,1000,,,,,,,,,,,,
1,2024-01-07 10:00:00,Withdrawal,Crypto Withdrawal,,t5,BTC,0.1,4000,,,,,,,,,,,,
1,2024-01-08 10:00:00,Other,Mystery Op,,t6,BTC,0.1,4000,,,,,,,,,,,,
`;

test("Binance.US: detected, trades and rewards mapped, movements ignored, unknowns flagged", () => {
  assert.equal(detectFormat(BINANCEUS), "binanceus");
  const r = convertExchangeCsv(BINANCEUS);
  const lines = r.csv.trim().split("\n");
  assert.equal(lines[0], OUT_HEADER);
  assert.deepEqual(lines.slice(1), [
    "2023-03-01,buy,BTC,0.5,10000,10,Binance.US",
    "2023-09-01,sell,BTC,0.2,6000,6,Binance.US",
    "2024-01-05,income,DOT,3,,0,Binance.US",
  ]);
  assert.ok(r.notes.some((n) => /1 Binance\.US row had no USD value/.test(n)));
  assert.ok(r.notes.some((n) => /2 deposit, withdrawal/.test(n)));
  assert.ok(r.notes.some((n) => /Mystery Op/.test(n)));
});

test("Binance.US rows flow through the matcher", () => {
  const { csv } = convertExchangeCsv(BINANCEUS.split("\n").filter((l) => !/Staking|Mystery/.test(l)).join("\n"));
  const t = parseTransactions(csv);
  assert.equal(t.errors.length, 0);
  assert.equal(t.transactions.length, 2);
  const a = analyze(csv, { method: "FIFO", year: 2023 });
  assert.ok(a);
});

const CRYPTOCOM = `Timestamp (UTC),Transaction Description,Currency,Amount,To Currency,To Amount,Native Currency,Native Amount,Native Amount (in USD),Transaction Kind
2023-03-01 10:00:00,Buy BTC,BTC,0.1,,,USD,2000,2000,crypto_purchase
2023-04-01 10:00:00,BTC -> ETH,BTC,-0.05,ETH,0.8,USD,1500,1500,crypto_exchange
2023-05-01 10:00:00,Earn,CRO,100,,,USD,12,12,crypto_earn_interest_paid
2023-06-01 10:00:00,Sell ETH,ETH,-0.8,USD,1800,USD,1800,1800,crypto_viban_exchange
2023-06-02 10:00:00,Withdraw,BTC,-0.01,,,USD,300,300,crypto_withdrawal
2023-06-03 10:00:00,Reward,CRO,5,,,USD,,,referral_card_cashback
2023-06-04 10:00:00,Odd,CRO,5,,,USD,1,1,mystery_kind
`;

test("Crypto.com: detected, buys, swaps, income, sells mapped; moves ignored", () => {
  assert.equal(detectFormat(CRYPTOCOM), "cryptocom");
  const r = convertExchangeCsv(CRYPTOCOM);
  const lines = r.csv.trim().split("\n");
  assert.equal(lines[0], OUT_HEADER);
  assert.ok(lines.includes("2023-03-01,buy,BTC,0.1,2000,0,Crypto.com"));
  assert.ok(lines.includes("2023-04-01,sell,BTC,0.05,1500,0,Crypto.com"));
  assert.ok(lines.includes("2023-04-01,buy,ETH,0.8,1500,0,Crypto.com"));
  assert.ok(lines.includes("2023-05-01,income,CRO,100,12,0,Crypto.com"));
  assert.ok(lines.includes("2023-06-01,sell,ETH,0.8,1800,0,Crypto.com"));
  assert.ok(lines.includes("2023-06-03,income,CRO,5,,0,Crypto.com")); // unpriced stays empty, never zero
  assert.equal(lines.length, 1 + 6); // buy, swap (2), income, sell, unpriced income
  assert.ok(r.notes.some((n) => /1 Crypto\.com row had no USD value/.test(n)));
  assert.ok(r.notes.some((n) => /mystery_kind/.test(n)));
  assert.ok(r.notes.some((n) => /1 deposit, withdrawal/.test(n)));
});

test("Crypto.com export feeds the lot matcher end to end", () => {
  const r = convertExchangeCsv(CRYPTOCOM.split("\n").filter((l) => !/referral|mystery/.test(l)).join("\n"));
  const a = analyze(r.csv, { method: "FIFO", year: 2023 });
  assert.ok(a.rows.length > 0);
});

const GEMINI = `Date,Time (UTC),Type,Symbol,Specification,Liquidity Provider,Trading Fee Rate (bps),USD Amount USD,Trading Fee (USD) USD,USD Balance USD,BTC Amount BTC,Trading Fee (BTC) BTC,BTC Balance BTC,ETH Amount ETH,ETH Balance ETH
2023-01-10,10:00:00.000,Buy,BTCUSD,Market,Taker,40,"($10,000.00)",($40.00),$0.00,0.5 BTC,0 BTC,0.5 BTC,,
2023-02-10,10:00:00.000,Interest Credit,ETH,Earn,,,,,,,,,0.02 ETH,0.02 ETH
2023-03-10,10:00:00.000,Credit,BTC,Deposit,,,,,,0.1 BTC,,0.6 BTC,,
2023-09-10,10:00:00.000,Sell,BTCUSD,Limit,Maker,20,"$15,000.00",($30.00),$14970.00,(0.5 BTC),0 BTC,0.1 BTC,,
2023-09-11,10:00:00.000,Buy,ETHBTC,Market,Taker,40,,,,,,,0.1 ETH,
2023-09-12,10:00:00.000,Mystery,BTC,,,,,,,,,,
`;

test("Gemini: detected, USD buys/sells and rewards mapped; deposits ignored", () => {
  assert.equal(detectFormat(GEMINI), "gemini");
  const r = convertExchangeCsv(GEMINI);
  const lines = r.csv.trim().split("\n");
  assert.equal(lines[0], OUT_HEADER);
  assert.ok(lines.includes("2023-01-10,buy,BTC,0.5,10000,40,Gemini"));
  assert.ok(lines.includes("2023-09-10,sell,BTC,0.5,15000,30,Gemini"));
  assert.ok(lines.includes("2023-02-10,income,ETH,0.02,,0,Gemini")); // unpriced stays empty, never zero
  assert.equal(lines.length, 1 + 3);
  assert.ok(r.notes.some((n) => /1 Gemini row had no USD value/.test(n)));
  assert.ok(r.notes.some((n) => /ETHBTC/.test(n)));
  assert.ok(r.notes.some((n) => /Mystery/.test(n)));
  assert.ok(r.notes.some((n) => /1 credit, debit/.test(n)));
});

test("Gemini export feeds the lot matcher end to end", () => {
  const r = convertExchangeCsv(GEMINI);
  const a = analyze(r.csv, { method: "FIFO", year: 2023 });
  assert.ok(a.rows.length > 0);
});

const BITSTAMP = `Type,Datetime,Account,Amount,Value,Rate,Fee,Sub Type
Deposit,"Jan. 09, 2023, 09:00 AM",Main Account,10000 USD,,,0 USD,
Market,"Jan. 10, 2023, 10:00 AM",Main Account,0.5 BTC,10000 USD,20000 USD,25 USD,Buy
Market,"Sep. 10, 2023, 10:00 AM",Main Account,0.5 BTC,15000 USD,30000 USD,37.5 USD,Sell
Market,"Oct. 01, 2023, 10:00 AM",Main Account,1 ETH,1500 EUR,1500 EUR,3 EUR,Buy
Withdrawal,"Oct. 02, 2023, 10:00 AM",Main Account,5000 USD,,,0 USD,
`;

test("Bitstamp: detected, USD market trades mapped; non-USD and movements flagged", () => {
  assert.equal(detectFormat(BITSTAMP), "bitstamp");
  const r = convertExchangeCsv(BITSTAMP);
  const lines = r.csv.trim().split("\n");
  assert.equal(lines[0], OUT_HEADER);
  assert.ok(lines.includes("2023-01-10,buy,BTC,0.5,10000,25,Bitstamp"));
  assert.ok(lines.includes("2023-09-10,sell,BTC,0.5,15000,37.5,Bitstamp"));
  assert.equal(lines.length, 3);
  assert.ok(r.notes.some((n) => /valued in EUR, not USD/.test(n)));
  assert.ok(r.notes.some((n) => /2 deposit and withdrawal rows ignored/.test(n)));
});

test("Bitstamp export feeds the lot matcher end to end", () => {
  const r = convertExchangeCsv(BITSTAMP);
  const a = analyze(r.csv, { method: "FIFO" });
  assert.equal(a.summary.shortBasis, 10025);
  assert.equal(a.summary.shortProceeds, 14962.5);
  assert.equal(a.summary.totalGain, 4937.5);
});
