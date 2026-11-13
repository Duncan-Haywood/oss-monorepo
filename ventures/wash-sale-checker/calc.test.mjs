import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDate, parseTrades, analyze, evaluate, sampleList, reportCsv, safeRebuyDate, isoDate, money } from "./calc.mjs";

const csv = (...rows) => ["Date,Symbol,Action,Quantity,Price,Account", ...rows].join("\n");

test("parseDate reads ISO and US dates and rejects impossible ones", () => {
  assert.equal(isoDate(parseDate("2025-03-09")), "2025-03-09");
  assert.equal(isoDate(parseDate("3/9/2025")), "2025-03-09");
  assert.equal(parseDate("2025-02-30"), null);
  assert.equal(parseDate("hello"), null);
});

test("a loss with no nearby repurchase is fully allowed", () => {
  const r = evaluate(csv("2025-01-02,AAPL,buy,10,100,Taxable", "2025-06-01,AAPL,sell,10,80,Taxable"));
  assert.equal(r.summary.grossLoss, 200);
  assert.equal(r.summary.disallowed, 0);
  assert.equal(r.summary.allowed, 200);
});

test("repurchase 30 days after the sale washes the loss, 31 days does not", () => {
  const base = ["2025-01-02,AAPL,buy,10,100,Taxable", "2025-06-01,AAPL,sell,10,80,Taxable"];
  assert.equal(evaluate(csv(...base, "2025-07-01,AAPL,buy,10,81,Taxable")).summary.disallowed, 200);
  assert.equal(evaluate(csv(...base, "2025-07-02,AAPL,buy,10,81,Taxable")).summary.disallowed, 0);
});

test("a purchase 30 days BEFORE the sale also counts, and the sold lot itself does not", () => {
  const r = evaluate(csv("2025-01-02,AAPL,buy,10,100,Taxable", "2025-05-02,AAPL,buy,10,90,Taxable", "2025-06-01,AAPL,sell,10,80,Taxable"));
  // FIFO sells the January lot (loss 200); the May 2 buy is 30 days earlier -> wash
  assert.equal(r.summary.disallowed, 200);
});

test("partial replacement disallows the loss proportionally", () => {
  const r = evaluate(csv("2025-01-02,TSLA,buy,50,250,Taxable", "2025-12-05,TSLA,sell,50,210,Taxable", "2025-12-20,TSLA,buy,30,215,Taxable"));
  assert.equal(r.summary.disallowed, 1200);
  assert.equal(r.summary.allowed, 800);
});

test("replacement bought in an IRA makes the loss permanent", () => {
  const r = evaluate(csv("2025-01-02,NVDA,buy,100,120,Taxable", "2025-11-14,NVDA,sell,100,95,Taxable", "2025-11-26,NVDA,buy,100,98,Roth IRA"));
  assert.equal(r.summary.disallowed, 2500);
  assert.equal(r.summary.permanent, 2500);
  assert.equal(r.summary.deferred, 0);
});

test("disallowed loss is added to the basis of the replacement shares and flows to a later sale", () => {
  const r = evaluate(csv("2025-01-02,X,buy,10,100,Taxable", "2025-03-01,X,sell,10,80,Taxable", "2025-03-10,X,buy,10,82,Taxable", "2025-09-01,X,sell,10,95,Taxable"));
  const [first, second] = r.sales;
  assert.equal(first.disallowed, 200);
  // second lot basis 820 + 200 carried = 1020, proceeds 950 -> loss 70, no replacement nearby
  assert.equal(second.basis, 1020);
  assert.equal(second.gain, -70);
});

test("a gain is never washed, and different symbols never match", () => {
  const r = evaluate(csv("2025-01-02,A,buy,10,10,Taxable", "2025-03-01,A,sell,10,20,Taxable", "2025-03-05,A,buy,10,20,Taxable", "2025-04-01,B,buy,10,5,Taxable"));
  assert.equal(r.summary.disallowed, 0);
  assert.equal(r.summary.lossSales, 0);
});

test("one replacement purchase is not counted against two sales", () => {
  const r = evaluate(csv("2025-01-02,A,buy,20,100,Taxable", "2025-03-01,A,sell,10,90,Taxable", "2025-03-05,A,sell,10,90,Taxable", "2025-03-10,A,buy,10,90,Taxable"));
  assert.equal(r.summary.disallowed, 100);
});

test("an explicit basis column overrides FIFO", () => {
  const t = parseTrades("Date,Symbol,Action,Quantity,Price,Cost basis\n2025-03-01,A,sell,10,80,1000").trades;
  const r = analyze(t);
  assert.equal(r.sales[0].gain, -200);
});

test("sells with no earlier buy are flagged, not silently invented", () => {
  const r = evaluate("Date,Symbol,Action,Quantity,Price\n2025-03-01,A,sell,10,80");
  assert.match(r.notes.join(" "), /no earlier purchase/);
});

test("sales inside an IRA are skipped with a note", () => {
  const r = evaluate(csv("2025-01-02,A,buy,10,100,IRA", "2025-03-01,A,sell,10,80,IRA"));
  assert.equal(r.sales.length, 0);
  assert.match(r.notes.join(" "), /IRA/);
});

test("bad rows are reported with their line number", () => {
  const r = evaluate(csv("2025-01-02,A,buy,10,100,Taxable", "nope,A,sell,10,80,Taxable"));
  assert.match(r.errors[0], /Line 3/);
});

test("missing columns give a clear error", () => {
  assert.match(parseTrades("a,b\n1,2").error, /Need columns/);
});

test("amount column can stand in for price, and quoted fields parse", () => {
  const t = parseTrades('Date,Symbol,Action,Quantity,Amount\n"2025-01-02","A",Buy,"10","$1,000.00"').trades;
  assert.equal(t[0].price, 100);
});

test("the sample list produces a mix of permanent, deferred and clean results", () => {
  const r = evaluate(sampleList());
  assert.equal(r.summary.washed, 2);
  assert.equal(r.summary.permanent, 1500);
  assert.equal(r.summary.deferred, 1200);
});

test("report CSV carries the Form 8949 code W column and safe date is 31 days on", () => {
  const r = evaluate(sampleList());
  assert.match(reportCsv(r), /Form 8949 code W/);
  assert.equal(isoDate(safeRebuyDate(parseDate("2025-11-14"))), "2025-12-15");
  assert.equal(money(-1234.5), "-$1,234.50");
});

test("price may be the first column, and net gain is the exact sum of every sale", () => {
  const r = evaluate(["Price,Date,Symbol,Action,Quantity", "100,2025-01-02,AAPL,buy,10", "80,2025-06-01,AAPL,sell,10", "130,2025-07-01,MSFT,sell,1"].join("\n"));
  assert.ok(!r.error);
  assert.equal(r.summary.netGain, -200 + 130);
  const only = evaluate(csv("2025-01-02,AAPL,buy,10,100,Taxable", "2025-06-01,AAPL,sell,10,100,Taxable"));
  assert.equal(only.summary.netGain, 0);
});

test("a basis column only attaches to sells, and a blank sell basis stays null", () => {
  const p = parseTrades(["Date,Symbol,Action,Quantity,Price,Basis", "2025-01-02,AAPL,buy,10,100,999", "2025-06-01,AAPL,sell,10,80,", "2025-06-02,AAPL,sell,1,80,50"].join("\n"));
  assert.deepEqual(p.trades.map((t) => t.basis), [null, null, 50]);
  const noCol = parseTrades(csv("2025-01-02,AAPL,buy,10,100,Taxable", "2025-06-01,AAPL,sell,10,80,Taxable"));
  assert.deepEqual(noCol.trades.map((t) => t.basis), [null, null]);
});

// Red-team 2026-11-12 (prompts/runs/2026-11-12-session_01AcxTtLTzXqEGdpixYVUsj4.json): the old parser deleted every
// non-digit, so "1e3" shares read as 13 and "12-34" as 1234.
test("scientific notation is read as its value, and a field that is not one number is refused", () => {
  const head = "Date,Action,Symbol,Quantity,Price\n";
  const ok = parseTrades(head + "2026-01-05,Buy,ABC,1e3,1.5E+01");
  assert.equal(ok.trades[0].qty, 1000);
  assert.equal(ok.trades[0].price, 15);
  for (const bad of ["12-34", "1.2.3", "5 6"]) {
    const p = parseTrades(head + `2026-01-05,Buy,ABC,${bad},10`);
    assert.equal(p.trades.length, 0, bad);
    assert.equal(p.errors.length, 1, bad);
  }
  assert.equal(parseTrades(head + '2026-01-05,Sell,ABC,-100,"$1,234.50"').trades[0].price, 1234.5);
});

// Red-team 2026-11-13. Real defect: the disallowed loss was spread per replacement share but charged on every share
// later sold from that purchase, so selling a 100-share buy that replaced only 30 shares added the carried loss
// 100/30 times over and overstated the later loss.
test("carried-over loss is added once, even when the replacement purchase is larger than the washed sale", () => {
  const r = evaluate(csv("2025-01-02,X,buy,30,100,Taxable", "2025-03-03,X,sell,30,90,Taxable", "2025-03-10,X,buy,100,90,Taxable", "2025-06-02,X,sell,100,90,Taxable"));
  const [first, second] = r.sales;
  assert.equal(first.disallowed, 300);
  assert.equal(first.replacements[0].adjustedBasisPerShare, 100);
  // 9,000 cost + 300 carried = 9,300 basis; proceeds 9,000 -> loss 300
  assert.equal(second.basis, 9300);
  assert.equal(second.gain, -300);
  // over a closed position, reported gains plus the code-W add-backs equal the real result: 11,700 proceeds - 12,000 cost
  assert.equal(r.summary.netGain + r.summary.disallowed, -300);
});

test("carried-over loss follows the replacement shares when the purchase is sold in pieces", () => {
  const r = evaluate(csv("2025-01-02,X,buy,30,100,Taxable", "2025-03-03,X,sell,30,90,Taxable", "2025-03-10,X,buy,100,90,Taxable",
    "2025-06-02,X,sell,50,95,Taxable", "2025-07-01,X,sell,50,95,Taxable"));
  const [, a, b] = r.sales;
  assert.equal(a.basis + b.basis, 9300);
  assert.equal(r.summary.netGain + r.summary.disallowed, 12200 - 12000);
});

test("two washed sales into one purchase each carry their own loss", () => {
  const r = evaluate(csv("2025-01-02,X,buy,10,100,Taxable", "2025-01-03,X,buy,10,100,Taxable",
    "2025-03-03,X,sell,10,90,Taxable", "2025-03-04,X,sell,10,80,Taxable", "2025-03-10,X,buy,40,85,Taxable", "2025-06-02,X,sell,40,85,Taxable"));
  const [s1, s2, last] = r.sales;
  assert.equal(s1.disallowed, 100);
  assert.equal(s2.disallowed, 200);
  assert.equal(s1.replacements[0].adjustedBasisPerShare, 95);
  assert.equal(s2.replacements[0].adjustedBasisPerShare, 105);
  assert.equal(last.basis, 3400 + 300);
  assert.equal(r.summary.netGain + r.summary.disallowed, 900 + 800 + 3400 - 2000 - 3400);
});

// Red-team 2026-11-13, second real defect (found by the conservation test below): shares already carrying one wash
// loss were designated again as replacement shares for a later loss sale, so the same held shares carried two losses.
test("shares already carrying a wash loss are not replacement shares for a second loss sale", () => {
  const r = evaluate(csv("2025-01-02,X,buy,20,100,Taxable", "2025-01-10,X,sell,10,80,Taxable", "2025-01-15,X,sell,5,80,Taxable", "2025-03-10,X,sell,5,80,Taxable"));
  const [a, b, c] = r.sales;
  assert.equal(a.disallowed, 200); // the 10 shares still held from the same buy replace it
  assert.equal(b.basis, 600); // 5 x 100 + 5 x 20 carried
  assert.equal(b.disallowed, 0); // the 5 left already carry the first loss
  assert.equal(c.basis, 600);
  assert.equal(r.summary.netGain + r.summary.deferred, 1600 - 2000);
});

test("report CSV prints amounts to the cent", () => {
  const row = reportCsv(evaluate(csv("2025-01-02,X,buy,3,10.005,Taxable", "2025-06-02,X,sell,3,9.333,Taxable"))).split("\n")[1];
  assert.equal(row, '2025-06-02,X,3,28.00,30.02,-2.02,0.00,2.02,""');
});

// Class guard (red-team 2026-11-13): basis is conserved. For random taxable trade lists that end flat, every dollar of
// cost appears exactly once: reported gains plus the deferred (code W) add-backs equal proceeds minus cost.
test("random closed positions conserve basis: net gain + deferred loss = proceeds - cost", () => {
  let seed = 20261113;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
  for (let trial = 0; trial < 300; trial++) {
    const rows = []; let held = 0, day = 0, proceeds = 0, cost = 0;
    const date = () => new Date(Date.UTC(2025, 0, 2) + day * 86400000).toISOString().slice(0, 10);
    for (let k = 0; k < 2 + rnd(8); k++) {
      day += 1 + rnd(40);
      const price = 50 + rnd(100);
      if (held > 0 && rnd(2)) { const q = 1 + rnd(held); held -= q; proceeds += q * price; rows.push(`${date()},X,sell,${q},${price},Taxable`); }
      else { const q = 1 + rnd(60); held += q; cost += q * price; rows.push(`${date()},X,buy,${q},${price},Taxable`); }
    }
    if (held) { day += 1 + rnd(40); proceeds += held * 70; rows.push(`${date()},X,sell,${held},70,Taxable`); }
    const r = evaluate(csv(...rows));
    const got = Math.round((r.summary.netGain + r.summary.deferred) * 100) / 100;
    assert.ok(Math.abs(got - (proceeds - cost)) < 0.05 * r.summary.lossSales + 0.01, `trial ${trial}: ${got} vs ${proceeds - cost}\n${rows.join("\n")}`);
  }
});

// Red-team 2026-11-13: guards for mutants that escaped the suite.
test("parseDate refuses a padded month and a two-digit-year ISO date", () => {
  assert.equal(parseDate("2025-001-15"), null);
  // Date.UTC maps years 0-99 to 1900-1999, so only the year check catches this one.
  assert.equal(parseDate("0050-01-01"), null);
});

test("penny-stock prices under $1 are read from the price column, not refused or replaced by the amount", () => {
  const r = evaluate("Date,Symbol,Action,Quantity,Price,Amount\n2025-01-02,PNY,buy,1000,0.50,505.00\n2025-03-03,PNY,sell,1000,0.40,395.00");
  assert.deepEqual(r.errors, []);
  assert.equal(r.summary.grossLoss, 100);
});

test("a sale with a small gain under $1 is not counted as a loss sale", () => {
  const r = evaluate(csv("2025-01-02,X,buy,100,10,Taxable", "2025-03-01,X,sell,100,10.005,Taxable"));
  assert.equal(r.summary.lossSales, 0);
  assert.equal(r.summary.grossLoss, 0);
});

test("dividend reinvestments and Fidelity's YOU BOUGHT / YOU SOLD rows are purchases and sales", () => {
  const r = evaluate(csv(
    "2025-01-02,VTI,YOU BOUGHT VANGUARD TOTAL STOCK MKT,10,200,Taxable",
    "2025-03-03,VTI,YOU SOLD VANGUARD TOTAL STOCK MKT,10,180,Taxable",
    "2025-03-20,VTI,Reinvest Shares,1,181,Taxable",
  ));
  assert.deepEqual(r.errors, []);
  assert.equal(r.summary.grossLoss, 200);
  assert.equal(r.summary.disallowed, 20); // the reinvested share washes 1 of 10 shares' loss
});

test("Schwab's Reinvest Dividend cash leg is not read as a purchase", () => {
  const r = evaluate(csv("2025-01-02,VTI,buy,10,200,Taxable", "2025-03-03,VTI,sell,10,180,Taxable", "2025-03-20,VTI,Reinvest Dividend,1,181,Taxable"));
  assert.equal(r.summary.disallowed, 0);
  assert.equal(r.errors.length, 1);
});

// Red-team 2026-11-13: guards for escaped mutants and real defects.
test("an Account column in the first position is still read (IRA replacement)", () => {
  const rows = ["Account,Date,Symbol,Action,Quantity,Price", "Taxable,2025-01-02,NVDA,buy,10,120", "Taxable,2025-11-14,NVDA,sell,10,95", "Roth IRA,2025-11-26,NVDA,buy,10,98"];
  const r = evaluate(rows.join("\n"));
  assert.equal(r.summary.permanent, 250);
});

test("an account number or name that merely contains 401, sep or ira is not a retirement account", () => {
  for (const acct of ["Individual Z40123456", "September Growth", "Mirage Joint", "Brokerage 4403-1234"]) {
    const r = evaluate(csv(`2025-01-02,ABC,buy,10,100,${acct}`, `2025-06-01,ABC,sell,10,80,${acct}`));
    assert.equal(r.summary.lossSales, 1, acct);
    assert.equal(r.summary.allowed, 200, acct);
  }
  for (const acct of ["Roth IRA", "ROTH_IRA", "SEP-IRA", "401(k)", "Company 401k", "403(b) plan", "Retirement", "HSA"]) {
    const r = evaluate(csv(`2025-01-02,ABC,buy,10,100,${acct}`, `2025-06-01,ABC,sell,10,80,${acct}`));
    assert.equal(r.summary.sales, 0, acct);
  }
});

test("a three-digit year is refused rather than read as year 202", () => {
  assert.equal(parseDate("1/2/202"), null);
  assert.equal(parseDate("1/2/100"), null);
  assert.equal(isoDate(parseDate("1/2/25")), "2025-01-02");
  assert.equal(isoDate(parseDate("1/2/1999")), "1999-01-02");
});

test("the report keeps one column per field when a symbol holds a comma or a quote, and defuses formulas", () => {
  const r = evaluate(['Date,Symbol,Action,Quantity,Price', '2025-01-02,"BRK,B",buy,10,100', '2025-06-01,"BRK,B",sell,10,80', '2025-01-02,=1+1,buy,1,10', '2025-06-01,=1+1,sell,1,5'].join("\n"));
  const lines = reportCsv(r).trim().split("\n");
  assert.equal(lines[1].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length, 9);
  assert.match(lines[1], /"BRK,B"/);
  assert.ok(lines.some((l) => l.includes(",'=1+1,")), lines.join("\n"));
});

test("two sales on one day keep file order (FIFO lots go to the earlier line)", () => {
  const r = evaluate(csv("2025-01-02,A,buy,10,100,Taxable", "2025-02-03,A,buy,10,50,Taxable", "2025-08-01,A,sell,10,80,Taxable", "2025-08-01,A,sell,10,80,Taxable"));
  assert.deepEqual(r.sales.map((s) => [s.line, s.gain]), [[4, -200], [5, 300]]);
});

// Red-team 2026-11-13: broker exports put other columns whose names contain "date", "type" or "security" ahead of the
// ones the rule needs. Each used to be picked by header order and gave a silently wrong answer.
test("the trade date wins over a settlement date that comes first (31 days apart by trade date: no wash)", () => {
  const r = evaluate(["Settlement Date,Trade Date,Action,Symbol,Quantity,Price", "2025-01-06,2025-01-02,Buy,ABC,10,100",
    "2025-02-04,2025-01-31,Sell,ABC,10,80", "2025-03-05,2025-03-03,Buy,ABC,10,70"].join("\n"));
  assert.equal(r.summary.grossLoss, 200);
  assert.equal(r.summary.disallowed, 0);
});

test("a Security Type column before Symbol is not read as the symbol or as the action", () => {
  const r = evaluate(["Date,Security Type,Symbol,Action,Quantity,Price", "2025-01-02,Stock,ABC,Buy,10,100",
    "2025-02-01,Stock,ABC,Sell,10,80", "2025-02-10,Stock,ABC,Buy,10,70"].join("\n"));
  assert.equal(r.summary.sales, 1);
  assert.equal(r.summary.disallowed, 200);
  assert.equal(r.sales[0].sym, "ABC");
});

test("an Account Type column before Action is not read as the action", () => {
  const p = parseTrades(["Date,Account Type,Action,Symbol,Quantity,Price", "2025-01-02,Taxable,Buy,ABC,10,100",
    "2025-02-01,Taxable,Sell,ABC,10,80"].join("\n"));
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.trades.map((t) => t.side), ["buy", "sell"]);
});

test("an action word that merely starts with sto, stc, bto or btc is not a trade side", () => {
  const p = parseTrades(csv("2025-01-02,ABC,Stock split,10,100,Taxable", "2025-01-02,ABC,STO,1,2,Taxable"));
  assert.equal(p.trades.length, 1);
  assert.equal(p.trades[0].side, "sell");
  assert.match(p.errors[0], /Line 2: action/);
});

test("a Robinhood export (Activity Date, Instrument, Trans Code) is read", () => {
  const r = evaluate(["Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount",
    "1/2/2025,1/2/2025,1/3/2025,ABC,x,Buy,10,$100.00,($1000.00)", "2/3/2025,2/3/2025,2/4/2025,ABC,x,Sell,10,$80.00,$800.00",
    "2/10/2025,2/10/2025,2/11/2025,ABC,x,Buy,10,$70.00,($700.00)"].join("\n"));
  assert.equal(r.summary.disallowed, 200);
});

test("a three-digit month is refused rather than read as a two-digit one", () => {
  assert.equal(parseDate("012/01/2025"), null);
});

test("Fidelity and Schwab history exports are read with their own headers", () => {
  const fid = evaluate(["Run Date,Account,Action,Symbol,Security Description,Security Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date",
    "01/02/2025,Individual Z40123456,YOU BOUGHT ABC CORP,ABC,ABC CORP,Cash,10,100,,,,-1000,01/03/2025",
    "02/03/2025,Individual Z40123456,YOU SOLD ABC CORP,ABC,ABC CORP,Cash,-10,80,,,,800,02/04/2025",
    "02/10/2025,ROTH IRA 123,YOU BOUGHT ABC CORP,ABC,ABC CORP,Cash,10,70,,,,-700,02/11/2025"].join("\n"));
  assert.deepEqual([fid.summary.disallowed, fid.summary.permanent], [200, 200]);
  const sch = evaluate(['"Date","Action","Symbol","Description","Quantity","Price","Fees & Comm","Amount"',
    '"01/02/2025","Buy","ABC","ABC CORP","10","$100.00","","-$1,000.00"',
    '"02/03/2025 as of 02/01/2025","Sell","ABC","ABC CORP","10","$80.00","","$800.00"',
    '"02/10/2025","Buy","ABC","ABC CORP","10","$70.00","","-$700.00"'].join("\n"));
  assert.equal(sch.summary.disallowed, 200);
});
