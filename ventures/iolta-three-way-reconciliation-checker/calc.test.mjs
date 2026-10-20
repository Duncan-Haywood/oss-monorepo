import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents, money, toDay, parseTable, parseTransactions, reconcile, summaryText, SAMPLE } from "./calc.mjs";

const base = (tx, extra = {}) => ({ transactions: tx, bankBalance: "0", statementDate: "2026-08-31", clientBalances: "", ...extra });

test("parseCents handles currency formats and rejects junk", () => {
  assert.equal(parseCents("$1,234.50"), 123450);
  assert.equal(parseCents("(200.00)"), -20000);
  assert.equal(parseCents("-0.05"), -5);
  assert.equal(parseCents("7"), 700);
  assert.equal(parseCents("1.234"), null);
  assert.equal(parseCents("abc"), null);
  assert.equal(parseCents(""), null);
  assert.equal(money(-123456), "-$1,234.56");
});

test("toDay accepts ISO and US dates and rejects impossible ones", () => {
  assert.equal(toDay("2026-02-30"), null);
  assert.equal(toDay("8/3/2026"), toDay("2026-08-03"));
  assert.equal(toDay("03.08.2026"), null);
});

test("parseTable handles quotes, tabs and blank lines", () => {
  assert.deepEqual(parseTable('a,"b,c",d\n\n1,2,3'), [["a", "b,c", "d"], ["1", "2", "3"]]);
  assert.deepEqual(parseTable("a\tb\n1\t2"), [["a", "b"], ["1", "2"]]);
});

test("header columns can come in any order", () => {
  const { txns, errors } = parseTransactions("Amount,Matter,Posted,Memo,Cleared\n100.00,Smith,2026-01-02,retainer,Y");
  assert.deepEqual(errors, []);
  assert.equal(txns[0].cents, 10000);
  assert.equal(txns[0].client, "Smith");
  assert.equal(txns[0].cleared, true);
});

test("bad rows are reported with their row number", () => {
  const r = reconcile(base("date,client,description,amount,cleared\n2026-01-01,A,x,100,yes\nnot-a-date,A,x,5,yes\n2026-01-02,A,x,xx,yes"));
  assert.equal(r.errors.length, 2);
  assert.match(r.errors[0], /Row 3/);
});

test("a balanced account reports three agreeing balances and no high findings", () => {
  const tx = `date,client,description,amount,cleared
2026-08-01,A,dep,1000,yes
2026-08-02,B,dep,500,yes
2026-08-10,A,chk,-200,yes
2026-08-28,B,dep,300,no
2026-08-29,A,chk,-100,no`;
  const r = reconcile(base(tx, { bankBalance: "1300.00" }));
  assert.equal(r.book, 150000);
  assert.equal(r.bankAdjusted, 150000);
  assert.equal(r.balanced, true);
  assert.equal(r.counts.high, 0);
});

test("a difference equal to one entry points at that entry", () => {
  const tx = "date,client,description,amount,cleared\n2026-08-01,A,dep,1000,yes\n2026-08-02,A,chk,-250,yes";
  const r = reconcile(base(tx, { bankBalance: "1000.00" }));
  assert.equal(r.diffBank, 25000);
  assert.match(r.findings[0].detail, /row 3/);
});

test("transposed digits hint fires when the difference is divisible by 9", () => {
  const tx = "date,client,description,amount,cleared\n2026-08-01,A,dep,1000,yes";
  const r = reconcile(base(tx, { bankBalance: "1009.00" }));
  assert.match(r.findings[0].detail, /transposed/);
});

test("a client who goes negative mid-period is flagged even if repaid later", () => {
  const tx = `date,client,description,amount,cleared
2026-08-01,A,dep,100,yes
2026-08-05,A,chk,-300,yes
2026-08-20,A,dep,400,yes`;
  const r = reconcile(base(tx, { bankBalance: "200" }));
  const f = r.findings.find((x) => /went negative/.test(x.title));
  assert.ok(f);
  assert.match(f.title, /2026-08-05/);
  assert.doesNotMatch(f.title, /still negative/);
});

test("same-day deposit then disbursement is not a false negative", () => {
  const tx = `date,client,description,amount,cleared
2026-08-05,A,chk,-300,yes
2026-08-05,A,dep,300,yes`;
  const r = reconcile(base(tx, { bankBalance: "0" }));
  assert.equal(r.findings.filter((f) => /went negative on/.test(f.title)).length, 0);
});

test("paying out before the deposit clears is caught on the cleared basis", () => {
  const tx = `date,client,description,amount,cleared
2026-08-01,B,other client funds,5000,yes
2026-08-02,A,deposit,1000,no
2026-08-03,A,chk,-800,yes`;
  const r = reconcile(base(tx, { bankBalance: "4200" }));
  assert.ok(r.findings.some((f) => /cleared disbursements exceed cleared deposits by \$800\.00/.test(f.title)));
});

test("firm money, missing client, dormant balance, stale check, stale deposit, future cleared row, duplicate", () => {
  const tx = `date,client,description,amount,cleared
2026-08-01,Firm,fee,50,yes
2026-08-01,,mystery,10,yes
2025-01-01,Old,dep,70,yes
2026-03-01,B,dep,500,yes
2026-03-02,B,chk 77,-100,no
2026-08-01,B,dep,40,no
2026-09-15,B,dep,5,yes
2026-08-02,B,dup,5,yes
2026-08-02,B,dup,5,yes`;
  const r = reconcile(base(tx, { bankBalance: "100" }));
  const titles = r.findings.map((f) => f.title).join("\n");
  assert.match(titles, /firm money/);
  assert.match(titles, /no client or matter/);
  assert.match(titles, /no activity since 2025-01-01/);
  assert.match(titles, /Outstanding disbursement of \$100\.00/);
  assert.match(titles, /Deposit in transit of \$40\.00/);
  assert.match(titles, /marked cleared but dated 2026-09-15/);
  assert.match(titles, /look identical/);
});

test("a supplied client ledger list is compared client by client", () => {
  const tx = "date,client,description,amount,cleared\n2026-08-01,A,dep,100,yes\n2026-08-01,B,dep,50,yes";
  const r = reconcile(base(tx, { bankBalance: "150", clientBalances: "client,balance\nA,100\nB,40\nZ,12" }));
  const titles = r.findings.map((f) => f.title).join("\n");
  assert.match(titles, /Client "B": ledger \$40\.00 but journal transactions give \$50\.00/);
  assert.match(titles, /Client "Z" is on your ledger list/);
  assert.equal(r.balanced, false);
});

test("missing cleared column is stated, not silently assumed", () => {
  const r = reconcile(base("date,client,description,amount\n2026-08-01,A,dep,100", { bankBalance: "100" }));
  assert.ok(r.findings.some((f) => /No cleared column/.test(f.title)));
  assert.equal(r.balanced, true);
});

test("money stays in integer cents: 0.1 + 0.2 style sums are exact", () => {
  const r = reconcile(base("date,client,description,amount,cleared\n2026-08-01,A,d,0.10,yes\n2026-08-01,A,d,0.20,yes", { bankBalance: "0.30" }));
  assert.equal(r.book, 30);
  assert.equal(r.balanced, true);
});

test("the shipped sample reconciles with exactly the planted problems", () => {
  const r = reconcile(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.diffBank, 65000);
  const titles = r.findings.map((f) => f.title).join("\n");
  assert.match(titles, /Chen v\. Dole.*negative/);
  assert.match(titles, /firm money/);
  assert.match(titles, /Nguyen/);
  assert.match(titles, /Outstanding disbursement of \$480\.00/);
  assert.match(summaryText(r), /DOES NOT BALANCE/);
  assert.match(summaryText(r), /Not legal or accounting advice/);
});
