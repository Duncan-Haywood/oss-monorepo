import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseDate, detectDelimiter, normalizeBank, parseRules, parseBusinessRules, categoryKey, analyze, reportCsv, summaryText, sampleCsv, CATEGORIES } from "./calc.mjs";

const bank = (csv, o) => normalizeBank(parseCsv(csv, detectDelimiter(csv)), o);
const run = (csv, o = {}) => analyze(bank(csv).txns, o);
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const H = "Date,Description,Amount\n";

test("parseNumber and parseDate read common bank formats", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("($12.00)"), -12);
  assert.equal(parseNumber("1.234,50", true), 1234.5);
  assert.equal(parseDate("03/05/2024"), "2024-03-05");
  assert.equal(parseDate("5 Mar 2024"), "2024-03-05");
  assert.equal(parseDate("nonsense"), null);
});

test("the Schedule C line numbers are the ones printed on the form", () => {
  const want = { receipts: "1", other_income: "6", advertising: "8", car_truck: "9", fees: "10", contract_labor: "11", insurance: "15", interest: "16b", legal_professional: "17", office: "18", rent_equipment: "20a", rent_property: "20b", repairs: "21", supplies: "22", taxes_licenses: "23", travel: "24a", meals: "24b", utilities: "25", wages: "26", other: "27a" };
  for (const [k, line] of Object.entries(want)) assert.equal(CATEGORIES[k].line, line, k);
  for (const k of ["equipment", "estimated_tax", "schedule_1", "loan", "transfer", "owner"]) assert.equal(CATEGORIES[k].line, null, k);
});

test("built-in rules put income and expenses on the right line", () => {
  const a = run(H + [
    "01/02/2024,ZELLE FROM ACME INVOICE 12,2000",
    "01/03/2024,GOOGLE ADS,-100",
    "01/04/2024,UPWORK CONTRACTOR PAYMENT,-400",
    "01/05/2024,NEXT INSURANCE LIABILITY POLICY,-50",
    "01/06/2024,STAPLES 221,-30",
    "01/07/2024,ADOBE CREATIVE CLOUD,-60",
    "01/08/2024,DELTA AIR LINES,-300",
  ].join("\n"));
  const key = (d) => a.rows.find((r) => r.desc.includes(d)).key;
  assert.equal(key("ACME"), "receipts");
  assert.equal(key("GOOGLE ADS"), "advertising");
  assert.equal(key("UPWORK"), "contract_labor");
  assert.equal(key("NEXT INSURANCE"), "insurance");
  assert.equal(key("STAPLES"), "supplies");
  assert.equal(key("ADOBE"), "other");
  assert.equal(key("DELTA"), "travel");
  const b = a.businesses[0];
  near(b.income, 2000); near(b.expenses, 940); near(b.net, 1060);
});

test("estimated tax, health insurance, loans and transfers are held out, never deducted", () => {
  const a = run(H + [
    "01/02/2024,ZELLE FROM ACME INVOICE 12,5000",
    "01/10/2024,IRS USATAXPYMT 1040ES,-1500",
    "01/11/2024,KAISER HEALTH PLAN PREMIUM,-600",
    "01/12/2024,SBA LOAN PAYMENT,-400",
    "01/13/2024,ONLINE TRANSFER TO SAVINGS,-1000",
  ].join("\n"));
  const b = a.businesses[0];
  near(b.expenses, 0); near(b.net, 5000);
  near(b.estimatedTaxPaid, 1500); near(b.scheduleOne, 600);
  assert.ok(a.findings.some((f) => /tax payments to the IRS/.test(f.title)));
  assert.ok(a.findings.some((f) => /health insurance or retirement/.test(f.title)));
});

test("a processor payout is receipts, not a transfer between your accounts", () => {
  const a = run(H + "01/02/2024,STRIPE TRANSFER PAYOUT,900\n01/03/2024,ONLINE TRANSFER FROM SAVINGS,500");
  assert.deepEqual(a.rows.map((r) => r.key), ["receipts", "transfer"]);
  assert.ok(a.findings.some((f) => /payment platforms, probably net of their fees/.test(f.title)));
});

test("meals count at 50 percent and the amount spent is kept", () => {
  const a = run(H + "01/02/2024,CHIPOTLE CLIENT LUNCH,-80\n01/03/2024,ZELLE FROM X INVOICE,500");
  const meals = a.businesses[0].lines.find((l) => l.key === "meals");
  near(meals.amount, 40); near(meals.spent, 80);
  near(a.businesses[0].expenses, 40);
});

test("reported gross receipts are compared with deposits", () => {
  const csv = H + "01/02/2024,STRIPE PAYOUT,900\n01/03/2024,PAYPAL PAYOUT,100";
  assert.ok(run(csv, { reportedReceipts: 1200 }).findings.some((f) => /differ from your reported/.test(f.title)));
  assert.ok(!run(csv, { reportedReceipts: 1005 }).findings.some((f) => /differ from your reported/.test(f.title)));
});

test("large or equipment-like purchases are held out and flagged, and small ones are not", () => {
  const a = run(H + "01/02/2024,APPLE STORE MACBOOK PRO,-2899\n01/03/2024,STAPLES,-30\n01/04/2024,ZELLE FROM X INVOICE,9000");
  near(a.businesses[0].equipmentExcluded, 2899);
  assert.equal(a.bigItems.length, 1);
  const low = run(H + "01/03/2024,STAPLES PRINTER PAPER,-30\n01/04/2024,AMAZON MARKETPLACE,-3000");
  assert.equal(low.bigItems.length, 1);
});

test("personal-looking rows are flagged and left out of totals", () => {
  const a = run(H + "01/02/2024,NETFLIX.COM,-15.49\n01/03/2024,ZELLE FROM X INVOICE,100");
  assert.equal(a.personalish.length, 1);
  assert.equal(a.uncategorised.length, 1);
  near(a.businesses[0].expenses, 0);
});

test("user rules win over built-ins and unknown categories are reported", () => {
  const rules = parseRules("stapies => supplies\nbogus => not a category\nnoarrow\nwework => Line 20b\nfoo => 1040-ES\n");
  assert.deepEqual(rules.rules.map((r) => [r.kw, r.key]), [["stapies", "supplies"], ["wework", "rent_property"], ["foo", "estimated_tax"]]);
  assert.equal(rules.skipped.length, 2);
  const a = run(H + "01/02/2024,WEWORK,-350\n01/03/2024,FOO CO,-20", { userRules: rules.rules });
  assert.deepEqual(a.rows.map((r) => [r.key, r.source]), [["rent_property", "your rule"], ["estimated_tax", "your rule"]]);
  assert.equal(categoryKey("Software"), "other");
  assert.equal(categoryKey("nonsense"), null);
});

test("business rules split totals per business", () => {
  const br = parseBusinessRules("etsy => Candle shop\nupwork => Consulting\nbad line");
  assert.equal(br.rules.length, 2); assert.equal(br.skipped.length, 1);
  const a = run(H + "01/02/2024,ETSY PAYOUT,500\n01/03/2024,UPWORK PAYOUT,800\n01/04/2024,ETSY FEES,-40", { businessRules: br.rules });
  assert.deepEqual(a.businesses.map((b) => b.business), ["Candle shop", "Consulting"]);
  near(a.businesses[0].net, 460); near(a.businesses[1].net, 800);
  near(a.totals.net, 1260);
});

test("equal and opposite uncategorised rows pair off as a transfer, duplicates are flagged", () => {
  const a = run(H + "01/02/2024,MYSTERY A,-70\n01/03/2024,MYSTERY B,70\n01/05/2024,WEWORK,-350\n01/05/2024,WEWORK,-350");
  assert.deepEqual(a.rows.slice(0, 2).map((r) => r.key), ["transfer", "transfer"]);
  assert.equal(a.findings.filter((f) => /duplicate/.test(f.title)).length, 1);
});

test("year filter, empty and invalid inputs", () => {
  const csv = H + "12/30/2023,ZELLE INVOICE,100\n01/02/2024,ZELLE INVOICE,200";
  const a = run(csv, { year: 2024 });
  assert.equal(a.totals.outOfYear, 1); near(a.totals.income, 200);
  assert.match(run(csv, { year: 1999 }).invalid, /No transactions dated 1999/);
  assert.match(analyze([]).invalid, /No transactions/);
  assert.match(run(csv, { equipmentLimit: -1 }).invalid, /zero or more/);
  assert.match(normalizeBank([]).error, /empty/);
});

test("debit and credit columns and card sign inversion", () => {
  const two = bank("Date,Description,Debit,Credit\n01/02/2024,ZELLE INVOICE,,100\n01/03/2024,STAPLES,20,");
  assert.deepEqual(two.txns.map((t) => t.amount), [100, -20]);
  const card = bank("Date,Description,Amount\n01/03/2024,STAPLES,20\n01/04/2024,PAYMENT THANK YOU,-500", { invertSign: true });
  assert.deepEqual(card.txns.map((t) => t.amount), [-20, 500]);
});

test("the CSV report guards formulas and lists the rule that decided each row", () => {
  const a = run(H + "01/02/2024,=HYPERLINK(1),-20\n01/03/2024,ZELLE INVOICE,100");
  const csv = reportCsv(a);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv.split("\n")[0], /Schedule C line,Decided by/);
});

test("the sample data reads, categorises and reconciles", () => {
  const s = sampleCsv();
  const a = run(s.bank, { reportedReceipts: Number(s.reported) });
  assert.ok(a.totals.categorisedPct > 80);
  const b = a.businesses[0];
  near(b.net, b.income - b.expenses);
  near(a.totals.net, b.net);
  assert.ok(a.findings.some((f) => /payment platforms/.test(f.title)));
  assert.ok(a.findings.some((f) => /differ from your reported/.test(f.title)));
  assert.match(summaryText(a), /Not tax advice/);
});
