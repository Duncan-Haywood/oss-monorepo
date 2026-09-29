import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, parseNumber, parseDate, detectDelimiter, decodeBuffer, normalizeBank, parseRules, parseBusinessRules, categoryKey, analyze, reportCsv, summaryText, sampleCsv, CATEGORIES, MEALS_DEDUCTIBLE } from "./calc.mjs";

const bank = (csv, o) => normalizeBank(parseCsv(csv, detectDelimiter(csv)), o);
const run = (csv, o = {}) => analyze(bank(csv).txns, o);
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const H = "Date,Description,Amount\n";

test("parsing helpers: numbers, dates, delimiters, utf-16", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("($12.00)"), -12);
  assert.equal(parseNumber("1.234,50", true), 1234.5);
  assert.equal(parseDate("01/03/2024"), "2024-01-03");
  assert.equal(parseDate("03/04/2024", true), "2024-04-03");
  assert.equal(detectDelimiter("a;b\n1;2"), ";");
  const text = "Date,Description,Amount\n1/1/2024,Rent,5";
  const le = new Uint8Array([0xff, 0xfe, ...[...text].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(le.buffer), text);
});

test("debit/credit layouts, blank files and missing headers are reported, not thrown", () => {
  const b = bank("Posting Date,Payee,Debit,Credit\n01/02/2024,ADOBE,59.99,\n01/03/2024,STRIPE PAYOUT,,500\nTotal,,,");
  assert.deepEqual(b.txns.map((t) => t.amount), [-59.99, 500]);
  assert.equal(b.skipped.length, 1);
  assert.match(normalizeBank([]).error, /empty/);
  assert.match(bank("foo,bar\n1,2").error, /No header row/);
});

test("the schedule C line numbers are the ones printed on the form", () => {
  const want = { receipts: "1", other_income: "6", advertising: "8", car_truck: "9", commissions: "10", contract_labor: "11", insurance: "15", interest: "16b", legal_professional: "17", office: "18", rent: "20b", repairs: "21", supplies: "22", taxes_licenses: "23", travel: "24a", meals: "24b", utilities: "25", wages: "26", other: "27a" };
  for (const [k, line] of Object.entries(want)) assert.equal(CATEGORIES[k].line, line, k);
  for (const k of ["equipment", "est_tax", "sales_tax", "health_insurance", "retirement", "loan_principal", "transfer", "owner", "investment_income"]) assert.equal(CATEGORIES[k].line, null, k);
});

test("built-in rules put receipts in and common expenses on the right line", () => {
  const a = run(H + [
    "01/02/2024,ZELLE FROM BRIGHTLINE LLC INVOICE 12,2000",
    "01/03/2024,GOOGLE ADS,-100",
    "01/04/2024,ADOBE CREATIVE CLOUD,-60",
    "01/05/2024,UPWORK CONTRACTOR PAY,-300",
    "01/06/2024,VERIZON WIRELESS,-80",
    "01/07/2024,HISCOX INSURANCE,-40",
    "01/08/2024,LEGALZOOM,-50",
    "01/09/2024,DELTA AIR LINES,-250",
    "01/10/2024,WEWORK,-200",
  ].join("\n"));
  const key = (d) => a.rows.find((r) => r.desc.includes(d)).key;
  assert.equal(key("INVOICE"), "receipts");
  assert.equal(key("GOOGLE ADS"), "advertising");
  assert.equal(key("ADOBE"), "office");
  assert.equal(key("UPWORK"), "contract_labor");
  assert.equal(key("VERIZON"), "utilities");
  assert.equal(key("HISCOX"), "insurance");
  assert.equal(key("LEGALZOOM"), "legal_professional");
  assert.equal(key("DELTA"), "travel");
  assert.equal(key("WEWORK"), "rent");
  const b = a.businesses[0];
  near(b.income, 2000); near(b.expenses, 100 + 60 + 300 + 80 + 40 + 50 + 250 + 200); near(b.net, 2000 - 1080);
});

test("meals count at 50% and the line reports what was spent", () => {
  const a = run(H + "01/02/2024,STARBUCKS,-40\n01/03/2024,ZELLE FROM CLIENT,500");
  const meals = a.businesses[0].lines.find((l) => l.key === "meals");
  assert.equal(MEALS_DEDUCTIBLE, 0.5);
  near(meals.amount, 20); near(meals.spent, 40);
  near(a.businesses[0].expenses, 20);
  assert.match(reportCsv(a), /Deductible meals.*,24b,20\.00,/);
});

test("things that are not Schedule C expenses are held out of the totals", () => {
  const a = run(H + [
    "01/02/2024,ZELLE FROM CLIENT INVOICE,5000",
    "01/03/2024,IRS USATAXPYMT,-1200",
    "01/04/2024,BLUE CROSS HEALTH INSURANCE,-400",
    "01/05/2024,FIDELITY SEP IRA,-500",
    "01/06/2024,CHASE CARD PMT,-300",
    "01/07/2024,TRANSFER TO SAVINGS,-1000",
    "01/08/2024,NETFLIX,-15",
    "01/09/2024,STATE DEPT OF REVENUE SALES TAX,-200",
    "01/10/2024,SBA LOAN PROCEEDS,10000",
    "01/11/2024,INTEREST PAID,4.2",
  ].join("\n"));
  const k = Object.fromEntries(a.rows.map((r) => [r.desc.split(" ")[0], r.key]));
  assert.deepEqual([k.IRS, k.BLUE, k.FIDELITY, k.CHASE, k.TRANSFER, k.NETFLIX, k.STATE, k.SBA, k.INTEREST], ["est_tax", "health_insurance", "retirement", "loan_principal", "transfer", "owner", "sales_tax", "loan_principal", "investment_income"]);
  const b = a.businesses[0];
  near(b.income, 5000); near(b.expenses, 0); near(b.estTaxPaid, 1200); near(b.healthInsurance, 400); near(b.retirement, 500);
  assert.ok(a.findings.some((f) => /estimated tax payments found/.test(f.title)));
  assert.ok(a.findings.some((f) => /health insurance and retirement/.test(f.title)));
});

test("payment-platform payouts raise the gross-receipts warning", () => {
  const a = run(H + "01/02/2024,STRIPE PAYOUT,900\n01/03/2024,PAYPAL TRANSFER,100");
  assert.ok(a.findings.some((f) => /payouts from a payment platform/.test(f.title)));
  near(a.processorTotal, 900);
  assert.equal(a.rows[1].key, "transfer");
  const none = run(H + "01/02/2024,ZELLE FROM CLIENT INVOICE,900");
  assert.ok(none.findings.some((f) => /Compare receipts with your 1099s/.test(f.title)));
});

test("equipment is held out, flagged with the threshold, and big supplies are flagged not moved", () => {
  const a = run(H + "01/02/2024,APPLE STORE MACBOOK PRO,-2899\n01/03/2024,BEST BUY MONITOR,-300\n01/04/2024,AMAZON MARKETPLACE,-3100\n01/05/2024,AMAZON MARKETPLACE,-40", { safeHarbor: 2500 });
  assert.equal(a.rows[0].key, "equipment");
  assert.match(a.rows[0].flags.join(), /over \$2,500\.00: depreciate/);
  assert.match(a.rows[1].flags.join(), /de minimis/);
  assert.equal(a.rows[2].key, "supplies");
  assert.match(a.rows[2].flags.join(), /over \$2,500\.00/);
  assert.equal(a.capexCandidates.length, 3);
  near(a.businesses[0].equipmentHeldOut, 2899 + 300);
  near(a.businesses[0].expenses, 3100 + 40);
  assert.ok(analyze(bank(H + "01/02/2024,X,-5").txns, { safeHarbor: -1 }).invalid);
});

test("user rules win over built-ins; unknown categories and bad lines are reported", () => {
  const rules = parseRules("adobe => Line 27a\nbogus => not a category\nnoarrow\n# comment\nstripe payout => sales tax");
  assert.deepEqual(rules.rules.map((r) => [r.kw, r.key]), [["adobe", "other"], ["stripe payout", "sales_tax"]]);
  assert.equal(rules.skipped.length, 2);
  const a = run(H + "01/02/2024,ADOBE,-60", { userRules: rules.rules });
  assert.deepEqual([a.rows[0].key, a.rows[0].source], ["other", "your rule"]);
  assert.equal(categoryKey("Estimated tax"), "est_tax");
  assert.equal(categoryKey("nonsense"), null);
});

test("business rules and a business column split the totals", () => {
  const csv = H + "01/02/2024,ZELLE FROM A INVOICE ACME,1000\n01/03/2024,ZELLE FROM B INVOICE ZED,800\n01/04/2024,ADOBE ZED,-100";
  const a = run(csv, { businessRules: parseBusinessRules("acme => Acme Design\nzed => Zed Photo").rules });
  assert.deepEqual(a.businesses.map((p) => [p.business, p.income, p.expenses]), [["Acme Design", 1000, 0], ["Zed Photo", 800, 100]]);
  const col = run("Date,Description,Amount,Business\n01/02/2024,ZELLE INVOICE,1000,A\n01/03/2024,ZELLE INVOICE,900,B");
  assert.deepEqual(col.businesses.map((p) => p.business), ["A", "B"]);
  assert.equal(parseBusinessRules("noarrow").skipped.length, 1);
});

test("uncategorised rows are listed largest first and equal-and-opposite pairs become transfers", () => {
  const a = run(H + "01/02/2024,MYSTERY A,-50\n01/03/2024,MYSTERY B,-500\n01/04/2024,WHO KNOWS,200\n01/05/2024,WHO KNOWS TOO,-200");
  assert.deepEqual(a.uncategorised.map((r) => r.desc), ["MYSTERY B", "MYSTERY A"]);
  assert.equal(a.rows[2].source, "paired");
  assert.equal(a.totals.uncategorisedCount, 2);
  assert.ok(a.findings.some((f) => /not categorised/.test(f.title)));
});

test("duplicates are flagged, not removed; other years are left out", () => {
  const a = run(H + "01/02/2024,ADOBE,-60\n01/02/2024,ADOBE,-60\n01/02/2023,ADOBE,-60", { year: 2024 });
  assert.equal(a.rows.length, 2);
  assert.equal(a.totals.outOfYear, 1);
  assert.ok(a.rows.every((r) => r.flags.includes("possible duplicate")));
  near(a.businesses[0].expenses, 120);
  assert.match(analyze(bank(H + "01/02/2024,ADOBE,-60").txns, { year: 2019 }).invalid, /2019/);
});

test("reconciliation: line items add up, and the CSV lists every row and guards formulas", () => {
  const s = sampleCsv();
  const a = run(s.bank);
  const b = a.businesses[0];
  near(b.lines.reduce((x, l) => x + l.amount, 0), b.expenses);
  near(a.businesses.reduce((x, p) => x + p.net, 0), a.totals.net);
  const csv = reportCsv(a);
  assert.equal(csv.trim().split("\n").length, a.rows.length + 1);
  const evil = reportCsv(run(H + "01/02/2024,=HYPERLINK(\"http://x\"),-5"));
  assert.match(evil, /'=HYPERLINK/);
  assert.match(summaryText(a), /Not tax advice/);
});

test("the sample data reads cleanly and shows the interesting cases", () => {
  const a = run(sampleCsv().bank);
  assert.equal(a.totals.txns, 17);
  assert.equal(a.totals.uncategorisedCount, 1);
  assert.equal(a.rows.filter((r) => r.key === "equipment").length, 1);
  assert.ok(a.findings.some((f) => /payouts/.test(f.title)));
});

test("the engine makes no network calls", () => {
  assert.doesNotMatch(readFileSync(new URL("./calc.mjs", import.meta.url), "utf8"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});
