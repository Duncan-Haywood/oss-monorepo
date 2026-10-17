import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  analyze, parseAmount, parsePlainDecimal, parseCsv, parseDate, parseCountry, parseRateCell, destinationRate,
  detectColumns, formatCents, periodDueDate, ossCsv, findingsCsv, rowsCsv, sampleCsv, sampleGrossCsv,
  csvCell, RATES, RATES_AS_OF, EU_CODES, THRESHOLD_CENTS, RECORDS_NOTE, rateOf,
} from "./calc.mjs";

const csv = (rows) => ["Date,Country,Net amount,Currency,Rate,VAT ID,Type", ...rows].join("\n") + "\n";
const run = (rows, opts = {}) => analyze(csv(rows), { sellerCountry: "DE", ...opts });
const line = (r, code, bp) => r.lines.find((l) => l.country === code && (bp === undefined || l.bp === bp));
const find = (r, code) => r.findings.filter((f) => f.code === code);

// ---- exact decimals ------------------------------------------------------------------------

test("parsePlainDecimal reads exact micro-units and rounds the seventh digit half up", () => {
  assert.equal(parsePlainDecimal("12.5"), 12500000n);
  assert.equal(parsePlainDecimal("-0.000001"), -1n);
  assert.equal(parsePlainDecimal("0.0000005"), 1n);
  assert.equal(parsePlainDecimal("1.1"), 1100000n);
  assert.equal(parsePlainDecimal("abc"), null);
  assert.equal(parsePlainDecimal(""), null);
});

test("parseAmount handles both separator conventions, symbols and accounting negatives", () => {
  const m = (s, d) => parseAmount(s, d)?.micro;
  assert.equal(m("1,234.56"), 1234560000n);
  assert.equal(m("1.234,56"), 1234560000n);
  assert.equal(m("12,50"), 12500000n);
  assert.equal(m("EUR 12.50"), 12500000n);
  assert.equal(m("€1 234,50"), 1234500000n);
  assert.equal(m("-12.50"), -12500000n);
  assert.equal(m("(12.50)"), -12500000n);
  assert.equal(m("12.50-"), -12500000n);
  assert.equal(m("1,234,567"), 1234567000000n);
  assert.equal(m("0.1"), 100000n);
  assert.equal(parseAmount("n/a"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("1.2.3,4.5"), null);
});

test("a lone separator followed by three digits is read as thousands and flagged ambiguous", () => {
  const a = parseAmount("1,234");
  assert.equal(a.micro, 1234000000n);
  assert.equal(a.ambiguous, true);
  assert.equal(parseAmount("1,234", "comma").micro, 1234000n);
  assert.equal(parseAmount("12,34").ambiguous, false);
});

test("formatCents groups and signs without floating point", () => {
  assert.equal(formatCents(0n), "0.00");
  assert.equal(formatCents(5n), "0.05");
  assert.equal(formatCents(-123456n), "-1234.56");
  assert.equal(formatCents(123456789n, { group: true }), "1,234,567.89");
  assert.equal(formatCents(-5n, { group: true }), "-0.05");
});

test("the source never uses floating-point parsing for money", () => {
  const src = readFileSync(new URL("./calc.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /parseFloat|toFixed|Math\.round\([^)]*amount/);
});

// ---- csv, dates, countries, columns --------------------------------------------------------

test("parseCsv keeps line numbers across quoted newlines, CRLF, BOM and blank lines", () => {
  const text = '﻿Date,Note,Amount\r\n2026-01-01,"a\nb",1\r\n\r\n2026-01-02,"say ""hi""",2\r\n';
  const { records, delimiter } = parseCsv(text);
  assert.equal(delimiter, ",");
  assert.deepEqual(records.map((r) => r.line), [1, 2, 5]);
  assert.equal(records[1].cells[1], "a\nb");
  assert.equal(records[2].cells[1], 'say "hi"');
});

test("parseCsv detects semicolon and tab delimiters", () => {
  assert.equal(parseCsv("a;b;c\n1;2;3").delimiter, ";");
  assert.equal(parseCsv("a\tb\tc\n1\t2\t3").delimiter, "\t");
  assert.equal(parseCsv('"a,b";c\n1;2').delimiter, ";");
});

test("parseDate reads ISO, day-first, month-first, month names and rejects impossible dates", () => {
  assert.deepEqual(parseDate("2026-03-04"), { y: 2026, m: 3, d: 4 });
  assert.deepEqual(parseDate("2026-03-04 10:00:00 +0100"), { y: 2026, m: 3, d: 4 });
  assert.deepEqual(parseDate("2026-03-04T10:00:00Z"), { y: 2026, m: 3, d: 4 });
  assert.deepEqual(parseDate("04/03/2026"), { y: 2026, m: 3, d: 4 });
  assert.deepEqual(parseDate("04.03.2026"), { y: 2026, m: 3, d: 4 });
  assert.deepEqual(parseDate("04/03/2026", "mdy"), { y: 2026, m: 4, d: 3 });
  assert.deepEqual(parseDate("4 Mar 2026"), { y: 2026, m: 3, d: 4 });
  assert.deepEqual(parseDate("March 4, 2026"), { y: 2026, m: 3, d: 4 });
  assert.equal(parseDate("2026-02-29"), null);
  assert.deepEqual(parseDate("2028-02-29"), { y: 2028, m: 2, d: 29 });
  assert.equal(parseDate("31/04/2026"), null);
  assert.equal(parseDate("13/13/2026"), null);
  assert.equal(parseDate("yesterday"), null);
});

test("parseCountry maps codes, names, GR to EL and UK to GB, and flags non-EU territories", () => {
  assert.equal(parseCountry("de").code, "DE");
  assert.equal(parseCountry("Germany").code, "DE");
  assert.equal(parseCountry("The Netherlands").code, "NL");
  assert.equal(parseCountry("Österreich").code, "AT"); // diacritics are stripped before the alias lookup
  const gr = parseCountry("GR");
  assert.equal(gr.code, "EL");
  assert.equal(gr.kind, "eu");
  assert.match(gr.note, /EL/);
  assert.equal(parseCountry("Greece").code, "EL");
  assert.equal(parseCountry("UK").code, "GB");
  assert.equal(parseCountry("UK").kind, "other");
  assert.match(parseCountry("XI").note, /Northern Ireland/);
  assert.match(parseCountry("Northern Ireland").note, /Northern Ireland/);
  assert.equal(parseCountry("US").kind, "other");
  assert.equal(parseCountry("").kind, "unknown");
  assert.equal(parseCountry("Narnia").kind, "unknown");
  assert.equal(parseCountry("12").kind, "unknown");
});

test("detectColumns recognises plain, Shopify-style, Etsy-style and German headers", () => {
  const plain = detectColumns(["Date", "Country", "Net amount", "Currency", "Rate", "VAT ID", "Type"]);
  assert.deepEqual(plain.mapping, { date: 0, country: 1, amount: 2, currency: 3, rate: 4, b2b: 5, type: 6, orderId: -1 });
  assert.equal(plain.basisHint, "net");
  const shop = detectColumns(["Name", "Created at", "Shipping Country", "Total", "Presentment Currency", "Financial Status"]);
  assert.equal(shop.mapping.date, 1);
  assert.equal(shop.mapping.country, 2);
  assert.equal(shop.mapping.amount, 3);
  assert.equal(shop.mapping.currency, 4);
  assert.equal(shop.mapping.orderId, 0);
  const etsy = detectColumns(["Sale Date", "Order ID", "Ship Country", "Order Total", "Currency"]);
  assert.equal(etsy.mapping.date, 0);
  assert.equal(etsy.mapping.country, 2);
  assert.equal(etsy.mapping.amount, 3);
  const de = detectColumns(["Datum", "Land", "Betrag", "Währung", "USt-IdNr"]);
  assert.deepEqual([de.mapping.date, de.mapping.country, de.mapping.amount, de.mapping.currency, de.mapping.b2b], [0, 1, 2, 3, 4]);
  assert.equal(detectColumns(["Gross amount", "Date", "Country"]).basisHint, "gross");
});

// ---- the rate table ------------------------------------------------------------------------

test("the rate table covers the 27 member states once, with an as-of date and honest flags", () => {
  assert.equal(RATES.length, 27);
  assert.equal(new Set(EU_CODES).size, 27);
  assert.ok(EU_CODES.includes("EL"));
  assert.ok(!EU_CODES.includes("GR"));
  assert.ok(!EU_CODES.includes("GB"));
  assert.match(RATES_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  for (const r of RATES) {
    assert.ok(r.std >= 15 && r.std <= 30, r.code);
    assert.deepEqual([...r.reduced].sort((a, b) => b - a), r.reduced, `${r.code} reduced sorted high to low`);
    for (const c of r.check) assert.ok(["std", "reduced", "ebook"].includes(c));
    assert.ok(r.reduced.every((x) => x < r.std));
    if (r.ebook === null) assert.ok(r.check.includes("ebook"), `${r.code} unknown e-book rate must be flagged`);
  }
  assert.equal(rateOf("DE").std, 19);
  assert.equal(rateOf("FI").std, 25.5);
  assert.equal(rateOf("XX"), null);
});

test("rate cells: words, percentages, fractions and zero", () => {
  assert.equal(parseRateCell("").kind, "standard");
  assert.equal(parseRateCell("Standard").kind, "standard");
  assert.equal(parseRateCell("reduced").kind, "reduced");
  assert.equal(parseRateCell("zero").kind, "zero");
  assert.equal(parseRateCell("0%").kind, "zero");
  assert.equal(parseRateCell("E-book").kind, "ebook");
  assert.equal(parseRateCell("digital publication").kind, "ebook");
  assert.equal(parseRateCell("19").bp, 1900);
  assert.equal(parseRateCell("5,5 %").bp, 550);
  assert.equal(parseRateCell("0.19").bp, 1900);
  assert.equal(parseRateCell("exempt").exempt, true);
  assert.equal(parseRateCell("banana"), null);
  assert.equal(parseRateCell("250"), null);
});

test("destinationRate resolves standard, reduced, e-book and warns where the table is thin", () => {
  assert.equal(destinationRate("FR", { kind: "standard" }).bp, 2000);
  assert.equal(destinationRate("FR", { kind: "ebook" }).bp, 550);
  const red = destinationRate("FR", { kind: "reduced" });
  assert.equal(red.bp, 1000);
  assert.equal(red.notes[0].code, "reduced-ambiguous");
  assert.equal(destinationRate("DE", { kind: "reduced" }).notes.length, 0);
  assert.equal(destinationRate("DK", { kind: "reduced" }).notes[0].code, "no-reduced");
  assert.equal(destinationRate("DK", { kind: "reduced" }).bp, 2500);
  assert.equal(destinationRate("BG", { kind: "ebook" }).notes[0].code, "no-ebook");
  assert.equal(destinationRate("DE", { kind: "percent", bp: 700 }).notes.length, 0);
  assert.equal(destinationRate("DE", { kind: "percent", bp: 1234 }).notes[0].code, "rate-not-in-table");
  assert.equal(destinationRate("DE", { kind: "zero" }).bp, 0);
});

// ---- rounding and reconciliation -----------------------------------------------------------

test("VAT is rounded once per country and rate, not per line", () => {
  // Three 0.50 sales at 21%: 0.105 per line rounds to 0.11 (0.33 summed), but 1.50 x 21% = 0.315 -> 0.32.
  const r = run(["2026-02-01,ES,0.50", "2026-02-02,ES,0.50", "2026-02-03,ES,0.50"], { ossMode: "optin" });
  const es = line(r, "ES");
  assert.equal(es.baseCents, 150n);
  assert.equal(es.vatCents, 32n);
  assert.equal(es.count, 3);
  assert.notEqual(es.vatCents, 3n * 11n);
});

test("half cents round up, and the same country at two rates stays two lines", () => {
  const r = run(["2026-01-05,FR,0.10", "2026-01-06,FR,10.00,EUR,reduced", "2026-01-07,FR,100.00,EUR,5.5"], { ossMode: "optin" });
  assert.equal(r.lines.filter((l) => l.country === "FR").length, 3);
  assert.equal(line(r, "FR", 2000).vatCents, 2n); // 0.10 x 20% = 0.02
  assert.equal(line(r, "FR", 1000).vatCents, 100n);
  assert.equal(line(r, "FR", 550).vatCents, 550n);
});

test("gross amounts: VAT is taken out of the rounded gross total so base plus VAT equals gross", () => {
  const r = analyze(csv(["2026-03-01,ES,121.00", "2026-03-02,ES,60.50", "2026-03-03,ES,0.99"]), { sellerCountry: "DE", ossMode: "optin", amountBasis: "gross" });
  const es = line(r, "ES");
  assert.equal(es.grossCents, 18249n);
  assert.equal(es.baseCents, 15082n); // 182.49 / 1.21 = 150.818... -> 150.82
  assert.equal(es.vatCents, 3167n);
  assert.equal(es.baseCents + es.vatCents, es.grossCents);
});

test("reconciliation holds for many gross and net lines: lines sum to totals and base plus VAT equals gross", () => {
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
  const countries = ["FR", "ES", "IT", "NL", "SE", "PL", "EL", "FI"];
  const rows = [];
  for (let i = 0; i < 300; i++) rows.push(`2026-0${1 + (i % 3)}-${String(1 + (i % 27)).padStart(2, "0")},${countries[next() % 8]},${(next() % 20000) / 100}`);
  for (const basis of ["net", "gross"]) {
    const r = analyze(csv(rows), { sellerCountry: "DE", ossMode: "optin", amountBasis: basis });
    const sum = (k) => r.lines.reduce((a, l) => a + l[k], 0n);
    assert.equal(sum("baseCents"), r.totals.baseCents);
    assert.equal(sum("vatCents"), r.totals.vatCents);
    assert.equal(r.totals.count, 300);
    for (const l of r.lines) assert.equal(l.baseCents + l.vatCents, l.grossCents);
    if (basis === "gross") {
      const grossTotal = rows.reduce((a, x) => a + BigInt(Math.round(parseFloat(x.split(",")[2]) * 100)), 0n);
      assert.equal(r.totals.grossCents, grossTotal);
    }
  }
});

test("sums are exact where binary floating point is not", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push("2026-04-01,NL,0.10");
  const r = run(rows, { ossMode: "optin" });
  assert.equal(line(r, "NL").baseCents, 100n);
  assert.equal(line(r, "NL").vatCents, 21n);
});

// ---- threshold -----------------------------------------------------------------------------

test("exactly EUR 10,000 does not exceed the threshold; one cent more does", () => {
  const under = run(["2026-02-01,FR,6000.00", "2026-03-01,ES,4000.00"]);
  assert.equal(under.lines.length, 0);
  assert.equal(under.thresholdYears[0].totalCents, 1000000n);
  assert.equal(under.thresholdYears[0].headroomCents, 0n);
  assert.equal(under.thresholdYears[0].exceeded, false);
  assert.equal(under.buckets.origin.count, 2);
  const over = run(["2026-02-01,FR,6000.00", "2026-03-01,ES,4000.01"]);
  assert.equal(over.thresholdYears[0].exceeded, true);
  assert.equal(over.thresholdYears[0].crossedLine, 3);
  assert.equal(over.thresholdYears[0].crossedDate, "2026-03-01");
  assert.equal(line(over, "ES").baseCents, 400001n);
  assert.equal(over.lines.length, 1);
  assert.ok(THRESHOLD_CENTS === 1000000n);
});

test("the sale that crosses the threshold and every later sale take destination VAT; earlier ones do not", () => {
  const r = run(["2026-01-10,FR,5000.00", "2026-02-10,IT,4500.00", "2026-03-10,ES,600.00", "2026-03-11,NL,100.00"]);
  const t = r.thresholdYears[0];
  assert.equal(t.crossedLine, 4);
  assert.equal(t.originCount, 2);
  assert.equal(t.originCents, 950000n);
  assert.deepEqual(r.lines.map((l) => l.country).sort(), ["ES", "NL"]);
  assert.equal(t.totalCents, 1020000n);
  assert.equal(t.headroomCents, -20000n);
  assert.equal(r.rows.filter((x) => x.status === "origin").length, 2);
  assert.equal(find(r, "threshold-crossed").length, 1);
});

test("rows are taken in date order, not file order, and ties keep file order", () => {
  const r = run(["2026-03-10,ES,600.00", "2026-01-10,FR,9500.00", "2026-03-10,NL,100.00"]);
  assert.equal(r.thresholdYears[0].crossedLine, 2); // file line 2 (ES, March) is the sale that crosses once the January FR sale is counted first
});

test("a previous year over EUR 10,000, from the file, puts every sale of the next year on the OSS return", () => {
  const r = run(["2025-06-01,FR,10500.00", "2026-01-05,ES,50.00"]);
  const y26 = r.thresholdYears.find((y) => y.year === 2026);
  assert.equal(y26.reason, "previous-year");
  assert.equal(y26.prevSource, "data");
  assert.equal(y26.crossedLine, null);
  assert.equal(line(r, "ES").baseCents, 5000n);
});

test("a previous-year figure typed by hand is used for the first year in the file", () => {
  const r = run(["2026-01-05,ES,50.00"], { priorYearNet: "10000.01" });
  assert.equal(r.thresholdYears[0].prevSource, "manual");
  assert.equal(r.thresholdYears[0].reason, "previous-year");
  const r2 = run(["2026-01-05,ES,50.00"], { priorYearNet: "10000" });
  assert.equal(r2.thresholdYears[0].exceeded, false);
  assert.equal(find(run(["2026-01-05,ES,50.00"]), "prior-year-unknown").length, 1);
  assert.equal(find(run(["2026-01-05,ES,50.00"], { priorYearNet: "nope" }), "prior-invalid").length, 1);
});

test("the threshold restarts each calendar year", () => {
  const r = run(["2024-05-01,FR,6000.00", "2025-05-01,FR,6000.00", "2026-05-01,FR,6000.00"]);
  assert.equal(r.lines.length, 0);
  assert.deepEqual(r.thresholdYears.map((y) => y.exceeded), [false, false, false]);
});

test("domestic, B2B and non-EU rows never count towards the threshold", () => {
  const r = run(["2026-01-01,DE,50000.00", "2026-01-02,FR,50000.00,EUR,standard,FR12345678901", "2026-01-03,US,50000.00", "2026-01-04,FR,100.00"]);
  assert.equal(r.thresholdYears[0].totalCents, 10000n);
  assert.equal(r.lines.length, 0);
});

test("opting into OSS puts every cross-border sale on the return and still reports where the threshold was passed", () => {
  const r = run(["2026-01-10,FR,6000.00", "2026-02-10,FR,5000.00"], { ossMode: "optin" });
  assert.equal(line(r, "FR").baseCents, 1100000n);
  assert.equal(r.thresholdYears[0].crossedLine, 3);
  assert.equal(r.buckets.origin.count, 0);
});

test("a seller outside the EU has no threshold and no domestic country", () => {
  const r = run(["2026-01-10,DE,100.00", "2026-01-11,FR,100.00"], { sellerCountry: "NONEU" });
  assert.equal(r.lines.length, 2);
  assert.equal(line(r, "DE").vatCents, 1900n);
  assert.equal(r.buckets.domestic.count, 0);
  assert.equal(r.thresholdYears[0].exceeded, false);
  assert.equal(find(r, "noneu-no-threshold").length, 1);
  assert.equal(find(run(["2026-01-10,DE,100.00"], { sellerCountry: "NONEU", supply: "goods" }), "noneu-goods").length, 1);
});

test("a warning appears at 80% of the threshold", () => {
  const r = run(["2026-01-10,FR,8000.00"]);
  assert.equal(find(r, "threshold-near").length, 1);
  assert.equal(find(run(["2026-01-10,FR,7999.99"]), "threshold-near").length, 0);
});

test("gross amounts below the threshold are converted with the seller's own rate for the threshold maths", () => {
  // 11,900.00 gross at Germany's 19% is 10,000.00 net: not over. 11,900.01 is.
  const a = analyze(csv(["2026-01-10,FR,11900.00"]), { sellerCountry: "DE", amountBasis: "gross" });
  assert.equal(a.thresholdYears[0].totalCents, 1000000n);
  assert.equal(a.thresholdYears[0].exceeded, false);
  const b = analyze(csv(["2026-01-10,FR,11900.20"]), { sellerCountry: "DE", amountBasis: "gross" });
  assert.equal(b.thresholdYears[0].exceeded, true);
  const c = analyze(csv(["2026-01-10,FR,11900.00"]), { sellerCountry: "DE", amountBasis: "gross", originRate: "20" });
  assert.equal(c.thresholdYears[0].totalCents, 991667n);
});

// ---- refunds, B2B, domestic ----------------------------------------------------------------

test("a negative amount and a refund-typed positive amount both reduce the group", () => {
  const r = run(["2026-02-01,FR,1000.00", "2026-02-05,FR,-200.00", "2026-02-09,FR,100.00,EUR,standard,,refund"], { ossMode: "optin" });
  const fr = line(r, "FR");
  assert.equal(fr.baseCents, 70000n);
  assert.equal(fr.vatCents, 14000n);
  assert.equal(fr.refunds, 2);
  assert.equal(fr.count, 3);
});

test("refunds reduce the cumulative threshold total", () => {
  const r = run(["2026-01-10,FR,9000.00", "2026-01-11,FR,-2000.00", "2026-01-12,FR,2500.00"]);
  assert.equal(r.thresholdYears[0].exceeded, false);
  assert.equal(r.thresholdYears[0].totalCents, 950000n);
});

test("a refund in a later quarter lands in its own quarter and can make a group negative", () => {
  const rows = ["2026-03-20,FR,100.00", "2026-04-02,FR,-300.00"];
  const q2 = run(rows, { ossMode: "optin", period: "2026-Q2" });
  assert.equal(line(q2, "FR").baseCents, -30000n);
  assert.equal(line(q2, "FR").vatCents, -6000n);
  assert.equal(find(q2, "negative-group").length, 1);
  const q1 = run(rows, { ossMode: "optin", period: "2026-Q1" });
  assert.equal(line(q1, "FR").baseCents, 10000n);
});

test("a refund after the threshold was crossed warns that it may reverse an origin-VAT sale", () => {
  const r = run(["2026-01-10,FR,9500.00", "2026-02-10,FR,1000.00", "2026-03-10,FR,-100.00"]);
  assert.equal(find(r, "refund-after-crossing").length, 1);
  assert.equal(find(r, "refund-after-crossing")[0].row, 4);
});

test("B2B rows with a VAT ID are excluded; a mismatching prefix is warned about", () => {
  const r = run(["2026-02-01,FR,1000.00,EUR,standard,FR12345678901", "2026-02-02,FR,1000.00,EUR,standard,ATU12345678", "2026-02-03,FR,500.00,EUR,standard,yes", "2026-02-04,FR,100.00,EUR,standard,no"], { ossMode: "optin" });
  assert.equal(r.buckets.b2b.count, 3);
  assert.equal(line(r, "FR").baseCents, 10000n);
  const mm = find(r, "vatid-mismatch");
  assert.equal(mm.length, 1);
  assert.equal(mm[0].row, 3);
  assert.equal(find(r, "b2b-no-id").length, 1);
});

test("Greek VAT IDs may start with EL or GR", () => {
  const ok = run(["2026-02-01,GR,100.00,EUR,standard,EL123456789", "2026-02-01,EL,100.00,EUR,standard,GR123456789"], { ossMode: "optin" });
  assert.equal(find(ok, "vatid-mismatch").length, 0);
  assert.equal(ok.buckets.b2b.count, 2);
});

test("domestic sales are shown separately and never on the OSS return", () => {
  const r = run(["2026-02-01,DE,500.00", "2026-02-02,Germany,250.00", "2026-02-03,FR,100.00"], { ossMode: "optin" });
  assert.equal(r.buckets.domestic.count, 2);
  assert.equal(r.buckets.domestic.cents, 75000n);
  assert.equal(r.lines.length, 1);
  assert.equal(r.totals.baseCents, 10000n);
  assert.equal(find(r, "domestic-excluded").length, 1);
});

test("a Greek seller is recognised as GR or EL", () => {
  const r = run(["2026-02-01,EL,500.00", "2026-02-01,GR,500.00"], { sellerCountry: "GR", ossMode: "optin" });
  assert.equal(r.buckets.domestic.count, 2);
});

// ---- countries, rates, columns, FX ---------------------------------------------------------

test("unknown countries are errors; GB, XI, Monaco and non-EU codes are excluded with their own notes", () => {
  const r = run(["2026-02-01,ZZZ,100.00", "2026-02-02,GB,100.00", "2026-02-03,XI,100.00", "2026-02-04,MC,100.00", "2026-02-05,US,100.00", "2026-02-06,FR,100.00"], { ossMode: "optin" });
  assert.equal(find(r, "country-unknown")[0].row, 2);
  assert.equal(find(r, "country-non-eu").length, 4);
  assert.match(find(r, "country-non-eu").find((f) => f.title.startsWith("XI")).detail, /Northern Ireland/);
  assert.match(find(r, "country-non-eu").find((f) => f.title.startsWith("MC")).detail, /Monaco/);
  assert.equal(r.buckets.excluded.count, 5);
  assert.equal(r.lines.length, 1);
  assert.equal(find(r, "rows-excluded").length, 1);
});

test("GR in the file is filed under EL", () => {
  const r = run(["2026-02-01,GR,100.00"], { ossMode: "optin" });
  assert.equal(r.lines[0].country, "EL");
  assert.equal(r.lines[0].name, "Greece");
  assert.equal(r.lines[0].vatCents, 2400n);
  assert.equal(find(r, "country-note").length, 1);
});

test("rate types: reduced, e-book, zero and an explicit percentage", () => {
  const r = run(["2026-02-01,DE,100.00,EUR,reduced", "2026-02-02,DE,100.00,EUR,ebook", "2026-02-03,FR,100.00,EUR,zero", "2026-02-04,NL,100.00,EUR,9%", "2026-02-05,ES,100.00,EUR,0.04"], { ossMode: "optin", sellerCountry: "NONEU" });
  assert.equal(line(r, "DE", 700).baseCents, 20000n);
  assert.equal(line(r, "DE", 700).vatCents, 1400n);
  assert.equal(line(r, "FR", 0).vatCents, 0n);
  assert.equal(line(r, "NL", 900).vatCents, 900n);
  assert.equal(line(r, "ES", 400).vatCents, 400n);
  assert.equal(find(r, "rate-not-in-table").length, 0);
});

test("an unreadable rate is an error on that row and the row is left out", () => {
  const r = run(["2026-02-01,FR,100.00,EUR,banana", "2026-02-02,FR,100.00"], { ossMode: "optin" });
  assert.equal(find(r, "rate-unknown")[0].row, 2);
  assert.equal(line(r, "FR").count, 1);
});

test("foreign currency needs a rate, then converts exactly", () => {
  const rows = ["2026-02-01,FR,110.00,USD", "2026-02-02,FR,100.00,EUR"];
  const missing = run(rows, { ossMode: "optin" });
  assert.deepEqual(missing.currencies, ["USD"]);
  assert.equal(find(missing, "fx-missing")[0].row, 2);
  assert.equal(line(missing, "FR").baseCents, 10000n);
  const ok = run(rows, { ossMode: "optin", fx: { USD: "1.10" } });
  assert.equal(line(ok, "FR").baseCents, 20000n);
  assert.equal(find(ok, "fx-missing").length, 0);
  const bad = run(rows, { ossMode: "optin", fx: { USD: "abc" } });
  assert.equal(find(bad, "fx-invalid").length, 1);
  const round = run(["2026-02-01,FR,100.00,SEK"], { ossMode: "optin", fx: { SEK: "11.2345" } });
  assert.equal(line(round, "FR").baseCents, 890n); // 100 / 11.2345 = 8.9012...
  const comma = run(rows, { ossMode: "optin", fx: { USD: "1,10" } });
  assert.equal(line(comma, "FR").baseCents, 20000n);
});

test("bad dates and amounts name their row and do not stop the rest", () => {
  const r = run(["not-a-date,FR,100.00", "2026-02-01,FR,abc", "2026-02-02,FR,100.00", "2026-13-40,FR,1.00"], { ossMode: "optin" });
  assert.deepEqual(find(r, "bad-date").map((f) => f.row), [2, 5]);
  assert.equal(find(r, "bad-amount")[0].row, 3);
  assert.equal(line(r, "FR").count, 1);
});

test("a missing required column is reported with the headers seen, and the mapping can be overridden", () => {
  const text = "When,Place,Value\n2026-02-01,FR,100.00\n";
  const r = analyze(text, { sellerCountry: "DE", ossMode: "optin" });
  assert.equal(find(r, "columns-missing").length, 1);
  assert.deepEqual(r.headers, ["When", "Place", "Value"]);
  assert.equal(r.ok, false);
  const fixed = analyze(text, { sellerCountry: "DE", ossMode: "optin", mapping: { date: 0, country: 1, amount: 2 } });
  assert.equal(fixed.ok, true);
  assert.equal(line(fixed, "FR").baseCents, 10000n);
});

test("Shopify-style gross export with no rate column", () => {
  const text = "Name,Created at,Shipping Country,Total,Currency\n#1001,2026-07-03 10:00:00 +0100,FR,120.00,EUR\n#1002,2026-07-04 11:00:00 +0100,DE,119.00,EUR\n";
  const r = analyze(text, { sellerCountry: "DE", ossMode: "optin", amountBasis: "gross" });
  assert.equal(line(r, "FR").baseCents, 10000n);
  assert.equal(line(r, "FR").vatCents, 2000n);
  assert.equal(r.buckets.domestic.count, 1);
});

test("a header that says net while gross is selected is flagged", () => {
  const r = analyze(csv(["2026-02-01,FR,100.00"]), { sellerCountry: "DE", ossMode: "optin", amountBasis: "gross" });
  assert.equal(find(r, "basis-hint").length, 1);
});

test("an identical order row is flagged as a possible duplicate but kept", () => {
  const text = "Date,Country,Net amount,Order\n2026-02-01,FR,100.00,A1\n2026-02-01,FR,100.00,A1\n2026-02-01,FR,100.00,A2\n";
  const r = analyze(text, { sellerCountry: "DE", ossMode: "optin" });
  assert.equal(find(r, "duplicate-row")[0].row, 3);
  assert.equal(line(r, "FR").count, 3);
});

test("European semicolon CSV with comma decimals and day-first dates", () => {
  const text = "Datum;Land;Betrag;Währung\n04.05.2026;FR;1.234,50;EUR\n05.05.2026;ES;10,00;EUR\n";
  const r = analyze(text, { sellerCountry: "DE", ossMode: "optin" });
  assert.equal(line(r, "FR").baseCents, 123450n);
  assert.equal(r.periods[0], "2026-Q2");
});

// ---- periods -------------------------------------------------------------------------------

test("the quarter selector filters the return but the threshold still uses the whole year", () => {
  const rows = ["2026-01-10,FR,9000.00", "2026-05-10,FR,2000.00", "2026-08-10,ES,100.00"];
  const q1 = run(rows, { period: "2026-Q1" });
  assert.equal(q1.lines.length, 0);
  assert.equal(q1.buckets.origin.count, 1);
  const q2 = run(rows, { period: "2026-Q2" });
  assert.equal(line(q2, "FR").baseCents, 200000n);
  assert.equal(q2.thresholdYears[0].crossedDate, "2026-05-10");
  const q3 = run(rows, { period: "2026-Q3" });
  assert.equal(line(q3, "ES").baseCents, 10000n);
  assert.deepEqual(q3.periods, ["2026-Q1", "2026-Q2", "2026-Q3"]);
  const all = run(rows);
  assert.equal(all.lines.length, 2);
});

test("periodDueDate is the end of the month after the quarter", () => {
  assert.equal(periodDueDate("2026-Q1"), "2026-04-30");
  assert.equal(periodDueDate("2026-Q2"), "2026-07-31");
  assert.equal(periodDueDate("2026-Q3"), "2026-10-31");
  assert.equal(periodDueDate("2026-Q4"), "2027-01-31");
  assert.equal(periodDueDate(""), null);
  assert.equal(run(["2026-02-01,FR,1"], { period: "2026-Q3" }).dueDate, "2026-10-31");
});

// ---- exports, samples, input guards --------------------------------------------------------

test("ossCsv has a header, one row per country and rate, and a total that equals the sum", () => {
  const r = run(["2026-02-01,FR,100.00", "2026-02-02,FR,100.00,EUR,5.5", "2026-02-03,ES,50.00"], { ossMode: "optin" });
  const lines = ossCsv(r).trim().split("\n");
  assert.equal(lines[0], "Member state of consumption,Country code,VAT rate %,Taxable amount EUR,VAT due EUR,Rows");
  assert.deepEqual(lines.slice(1), ["France,FR,20,100.00,20.00,1", "France,FR,5.5,100.00,5.50,1", "Spain,ES,21,50.00,10.50,1", "Total,,,250.00,36.00,3"]);
});

test("CSV exports quote commas and neutralise spreadsheet formulas", () => {
  assert.equal(csvCell("=cmd|x"), "'=cmd|x");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-12.50"), "-12.50");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  const r = analyze("Date,Country,Net amount\n2026-02-01,ZZZ,1.00\n", { sellerCountry: "DE", ossMode: "optin" });
  const out = findingsCsv(r);
  assert.match(out, /^Row,Severity,Code,Finding,Detail\n/);
  assert.match(out, /country-unknown/);
  assert.match(rowsCsv(run(["2026-02-01,FR,1.00"], { ossMode: "optin" })), /^Row,Date,Country,Status/);
});

test("the net sample crosses the threshold in Q2 with the expected return", () => {
  const r = analyze(sampleCsv(), { sellerCountry: "DE", period: "2026-Q2" });
  const y = r.thresholdYears.find((t) => t.year === 2026);
  assert.equal(y.crossedDate, "2026-04-09");
  assert.equal(y.crossedLine, 12);
  assert.equal(y.originCents, 940000n);
  assert.equal(r.totals.baseCents, 435200n);
  assert.equal(r.totals.vatCents, 96187n);
  assert.equal(line(r, "ES").vatCents, 32n);
  assert.equal(line(r, "EL").vatCents, 24000n);
  const whole = analyze(sampleCsv(), { sellerCountry: "DE" });
  assert.equal(whole.buckets.domestic.count, 1);
  assert.equal(whole.buckets.b2b.count, 1);
  const q1 = analyze(sampleCsv(), { sellerCountry: "DE", period: "2026-Q1" });
  assert.equal(q1.lines.length, 0);
});

test("the gross sample converts SEK and removes VAT per country", () => {
  const r = analyze(sampleGrossCsv(), { sellerCountry: "DE", amountBasis: "gross", priorYearNet: "12000", fx: { SEK: "11.2" } });
  assert.equal(line(r, "ES").baseCents, 10000n);
  assert.equal(line(r, "SE").grossCents, 2232n); // 250 / 11.2 = 22.3214
  assert.equal(line(r, "FR").baseCents, 0n);
  assert.equal(r.buckets.domestic.count, 1);
});

test("the seller country is required and no result is produced without it", () => {
  const r = analyze(csv(["2026-02-01,FR,1"]), {});
  assert.equal(r.ok, false);
  assert.equal(find(r, "seller-country").length, 1);
  assert.equal(analyze(csv(["2026-02-01,FR,1"]), { sellerCountry: "XX" }).ok, false);
});

test("an empty or header-only file is reported", () => {
  assert.equal(find(analyze("", { sellerCountry: "DE" }), "no-data").length, 1);
  assert.equal(find(analyze("Date,Country,Amount\n", { sellerCountry: "DE" }), "no-data").length, 1);
});

test("records note covers 10 years and two non-conflicting pieces of evidence", () => {
  const t = RECORDS_NOTE.join(" ");
  assert.match(t, /10 years/);
  assert.match(t, /two pieces of non-conflicting evidence/);
  assert.match(t, /not advice/);
});

test("findings always carry a severity, a code and a title", () => {
  const r = analyze(sampleCsv(), { sellerCountry: "DE" });
  assert.ok(r.findings.length > 3);
  for (const f of r.findings) {
    assert.ok(["error", "warning", "info"].includes(f.severity));
    assert.ok(f.code && f.title);
  }
});
