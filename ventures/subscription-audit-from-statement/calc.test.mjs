import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, detectDelimiter, decodeBuffer, parseNumber, parseDate, isoDay, guessDateOrder, merchantKey, kindOf, normalizeStatement, analyze, savings, reportCsv, summaryText, sampleCsv } from "./calc.mjs";

const read = (text, opts) => { const d = detectDelimiter(text); return normalizeStatement(parseCsv(text, d), { decimalComma: d === ";", ...opts }); };
const monthly = (name, amt, n, day = "05", from = 2026, startMonth = 1) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const m = startMonth + i, y = from + Math.floor((m - 1) / 12), mm = ((m - 1) % 12) + 1;
    out.push(`${y}-${String(mm).padStart(2, "0")}-${day},${name},${-amt}`);
  }
  return out;
};
const csv = (...groups) => "Date,Description,Amount\n" + groups.flat().join("\n") + "\n";

test("parseNumber handles signs, parentheses, symbols, decimal commas", () => {
  assert.equal(parseNumber("-$1,234.50"), -1234.5);
  assert.equal(parseNumber("(12.00)"), -12);
  assert.equal(parseNumber("1.234,50", true), 1234.5);
  assert.equal(parseNumber("12.00 CR"), -12);
  assert.ok(Number.isNaN(parseNumber("abc")));
  assert.equal(parseNumber(""), 0);
});

test("parseDate reads ISO, US and day-first dates and rejects impossible ones", () => {
  assert.equal(isoDay(parseDate("2026-03-05")), "2026-03-05");
  assert.equal(isoDay(parseDate("3/5/2026", "mdy")), "2026-03-05");
  assert.equal(isoDay(parseDate("3/5/26", "mdy")), "2026-03-05");
  assert.equal(isoDay(parseDate("5/3/2026", "dmy")), "2026-03-05");
  assert.equal(isoDay(parseDate("2026-03-05T10:00:00Z")), "2026-03-05");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("13/13/2026"), null);
  assert.equal(parseDate("yesterday"), null);
});

test("guessDateOrder reads day-first only when the evidence says so", () => {
  assert.equal(guessDateOrder(["25/03/2026", "01/04/2026"]), "dmy");
  assert.equal(guessDateOrder(["03/25/2026", "04/01/2026"]), "mdy");
  assert.equal(guessDateOrder(["03/04/2026"]), "mdy");
});

test("merchantKey strips processor prefixes, numbers, phone numbers and state codes", () => {
  assert.equal(merchantKey("NETFLIX.COM 866-579-7172 CA"), "NETFLIX.COM");
  assert.equal(merchantKey("NETFLIX.COM 800-123-4567 CA"), "NETFLIX.COM");
  assert.equal(merchantKey("SQ *BLUE BOTTLE COFFEE 104 OAKLAND CA"), "BLUE BOTTLE COFFEE");
  assert.equal(merchantKey("DEBIT CARD PURCHASE SPOTIFY USA 877-7781161 NY"), "SPOTIFY USA");
  assert.equal(merchantKey("PAYPAL *DROPBOX 402-935-7733"), "DROPBOX");
  assert.equal(merchantKey("123 456"), "");
});

test("kindOf guesses a category from the name only", () => {
  assert.equal(kindOf("NETFLIX.COM"), "Video streaming");
  assert.equal(kindOf("SPOTIFY USA"), "Music streaming");
  assert.equal(kindOf("JOES DINER"), null);
});

test("header is found below preamble lines and aliases are matched", () => {
  const r = read("Account: 1234\nPosted Date,Payee,Amount\n2026-01-05,NETFLIX,-15.49\n");
  assert.equal(r.error, undefined);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].spend, 15.49);
  assert.equal(r.columns.desc, "Payee");
});

test("no usable header gives a plain error", () => {
  assert.match(read("a,b\n1,2\n").error, /No header row/);
  assert.match(normalizeStatement([]).error, /empty/);
});

test("spend sign is detected: bank negatives and card positives both work", () => {
  const bank = read("Date,Description,Amount\n2026-01-05,NETFLIX,-15.49\n2026-01-06,PAYROLL,2000\n2026-01-07,SPOTIFY,-11.99\n");
  assert.equal(bank.spendSign, "negative");
  assert.deepEqual(bank.rows.map((r) => r.spend), [15.49, 11.99]);
  const card = read("Date,Description,Amount\n2026-01-05,NETFLIX,15.49\n2026-01-06,PAYMENT THANK YOU,-500\n2026-01-07,SPOTIFY,11.99\n2026-01-08,HULU,17.99\n");
  assert.equal(card.spendSign, "positive");
  assert.equal(card.rows.length, 3);
  const forced = read("Date,Description,Amount\n2026-01-05,NETFLIX,15.49\n", { spendSign: "positive" });
  assert.equal(forced.rows[0].spend, 15.49);
});

test("debit and credit columns are read as money out and money in", () => {
  const r = read("Date,Description,Debit,Credit\n2026-01-05,NETFLIX,15.49,\n2026-01-06,REFUND,,5.00\n");
  assert.equal(r.spendSign, "columns");
  assert.equal(r.rows.length, 1);
});

test("unreadable rows are skipped and counted, not guessed", () => {
  const r = read("Date,Description,Amount\nnot a date,X,-1\n2026-01-05,,-2\n2026-01-06,Y,abc\n2026-01-07,NETFLIX,-15\n");
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.skipped.map((s) => s.reason), ["date not readable", "no description", "amount not readable"]);
});

test("semicolon files with decimal commas are read", () => {
  const r = read("Date;Description;Amount\n05.01.2026;NETFLIX;-15,49\n");
  assert.equal(r.rows[0].spend, 15.49);
  assert.equal(isoDay(r.rows[0].day), "2026-01-05");
});

test("UTF-16 buffers decode", () => {
  const text = "Date,Description,Amount\n2026-01-05,NETFLIX,-15.49\n";
  const buf = new Uint8Array(2 + text.length * 2);
  buf[0] = 0xff; buf[1] = 0xfe;
  for (let i = 0; i < text.length; i++) buf[2 + i * 2] = text.charCodeAt(i);
  assert.equal(decodeBuffer(buf.buffer).includes("NETFLIX"), true);
});

test("a monthly fixed charge is found with its yearly cost", () => {
  const a = analyze(read(csv(monthly("NETFLIX.COM", 15.49, 6))).rows);
  assert.equal(a.subs.length, 1);
  const s = a.subs[0];
  assert.equal(s.cadence, "monthly");
  assert.equal(s.fixed, true);
  assert.equal(s.perYear, 185.88);
  assert.equal(s.perMonth, 15.49);
  assert.equal(a.totals.perYear, 185.88);
});

test("two charges are not enough for a monthly pattern, but are for a yearly one", () => {
  const two = analyze(read(csv(monthly("NETFLIX.COM", 15.49, 2))).rows);
  assert.equal(two.subs.length, 0);
  const yearly = analyze(read(csv(["2025-03-10,DROPBOX,-119.88", "2026-03-10,DROPBOX,-119.88"])).rows);
  assert.equal(yearly.subs[0].cadence, "annual");
  assert.equal(yearly.subs[0].perMonth, 9.99);
});

test("irregular spending at one merchant is not called a subscription", () => {
  const rows = ["2026-01-02,COFFEE SHOP,-4.5", "2026-01-03,COFFEE SHOP,-5.5", "2026-01-09,COFFEE SHOP,-4", "2026-01-15,COFFEE SHOP,-6", "2026-01-16,COFFEE SHOP,-4.75", "2026-01-29,COFFEE SHOP,-5"];
  assert.equal(analyze(read(csv(rows)).rows).subs.length, 0);
});

test("weekly variable-amount charges are not called subscriptions, weekly fixed ones are", () => {
  const wk = (amts) => amts.map((a, i) => `2026-01-${String(1 + i * 7).padStart(2, "0")},MEALKIT,${-a}`);
  assert.equal(analyze(read(csv(wk([31, 42, 28, 55, 37]))).rows).subs.length, 0);
  const fixed = analyze(read(csv(wk([30, 30, 30, 30, 30]))).rows);
  assert.equal(fixed.subs[0].cadence, "weekly");
  assert.equal(fixed.subs[0].perYear, 1560);
});

test("a variable monthly bill is found and marked as not fixed", () => {
  const a = analyze(read(csv(["2026-01-12,POWER CO,-88", "2026-02-12,POWER CO,-131", "2026-03-13,POWER CO,-64", "2026-04-12,POWER CO,-109"])).rows);
  assert.equal(a.subs[0].fixed, false);
  assert.equal(a.subs[0].rises.length, 0);
});

test("a price rise is reported with when it started and what it costs a year", () => {
  const rows = [...monthly("NETFLIX.COM", 15.49, 4), ...monthly("NETFLIX.COM", 17.99, 4, "05", 2026, 5)];
  const s = analyze(read(csv(rows)).rows).subs[0];
  assert.equal(s.rises.length, 1);
  assert.deepEqual([s.rises[0].from, s.rises[0].to, isoDay(s.rises[0].day)], [15.49, 17.99, "2026-05-05"]);
  assert.equal(s.riseImpactYear, 30);
  assert.equal(s.amount, 17.99);
});

test("a price cut is not a rise, and pennies of drift are ignored", () => {
  const cut = analyze(read(csv([...monthly("X", 20, 3), ...monthly("X", 15, 3, "05", 2026, 4)])).rows).subs[0];
  assert.equal(cut.rises.length, 0);
  const drift = analyze(read(csv(["2026-01-05,X,-10.00", "2026-02-05,X,-10.10", "2026-03-05,X,-10.05"])).rows).subs[0];
  assert.equal(drift.rises.length, 0);
});

test("the same charge twice in two days is a double charge and does not become a cycle", () => {
  const rows = [...monthly("HULU", 17.99, 4), "2026-03-06,HULU,-17.99"];
  const a = analyze(read(csv(rows)).rows);
  assert.equal(a.doubleCharges.length, 1);
  assert.equal(a.subs[0].count, 4);
  assert.ok(a.findings.some((f) => f.severity === "high" && /twice/.test(f.title)));
});

test("a charge that stopped reads as ended and leaves the totals", () => {
  const rows = [...monthly("SKILLSHARE", 19, 3), ...monthly("SPOTIFY", 11.99, 8)];
  const a = analyze(read(csv(rows)).rows);
  assert.equal(a.subs.find((s) => s.merchant === "SKILLSHARE").status, "ended");
  assert.equal(a.totals.active, 1);
  assert.equal(a.totals.perMonth, 11.99);
  assert.ok(a.findings.some((f) => /seem to have stopped/.test(f.title)));
});

test("asOf moves the ended test, so an old file is not called cancelled", () => {
  const rows = monthly("SPOTIFY", 11.99, 4);
  const a = analyze(read(csv(rows)).rows, { asOf: parseDate("2026-05-01") });
  assert.equal(a.subs[0].status, "active");
  const later = analyze(read(csv(rows)).rows, { asOf: parseDate("2026-09-01") });
  assert.equal(later.subs[0].status, "ended");
});

test("overlapping services of one kind are flagged with the combined monthly cost", () => {
  const a = analyze(read(csv(monthly("NETFLIX.COM", 15.49, 4), monthly("HULU", 17.99, 4, "09"), monthly("DISNEY PLUS", 13.99, 4, "14"), monthly("SPOTIFY", 11.99, 4, "20"))).rows);
  assert.equal(a.overlaps.length, 1);
  assert.equal(a.overlaps[0].kind, "Video streaming");
  assert.equal(a.overlaps[0].merchants.length, 3);
  assert.equal(a.overlaps[0].perMonth, 47.47);
});

test("a yearly renewal coming up is listed", () => {
  const a = analyze(read(csv(["2025-10-20,DROPBOX,-119.88", "2026-10-20,DROPBOX,-119.88", "2026-11-20,SPOTIFY,-11.99"])).rows, { asOf: parseDate("2026-11-20") });
  assert.equal(a.subs.find((s) => s.merchant === "DROPBOX").status, "active");
  const b = analyze(read(csv(["2025-10-20,DROPBOX,-119.88", "2026-10-20,DROPBOX,-119.88"])).rows, { asOf: parseDate("2027-09-25") });
  assert.equal(b.upcoming.length, 1);
  assert.ok(b.findings.some((f) => /renews/.test(f.title)));
});

test("month-end billing steps to the end of the next month", () => {
  const a = analyze(read(csv(["2026-01-31,GYM,-25", "2026-02-28,GYM,-25", "2026-03-31,GYM,-25"])).rows);
  assert.equal(isoDay(a.subs[0].next), "2026-04-30");
});

test("small recurring amounts under the floor are ignored", () => {
  const a = analyze(read(csv(monthly("APP", 0.99, 5))).rows, { minAmount: 1 });
  assert.equal(a.subs.length, 0);
});

test("a short file is marked so the page can say the pattern is thin", () => {
  assert.equal(analyze(read(csv(["2026-01-05,X,-10", "2026-01-20,X,-3"])).rows).shortFile, true);
  assert.equal(analyze(read(csv(monthly("X", 10, 6))).rows).shortFile, false);
});

test("savings adds up only the active merchants chosen", () => {
  const a = analyze(read(csv(monthly("NETFLIX.COM", 15.49, 4), monthly("SPOTIFY", 11.99, 4, "09"))).rows);
  assert.deepEqual(savings(a, ["NETFLIX", "NOT THERE"]), { count: 1, perMonth: 15.49, perYear: 185.88 });
  assert.deepEqual(savings(a, []), { count: 0, perMonth: 0, perYear: 0 });
});

test("totals reconcile: per-year is the sum of the rows and per-month is a twelfth", () => {
  const a = analyze(read(sampleCsv()).rows);
  const sum = a.active.reduce((x, s) => x + s.perYear, 0);
  assert.ok(Math.abs(a.totals.perYear - sum) < 0.02);
  assert.ok(Math.abs(a.totals.perMonth * 12 - a.totals.perYear) < 0.2);
});

test("sample data shows a price rise, a double charge, overlap and an ended charge", () => {
  const a = analyze(read(sampleCsv()).rows);
  const titles = a.findings.map((f) => f.title).join("|");
  assert.match(titles, /NETFLIX went up/);
  assert.match(titles, /HULU charged/);
  assert.match(titles, /video streaming services/);
  assert.match(titles, /seem to have stopped/);
});

test("CSV export neutralises formula cells and reads back", () => {
  const rows = read(csv(monthly("=HYPERLINK", 15, 4))).rows;
  const out = reportCsv(analyze(rows));
  assert.match(out, /^merchant,status/);
  assert.ok(!/(^|\n)=/.test(out));
  assert.match(out, /'=HYPERLINK/);
});

test("summary names totals and the selected saving", () => {
  const a = analyze(read(csv(monthly("NETFLIX.COM", 15.49, 4))).rows);
  const t = summaryText(a, ["NETFLIX"]);
  assert.match(t, /\$185\.88 a year/);
  assert.match(t, /Cancelling the 1 selected/);
});

test("analyze refuses an empty input", () => {
  assert.match(analyze([]).invalid, /no charges/);
});

import { identifyService, storeBiller, SERVICES } from "./services.mjs";

test("directory: descriptor variants of one service merge into one line", () => {
  const text = csv(monthly("NETFLIX.COM 866-579-7172 CA", 15.49, 3), monthly("NETFLIX INC LOS GATOS", 15.49, 3, "05", 2026, 4));
  const a = analyze(read(text).rows);
  assert.equal(a.active.length, 1);
  assert.equal(a.active[0].merchant, "NETFLIX");
  assert.equal(a.active[0].site, "netflix.com");
  assert.equal(a.active[0].count, 6);
});

test("directory: every entry matches its own name and no two services share a kind-name", () => {
  const names = new Set();
  for (const s of SERVICES) {
    assert.ok(!names.has(s.name), s.name);
    names.add(s.name);
    assert.ok(s.site && s.kind && s.re instanceof RegExp, s.name);
  }
  assert.equal(identifyService("SPOTIFY USA").name, "Spotify");
  assert.equal(identifyService("JOES DINER"), null);
  assert.equal(identifyService("CALMWATER PLUMBING"), null);
});

test("app-store charges are flagged with where to look, and not guessed", () => {
  assert.equal(storeBiller("APPLE.COM/BILL 866-712-7753 CA").id, "apple");
  assert.equal(storeBiller("GOOGLE *Play Store").id, "google");
  assert.equal(storeBiller("NETFLIX.COM"), null);
  const a = analyze(read(csv(monthly("APPLE.COM/BILL 866-712-7753 CA", 9.99, 4))).rows);
  const f = a.findings.find((x) => /billed through Apple/.test(x.title));
  assert.ok(f);
  assert.match(f.detail, /Settings > your name > Subscriptions/);
});
