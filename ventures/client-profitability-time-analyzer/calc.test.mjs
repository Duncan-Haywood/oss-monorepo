import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDuration, parseBillable, parseFlat, normalizeRows, analyze, summaryText, sampleCsv, SAMPLE_FLAT } from "./calc.mjs";

const HEAD = "Client,Project,Date,Duration,Billable,Amount\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const by = (r, name) => r.clients.find((c) => c.label === name);

test("durations in every common shape become hours", () => {
  near(parseDuration("1:30:00"), 1.5);
  near(parseDuration("01:30"), 1.5);
  near(parseDuration("1h 30m"), 1.5);
  near(parseDuration("90m"), 1.5);
  near(parseDuration("1.5"), 1.5);
  near(parseDuration("45", { minutes: true }), 0.75);
  near(parseDuration("1,5", { decimalComma: true }), 1.5);
  assert.ok(Number.isNaN(parseDuration("soon")));
  assert.ok(Number.isNaN(parseDuration("")));
});

test("billable words are read, unknown words are not guessed", () => {
  assert.equal(parseBillable("Yes"), true);
  assert.equal(parseBillable("Non-billable"), false);
  assert.equal(parseBillable("maybe"), null);
  assert.equal(parseBillable(""), null);
});

test("flat-fee lines are parsed and bad ones reported", () => {
  const f = parseFlat("Acme, 1,000\nBeta Co: 250.50\nnonsense\n, 5");
  assert.deepEqual(f.items, [{ client: "Acme", amount: 1000 }, { client: "Beta Co", amount: 250.5 }]);
  assert.equal(f.bad.length, 2);
  const g = parseFlat("Acme; 1000\nBeta Co: 250.50");
  assert.deepEqual(g.items, [{ client: "Acme", amount: 1000 }, { client: "Beta Co", amount: 250.5 }]);
});

test("rows are normalized and unreadable ones skipped with a reason", () => {
  const n = load("A,x,2026-01-05,1:00:00,yes,100\n,x,2026-01-05,1,yes,5\nB,x,2026-01-06,abc,yes,5\nB,x,not a date,1,yes,5\nTotal,,,2,,105\n");
  assert.equal(n.items.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.reason), ["no client", "duration not readable", "date not readable", "total row"]);
});

test("a rate column is multiplied by hours and non-billable entries earn nothing", () => {
  const n = load("A,x,2026-01-05,2,yes,\nA,x,2026-01-06,3,no,\n", "Client,Project,Date,Hours,Billable,Hourly Rate\n".replace(",Hourly Rate", ",Hourly Rate"));
  assert.equal(n.items.length, 2);
  const m = normalizeRows(parseCsv("Client,Date,Hours,Billable,Rate\nA,2026-01-05,2,yes,80\nA,2026-01-06,3,no,80\n"));
  near(m.items[0].amount, 160);
  near(m.items[1].amount, 0);
});

test("a missing header is an error that names the columns", () => {
  assert.match(load("a,b", "foo,bar\n").error, /Client/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("effective rate divides all hours, billable or not, and reconciles", () => {
  const n = load("A,x,2026-01-05,4,yes,400\nA,x,2026-01-06,1,no,0\nB,x,2026-01-07,2,yes,300\n");
  const r = analyze(n.items, { targetRate: 100 });
  near(by(r, "A").effective, 80);
  near(by(r, "A").nonBillableHours, 1);
  near(by(r, "B").effective, 150);
  near(r.summary.hours, 7);
  near(r.summary.revenue, 700);
  near(r.clients.reduce((s, c) => s + c.hours, 0), r.summary.hours);
  near(r.clients.reduce((s, c) => s + c.revenue, 0), r.summary.revenue);
  near(r.summary.blended, 100);
  near(by(r, "A").shortfall, 100); // 100*5 - 400
  near(r.summary.upside, 100);
  assert.equal(r.summary.belowCount, 1);
});

test("flat fees join the client's revenue, case-insensitively, and unmatched ones are named", () => {
  const n = load("Acme,x,2026-01-05,10,yes,\n");
  const r = analyze(n.items, { flat: [{ client: "ACME", amount: 500 }, { client: "Ghost", amount: 900 }], targetRate: 100 });
  near(by(r, "Acme").effective, 50);
  assert.equal(by(r, "Ghost").effective, null);
  assert.ok(r.findings.some((f) => /no time entries/.test(f.title)));
  assert.equal(r.summary.clients, 1);
});

test("hours with no revenue anywhere are called out", () => {
  const r = analyze(load("A,x,2026-01-05,5,yes,0\nB,x,2026-01-05,1,yes,500\n").items, { targetRate: 100 });
  assert.ok(r.findings.some((f) => /no revenue/.test(f.title) && /A \(/.test(f.detail)));
});

test("scope creep needs a mostly flat-fee client whose hours grow", () => {
  const rows = [];
  for (let m = 0; m < 6; m++) for (let k = 0; k < 2; k++) rows.push(`Flat,x,2026-0${m + 1}-${10 + k * 10},${m < 3 ? 2 : 5},yes,`);
  const n = load(rows.join("\n") + "\n");
  const r = analyze(n.items, { flat: [{ client: "Flat", amount: 3000 }] });
  assert.ok(by(r, "Flat").creep.change > 1);
  assert.ok(r.findings.some((f) => /flat-fee work/.test(f.title)));
  // Same hours with no flat fee: hourly client, no creep verdict.
  assert.equal(by(analyze(n.items, {}), "Flat").creep, null);
});

test("non-billable share is only judged when the file has a billable column", () => {
  const withFlag = analyze(load("A,x,2026-01-05,6,yes,600\nA,x,2026-01-06,4,no,0\n").items, {});
  assert.ok(withFlag.findings.some((f) => /non-billable/.test(f.title)));
  const without = analyze(normalizeRows(parseCsv("Client,Date,Hours,Amount\nA,2026-01-05,10,600\n")).items, {});
  assert.equal(without.summary.hasBillableFlag, false);
  assert.ok(!without.findings.some((f) => /non-billable/.test(f.title)));
});

test("a client taking most hours is flagged as concentration", () => {
  const r = analyze(load("A,x,2026-01-05,9,yes,900\nB,x,2026-01-05,1,yes,100\n").items, {});
  assert.ok(r.findings.some((f) => /takes 90% of your hours/.test(f.title)));
});

test("an invalid target falls back to the default and an empty list is refused", () => {
  const n = load("A,x,2026-01-05,1,yes,100\n");
  assert.equal(analyze(n.items, { targetRate: -5 }).target, 100);
  assert.ok(analyze([], {}).invalid);
});

test("the built-in example runs end to end and its summary reads", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.skipped.length, 0);
  const r = analyze(n.items, { flat: parseFlat(SAMPLE_FLAT).items, targetRate: 100 });
  assert.ok(r.summary.belowCount >= 2);
  assert.ok(r.findings.length >= 3);
  assert.match(summaryText(r), /blended/);
});
