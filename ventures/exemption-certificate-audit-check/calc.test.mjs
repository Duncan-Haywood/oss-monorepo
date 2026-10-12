import { test } from "node:test";
import assert from "node:assert/strict";
import { check, readSales, readCertificates, readRates, parseDate, parseMoney, parseRate, stateCode, reasonFamily, customerKey, isoDay, dollars, salesCsv, chaseCsv, renewalsCsv, findingsCsv, lettersText, requestLetter, SAMPLE_SALES, SAMPLE_CERTS, SAMPLE_RATES, SAMPLE_SELLER } from "./calc.mjs";

const ASOF = parseDate("2026-10-06");
const SH = "Invoice,Date,Customer,State,Amount,Tax charged,Exemption reason\n";
const CH = "Customer,State,Certificate number,Type,Date signed,Expires\n";
const run = (sales, certs, rates = "", opts = {}) => check(SH + sales.join("\n"), CH + certs.join("\n"), rates, { asOf: ASOF, ...opts });
const statusOf = (r, inv) => r.rows.find((x) => x.invoice === inv).status;

test("money, dates, rates and states are read the way accounting exports write them", () => {
  assert.equal(parseMoney("$12,400.50"), 1240050);
  assert.equal(parseMoney("(40)"), -4000);
  assert.ok(Number.isNaN(parseMoney("x")));
  assert.equal(isoDay(parseDate("3/4/26")), "2026-03-04");
  assert.ok(Number.isNaN(parseDate("2026-02-30")));
  assert.equal(parseRate("6.25"), 6.25);
  assert.equal(parseRate("6.25%"), 6.25);
  assert.equal(parseRate("0.0625"), 6.25);
  assert.ok(Number.isNaN(parseRate("abc")));
  assert.equal(stateCode("tx "), "TX");
  assert.equal(stateCode("New York"), "NY");
  assert.equal(stateCode("Ontario"), null);
  assert.equal(dollars(123456), "$1,234.56");
});

test("reasons fold to families and taxable markers are not exemptions", () => {
  assert.equal(reasonFamily("For resale"), "resale");
  assert.equal(reasonFamily("RESALE-WHSL"), "resale");
  assert.equal(reasonFamily("Manufacturing"), "manufacturing");
  assert.equal(reasonFamily("Non-profit"), "nonprofit");
  assert.equal(reasonFamily("Delivered out of state"), "interstate");
  assert.equal(reasonFamily("Taxable"), null);
  assert.equal(reasonFamily(""), null);
  assert.equal(reasonFamily("Exempt"), "other");
});

test("the same buyer typed with and without Inc, LLC and punctuation is one customer", () => {
  assert.equal(customerKey("Acme Supply, Inc."), customerKey("ACME SUPPLY INC"));
  assert.notEqual(customerKey("Acme Supply"), customerKey("Acme Tools"));
});

test("a covered sale has no exposure; a missing certificate is assessed at the state rate", () => {
  const r = run(["A1,2026-03-01,Acme,TX,1000,0,Resale", "A2,2026-03-02,Zed,TX,1000,0,Resale"], ["Acme,TX,N-1,Resale,2025-01-01,"], "TX,8.25");
  assert.equal(statusOf(r, "A1"), "covered");
  assert.equal(statusOf(r, "A2"), "missing");
  assert.equal(r.summary.exposureCents, 8250);
  assert.equal(r.summary.coveredPct, 50);
});

test("a certificate for another state does not cover a sale shipped to this one", () => {
  const r = run(["A1,2026-03-01,Acme,OH,1000,0,Resale"], ["Acme,TX,N-1,Resale,2025-01-01,"]);
  assert.equal(statusOf(r, "A1"), "other-state");
  assert.ok(r.summary.exposureCents > 0);
});

test("expiry: given expiry beats nothing, derived expiry applies only when asked for", () => {
  const given = run(["A1,2026-06-01,Acme,TX,1000,0,Resale"], ["Acme,TX,N-1,Resale,2020-01-01,2026-01-01"]);
  assert.equal(statusOf(given, "A1"), "expired");
  const neverLapses = run(["A1,2026-06-01,Acme,TX,1000,0,Resale"], ["Acme,TX,N-1,Resale,2020-01-01,"]);
  assert.equal(statusOf(neverLapses, "A1"), "covered");
  const derived = run(["A1,2026-06-01,Acme,TX,1000,0,Resale"], ["Acme,TX,N-1,Resale,2020-01-01,"], "", { validityYears: 3 });
  assert.equal(statusOf(derived, "A1"), "expired");
  const earlier = run(["A1,2022-06-01,Acme,TX,1000,0,Resale"], ["Acme,TX,N-1,Resale,2020-01-01,"], "", { validityYears: 3 });
  assert.equal(statusOf(earlier, "A1"), "covered");
});

test("a certificate signed after the sale is late, and says by how many days", () => {
  const r = run(["A1,2026-02-22,Acme,OH,4300,0,Resale"], ["Acme,OH,N-1,Resale,2026-04-01,"]);
  assert.equal(statusOf(r, "A1"), "late");
  assert.equal(r.rows[0].daysLate, 38);
  assert.ok(r.findings.some((f) => /38 days after the sale/.test(f.title)));
});

test("a resale certificate does not cover a manufacturing claim, and the reverse", () => {
  const r = run(["A1,2026-03-01,Acme,TX,1000,0,Manufacturing", "A2,2026-03-01,Acme,TX,1000,0,Resale"], ["Acme,TX,N-1,Resale,2025-01-01,"]);
  assert.equal(statusOf(r, "A1"), "wrong-type");
  assert.equal(statusOf(r, "A2"), "covered");
});

test("a certificate with no number is flagged but still counts as on file", () => {
  const r = run(["A1,2026-03-01,Acme,FL,1000,0,Resale"], ["Acme,FL,,Resale,2025-01-01,"]);
  assert.equal(statusOf(r, "A1"), "incomplete");
  assert.equal(r.summary.exposureCents, 0);
});

test("out-of-state delivery is not chased for a buyer certificate", () => {
  const r = run(["A1,2026-03-01,Acme,FL,1000,0,Delivered out of state"], []);
  assert.equal(statusOf(r, "A1"), "not-needed");
  assert.equal(r.summary.exposureCents, 0);
});

test("taxable sales are not tested, and tax charged on an exempt-marked sale is called out", () => {
  const r = run(["A1,2026-03-01,Acme,TX,1000,82.5,", "A2,2026-03-01,Acme,TX,1000,82.5,Resale"], []);
  assert.equal(r.rows.length, 0);
  assert.ok(r.findings.some((f) => /Tax was charged on a sale marked exempt/.test(f.title)));
});

test("with no reason column, zero tax is the exemption signal", () => {
  const r = check("Invoice,Date,Customer,State,Amount,Tax\nA1,2026-03-01,Acme,TX,1000,0\nA2,2026-03-01,Acme,TX,1000,82.5", CH, "", { asOf: ASOF });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].status, "missing");
});

test("default rate is used and announced; a state rate overrides it", () => {
  const r = run(["A1,2026-03-01,Zed,TX,1000,0,Resale", "A2,2026-03-01,Zed,OH,1000,0,Resale"], [], "TX,8.25", { defaultRate: 6 });
  assert.equal(r.rows.find((x) => x.state === "TX").exposureCents, 8250);
  assert.equal(r.rows.find((x) => x.state === "OH").exposureCents, 6000);
  assert.ok(r.findings.some((f) => /Default rate used/.test(f.title) && /OH/.test(f.detail)));
});

test("customers are ranked by tax at stake, the chase list says what to ask for", () => {
  const r = run(["A1,2026-03-01,Small Co,TX,1000,0,Resale", "A2,2026-03-01,Big Co,TX,50000,0,Resale", "A3,2026-04-01,Big Co,OH,2000,0,Resale"], ["Big Co,TX,N-1,Resale,2026-05-01,"], "TX,8");
  assert.equal(r.customers[0].customer, "Big Co");
  const csv = chaseCsv(r);
  assert.match(csv, /signed exemption certificate for OH/);
  assert.match(csv, /confirmation of the certificate's effective date for TX/);
});

test("a likely name mismatch between sales and certificates is surfaced", () => {
  const r = run(["A1,2026-03-01,Acme Supply,TX,1000,0,Resale"], ["Acme Supply Company of Texas,TX,N-1,Resale,2025-01-01,"]);
  assert.ok(r.findings.some((f) => /Possible name mismatch/.test(f.title)));
});

test("certificates close to lapsing are listed with days left", () => {
  const r = run([], ["Acme,TX,N-1,Resale,2020-01-01,2026-11-30", "Old,TX,N-2,Resale,2020-01-01,2026-01-01", "Far,TX,N-3,Resale,2020-01-01,2030-01-01"]);
  assert.equal(r.renewals.length, 1);
  assert.equal(r.summary.lapsed, 1);
  assert.match(renewalsCsv(r), /Acme,TX,N-1,2026-11-30,55/);
});

test("bad rows are reported with their line and skipped, not guessed", () => {
  const sales = readSales(SH + "A1,notadate,Acme,TX,1000,0,Resale\nA2,2026-03-01,Acme,Narnia,1000,0,Resale\nA3,2026-03-01,Acme,TX,-50,0,Resale");
  assert.equal(sales.sales.length, 0);
  assert.equal(sales.findings.length, 3);
  assert.deepEqual(sales.findings.map((f) => f.line), [2, 3, 4]);
  const certs = readCertificates(CH + "Acme,Atlantis,N,Resale,2025-01-01,\n,TX,N,Resale,2025-01-01,\nAcme,TX,N,Resale,xx,", {});
  assert.equal(certs.certs.length, 0);
  assert.equal(certs.findings.length, 3);
  assert.equal(readRates("State,Rate\nTX,abc\nNarnia,5\nOH,7.25").rates.OH, 7.25);
});

test("missing columns are errors that name the column", () => {
  const r = readSales("Foo,Bar\n1,2");
  assert.ok(r.findings.some((f) => /no date column/.test(f.title)));
  assert.ok(readCertificates("Foo\n1").findings.some((f) => /no customer column/.test(f.title)));
  assert.equal(readSales("").sales.length, 0);
});

test("the sample runs and exercises every status", () => {
  const r = check(SAMPLE_SALES, SAMPLE_CERTS, SAMPLE_RATES, { asOf: ASOF });
  const seen = new Set(r.rows.map((x) => x.status));
  for (const s of ["covered", "missing", "other-state", "expired", "late", "wrong-type", "incomplete", "not-needed"]) assert.ok(seen.has(s), s);
  assert.equal(r.summary.exemptSales, 9);
  assert.ok(r.summary.exposureCents > 0);
  assert.equal(r.summary.errors, 0);
});

test("exports are well-formed CSV and the letter lists the invoices", () => {
  const r = check(SAMPLE_SALES, SAMPLE_CERTS, SAMPLE_RATES, { asOf: ASOF });
  assert.equal(salesCsv(r).trim().split("\n").length, r.rows.length + 1);
  assert.ok(findingsCsv(r).startsWith("severity,"));
  const big = r.customers.find((c) => c.exposureCents > 0);
  const letter = requestLetter(big, SAMPLE_SELLER);
  assert.match(letter, new RegExp(big.customer));
  assert.match(letter, /INV-\d+/);
  assert.match(lettersText(r, SAMPLE_SELLER), /Example Supply Co\./);
});

test("exposure is arithmetic on cents, so totals equal their parts", () => {
  const r = check(SAMPLE_SALES, SAMPLE_CERTS, SAMPLE_RATES, { asOf: ASOF });
  assert.equal(r.summary.exposureCents, r.rows.reduce((t, x) => t + x.exposureCents, 0));
  assert.equal(r.summary.exposureCents, r.customers.reduce((t, x) => t + x.exposureCents, 0));
  assert.equal(r.summary.exposureCents, r.states.reduce((t, x) => t + x.exposureCents, 0));
});
