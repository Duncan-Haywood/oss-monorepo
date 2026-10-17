import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv, parseDate, parseTransactions, normalizeType, holdingTerm, matchLots, analyze, estimateTax,
  toForm8949Csv, form8949Totals, SAMPLE_CSV, METHODS, parsePrices, harvestPlan,
} from "./calc.mjs";

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg ?? ""} ${a} != ${b}`);

test("parseCsv handles quotes, embedded commas, CRLF and a BOM", () => {
  const g = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(g, [["a", "b"], ["x, y", 'say "hi"']]);
});

test("dates: ISO, US format, timestamps; impossible dates rejected", () => {
  assert.equal(parseDate("2024-03-05"), "2024-03-05");
  assert.equal(parseDate("3/5/2024"), "2024-03-05");
  assert.equal(parseDate("2024-03-05T14:22:00Z"), "2024-03-05");
  assert.equal(parseDate("2024-02-30"), null);
  assert.equal(parseDate("yesterday"), null);
  assert.equal(parseDate("2024-3-5"), "2024-03-05");
  assert.equal(parseDate("2024-12-5 08:00"), "2024-12-05");
});

test("type words map to buy, income, sell, transfer", () => {
  assert.equal(normalizeType("Purchase"), "buy");
  assert.equal(normalizeType("Staking Reward"), "income");
  assert.equal(normalizeType("SELL"), "sell");
  assert.equal(normalizeType("Withdrawal"), "transfer");
  assert.equal(normalizeType("wizardry"), null);
});

test("holding period: more than one year is long-term, exactly one year is not", () => {
  assert.equal(holdingTerm("2023-01-10", "2024-01-10"), "Short");
  assert.equal(holdingTerm("2023-01-10", "2024-01-11"), "Long");
  assert.equal(holdingTerm("2023-12-31", "2024-12-31"), "Short");
  assert.equal(holdingTerm("2023-12-31", "2025-01-01"), "Long");
  // leap-day acquisition: anniversary treated as Feb 28 of the next year
  assert.equal(holdingTerm("2024-02-29", "2025-02-28"), "Short");
  assert.equal(holdingTerm("2024-02-29", "2025-03-01"), "Long");
});

test("FIFO on the sample, recomputed by hand", () => {
  // BTC lots: 0.50 @ 10,010 (10,000 + 10 fee), 0.50 @ 15,015, 0.25 @ 12,012.
  // 2024-09-20 sell 0.60 BTC, proceeds 36,000 - 36 fee = 35,964.
  // FIFO: 0.50 from lot 1 (basis 10,010) + 0.10 from lot 2 (basis 3,003), both long-term.
  // gain = 35,964 - 13,013 = 22,951. ETH income 2 @ 5,000; sell 1 for 3,300 - 3 = 3,297; basis 2,500; short; gain 797.
  const r = analyze(SAMPLE_CSV, { method: "FIFO", year: 2024 });
  assert.equal(r.summary.longGain, 22951);
  assert.equal(r.summary.shortGain, 797);
  assert.equal(r.summary.totalGain, 23748);
  assert.equal(r.income, 5000);
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows[0].term, "Long");
  assert.deepEqual(r.warnings, []);
});

test("LIFO on the sample, recomputed by hand", () => {
  // 0.25 from the Feb 2024 lot (48,048 per BTC, short) = basis 12,012; 0.35 from lot 2 (30,030 per BTC, long) = 10,510.50.
  const r = analyze(SAMPLE_CSV, { method: "LIFO", year: 2024 });
  assert.equal(r.summary.shortBasis, 12012 + 2500);
  assert.equal(r.summary.longBasis, 10510.5);
  assert.equal(r.summary.totalGain, 14238.5);
});

test("HIFO picks the highest unit cost and matches LIFO here", () => {
  const r = analyze(SAMPLE_CSV, { method: "HIFO", year: 2024 });
  assert.equal(r.summary.totalGain, 14238.5);
});

test("remaining holdings carry the unspent basis", () => {
  const r = analyze(SAMPLE_CSV, { method: "FIFO", year: 2024 });
  const btc = r.holdings.find((h) => h.asset === "BTC");
  // 0.40 left of lot 2 (30,030/BTC = 12,012) + 0.25 lot 3 (12,012) = 24,024
  assert.equal(btc.qty, 0.65);
  assert.equal(btc.basis, 24024);
  const eth = r.holdings.find((h) => h.asset === "ETH");
  assert.equal(eth.qty, 1);
  assert.equal(eth.basis, 2500);
});

test("TAXMIN beats HIFO when a long-term lot is taxed more lightly than a higher-basis short-term lot", () => {
  const csv = `date,type,asset,quantity,total
2022-01-01,buy,BTC,1,100
2024-06-01,buy,BTC,1,110
2024-08-01,sell,BTC,1,150
`;
  const o = { year: 2024, shortRate: 0.24, longRate: 0.15 };
  const hifo = analyze(csv, { ...o, method: "HIFO" });
  const taxmin = analyze(csv, { ...o, method: "TAXMIN" });
  // HIFO sells the 110 lot: 40 short gain, tax 9.60. TAXMIN sells the 100 lot: 50 long gain, tax 7.50.
  assert.equal(hifo.tax, 9.6);
  assert.equal(taxmin.tax, 7.5);
  // FIFO also sells the 100 lot, so it ties TAXMIN at 7.50; the tie goes to the first method listed.
  const cmp = analyze(csv, { ...o, method: "FIFO" });
  assert.equal(cmp.comparison.find((c) => c.method === "TAXMIN").tax, 7.5);
  assert.equal(cmp.comparison.find((c) => c.method === "HIFO").tax, 9.6);
  assert.equal(cmp.bestMethod, "FIFO");
});

test("fee on a buy raises basis, fee on a sale lowers proceeds", () => {
  const r = analyze("date,type,asset,quantity,total,fee\n2024-01-01,buy,SOL,10,1000,5\n2024-02-01,sell,SOL,10,1500,7\n", { year: 2024 });
  assert.equal(r.rows[0].basis, 1005);
  assert.equal(r.rows[0].proceeds, 1493);
  assert.equal(r.rows[0].gain, 488);
});

test("price per unit is used when there is no total", () => {
  const r = analyze("date,type,asset,quantity,price\n2024-01-01,buy,ADA,1000,0.50\n2024-03-01,sell,ADA,1000,0.80\n", { year: 2024 });
  assert.equal(r.rows[0].basis, 500);
  assert.equal(r.rows[0].proceeds, 800);
});

test("selling more than was bought is flagged and shown with zero basis, not hidden", () => {
  const r = analyze("date,type,asset,quantity,total\n2024-01-01,buy,BTC,1,20000\n2024-02-01,sell,BTC,1.5,45000\n", { year: 2024 });
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /0\.5 BTC/);
  const missing = r.rows.find((x) => x.missingBasis);
  assert.equal(missing.basis, 0);
  assert.equal(missing.proceeds, 15000);
  assert.equal(r.summary.totalGain, 25000);
});

test("per-wallet mode matches lots only inside the wallet the coins sit in", () => {
  const csv = `date,type,asset,quantity,total,wallet
2024-01-01,buy,BTC,1,10000,A
2024-01-02,buy,BTC,1,30000,B
2024-06-01,sell,BTC,1,35000,B
`;
  const universal = analyze(csv, { method: "FIFO", year: 2024 });
  assert.equal(universal.rows[0].basis, 10000);
  const wallet = analyze(csv, { method: "FIFO", year: 2024, perWallet: true });
  assert.equal(wallet.rows[0].basis, 30000);
  const short = analyze(csv.replace("sell,BTC,1,35000,B", "sell,BTC,2,70000,B"), { year: 2024, perWallet: true });
  assert.equal(short.warnings.length, 1);
});

test("transfers are skipped, bad types and bad dates are reported with their line number", () => {
  const r = parseTransactions("date,type,asset,quantity,total\n2024-01-01,transfer,BTC,1,0\n2024-01-02,gift,BTC,1,5\nnope,buy,BTC,1,5\n2024-01-03,buy,BTC,1,5\n");
  assert.equal(r.transactions.length, 1);
  assert.equal(r.skipped.length, 1);
  assert.match(r.errors[0], /^Line 3:.*gift/);
  assert.match(r.errors[1], /^Line 4:.*date/);
});

test("exchange-style header names are recognised", () => {
  const csv = `Timestamp,Transaction Type,Asset,Quantity Transacted,Subtotal,Fees,Account
2024-01-01T10:00:00Z,Buy,btc,0.1,"4,000.00",1.00,Main
2024-04-01T10:00:00Z,Sell,BTC,0.1,"5,000.00",1.00,Main
`;
  const r = analyze(csv, { year: 2024 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows[0].basis, 4001);
  assert.equal(r.rows[0].proceeds, 4999);
});

test("a missing required column is one clear error", () => {
  const r = analyze("when,what\n1,2\n");
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /missing: date, type, asset, quantity/);
});

test("same-day buy is available to a same-day sale", () => {
  const r = analyze("date,type,asset,quantity,total\n2024-05-01,sell,BTC,1,60000\n2024-05-01,buy,BTC,1,50000\n", { year: 2024 });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.summary.totalGain, 10000);
});

test("tax estimate nets short and long results the way the schedule does", () => {
  const rates = { shortRate: 0.24, longRate: 0.15 };
  close(estimateTax({ shortGain: 1000, longGain: 1000 }, rates), 390);
  close(estimateTax({ shortGain: -400, longGain: 1000 }, rates), 90); // 600 long
  close(estimateTax({ shortGain: 1000, longGain: -400 }, rates), 144); // 600 short
  close(estimateTax({ shortGain: -1000, longGain: 500 }, rates), 0);
  close(estimateTax({ shortGain: -1, longGain: -1 }, rates), 0);
});

test("Form 8949 CSV: header, quoting, VARIOUS for unknown acquisition", () => {
  const r = analyze("date,type,asset,quantity,total\n2024-02-01,sell,BTC,1,100\n", { year: 2024 });
  const csv = toForm8949Csv(r.rows);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "Description of property,Date acquired,Date sold,Proceeds,Cost or other basis,Gain or loss,Term,Note");
  assert.equal(lines[1], "1 BTC,VARIOUS,2024-02-01,100.00,0.00,100.00,Short,No basis on record");
});

test("year filter only reports that year's sales, but lots from earlier years still match", () => {
  const csv = `date,type,asset,quantity,total
2022-01-01,buy,BTC,1,20000
2023-03-01,sell,BTC,0.5,15000
2024-03-01,sell,BTC,0.5,16000
`;
  const y23 = analyze(csv, { year: 2023 });
  const y24 = analyze(csv, { year: 2024 });
  assert.equal(y23.summary.totalGain, 5000);
  assert.equal(y24.summary.totalGain, 6000);
  assert.deepEqual(y24.years, [2023, 2024]);
  assert.equal(y24.rows[0].term, "Long");
});

// Conservation: whatever the method, every coin sold is matched exactly once and
// proceeds + basis consumed + basis left over add up to the same totals.
test("conservation across all methods on seeded random books", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let trial = 0; trial < 40; trial++) {
    const lines = ["date,type,asset,quantity,total,fee,wallet"];
    let held = 0;
    let day = 0;
    let totalBuyBasis = 0;
    let soldQty = 0;
    let proceedsTotal = 0;
    for (let i = 0; i < 25; i++) {
      day += 1 + Math.floor(rnd() * 90);
      const d = new Date(Date.UTC(2021, 0, 1 + day)).toISOString().slice(0, 10);
      const wallet = rnd() < 0.5 ? "A" : "B";
      if (held < 0.2 || rnd() < 0.55) {
        const qty = Math.round((0.1 + rnd() * 2) * 1e4) / 1e4;
        const usd = Math.round(qty * (1000 + rnd() * 9000) * 100) / 100;
        const fee = Math.round(rnd() * 20 * 100) / 100;
        lines.push(`${d},buy,BTC,${qty},${usd},${fee},${wallet}`);
        held += qty; totalBuyBasis += usd + fee;
      } else {
        const qty = Math.round(Math.min(held, 0.05 + rnd() * 1.5) * 1e4) / 1e4;
        const usd = Math.round(qty * (1000 + rnd() * 9000) * 100) / 100;
        const fee = Math.round(rnd() * 20 * 100) / 100;
        lines.push(`${d},sell,BTC,${qty},${usd},${fee},${wallet}`);
        held -= qty; soldQty += qty; proceedsTotal += usd - fee;
      }
    }
    const { transactions } = parseTransactions(lines.join("\n"));
    for (const perWallet of [false, true]) {
      for (const method of METHODS) {
        const { pieces, openLots } = matchLots(transactions, { method, perWallet });
        const qty = pieces.reduce((a, p) => a + p.qty, 0);
        const proceeds = pieces.reduce((a, p) => a + p.proceeds, 0);
        const basisUsed = pieces.reduce((a, p) => a + p.basis, 0);
        const basisLeft = openLots.reduce((a, l) => a + (l.basis / l.qtyOriginal) * l.qty, 0);
        close(qty, soldQty, `qty ${method}`);
        close(proceeds, proceedsTotal, `proceeds ${method}`);
        // In per-wallet mode a sale can outrun its wallet; those pieces carry zero basis, so the identity still holds.
        close(basisUsed + basisLeft, totalBuyBasis, `basis ${method} wallet=${perWallet}`);
      }
    }
  }
});

test("the sample CSV parses cleanly", () => {
  const r = analyze(SAMPLE_CSV);
  assert.deepEqual(r.errors, []);
  assert.equal(r.count, 6);
});

test("empty or header-only input returns no transactions and no errors", () => {
  assert.deepEqual(parseTransactions(""), { transactions: [], skipped: [], errors: [] });
  assert.deepEqual(parseTransactions("date,type,asset,quantity,total\n"), { transactions: [], skipped: [], errors: [] });
});

test("parsePrices reads several separators and reports bad entries", () => {
  const r = parsePrices("btc=65,000\nETH: $3200.5; SOL 150, junk");
  assert.deepEqual(r.prices, { BTC: 65000, ETH: 3200.5, SOL: 150 });
  assert.equal(r.errors.length, 1);
  assert.equal(parsePrices("BTC=0").errors.length, 1);
});

test("harvestPlan: loss lots offset realized gains at the right rates", () => {
  const lots = [
    { asset: "BTC", wallet: "", acquired: "2024-01-10", qty: 1, basis: 60000 },  // long by 2026-10-16, price 50000 -> -10000
    { asset: "ETH", wallet: "", acquired: "2026-05-01", qty: 10, basis: 40000 }, // short, price 3000 -> -10000
    { asset: "SOL", wallet: "", acquired: "2026-01-01", qty: 10, basis: 1000 },  // gain, ignored
    { asset: "DOGE", wallet: "", acquired: "2026-01-01", qty: 1, basis: 5 },     // no price
  ];
  const h = harvestPlan(lots, { BTC: 50000, ETH: 3000, SOL: 200 }, {
    asOf: "2026-10-16", summary: { shortGain: 20000, longGain: 5000 }, shortRate: 0.3, longRate: 0.2,
  });
  assert.equal(h.losers.length, 2);
  assert.deepEqual(h.unpriced, ["DOGE"]);
  assert.equal(h.shortLoss, -10000);
  assert.equal(h.longLoss, -10000);
  // before: 20000*.3 + 5000*.2 = 7000. after: short 10000, long -5000 -> 10000-5000=5000 * .3 = 1500
  assert.equal(h.taxBefore, 7000);
  assert.equal(h.taxAfter, 1500);
  assert.equal(h.taxSaved, 5500);
  assert.equal(h.losers[0].asset, "ETH"); // short loss saves more tax per dollar
  assert.equal(h.unusedLoss, 0);
});

test("harvestPlan: no realized gains means the loss is unused, not tax saved", () => {
  const h = harvestPlan([{ asset: "BTC", wallet: "", acquired: "2026-02-01", qty: 1, basis: 100 }], { BTC: 40 },
    { asOf: "2026-10-16", summary: { shortGain: 0, longGain: 0 } });
  assert.equal(h.taxSaved, 0);
  assert.equal(h.unusedLoss, 60);
});

test("analyze exposes open lots that add up to the holdings", () => {
  const r = analyze(SAMPLE_CSV);
  const basis = r.openLots.reduce((a, l) => a + l.basis, 0);
  const held = r.holdings.reduce((a, h) => a + h.basis, 0);
  assert.ok(Math.abs(basis - held) < 0.05);
});

test("Form 8949 totals: parts add up to the rows and to the summary", () => {
  const r = analyze(SAMPLE_CSV, { method: "FIFO" });
  const t = form8949Totals(r.rows);
  const sum = (k) => Math.round(r.rows.reduce((a, x) => a + x[k], 0) * 100) / 100;
  assert.equal(t.total.rows, r.rows.length);
  assert.equal(t.total.proceeds, sum("proceeds"));
  assert.equal(t.total.basis, sum("basis"));
  assert.equal(t.total.gain, Math.round((t.total.proceeds - t.total.basis) * 100) / 100);
  assert.equal(t.short.gain, r.summary.shortGain);
  assert.equal(t.long.gain, r.summary.longGain);
  assert.deepEqual(form8949Totals([]).total, { rows: 0, proceeds: 0, basis: 0, gain: 0, noBasis: 0 });
});

test("Form 8949 totals: rows with no basis on record are counted", () => {
  const t = form8949Totals([
    { proceeds: 100, basis: 0, gain: 100, term: "Short", missingBasis: true },
    { proceeds: 50, basis: 20, gain: 30, term: "Long", missingBasis: false },
  ]);
  assert.equal(t.short.noBasis, 1);
  assert.equal(t.total.noBasis, 1);
  assert.equal(t.total.gain, 130);
});
