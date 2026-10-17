import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, sampleReport, sampleBrokenReport, buildReport, SAMPLE_ITEMS, SAMPLE_NET_SEPT15, parseMoney, parseMapping, defaultMapping, toXeroJournalCsv, toQboJournalCsv, toIif, journalsCsv, parseRegister } from "./calc.mjs";

const ok = () => validate(sampleReport());
const sept15 = () => buildReport(SAMPLE_ITEMS.filter((i) => i.date === "2026-09-15"));
const net15 = Math.round(SAMPLE_NET_SEPT15 * 100);
const bal = (j) => j.lines.reduce((a, l) => a + l.debit - l.credit, 0);
const by = (j, c) => j.lines.find((l) => l.category === c);

test("the sample splits into one balanced journal per pay date with no errors or warnings", () => {
  const r = ok();
  assert.equal(r.findings.filter((f) => f.severity !== "info").length, 0);
  assert.deepEqual(r.journals.map((j) => j.period), ["2026-09-15", "2026-09-30", "2026-10-15"]);
  for (const j of r.journals) assert.equal(bal(j), 0);
});

test("wages and employer costs are debits; every withholding is a credit to its own liability", () => {
  const j = ok().journals[0];
  assert.equal(by(j, "wages").debit, 420000);
  assert.equal(by(j, "ertax").debit, 32130 + 6720); // employer Social Security + Medicare, FUTA + SUTA
  assert.equal(by(j, "fit").credit, 41000);
  assert.equal(by(j, "state").credit, 15200);
  assert.equal(by(j, "erben").debit, 7200); // employer 401(k) match expense
  assert.equal(by(j, "retire").credit, 12000 + 7200); // deferrals plus match owed to the plan
  assert.equal(by(j, "health").credit, 17000);
  assert.equal(by(j, "otherded").credit, 5000);
  assert.equal(by(j, "clearing").credit, net15);
  assert.equal(by(j, "uncategorised"), undefined);
});

test("FICA payable carries both halves and the 941 deposit is income tax plus both halves", () => {
  const r = ok();
  const half = Math.round(240000 * 0.062) + Math.round(180000 * 0.062) + Math.round(240000 * 0.0145) + Math.round(180000 * 0.0145);
  assert.equal(by(r.journals[0], "fica").credit, 2 * half);
  assert.equal(r.remit[0].form941, 41000 + 2 * half);
});

test("a typed-in net pay total proves the run, and a wrong one is an error", () => {
  assert.equal(validate(sept15(), { expected: net15 }).reconciliation[0].agrees, true);
  const bad = validate(sept15(), { expected: net15 + 500 });
  assert.ok(bad.findings.some((f) => f.severity === "error" && /Do not post/.test(f.detail)));
});

test("grouping by month combines pay dates into one journal dated at month end", () => {
  const r = validate(sampleReport(), { group: "month" });
  assert.deepEqual(r.journals.map((j) => j.date), ["2026-09-30", "2026-10-31"]);
  for (const j of r.journals) assert.equal(bal(j), 0);
  assert.equal(by(r.journals[0], "wages").debit, 420000 + 435000);
});

test("net pay that does not match gross less withholdings is journalled to uncategorised and reported", () => {
  const r = validate(sampleBrokenReport());
  assert.ok(r.findings.some((f) => f.severity === "error" && /more than gross pay less withholdings/.test(f.title)));
  assert.ok(r.findings.some((f) => /not a number/.test(f.title)));
  assert.ok(r.findings.some((f) => /Totals row skipped/.test(f.title)));
  for (const j of r.journals) assert.equal(bal(j), 0);
});

test("money that withholdings do not explain is kept, not dropped", () => {
  const csv = "Pay Date,Employee,Gross Pay,Federal Income Tax,Net Pay\n2026-09-15,X,1000.00,100.00,800.00\n";
  const r = validate(csv);
  assert.equal(by(r.journals[0], "uncategorised").credit, 10000);
  assert.equal(bal(r.journals[0]), 0);
  assert.ok(r.findings.some((f) => f.severity === "warning"));
});

test("withholdings printed negative are read as money taken out", () => {
  const csv = "Pay Date,Employee,Gross Pay,Federal Income Tax,Net Pay\n2026-09-15,X,1000.00,-100.00,900.00\n";
  assert.equal(by(validate(csv).journals[0], "fit").credit, 10000);
});

test("unrecognised tax or deduction columns are reported", () => {
  const csv = "Pay Date,Employee,Gross Pay,Weird Local Tax,Net Pay\n2026-09-15,X,1000.00,50.00,950.00\n";
  assert.ok(validate(csv).findings.some((f) => /not recognised/.test(f.title)));
});

test("a file that is not a register is refused with the missing columns named", () => {
  const r = validate("Date,Memo\n2026-09-15,hello\n");
  assert.match(r.findings[0].detail, /Gross Pay/);
  assert.equal(r.journals.length, 0);
});

test("parseMoney reads symbols, parentheses and blanks", () => {
  assert.equal(parseMoney("$1,250.00"), 125000);
  assert.equal(parseMoney("($3.00)"), -300);
  assert.equal(parseMoney("--"), null);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("account mapping renames accounts and rejects unknown categories", () => {
  const { mapping, errors } = parseMapping("fit = 2300 Federal\nbogus = x\nnonsense");
  assert.equal(mapping.fit, "2300 Federal");
  assert.equal(errors.length, 2);
  assert.equal(defaultMapping().clearing, "Payroll Clearing");
  assert.equal(by(validate(sampleReport(), { mapping }).journals[0], "fit").account, "2300 Federal");
});

test("exports balance and never carry employee names", () => {
  const j = ok().journals;
  assert.match(toXeroJournalCsv(j), /^\*Narration,\*Date/);
  assert.match(toQboJournalCsv(j), /PR-2026-09-15/);
  const iif = toIif(j);
  assert.equal((iif.match(/^ENDTRNS/gm) || []).length, 3);
  const sums = [...iif.split("ENDTRNS")].map((t) => [...t.matchAll(/GENERAL JOURNAL\t[^\t]+\t[^\t]+\t(-?\d+\.\d+)/g)].reduce((a, m) => a + parseFloat(m[1]), 0));
  for (const s of sums) assert.ok(Math.abs(s) < 0.005);
  for (const out of [toXeroJournalCsv(j), toQboJournalCsv(j), iif, journalsCsv(j)]) assert.doesNotMatch(out, /Example|Sample/);
});

test("tab-separated registers and DD/MM dates are read", () => {
  const tsv = "Pay Date\tEmployee\tGross Pay\tNet Pay\n15/09/2026\tX\t100.00\t100.00\n";
  const p = parseRegister(tsv, { dateOrder: "dmy" });
  assert.equal(p.payouts[0].id, "2026-09-15");
});
