import { test } from "node:test";
import assert from "node:assert/strict";
import { check, capBasisPoints, maxAllowedCents, parseMoney, parseDate, parseCsv, RULES, noticeText, noticesText, reportCsv, sampleList, SAMPLE_SETTINGS } from "./calc.mjs";

const H = "Unit,Tenant,Current rent,Proposed rent,Rent 12 months ago,Tenancy start,Last increase,Exempt,Good cause\n";
const run = (rows, s) => check(H + rows, { noticeDate: "2026-11-01", cpi: 3.4, ...s });

test("money and dates parse strictly", () => {
  assert.equal(parseMoney("$1,500.5"), 150050);
  assert.equal(parseMoney("12.345"), null);
  assert.equal(parseMoney(""), null);
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("3/4/2026").toISOString().slice(0, 10), "2026-03-04");
});

test("csv handles quotes, tabs and a BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\n"x, y",2\n'), [["a", "b"], ["x, y", "2"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});

test("cap is the lesser of base plus CPI and the ceiling, in basis points", () => {
  assert.equal(capBasisPoints(RULES.CA, 3.4), 840);
  assert.equal(capBasisPoints(RULES.CA, 7), 1000);
  assert.equal(capBasisPoints(RULES.WA, 2), 900);
  assert.equal(capBasisPoints(RULES.NY, 3, false), null);
  assert.equal(capBasisPoints(RULES.NY, 3, true), 800);
  assert.equal(capBasisPoints(RULES.OTHER, 3), null);
});

test("the dollar limit is floored to the cent and the cap is inclusive", () => {
  assert.equal(maxAllowedCents(150000, 840), 162600);
  assert.equal(maxAllowedCents(123457, 840), 133827);
  const ok = run("1,A,1500,1626,1500,,,,", { state: "CA" });
  assert.equal(ok.rows[0].status, "ok");
  const over = run("1,A,1500,1626.01,1500,,,,", { state: "CA" });
  assert.equal(over.rows[0].status, "over");
});

test("the cap runs from the lowest rent in the last 12 months, not the current rent", () => {
  const r = run("1,A,1600,1700,1500,,,,", { state: "CA" });
  assert.equal(r.rows[0].status, "over");
  assert.match(r.rows[0].reasons[0], /1,626\.00/);
});

test("California notice is 30 days to 10 percent and 90 above, plus 5 for mail", () => {
  const r = run("1,A,1000,1080,1000,,,,\n2,B,1000,1100,1000,,,,\n", { state: "CA", cpi: 6 });
  assert.equal(r.rows[0].noticeDays, 30);
  assert.equal(r.rows[1].noticeDays, 30);
  const big = run("1,A,1000,1101,1000,,,,", { state: "CA", cpi: 6, mailed: true });
  assert.equal(big.rows[0].noticeDays, 90);
  assert.equal(big.rows[0].status, "over");
  const mail = run("1,A,1000,1050,1000,,,,", { state: "CA", mailed: true });
  assert.equal(mail.rows[0].earliest, "2026-12-06");
});

test("Oregon blocks a first-year increase and a second increase inside 12 months", () => {
  const a = run("1,A,1000,1050,1000,2026-03-01,,,", { state: "OR" });
  assert.equal(a.rows[0].status, "over");
  assert.match(a.rows[0].reasons.join(), /first year/);
  const b = run("1,A,1000,1050,1000,2024-03-01,2026-06-01,,", { state: "OR" });
  assert.equal(b.rows[0].status, "over");
  const c = run("1,A,1000,1050,1000,2024-03-01,2025-06-01,,", { state: "OR" });
  assert.equal(c.rows[0].status, "ok");
  assert.equal(c.rows[0].noticeDays, 90);
});

test("Washington uses 90 days", () => {
  const r = run("1,A,1000,1050,1000,,,,", { state: "WA" });
  assert.equal(r.rows[0].noticeDays, 90);
  assert.equal(r.rows[0].earliest, "2027-01-30");
});

test("New York notice depends on tenancy length and the cap only on good cause units", () => {
  const rows = "1,A,1000,1100,1000,2026-06-01,,,\n2,B,1000,1100,1000,2025-03-01,,,\n3,C,1000,1100,1000,2020-03-01,,,\n4,D,1000,1040,1000,2020-03-01,,,\n5,E,1000,1200,1000,2020-03-01,,,yes\n";
  const r = run(rows, { state: "NY" });
  assert.deepEqual(r.rows.map((x) => x.noticeDays), [30, 60, 90, 0, 90]);
  assert.equal(r.rows[2].status, "ok");
  assert.equal(r.rows[4].status, "over");
});

test("an exempt row is not capped, and says so", () => {
  const r = run("1,A,1000,1500,1000,,,yes,", { state: "CA" });
  assert.equal(r.rows[0].status, "ok");
  assert.match(r.rows[0].notes.join(), /exempt/);
});

test("other states use the notice days you give and apply no cap", () => {
  const r = run("1,A,1000,2000,1000,,,,", { state: "OTHER", otherNoticeDays: 45 });
  assert.equal(r.rows[0].status, "ok");
  assert.equal(r.rows[0].noticeDays, 45);
  assert.equal(r.rows[0].earliest, "2026-12-16");
});

test("a planned effective date earlier than the earliest is flagged", () => {
  const r = run("1,A,1000,1050,1000,,,,", { state: "CA", effectiveDate: "2026-11-15" });
  assert.equal(r.rows[0].status, "early");
  const ok = run("1,A,1000,1050,1000,,,,", { state: "CA", effectiveDate: "2026-12-01" });
  assert.equal(ok.rows[0].status, "ok");
});

test("bad rows are reported, not guessed at", () => {
  const r = run("1,A,abc,1500,,,,,\n,B,1000,1100,,,,,\n3,C,1000,0,,,,,\n4,D,1000,900,1000,,,,", { state: "CA" });
  assert.deepEqual(r.rows.map((x) => x.status), ["error", "error", "error", "info"]);
  assert.equal(r.summary.errors, 3);
});

test("missing columns and a missing notice date are errors", () => {
  const r = check("Unit,Rent\n1,1000", { noticeDate: "2026-11-01" });
  assert.ok(r.findings.some((f) => /proposed/.test(f.title)));
  const n = check(H + "1,A,1000,1050,1000,,,,", { state: "CA" });
  assert.ok(n.findings.some((f) => /date you will give/.test(f.title)));
});

test("the sample list reads as designed: one over the cap, three fine", () => {
  const r = check(sampleList(), SAMPLE_SETTINGS);
  assert.deepEqual(r.rows.map((x) => x.status), ["ok", "ok", "over", "ok"]);
  assert.equal(r.summary.over, 1);
});

test("notices are only written for rows that can be sent, and never promise compliance", () => {
  const r = check(sampleList(), SAMPLE_SETTINGS);
  const all = noticesText(r);
  assert.equal((all.match(/NOTICE OF RENT INCREASE/g) || []).length, 3);
  assert.doesNotMatch(all, /Priya/);
  assert.match(noticeText(r.rows[0], r), /as the landlord understands/);
  assert.equal(noticeText(r.rows[2], r), "");
});

test("report csv escapes commas and carries the reason", () => {
  const r = check(sampleList(), SAMPLE_SETTINGS);
  const csv = reportCsv(r);
  assert.match(csv, /2A,Priya Nair,over,2000\.00,2400\.00,20\.00,2168\.00,90,2027-01-30,"exceeds the 8\.40% cap/);
});
