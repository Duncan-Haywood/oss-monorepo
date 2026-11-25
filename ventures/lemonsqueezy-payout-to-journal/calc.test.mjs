import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleOrdersExport, sampleBrokenOrdersExport, sampleOrdersDeposit, estimateFee, sampleBrokenReport, parseAmount, parseDate, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, buildReport, parsePayouts } from "./calc.mjs";

const ok = () => validate(sampleReport());

test("the sample reconciles: rows add up to the deposit row and every journal balances", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.reconciliation[0].stated, 35750);
  for (const j of r.journals) assert.equal(j.lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a payout spanning a month end becomes two journals dated inside their own months", () => {
  const r = ok();
  assert.deepEqual(r.journals.map((j) => [j.period, j.date]), [["2026-09", "2026-09-30"], ["2026-10", "2026-10-03"]]);
  assert.equal(r.journals[0].clearing + r.journals[1].clearing, 35750);
});

test("gross sales and the Lemon Squeezy fee are booked separately, not as the net deposit", () => {
  const sept = ok().journals[0];
  assert.equal(sept.lines.find((l) => l.category === "sales").credit, 2900 + 14900 + 1900);
  assert.equal(sept.lines.find((l) => l.category === "fees").debit, 195 + 795 + 145);
});

test("a refunded sale books a refund and keeps the fee; shipping gets its own line", () => {
  const oct = ok().journals[1];
  assert.equal(oct.lines.find((l) => l.category === "refunds").debit, 2900);
  assert.equal(oct.lines.find((l) => l.category === "fees").debit, 795 + 195 + 225);
  const ship = validate("Order ID,Date,Subtotal,Shipping,Fee,Net\n1,2026-10-04,20.00,6.50,1.83,24.67\n", { expected: 2467 });
  assert.equal(ship.journals[0].lines.find((l) => l.category === "shipping").credit, 650);
  assert.equal(ship.reconciliation[0].agrees, true);
});

test("split none keeps one journal for the whole payout", () => {
  const r = validate(sampleReport(), { split: "none" });
  assert.equal(r.journals.length, 1);
  assert.equal(r.journals[0].clearing, 35750);
});

test("the broken sample names the mismatch, the bad amount and the sale whose parts do not add up", () => {
  const f = validate(sampleBrokenReport()).findings;
  const titles = f.map((x) => x.title).join("\n");
  assert.match(titles, /rows add up to 331\.75 USD but the payout is 357\.50 USD/);
  assert.match(titles, /An amount on 1007 is not a number/);
  assert.match(titles, /Parts do not add up to the net total on 1006/);
});

test("a sale whose parts do not explain its net is journalled to uncategorised, never dropped", () => {
  const j = validate(sampleBrokenReport()).journals.flatMap((x) => x.lines);
  assert.equal(j.find((l) => l.category === "uncategorised").debit, 200);
});

test("tax you collected is a liability only when the row's own arithmetic says it was paid out", () => {
  const head = "Order ID,Product,Date,Price,Shipping,Taxes,Fees,Net Total,Payout ID\n";
  const inNet = validate(head + "a,x,2026-09-10,100.00,0.00,8.00,13.00,95.00,1\n", { expected: 9500 });
  assert.equal(inNet.journals[0].lines.find((l) => l.category === "tax").credit, 800);
  assert.equal(inNet.reconciliation[0].agrees, true);
  const remitted = validate(head + "a,x,2026-09-10,100.00,0.00,8.00,13.00,87.00,1\n", { expected: 8700 });
  assert.equal(remitted.journals[0].lines.some((l) => l.category === "tax"), false);
  assert.equal(remitted.findings.filter((f) => f.severity === "error").length, 0);
});

test("without a deposit row the deposit can be supplied, and a wrong one is an error", () => {
  const bare = buildReport({ items: [["2026-09-10", "x", 100, 10, false]], withPayoutRow: false });
  const warn = validate(bare);
  assert.equal(warn.reconciliation[0].agrees, null);
  assert.ok(warn.findings.some((f) => /no payout row and no expected deposit/.test(f.title)));
  assert.equal(validate(bare, { expected: 9000 }).reconciliation[0].agrees, true);
  assert.ok(validate(bare, { expected: 9500 }).findings.some((f) => f.severity === "error"));
});

test("an export with no payout column is one group the deposit can be checked against", () => {
  const csv = "Order ID,Date,Price,Fees,Net Total\na,2026-09-10,50.00,5.00,45.00\nb,2026-09-11,50.00,5.00,45.00\n";
  const r = validate(csv, { expected: 9000 });
  assert.equal(r.payouts.length, 1);
  assert.equal(r.reconciliation[0].agrees, true);
});

test("rows with no payout id are grouped apart and warned about", () => {
  const csv = sampleReport().replace("1001,Field guide ebook,2026-09-28 12:00:00,29.00,0.00,0.00,1.95,0.00,27.05,USD,false,P-2026-10", "1001,Field guide ebook,2026-09-28 12:00:00,29.00,0.00,0.00,1.95,0.00,27.05,USD,false,");
  assert.ok(validate(csv).findings.some((f) => /no payout ID/.test(f.title)));
});

test("amounts parse US, European and thousands-separated forms to cents", () => {
  assert.equal(parseAmount("12.34"), 1234);
  assert.equal(parseAmount("-12,34"), -1234);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12..5")));
});

test("dates parse ISO with a time suffix, dotted European, and slashed per the chosen order", () => {
  assert.equal(parseDate("2026-09-28 12:00:00"), "2026-09-28");
  assert.equal(parseDate("28.09.2026"), "2026-09-28");
  assert.equal(parseDate("09/28/2026"), "2026-09-28");
  assert.equal(parseDate("28/09/2026", "dmy"), "2026-09-28");
  assert.equal(parseDate("31.02.2026"), null);
});


test("a file without the sales columns is refused with a pointer to the right export", () => {
  const r = validate("date,amount\n2026-01-01,5\n");
  assert.equal(r.findings[0].severity, "error");
  assert.match(r.findings[0].detail, /subtotal, fee and net/);
  assert.doesNotMatch(r.findings[0].detail, /Insights \/ Payouts/);
});

test("two payouts in one file are journalled separately", () => {
  const a = buildReport({ id: "11", items: [["2026-09-10", "a", 10, 1, false]], withPayoutRow: true });
  const b = buildReport({ id: "22", items: [["2026-09-20", "b", 20, 2, false]], withPayoutRow: true });
  const r = validate(a + b.split("\n").slice(1).join("\n"));
  assert.equal(r.payouts.length, 2);
  assert.deepEqual(r.reconciliation.map((x) => x.stated), [900, 1800]);
});

test("tab-separated exports and a BOM are read", () => {
  const tsv = "\ufeff" + sampleReport().replace(/,/g, "\t");
  assert.equal(validate(tsv).reconciliation[0].agrees, true);
});

test("account mapping overrides names, reports bad lines, and reaches the exports", () => {
  const { mapping, errors } = parseMapping("sales = 200\nbogus = 1\nnot a line\n# note\nclearing = 1200");
  assert.equal(mapping.sales, "200");
  assert.equal(errors.length, 2);
  const j = validate(sampleReport(), { mapping }).journals;
  assert.match(toXeroJournalCsv(j), /,200,Tax Exempt,/);
  assert.match(toIif(j), /\t1200\t/);
  assert.equal(defaultMapping().sales, "Lemon Squeezy Product Sales");
});

test("Xero export: debits positive, credits negative, columns as the manual journal import expects", () => {
  const lines = toXeroJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount");
  assert.match(lines[1], /^Lemon Squeezy payout P-2026-10 2026-09,30\/09\/2026,Lemon Squeezy Product Sales \(gross\) \(3 rows\),Lemon Squeezy Product Sales,Tax Exempt,-197\.00$/);
  const sum = lines.slice(1).reduce((a, l) => a + Number(l.split(",").pop()), 0);
  assert.ok(Math.abs(sum) < 0.005);
});

test("QuickBooks Online export: debit and credit columns, journal numbers disambiguated by month", () => {
  const lines = toQboJournalCsv(ok().journals).trim().split("\r\n");
  assert.equal(lines[0], "*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
  assert.match(lines[1], /^P-2026-10-2026-09,09\/30\/2026,Lemon Squeezy Product Sales,,197\.00,/);
});

test("IIF export: every transaction's lines sum to zero and end with ENDTRNS", () => {
  const blocks = toIif(ok().journals).split("ENDTRNS").slice(1, -1);
  assert.equal(blocks.length, 2);
  for (const b of blocks) {
    const amounts = b.split("\r\n").filter((l) => /^(TRNS|SPL)\t/.test(l)).map((l) => Number(l.split("\t")[5]));
    assert.ok(Math.abs(amounts.reduce((a, x) => a + x, 0)) < 0.005);
  }
});

test("tabs and newlines in account names cannot break IIF rows", () => {
  const { mapping } = parseMapping("sales = Bad\tName");
  assert.ok(!/Bad\tName/.test(toIif(validate(sampleReport(), { mapping }).journals)));
});

test("generic journals CSV carries category and both columns", () => {
  assert.match(journalsCsv(ok().journals), /^payout,period,date,category,account,debit,credit,memo\r\n/);
});

test("parsePayouts on an empty string reports an error and does not throw", () => {
  assert.equal(parsePayouts("").findings[0].severity, "error");
});

test("separate platform and processing fee columns in a hand-built CSV are both booked to fees", () => {
  const csv = "Order ID,Date,Subtotal,Platform Fee,Processing Fee,Net Total,Payout ID\nc1,2026-09-10,10.00,0.80,0.59,8.61,PO1\nc2,2026-09-11,5.00,0.40,0.45,4.15,PO1\n";
  const r = validate(csv, { expected: 1276 });
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  const fees = r.journals[0].lines.find((l) => l.category === "fees");
  assert.equal(fees.debit, 224);
  assert.equal(r.reconciliation[0].agrees, true);
});

test("the date_utc column of a Lemon Squeezy export is read as the order date", () => {
  const r = parsePayouts("Order ID,date_utc,Subtotal,Fee,Net\n1,2026-10-04 10:00:00,20.00,1.50,18.50\n");
  assert.equal(r.payouts[0].rows[0].created, "2026-10-04");
});

// ---- Lemon Squeezy's own Orders export (2026-11-24 fix for the 2026-11-13 audit) ----

const ORDERS = "identifier,order_number,product_name,variant_name,status,subtotal,discount_total,tax,total,tax_name,tax_rate,date_utc\n";

test("the documented Orders export is read, with amounts in cents, not refused or read 100x", () => {
  const r = validate(ORDERS + "abc,1001,Ebook,Default,paid,2000,0,0,2000,,,2026-10-04 10:00:00\n");
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.journals[0].lines.find((l) => l.category === "sales").credit, 2000);
  assert.equal(r.journals[0].period, "2026-10");
});

test("Lemon Squeezy's fee worked example: $20 + 20% VAT from France by card gives fee $2.06 and net $17.94", () => {
  // docs.lemonsqueezy.com/help/getting-started/fees: 5% + 50c, +1.5% for a buyer outside the US, on the $24 total.
  const r = validate(ORDERS + "abc,1001,Ebook,Default,paid,2000,0,400,2400,VAT,20,2026-10-04 10:00:00\n", { extraPct: 1.5, expected: 1794 });
  const j = r.journals[0];
  assert.equal(j.lines.find((l) => l.category === "fees").debit, 206);
  assert.equal(j.clearing, 1794);
  assert.equal(j.lines.some((l) => l.category === "tax"), false, "merchant-of-record tax is never the seller's");
  assert.equal(r.reconciliation[0].agrees, true);
});

test("the base fee is 5% + 50c of the total, and a free order costs nothing", () => {
  assert.equal(estimateFee(2900), 195);
  assert.equal(estimateFee(14900), 795);
  assert.equal(estimateFee(0), 0);
  assert.equal(estimateFee(2400, 1.5), 206);
});

test("discount_total is booked to discounts, not uncategorised, and the fee is on the discounted total", () => {
  const r = validate(ORDERS + "abc,1001,Ebook,Default,paid,2000,500,0,1500,,,2026-10-04\n", { expected: 1375 });
  const l = r.journals[0].lines;
  assert.equal(l.find((x) => x.category === "discounts").debit, 500);
  assert.equal(l.find((x) => x.category === "fees").debit, 125);
  assert.equal(l.some((x) => x.category === "uncategorised"), false);
  assert.equal(r.reconciliation[0].agrees, true);
});

test("a discount column in a hand-built CSV is booked to discounts", () => {
  const r = validate("Order ID,Date,Subtotal,Discount,Fee,Net\n1,2026-10-04,20.00,5.00,1.25,13.75\n", { expected: 1375 });
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.journals[0].lines.find((x) => x.category === "discounts").debit, 500);
});

test("a payout fee is booked to fees and the payout then agrees", () => {
  const csv = "Order ID,Date,Subtotal,Fee,Net\n1,2026-10-04,1000.00,0,1000.00\n";
  assert.equal(validate(csv, { expected: 99000 }).reconciliation[0].agrees, false);
  const r = validate(csv, { expected: 99000, payoutFee: 1000 });
  assert.equal(r.reconciliation[0].agrees, true);
  assert.equal(r.journals[0].lines.find((l) => l.category === "payoutfees").debit, 1000);
  assert.equal(r.journals[0].lines.reduce((a, l) => a + l.debit - l.credit, 0), 0);
});

test("a payout off by one cent is an error: there is no tolerance", () => {
  const csv = "Order ID,Date,Subtotal,Fee,Net\n1,2026-10-04,10.00,1.00,9.00\n";
  assert.equal(validate(csv, { expected: 899 }).reconciliation[0].agrees, false);
  assert.equal(validate(csv, { expected: 901 }).reconciliation[0].agrees, false);
});

test("a partial refund by refunded amount books only that amount", () => {
  const r = validate("Order ID,Date,Subtotal,Fee,Net,Refunded Amount\n1,2026-10-04,20.00,1.50,13.50,5.00\n", { expected: 1350 });
  assert.equal(r.journals[0].lines.find((l) => l.category === "refunds").debit, 500);
  assert.equal(r.reconciliation[0].agrees, true);
});

test("refunded orders reverse revenue and keep the fee; pending ones are skipped", () => {
  const r = validate(ORDERS + "a,1,X,Default,refunded,2900,0,0,2900,,,2026-10-02\nb,2,X,Default,pending,2900,0,0,2900,,,2026-10-02\n");
  const l = r.journals[0].lines;
  assert.equal(l.find((x) => x.category === "refunds").debit, 2900);
  assert.equal(r.journals[0].clearing, -195);
  assert.equal(r.summary.rows, 1);
});

test("a total that subtotal, discount and tax do not explain is flagged and journalled to uncategorised", () => {
  const r = validate(ORDERS + "a,1,X,Default,paid,1900,500,0,1900,,,2026-10-02\n");
  assert.ok(r.findings.some((f) => f.severity === "error" && /do not make the total on #1/.test(f.title)));
  assert.equal(r.journals[0].lines.find((l) => l.category === "uncategorised").credit, 500);
});

test("the Orders sample reconciles to its deposit, recomputed by hand", () => {
  // Sep: 2900 (fee 195) + 14900 with 2980 VAT (fee 5% of 17880 + 50 = 944) + 1900 less 500 discount (fee 120).
  // Oct: 14900 (fee 795) + a refunded 2900 (fee 195 kept) + 3500 with 665 tax (fee 208 + 50 = 258). One pending order skipped.
  const dep = (19200 - 1259) + (14900 + 3500 - 1248);
  assert.equal(sampleOrdersDeposit(), dep);
  const r = validate(sampleOrdersExport(), { expected: dep });
  assert.equal(r.findings.filter((f) => f.severity === "error").length, 0);
  assert.equal(r.reconciliation[0].agrees, true);
  assert.deepEqual(r.journals.map((j) => j.clearing), [17941, 17152]);
});

test("the broken Orders sample names the mismatch, the bad amount and the total that does not add up", () => {
  const titles = validate(sampleBrokenOrdersExport(), { expected: sampleOrdersDeposit() }).findings.map((f) => f.title).join("\n");
  assert.match(titles, /An amount on #2048 is not a number/);
  assert.match(titles, /do not make the total on #2043/);
  assert.match(titles, /rows add up to .* but the payout is 350\.93 USD/);
});

test("nothing left over from the Patreon tool this was copied from", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["calc.mjs", "index.html", "README.md", "llms.txt"]) assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), "utf8").replace(/patreon-payout-to-journal\/|>Patreon</g, ""), /patreon|pledge|tier/i, f);
});

test("a payout off by one cent raises an error finding, not only a 'NO' in the table", () => {
  const csv = "Order ID,Date,Subtotal,Fee,Net\n1,2026-10-04,10.00,1.00,9.00\n";
  assert.ok(validate(csv, { expected: 901 }).findings.some((f) => f.severity === "error" && /Off by 0\.01 USD/.test(f.detail)));
  assert.equal(validate(csv, { expected: 900 }).findings.some((f) => f.severity === "error"), false);
});

test("a refunded order with tax reverses the revenue before tax, since the tax never reached the seller", () => {
  const r = validate(ORDERS + "a,1,X,Default,refunded,2000,0,400,2400,VAT,20,2026-10-02\n");
  assert.equal(r.journals[0].lines.find((l) => l.category === "refunds").debit, 2000);
  assert.equal(r.journals[0].clearing, -estimateFee(2400));
});
