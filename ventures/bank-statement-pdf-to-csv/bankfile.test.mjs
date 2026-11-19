import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStatementText, sampleStatement, sampleCard, sampleBroken, toCsv } from "./calc.mjs";
import { toOfx, toQif, stitch, fitids, accountsOf, trnType } from "./bankfile.mjs";

const NOW = "2026-11-18T00:00:00";
const fmt = (c) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });

// A made-up month of a business checking account, opening where it is told to.
function month(m, opening, rows, year = 2026) {
  let bal = opening;
  const lines = [`EXAMPLE BANK   Statement period: ${m}/01/${year} - ${m}/28/${year}`, `Beginning balance   ${fmt(opening)}`];
  const body = rows.map(([d, desc, amt]) => { bal += amt; return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}   ${desc.padEnd(40)} ${amt < 0 ? fmt(-amt).padStart(12) : "".padStart(12)} ${amt > 0 ? fmt(amt).padStart(12) : "".padStart(12)} ${fmt(bal).padStart(12)}`; });
  lines.push(`Ending balance   ${fmt(bal)}`, "", `Date   Description${" ".repeat(32)}Withdrawals   Deposits   Balance`, ...body);
  return { text: lines.join("\n"), closing: bal };
}
const ROWS = [
  [[3, "ACH CREDIT STRIPE PAYOUT", 120000], [9, "CARD PURCHASE OFFICE SUPPLY", -4520], [20, "CHECK 1043", -30000]],
  [[2, "ACH CREDIT STRIPE PAYOUT", 98000], [14, "ACH DEBIT ADOBE SYSTEMS", -5499], [27, "MONTHLY SERVICE FEE", -1500]],
  [[5, "DEPOSIT MOBILE", 45000], [11, "ONLINE TRANSFER TO SAVINGS", -50000], [12, "ONLINE TRANSFER TO SAVINGS", -50000]],
];
function quarter(start = 500000) {
  const out = [];
  let open = start;
  ROWS.forEach((rows, i) => { const s = month(i + 1, open, rows); out.push({ name: `2026-0${i + 1}.pdf`, result: parseStatementText(s.text) }); open = s.closing; });
  return out;
}

test("each made-up month proves on its own", () => {
  for (const q of quarter()) assert.equal(q.result.reconcile.ok, true, q.name);
});

test("OFX: one STMTTRN per row, signed amounts, the statement's ledger balance", () => {
  const r = parseStatementText(sampleStatement());
  const ofx = toOfx(r, { now: NOW, accountId: "123456789", routing: "011000015" });
  assert.match(ofx, /^OFXHEADER:100\r\n/);
  assert.equal((ofx.match(/<STMTTRN>/g) || []).length, 9);
  assert.match(ofx, /<TRNAMT>1420\.00\r\n/);
  assert.match(ofx, /<TRNAMT>-86\.19\r\n/);
  assert.match(ofx, /<TRNTYPE>CHECK\r\n<DTPOSTED>20260106120000\r\n<TRNAMT>-600\.00\r\n<FITID>\w+\r\n<CHECKNUM>1042/);
  assert.match(ofx, /<LEDGERBAL>\r\n<BALAMT>5673\.12\r\n<DTASOF>20260128120000/);
  assert.match(ofx, /<BANKID>011000015\r\n<ACCTID>123456789\r\n<ACCTTYPE>CHECKING/);
  assert.match(ofx, /<DTSTART>20260102120000\r\n<DTEND>20260128120000/);
  const broken = toOfx(parseStatementText(sampleBroken()), { now: NOW });
  assert.match(broken, /<BALAMT>5673\.12/, "OFX requires a balance: the printed closing, even when the rows do not reach it");
});

test("OFX for a card: credit card aggregate, posting dates, balance owed is negative", () => {
  const r = parseStatementText(sampleCard(), { kind: "card" });
  assert.equal(r.reconcile.ok, true);
  const ofx = toOfx(r, { now: NOW });
  assert.match(ofx, /<CREDITCARDMSGSRSV1>/);
  assert.match(ofx, /<DTPOSTED>20251206120000\r\n<DTUSER>20251205120000\r\n<TRNAMT>-129\.99/);
  assert.match(ofx, /<BALAMT>-1013\.77/);
  assert.match(ofx, /<DTEND>20260102120000/, "the range covers the last posting date");
  // DTPOSTED values sit inside DTSTART..DTEND
  const start = ofx.match(/<DTSTART>(\d{8})/)[1], end = ofx.match(/<DTEND>(\d{8})/)[1];
  for (const [, d] of ofx.matchAll(/<DTPOSTED>(\d{8})/g)) assert.ok(d >= start && d <= end, d);
});

test("QFX/QBO carry INTU.BID only when given a numeric one", () => {
  const r = parseStatementText(sampleStatement());
  assert.match(toOfx(r, { format: "qbo", intuBid: "3000", now: NOW }), /<INTU\.BID>3000\r\n/);
  assert.doesNotMatch(toOfx(r, { format: "qbo", intuBid: "<x>", now: NOW }), /INTU\.BID/);
  assert.doesNotMatch(toOfx(r, { format: "ofx", intuBid: "3000", now: NOW }), /INTU\.BID/);
});

test("FITIDs are stable across files and split identical rows on one day", () => {
  const a = parseStatementText(sampleStatement()).transactions;
  assert.deepEqual(fitids(a), fitids(a.map((t) => ({ ...t, description: `  ${t.description.toLowerCase()} ` }))));
  const twin = [a[0], { ...a[0] }];
  const ids = fitids(twin);
  assert.notEqual(ids[0], ids[1]);
  assert.equal(ids[1], `${ids[0]}-2`);
  assert.equal(new Set(fitids(a)).size, a.length);
});

test("markup and accents are made safe for SGML", () => {
  const r = parseStatementText(sampleStatement());
  r.transactions[0] = { ...r.transactions[0], description: "CAFÉ <B&B> ÜBER" };
  const ofx = toOfx(r, { now: NOW });
  assert.match(ofx, /<NAME>CAFE &lt;B&amp;B&gt; UBER\r\n/);
  assert.doesNotMatch(ofx, /[^\x00-\x7f]/);
});

test("a year-less date is refused, not guessed into the file", () => {
  const r = parseStatementText(sampleStatement());
  r.transactions[2] = { ...r.transactions[2], date: { ok: false } };
  assert.throws(() => toOfx(r), /no full date/);
  assert.throws(() => toQif(r), /no full date/);
});

test("QIF: bank and card headers, US and day-first dates, check numbers", () => {
  const q = toQif(parseStatementText(sampleStatement()));
  assert.match(q, /^!Type:Bank\r\nD01\/02\/2026\r\nT1420\.00\r\nPACH CREDIT STRIPE PAYOUT\r\n\^/);
  assert.match(q, /T-600\.00\r\nN1042\r\n/);
  assert.match(toQif(parseStatementText(sampleStatement()), { dateStyle: "dmy" }), /D02\/01\/2026/);
  assert.match(toQif(parseStatementText(sampleCard(), { kind: "card" })), /^!Type:CCard/);
});

test("transaction types read from the description", () => {
  assert.equal(trnType(-6000, "ATM WITHDRAWAL 0042"), "ATM");
  assert.equal(trnType(250000, "DIRECT DEPOSIT ACME PAYROLL"), "DIRECTDEP");
  assert.equal(trnType(-5499, "ACH DEBIT ADOBE"), "DIRECTDEBIT");
  assert.equal(trnType(12, "INTEREST PAID"), "INT");
  assert.equal(trnType(-1500, "MONTHLY SERVICE FEE"), "SRVCHG");
  assert.equal(trnType(-100, "SOMETHING"), "DEBIT");
});

test("stitch: three months in any order join into one proved run", () => {
  const q = quarter();
  const s = stitch([q[2], q[0], q[1]]);
  assert.equal(s.reconcile.ok, true);
  assert.deepEqual(s.statements.map((x) => x.name), ["2026-01.pdf", "2026-02.pdf", "2026-03.pdf"]);
  assert.equal(s.transactions.length, 9);
  assert.equal(s.reconcile.opening, 500000);
  assert.equal(s.breaks.length, 0);
  const ofx = toOfx(s, { now: NOW });
  assert.equal((ofx.match(/<STMTTRN>/g) || []).length, 9);
  assert.match(ofx, /<DTSTART>20260103120000/);
  assert.match(ofx, new RegExp(`<BALAMT>${(s.reconcile.closing / 100).toFixed(2)}`));
  const csv = toCsv(s).trim().split("\r\n");
  assert.equal(csv.length, 10);
  // identical transfers on one day both survive, with distinct ids
  assert.equal(new Set(fitids(s.transactions)).size, 9);
});

test("stitch: a missing month is a gap of exactly that month's movement", () => {
  const q = quarter();
  const s = stitch([q[0], q[2]]);
  assert.equal(s.reconcile.ok, false);
  assert.equal(s.breaks.length, 1);
  const febNet = ROWS[1].reduce((a, r) => a + r[2], 0);
  assert.equal(s.breaks[0].gap, febNet);
  assert.ok(s.findings[0].title.startsWith("Gap between 2026-01.pdf and 2026-03.pdf"));
  assert.match(toOfx(s, { now: NOW }), new RegExp(`<BALAMT>${(s.reconcile.closing / 100).toFixed(2)}`), "the last statement's printed closing");
});

test("stitch: the same statement chosen twice is counted once", () => {
  const q = quarter();
  const s = stitch([q[0], q[1], { name: "copy of feb.pdf", result: q[1].result }]);
  assert.equal(s.reconcile.ok, true);
  assert.equal(s.transactions.length, 6);
  assert.ok(s.findings.some((f) => /same statement/.test(f.title)));
});

test("stitch: overlapping downloads keep each shared row once", () => {
  // Jan 1-28, then a download covering Jan 20 to Feb 28 that repeats the 20 Jan check.
  const jan = month(1, 500000, ROWS[0]);
  const overlapRows = [[20, "CHECK 1043", -30000], ...ROWS[1].map(([d, x, a]) => [d + 28, x, a])];
  // Written as one statement whose dates run past the 28th of January.
  let bal = jan.closing + 30000;
  const lines = ["EXAMPLE BANK   Statement period: 01/20/2026 - 02/28/2026", `Beginning balance   ${fmt(bal)}`];
  const body = overlapRows.map(([d, desc, amt]) => { bal += amt; const dt = d > 31 ? `02/${String(d - 31).padStart(2, "0")}` : `01/${String(d).padStart(2, "0")}`; return `${dt}   ${desc.padEnd(40)} ${amt < 0 ? fmt(-amt).padStart(12) : "".padStart(12)} ${amt > 0 ? fmt(amt).padStart(12) : "".padStart(12)} ${fmt(bal).padStart(12)}`; });
  lines.push(`Ending balance   ${fmt(bal)}`, "", "Date   Description   Withdrawals   Deposits   Balance", ...body);
  const second = parseStatementText(lines.join("\n"));
  assert.equal(second.reconcile.ok, true);
  const s = stitch([{ name: "jan.pdf", result: parseStatementText(jan.text) }, { name: "jan-feb.pdf", result: second }]);
  assert.equal(s.transactions.length, 6, "3 + 4 rows, one shared");
  assert.equal(s.reconcile.ok, true);
  assert.ok(s.findings.some((f) => /overlaps/.test(f.title)));
});

test("stitch refuses a statement holding several accounts", () => {
  const multi = { kind: "bank", transactions: [], reconcile: { method: "sections", sections: [{ account: 0, chained: true, totalsAgree: true }, { account: 1, chained: true, totalsAgree: true }] } };
  assert.equal(accountsOf(multi).length, 2);
  const s = stitch([{ name: "two.pdf", result: multi }]);
  assert.match(s.findings[0].title, /several accounts/);
  assert.throws(() => toOfx(multi), /Pick the account/);
});

test("a statement with two accounts writes one bank file per account, each with its own balance", async () => {
  const { parseStatement } = await import("./calc.mjs");
  const L = (page, key, ...items) => ({ page, key, items: items.map(([text, x]) => ({ text, x, xEnd: x + text.length * 4.5 })) });
  const lines = [
    L(1, -10, ["HKD Current Account — 817-890692-838", 40]),
    L(1, -20, ["Date", 40], ["Transaction Details", 81], ["Deposit", 303], ["Withdrawal", 360], ["Balance", 520]),
    L(1, -30, ["1 Sep", 40], ["Fps payment", 81], ["100.00", 384], ["900.00", 514]),
    L(1, -40, ["2 Sep", 40], ["Fps received", 81], ["50.00", 309], ["950.00", 514]),
    L(1, -50, ["Total Deposit Amount:", 40], ["HKD 50.00", 169], ["Total Withdrawal Amount:", 298], ["HKD 100.00", 426]),
    L(2, -10, ["USD Savings Account — 817-890692-002", 40]),
    L(2, -20, ["Date", 40], ["Transaction Details", 81], ["Deposit", 303], ["Withdrawal", 360], ["Balance", 520]),
    L(2, -30, ["3 Sep", 40], ["Fps transfer", 81], ["20.00", 384], ["5,000.00", 512]),
    L(2, -40, ["Total Deposit Amount:", 40], ["USD 0.00", 169], ["Total Withdrawal Amount:", 298], ["USD 20.00", 426]),
  ];
  const r = parseStatement(lines, { year: 2024 });
  assert.throws(() => toOfx(r, { now: NOW }), /2 accounts/);
  const a = toOfx(r, { account: 0, now: NOW, currency: "HKD" });
  const b = toOfx(r, { account: 1, now: NOW, currency: "USD", accountType: "savings" });
  assert.equal((a.match(/<STMTTRN>/g) || []).length, 2);
  assert.match(a, /<CURDEF>HKD/);
  assert.match(a, /<BALAMT>950\.00/);
  assert.equal((b.match(/<STMTTRN>/g) || []).length, 1);
  assert.match(b, /<ACCTTYPE>SAVINGS/);
  assert.match(b, /<BALAMT>5000\.00/);
});

test("ledger balance: printed, else opening plus rows, else the rows' net", async () => {
  const { ledgerBalance } = await import("./bankfile.mjs");
  const tx = [{ amount: 500 }, { amount: -200 }];
  assert.deepEqual(ledgerBalance({ closing: 9000, opening: 1, transactions: tx }), { cents: 9000, from: "printed" });
  assert.deepEqual(ledgerBalance({ closing: null, opening: 1000, transactions: tx }), { cents: 1300, from: "computed" });
  assert.deepEqual(ledgerBalance({ closing: null, opening: null, transactions: tx }), { cents: 300, from: "rows" });
});
