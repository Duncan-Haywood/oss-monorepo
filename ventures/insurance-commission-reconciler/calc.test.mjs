import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcile, readBook, readStatement, readRates, parseMoney, parseRate, parseDate, isoDay, dollars, classifyTxn, policyKeys, carrierKey, disputeLetter, allDisputeLetters, findingsCsv, carrierCsv, sampleBook, sampleStatements, SAMPLE_OPTS } from "./calc.mjs";

const BOOK_HEAD = "Policy,Insured,Carrier,Line,Effective,Premium,Rate,Business Type,Status,Billing\n";
const STMT_HEAD = "Policy,Insured,Transaction,Premium,Commission,Statement Date\n";
const OPTS = { periodStart: "2026-09-01", periodEnd: "2026-09-30", lagDays: 30 };
const rec = (bookRows, stmtRows, extra = {}) => reconcile({ book: BOOK_HEAD + bookRows.join("\n"), statements: [{ name: "Acme", carrier: "Acme Insurance", text: STMT_HEAD + stmtRows.join("\n") }], opts: OPTS, ...extra });
const kinds = (r) => r.findings.map((f) => f.kind);
const one = (r, kind) => r.findings.find((f) => f.kind === kind);

test("money, rates and dates are read the way carrier files write them", () => {
  assert.equal(parseMoney("$1,250.50"), 125050);
  assert.equal(parseMoney("(50.00)"), -5000);
  assert.equal(parseMoney("12.50-"), -1250);
  assert.equal(parseMoney(""), null);
  assert.ok(Number.isNaN(parseMoney("n/a")));
  assert.equal(parseRate("15%"), 0.15);
  assert.equal(parseRate("15"), 0.15);
  assert.equal(parseRate("0.15"), 0.15);
  assert.equal(parseRate("1"), 0.01);
  assert.equal(parseRate(""), null);
  assert.equal(isoDay(parseDate("9/5/2026")), "2026-09-05");
  assert.equal(isoDay(parseDate("Sep 2026")), "2026-09-01");
  assert.equal(isoDay(parseDate("2026-09")), "2026-09-01");
  assert.ok(Number.isNaN(parseDate("2026-02-30")));
  assert.equal(dollars(-125050), "-$1,250.50");
});

test("policy numbers meet across punctuation, case, leading zeros and a term suffix", () => {
  assert.equal(policyKeys("pa-0100231").full, "PA0100231".replace(/^0+/, ""));
  assert.equal(policyKeys("PA 100231").full, policyKeys("pa100231").full);
  assert.equal(policyKeys("PA-100231-01").base, policyKeys("PA-100231").full);
  assert.notEqual(policyKeys("PA-100231").full, policyKeys("PA-100232").full);
  assert.equal(carrierKey("Northbridge Mutual Insurance Co."), carrierKey("northbridge mutual"));
});

test("transactions: a negative is a chargeback, a bonus is not a policy, renewal beats new", () => {
  assert.equal(classifyTxn("Renewal Premium", 5000), "renewal");
  assert.equal(classifyTxn("New Business", 5000), "new");
  assert.equal(classifyTxn("Endorsement AP", 500), "endorsement");
  assert.equal(classifyTxn("Cancellation", -5000), "chargeback");
  assert.equal(classifyTxn("Contingent bonus", 90000), "other");
  assert.equal(classifyTxn("", 5000), "unspecified");
});

test("a policy with no commission on any statement is reported with the amount it should have paid", () => {
  const r = rec(["P1,Bakery,Acme Insurance,Package,2026-08-10,10000,15%,New,Active,Agency"], ["P9,Other,New,500,75.00,2026-09-15"]);
  const f = one(r, "missing");
  assert.equal(f.cents, 150000);
  assert.equal(f.severity, "error");
  assert.equal(r.summary.missingCents, 150000);
});

test("a policy not yet due, a cancelled policy and an older one are not reported as missing", () => {
  const r = rec([
    "P1,A,Acme Insurance,Package,2026-09-20,10000,15%,New,Active,Agency",
    "P2,B,Acme Insurance,Package,2026-08-10,10000,15%,New,Cancelled,Agency",
    "P3,C,Acme Insurance,Package,2026-06-01,10000,15%,New,Active,Agency",
  ], ["P9,Other,New,500,75.00,2026-09-15"]);
  assert.equal(r.summary.missing, 0);
  assert.ok(kinds(r).includes("not-due"));
  assert.ok(kinds(r).includes("older-unmatched"));
  assert.match(one(r, "older-unmatched").detail, /\$1,500\.00/);
});

test("a direct-billed policy is a warning, not an error", () => {
  const r = rec(["P1,A,Acme Insurance,Home,2026-08-10,2000,12%,New,Active,Direct"], ["P9,Other,New,500,75.00,2026-09-15"]);
  assert.equal(one(r, "missing").severity, "warning");
});

test("a commission paid below the book rate is underpaid by the difference", () => {
  const r = rec(["P1,A,Acme Insurance,Auto,2026-08-10,12400,12%,Renewal,Active,Agency"], ["P1,A,Renewal,12400,1116.00,2026-09-15"]);
  const f = one(r, "underpaid");
  assert.equal(f.cents, 37200);
  assert.equal(f.expectedCents, 148800);
  assert.match(f.title, /paid at 9%, expected 12%/);
  assert.equal(r.summary.missing, 0);
});

test("a rate within the tolerance, or a few cents of rounding, is not a finding", () => {
  const r = rec(["P1,A,Acme Insurance,Auto,2026-08-10,12400,12%,Renewal,Active,Agency"], ["P1,A,Renewal,12400,1487.50,2026-09-15"]);
  assert.deepEqual(kinds(r).filter((k) => ["underpaid", "overpaid"].includes(k)), []);
});

test("an overpayment is a warning that can come back as a chargeback, and is not counted as owed", () => {
  const r = rec(["P1,A,Acme Insurance,Auto,2026-08-10,10000,10%,New,Active,Agency"], ["P1,A,New,10000,1500.00,2026-09-15"]);
  const f = one(r, "overpaid");
  assert.equal(f.severity, "warning");
  assert.equal(f.overCents, 50000);
  assert.equal(r.summary.underpaidCents, 0);
  assert.equal(r.summary.overpaidCents, 50000);
});

test("a chargeback on a policy the book shows in force is an error; on a cancelled one it is silent", () => {
  const r = rec([
    "P1,A,Acme Insurance,BOP,2026-08-10,1800,15%,New,Active,Agency",
    "P2,B,Acme Insurance,BOP,2026-06-10,1800,15%,New,Cancelled,Agency",
  ], ["P1,A,Chargeback,-1800,-270.00,2026-09-15", "P2,B,Chargeback,-1800,-270.00,2026-09-15"]);
  const hits = r.findings.filter((f) => f.kind === "chargeback-active");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].policy, "P1");
  assert.equal(r.summary.chargebackCents, 27000);
  assert.equal(r.summary.missing, 0, "a charged-back policy is not also reported missing");
});

test("identical lines are flagged as a likely duplicate with the amount to hold back", () => {
  const r = rec(["P1,A,Acme Insurance,Home,2026-08-20,1900,12%,Renewal,Active,Agency"], ["P1,A,Renewal,1900,228.00,2026-09-10", "P1,A,Renewal,1900,228.00,2026-09-10"]);
  const f = one(r, "duplicate");
  assert.equal(f.overCents, 22800);
  assert.equal(r.summary.overpaidCents, 22800);
});

test("a line for a policy not in the book is a warning; a bonus line is not", () => {
  const r = rec(["P1,A,Acme Insurance,Home,2026-08-20,1900,12%,Renewal,Active,Agency"], ["P1,A,Renewal,1900,228.00,2026-09-10", "P7,Z,New,4000,600.00,2026-09-10", "P8,Y,Volume Bonus,0,900.00,2026-09-10"]);
  const u = r.findings.filter((f) => f.kind === "unknown-policy");
  assert.deepEqual(u.map((f) => f.policy), ["P7"]);
});

test("a statement total that does not match its lines is an error naming the gap", () => {
  const r = rec(["P1,A,Acme Insurance,Home,2026-08-20,1900,12%,Renewal,Active,Agency"], ["P1,A,Renewal,1900,228.00,2026-09-10", "Total,,,,258.00,"]);
  const f = one(r, "total-mismatch");
  assert.match(f.title, /\$258\.00.*\$228\.00/);
  assert.equal(r.lines.length, 1, "the total row is not a policy line");
  const ok = rec(["P1,A,Acme Insurance,Home,2026-08-20,1900,12%,Renewal,Active,Agency"], ["P1,A,Renewal,1900,228.00,2026-09-10", "Total,,,,228.00,"]);
  assert.equal(one(ok, "total-mismatch"), undefined);
});

test("numbers that differ only by a term suffix still match, and say so", () => {
  const r = rec(["PA-100231,A,Acme Insurance,Auto,2026-08-10,1000,10%,Renewal,Active,Agency"], ["PA-100231-01,A,Renewal,1000,100.00,2026-09-15"]);
  assert.equal(r.summary.matched, 1);
  assert.ok(kinds(r).includes("term-suffix"));
  assert.equal(r.summary.missing, 0);
});

test("a policy number on one carrier's statement does not match the same number at another carrier", () => {
  const book = BOOK_HEAD + "P1,A,Acme Insurance,Auto,2026-08-10,1000,10%,Renewal,Active,Agency\nP1,B,Zeta Mutual,Auto,2026-08-10,2000,10%,Renewal,Active,Agency";
  const r = reconcile({ book, statements: [{ name: "Zeta", carrier: "Zeta Mutual", text: STMT_HEAD + "P1,B,Renewal,2000,200.00,2026-09-15" }], opts: OPTS });
  assert.equal(r.summary.matched, 1);
  assert.equal(r.summary.missing, 0, "Acme has no statement loaded, so its policy is not called unpaid");
  assert.match(one(r, "no-statement").title, /No statement loaded for Acme Insurance: 1 policy not checked/);
});

test("with no rate in the book, a rate table supplies it, per carrier and line", () => {
  const rates = "Carrier,Line,New,Renewal\nAcme Insurance,Auto,15%,12%\nAcme Insurance,,10%,8%";
  const r = rec(["P1,A,Acme Insurance,Auto,2026-08-10,10000,,Renewal,Active,Agency", "P2,B,Acme Insurance,Property,2026-08-10,10000,,New,Active,Agency"], ["P9,Z,New,100,10.00,2026-09-15"], { rates });
  const miss = r.findings.filter((f) => f.kind === "missing").sort((a, b) => a.policy.localeCompare(b.policy));
  assert.equal(miss[0].cents, 120000);
  assert.equal(miss[1].cents, 100000);
  assert.deepEqual(readRates(rates).map((x) => [x.lob, x.new, x.renewal]), [["auto", 0.15, 0.12], ["", 0.1, 0.08]]);
});

test("with no rate anywhere, a missing policy is reported without inventing an amount", () => {
  const r = rec(["P1,A,Acme Insurance,Auto,2026-08-10,10000,,Renewal,Active,Agency"], ["P9,Z,New,100,10.00,2026-09-15"]);
  const f = one(r, "missing");
  assert.equal(f.cents, 0);
  assert.match(f.detail, /No commission rate is known/);
});

test("the carrier's usual rate flags the one policy paid differently, when there are enough lines", () => {
  const book = [], stmt = [];
  for (let i = 1; i <= 6; i++) { book.push(`P${i},A${i},Acme Insurance,Auto,2026-08-10,10000,,Renewal,Active,Agency`); stmt.push(`P${i},A${i},Renewal,10000,${i === 6 ? "1000.00" : "1200.00"},2026-09-15`); }
  const r = rec(book, stmt);
  const f = one(r, "underpaid");
  assert.equal(f.policy, "P6");
  assert.equal(f.cents, 20000);
  assert.equal(f.rateSource, "usual");
  assert.match(f.detail, /5 of 6 other/);
  const few = rec(book.slice(0, 3), stmt.slice(0, 3).map((s, i) => (i === 2 ? s.replace("1200.00", "1000.00") : s)));
  assert.equal(one(few, "underpaid"), undefined, "three lines are not a pattern");
});

test("a premium that differs from the book is flagged without a dollar claim", () => {
  const r = rec(["P1,A,Acme Insurance,Auto,2026-08-10,10000,10%,Renewal,Active,Agency"], ["P1,A,Renewal,8000,800.00,2026-09-15"]);
  const f = one(r, "premium-mismatch");
  assert.equal(f.cents, 0);
  assert.equal(one(r, "underpaid"), undefined);
});

test("the period is read from the statement dates, whole months, when not typed", () => {
  const r = reconcile({ book: BOOK_HEAD + "P1,A,Acme Insurance,Auto,2026-08-10,10000,10%,Renewal,Active,Agency", statements: [{ name: "Acme", carrier: "Acme Insurance", text: STMT_HEAD + "P9,Z,New,100,10.00,2026-09-15" }], opts: {} });
  assert.deepEqual(r.summary.period, { start: "2026-09-01", end: "2026-09-30" });
  assert.equal(r.summary.missing, 1);
});

test("no statement dates and no typed period: unpaid policies are not checked, and the report says so", () => {
  const r = reconcile({ book: BOOK_HEAD + "P1,A,Acme Insurance,Auto,2026-08-10,10000,10%,Renewal,Active,Agency", statements: [{ name: "Acme", carrier: "Acme Insurance", text: "Policy,Insured,Transaction,Premium,Commission\nP9,Z,New,100,10.00" }], opts: {} });
  assert.ok(kinds(r).includes("period-unknown"));
  assert.equal(r.summary.missing, 0);
});

test("a statement with a title block above the header is still read", () => {
  const s = readStatement("Acme - Agency Statement\nProduced 2026-09-16\n\n" + STMT_HEAD + "P1,A,Renewal,1000,100.00,2026-09-15", "Acme", "Acme");
  assert.equal(s.lines.length, 1);
  assert.equal(s.lines[0].commission, 10000);
});

test("a statement with premium and rate but no commission amount is priced from them", () => {
  const s = readStatement("Policy,Premium,Rate\nP1,1000,10%", "Acme", "Acme");
  assert.equal(s.lines[0].commission, 10000);
  assert.equal(s.lines[0].derived, true);
});

test("missing columns and unreadable cells are reported, not swallowed", () => {
  const b = readBook("Name,Amount\nx,1");
  assert.ok(b.findings.some((f) => /no "policy" column/.test(f.title)));
  const r = reconcile({ book: "Name,Amount\nx,1", statements: [], opts: OPTS });
  assert.ok(r.findings.some((f) => f.severity === "error"));
  const s = readStatement(STMT_HEAD + "P1,A,Renewal,1000,abc,2026-09-15", "Acme", "Acme");
  assert.equal(s.lines.length, 0);
  assert.ok(s.findings.some((f) => /not readable/.test(f.title)));
});

test("the sample reproduces every kind of finding and the figures printed on the page", () => {
  const r = reconcile({ book: sampleBook(), statements: sampleStatements(), opts: SAMPLE_OPTS });
  for (const k of ["missing", "underpaid", "chargeback-active", "duplicate", "unknown-policy", "total-mismatch", "not-due"]) assert.ok(kinds(r).includes(k), k);
  assert.equal(r.summary.recoverableCents, 181500);
  assert.equal(r.summary.missingCents, 117300);
  assert.equal(r.summary.underpaidCents, 37200);
  assert.equal(r.summary.chargebackCents, 27000);
  assert.deepEqual(r.carriers.map((c) => c.carrier), ["Northbridge Mutual", "Cedar Casualty"]);
});

test("the dispute letter names only that carrier's items, states the total and is worded as a question", () => {
  const r = reconcile({ book: sampleBook(), statements: sampleStatements(), opts: SAMPLE_OPTS });
  const cedar = disputeLetter(r, "Cedar Casualty");
  assert.match(cedar, /Hello Cedar Casualty/);
  assert.match(cedar, /HO-558120/);
  assert.doesNotMatch(cedar, /PA-100/);
  assert.match(cedar, /\$258\.00/);
  const nb = disputeLetter(r, "Northbridge Mutual");
  assert.match(nb, /Amount we are asking you to review: \$1,557\.00/);
  assert.match(nb, /please tell us which/);
  assert.match(nb, /producer code A12345/);
  assert.equal(disputeLetter(r, "Nobody Mutual"), "");
  assert.match(allDisputeLetters(r), /----/);
});

test("CSV output has a header, escapes commas, and cannot run a typed formula", () => {
  const r = rec(["P1,\"=cmd|' /c calc'!A0, Inc\",Acme Insurance,Auto,2026-08-10,10000,10%,New,Active,Agency"], ["P9,Z,New,100,10.00,2026-09-15"]);
  const csv = findingsCsv(r);
  assert.match(csv.split("\n")[0], /^severity,kind,carrier,policy,insured,effective,premium,expected,paid,money_to_chase/);
  assert.ok(csv.includes("\"'=cmd"));
  assert.match(carrierCsv(r), /^carrier,statement_lines/);
});

test("the module never touches the network", async () => {
  const { readFileSync } = await import("node:fs");
  assert.doesNotMatch(readFileSync(new URL("./calc.mjs", import.meta.url), "utf8"), /fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
});
