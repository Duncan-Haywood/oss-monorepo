import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, parseNumber, parseDate, detectDelimiter, decodeBuffer, findColumns, normalizeBank, parseRules, parsePropertyRules, parseInterest, categoryKey, analyze, reportCsv, summaryText, sampleCsv, CATEGORIES } from "./calc.mjs";

const bank = (csv, o) => normalizeBank(parseCsv(csv, detectDelimiter(csv)), o);
const run = (csv, o = {}) => analyze(bank(csv).txns, o);
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const H = "Date,Description,Amount\n";

test("parseNumber handles $, thousands, parentheses, trailing minus and decimal commas", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("($12.00)"), -12);
  assert.equal(parseNumber("-$5.25"), -5.25);
  assert.equal(parseNumber("12.00-"), -12);
  assert.equal(parseNumber("1.234,50", true), 1234.5);
  assert.ok(Number.isNaN(parseNumber("abc")));
});

test("parseDate reads US, ISO, short-year, day-first and month-name dates", () => {
  assert.equal(parseDate("01/03/2024"), "2024-01-03");
  assert.equal(parseDate("1/3/24"), "2024-01-03");
  assert.equal(parseDate("2024-03-05"), "2024-03-05");
  assert.equal(parseDate("5 Mar 2024"), "2024-03-05");
  assert.equal(parseDate("Mar 5, 2024"), "2024-03-05");
  assert.equal(parseDate("03/04/2024", true), "2024-04-03");
  assert.equal(parseDate("13/03/2024"), "2024-03-13");
  assert.equal(parseDate("nonsense"), null);
  assert.equal(parseDate("2024-13-40"), null);
});

test("delimiter detection and utf-16 decoding", () => {
  assert.equal(detectDelimiter("a;b\n1;2"), ";");
  const text = "Date,Description,Amount\n1/1/2024,Rent,5";
  const le = new Uint8Array([0xff, 0xfe, ...[...text].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(le.buffer), text);
});

test("header aliases: bank, card and debit/credit layouts resolve", () => {
  for (const h of ["Posting Date,Payee,Amount", "Transaction Date,Description,Transaction Amount", "Date,Merchant,Amt"]) {
    const r = bank(`${h}\n01/02/2024,ZELLE RENT,900`);
    assert.equal(r.error, undefined, h);
    assert.equal(r.txns[0].amount, 900);
  }
  const dc = bank("Date,Description,Debit,Credit\n01/02/2024,HOME DEPOT,50.00,\n01/03/2024,ZELLE RENT,,900.00");
  assert.deepEqual(dc.txns.map((t) => t.amount), [-50, 900]);
  assert.deepEqual(findColumns(["Date", "Amount"], { date: ["date"], amount: ["amount"] }), { date: 0, amount: 1 });
});

test("invertSign flips a card export that lists charges as positive", () => {
  const r = bank(H + "01/02/2024,HOME DEPOT,50.00", { invertSign: true });
  assert.equal(r.txns[0].amount, -50);
});

test("preamble, total rows, unreadable dates and zero rows are skipped with a reason", () => {
  const r = bank("Account summary\nDate,Description,Amount\n01/02/2024,ZELLE RENT,900\nTotal,,900\nnotadate,X,5\n01/03/2024,MEMO,0\n01/04/2024,Y,abc");
  assert.equal(r.txns.length, 1);
  assert.deepEqual(r.skipped.map((s) => s.reason), ["total or balance row", "date not readable", "zero amount", "amount not readable"]);
  assert.match(bank("foo,bar\n1,2").error, /No header row/);
  assert.match(normalizeBank([]).error, /empty/);
});

test("built-in rules put rent in, and common expenses on the right Schedule E line", () => {
  const a = run(H + [
    "01/02/2024,ZELLE FROM A B RENT,1000",
    "01/03/2024,STATE FARM LANDLORD POLICY,-100",
    "01/04/2024,COUNTY TREASURER PROPERTY TAX,-500",
    "01/05/2024,ACE PLUMBING SERVICE CALL,-200",
    "01/06/2024,HOME DEPOT 4821,-60",
    "01/07/2024,BUILDIUM MGMT FEE,-80",
    "01/08/2024,ZILLOW LISTING FEE,-30",
    "01/09/2024,LAWN CARE,-45",
  ].join("\n"));
  const key = (d) => a.rows.find((r) => r.desc.includes(d)).key;
  assert.equal(key("RENT"), "rent");
  assert.equal(key("STATE FARM"), "insurance");
  assert.equal(key("TREASURER"), "taxes");
  assert.equal(key("PLUMBING"), "repairs");
  assert.equal(key("HOME DEPOT"), "supplies");
  assert.equal(key("BUILDIUM"), "management");
  assert.equal(key("ZILLOW"), "advertising");
  assert.equal(key("LAWN"), "cleaning_maintenance");
  const p = a.properties[0];
  near(p.income, 1000);
  near(p.expenses, 100 + 500 + 200 + 60 + 80 + 30 + 45);
  near(p.net, 1000 - 1015);
});

test("the schedule E line numbers are the ones printed on the form", () => {
  const want = { rent: "3", advertising: "5", auto_travel: "6", cleaning_maintenance: "7", commissions: "8", insurance: "9", legal_professional: "10", management: "11", mortgage_interest: "12", other_interest: "13", repairs: "14", supplies: "15", taxes: "16", utilities: "17", other: "19" };
  for (const [k, line] of Object.entries(want)) assert.equal(CATEGORIES[k].line, line, k);
  assert.equal(CATEGORIES.capital.line, null);
  assert.equal(CATEGORIES.mortgage_payment.line, null);
});

test("user rules win over built-ins and unknown categories are reported", () => {
  const rules = parseRules("home depot => repairs\nbogus => not a category\nnoarrow\n# comment\nkeys and locks => Line 7\n");
  assert.deepEqual(rules.rules.map((r) => [r.kw, r.key]), [["home depot", "repairs"], ["keys and locks", "cleaning_maintenance"]]);
  assert.equal(rules.skipped.length, 2);
  const a = run(H + "01/02/2024,HOME DEPOT,-60\n01/03/2024,SQ KEYS AND LOCKS,-40", { userRules: rules.rules });
  assert.deepEqual(a.rows.map((r) => [r.key, r.source]), [["repairs", "your rule"], ["cleaning_maintenance", "your rule"]]);
  assert.equal(categoryKey("Mortgage interest"), "mortgage_interest");
  assert.equal(categoryKey("nonsense"), null);
});

test("a mortgage payment is not an expense until the interest is typed, then only interest counts", () => {
  const csv = H + "01/05/2024,ROCKET MORTGAGE,-1000\n02/05/2024,ROCKET MORTGAGE,-1000\n01/02/2024,ZELLE RENT,1500";
  const before = run(csv);
  assert.equal(before.properties[0].needsSplit, true);
  near(before.properties[0].expenses, 0);
  assert.ok(before.findings.some((f) => /not on Schedule E yet/.test(f.title)));
  const after = run(csv, { interestByProperty: { "All properties": 1700 } });
  const p = after.properties[0];
  near(p.interest, 1700); near(p.principalEscrow, 300); near(p.expenses, 1700);
  assert.equal(p.needsSplit, false);
  const over = run(csv, { interestByProperty: { "All properties": 2500 } });
  assert.ok(over.findings.some((f) => /does not fit the payments/.test(f.title)));
});

test("interest list parsing", () => {
  const r = parseInterest("12 Oak St, 3,980.25\nbad line\n8 Elm, 100\n8 Elm, 50");
  assert.equal(r.map["8 Elm"], 150);
  assert.equal(r.skipped.length, 1);
});

test("property rules and a property column split the totals", () => {
  const csv = H + "01/02/2024,RENT 12 OAK,1000\n01/03/2024,RENT 8 ELM,800\n01/04/2024,PLUMBER 8 ELM,-100";
  const a = run(csv, { propertyRules: parsePropertyRules("12 oak => Oak\n8 elm => Elm").rules });
  assert.deepEqual(a.properties.map((p) => [p.property, p.income, p.expenses]), [["Elm", 800, 100], ["Oak", 1000, 0]]);
  const col = run("Date,Description,Amount,Property\n01/02/2024,RENT,1000,A\n01/03/2024,RENT,900,B");
  assert.deepEqual(col.properties.map((p) => p.property), ["A", "B"]);
  assert.equal(parsePropertyRules("noarrow").skipped.length, 1);
});

test("repair-like items over the threshold or worded like a remodel are flagged, not moved", () => {
  const a = run(H + "01/02/2024,ACE PLUMBING SERVICE CALL,-3000\n01/03/2024,TOP ROOF CO NEW ROOF,-400\n01/04/2024,ACE PLUMBING SERVICE CALL,-100", { safeHarbor: 2500 });
  assert.equal(a.capexCandidates.length, 2);
  assert.equal(a.rows[0].key, "repairs");
  assert.match(a.rows[0].flags.join(), /over \$2,500/);
  assert.match(a.rows[1].flags.join(), /improvement/);
  const raised = run(H + "01/02/2024,ACE PLUMBING SERVICE CALL,-3000", { safeHarbor: 5000 });
  assert.equal(raised.capexCandidates.length, 0);
  assert.ok(analyze(bank(H + "01/02/2024,X,-1").txns, { safeHarbor: -1 }).invalid);
});

test("uncategorised rows stay out of the totals and are listed largest first", () => {
  const a = run(H + "01/02/2024,MYSTERY CO,-40\n01/03/2024,OTHER THING,-900\n01/04/2024,ZELLE RENT,1000");
  assert.equal(a.uncategorised.length, 2);
  assert.equal(a.uncategorised[0].desc, "OTHER THING");
  near(a.properties[0].expenses, 0);
  assert.ok(a.findings[0].severity === "high" && /not categorised/.test(a.findings[0].title));
  near(a.totals.categorisedPct, 33.33, 0.01);
});

test("equal and opposite uncategorised rows within three days pair off as a transfer", () => {
  const a = run(H + "01/02/2024,ACCT 4471,-500\n01/04/2024,ACCT 9902,500\n01/20/2024,ACCT 4471,-500");
  assert.deepEqual(a.rows.map((r) => r.key), ["transfer", "transfer", "uncategorised"]);
  assert.equal(a.rows[0].source, "paired");
});

test("security deposits and transfers are not income or expense", () => {
  const a = run(H + "01/02/2024,SECURITY DEPOSIT FROM TENANT,1500\n01/03/2024,DEPOSIT REFUND TENANT,-1500\n01/04/2024,ONLINE TRANSFER TO SAVINGS,-200\n01/05/2024,ZELLE RENT,1000");
  const p = a.properties[0];
  near(p.income, 1000); near(p.expenses, 0); near(p.depositsNet, 0);
  assert.equal(a.rows[0].key, "security_deposit");
});

test("months with no rent between the first and last rent are listed per property", () => {
  const a = run(H + "01/02/2024,ZELLE RENT,900\n02/02/2024,ZELLE RENT,900\n04/02/2024,ZELLE RENT,900\n05/02/2024,ZELLE RENT,900");
  assert.deepEqual(a.missing, [{ property: "All properties", month: "2024-03" }]);
  assert.ok(a.findings.some((f) => /no rent deposit/.test(f.title)));
  assert.equal(run(H + "01/02/2024,ZELLE RENT,900").missing.length, 0);
});

test("identical rows are flagged as possible duplicates and kept", () => {
  const a = run(H + "01/02/2024,ROCKET MORTGAGE,-500\n01/02/2024,ROCKET MORTGAGE,-500");
  assert.equal(a.rows.length, 2);
  assert.ok(a.rows.every((r) => r.flags.includes("possible duplicate")));
});

test("the tax year filter drops other years and says how many", () => {
  const a = run(H + "12/30/2023,ZELLE RENT,900\n01/02/2024,ZELLE RENT,900", { year: 2024 });
  assert.equal(a.totals.txns, 1);
  assert.equal(a.totals.outOfYear, 1);
  assert.ok(analyze(bank(H + "01/02/2024,ZELLE RENT,9").txns, { year: 2019 }).invalid);
});

test("income and expenses reconcile to the property rows and the sample runs end to end", () => {
  const s = sampleCsv();
  const a = analyze(bank(s.bank).txns, { propertyRules: parsePropertyRules(s.properties).rules, interestByProperty: parseInterest(s.interest).map });
  near(a.totals.income, a.properties.reduce((x, p) => x + p.income, 0));
  near(a.totals.net, a.totals.income - a.totals.expenses);
  for (const p of a.properties) near(p.net, p.income - p.lines.reduce((x, l) => x + l.amount, 0));
  const oak = a.properties.find((p) => p.property === "12 Oak St");
  near(oak.interest, 3980.25);
  assert.ok(a.capexCandidates.some((r) => /NEW ROOF/.test(r.desc)));
  assert.ok(a.findings.some((f) => /duplicate/.test(f.title)));
});

test("csv report escapes and neutralises spreadsheet formulas; summary carries the caveat", () => {
  const a = run(H + '01/02/2024,"=HYPERLINK(""x"")",-5\n01/03/2024,"Plumber, Inc",-10');
  const csv = reportCsv(a);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"Plumber, Inc"/);
  assert.match(summaryText(a), /Not tax advice/);
});

test("no network or storage code in the module", () => {
  assert.doesNotMatch(readFileSync(new URL("./calc.mjs", import.meta.url), "utf8"), /fetch\(|XMLHttpRequest|sendBeacon|localStorage/);
});
