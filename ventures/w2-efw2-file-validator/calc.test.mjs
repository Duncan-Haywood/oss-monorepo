import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, sampleFile, sampleBrokenFile, buildFile, splitRecords, ssnProblem, maskedFindingsCsv, cents, RECORD_LENGTH } from "./calc.mjs";

const codes = (r) => r.findings.map((f) => f.code);
const put = (rec, from, t) => rec.slice(0, from - 1) + t + rec.slice(from - 1 + t.length);
const lines = (t) => t.split("\r\n").filter(Boolean);
const join = (a) => a.join("\r\n") + "\r\n";

test("the clean sample has no findings and sensible totals", () => {
  const r = validate(sampleFile());
  assert.deepEqual(r.findings, []);
  assert.equal(r.summary.employees, 3);
  assert.equal(r.summary.employers, 1);
  assert.equal(r.summary.totals.wages, 16150000);
  assert.equal(r.summary.rfCount, 3);
});

test("every sample record is exactly 512 characters", () => {
  for (const l of lines(sampleFile())) assert.equal(l.length, RECORD_LENGTH);
});

test("the broken sample reports a bad SSN and a stale RT total, and repair fixes only the RT", () => {
  const t = sampleBrokenFile();
  const r = validate(t);
  assert.ok(codes(r).includes("ssn"));
  assert.ok(codes(r).includes("rt-total"));
  const fixed = repair(t);
  assert.equal(fixed.error, null);
  assert.equal(fixed.changes.length, 1);
  const before = lines(t), after = lines(fixed.text);
  assert.deepEqual(after.filter((_, i) => i !== 5), before.filter((_, i) => i !== 5));
  assert.ok(!codes(validate(fixed.text)).includes("rt-total"));
});

test("a trimmed record is reported and blocks repair", () => {
  const a = lines(sampleFile());
  a[2] = a[2].trimEnd();
  const t = join(a);
  assert.ok(codes(validate(t)).includes("length"));
  assert.match(repair(t).error, /record lengths/);
});

test("repair rebuilds the RF count after an RW is deleted", () => {
  const a = lines(sampleFile());
  a.splice(3, 1);
  const f = repair(join(a));
  assert.equal(f.changes.length, 2);
  assert.deepEqual(validate(f.text).findings, []);
});

test("repair never changes an employee wage or SSN", () => {
  const a = lines(sampleFile());
  a[2] = put(a[2], 188, "00099999999");
  const f = repair(join(a));
  assert.equal(lines(f.text)[2], a[2]);
});

test("file without line breaks is split every 512 characters", () => {
  const one = lines(sampleFile()).join("");
  const s = splitRecords(one);
  assert.equal(s.unbroken, true);
  assert.equal(s.records.length, 7);
  assert.ok(codes(validate(one)).includes("no-line-ends"));
  assert.equal(validate(one).findings.filter((f) => f.severity === "error").length, 0);
});

test("SSN rules", () => {
  assert.match(ssnProblem("000123456"), /000/);
  assert.match(ssnProblem("666123456"), /666/);
  assert.match(ssnProblem("912345678"), /912/);
  assert.match(ssnProblem("123005678"), /group/);
  assert.match(ssnProblem("123450000"), /serial/);
  assert.match(ssnProblem("111111111"), /repeated/);
  assert.match(ssnProblem("12345678"), /nine/);
  assert.equal(ssnProblem("512340001"), null);
});

test("SSNs are masked in findings", () => {
  const t = sampleBrokenFile();
  const csv = maskedFindingsCsv(validate(t));
  assert.doesNotMatch(csv, /000340003/);
  assert.match(csv, /\*\*\*-\*\*-0003/);
});

test("record order: missing RA, missing RF, RW outside an employer", () => {
  const a = lines(sampleFile());
  assert.ok(codes(validate(join(a.slice(1)))).includes("order"));
  assert.ok(codes(validate(join(a.slice(0, -1)))).includes("no-rf"));
  const b = a.slice(); b.splice(1, 1);
  assert.ok(codes(validate(join(b))).includes("order"));
});

test("social security wage base is enforced per tax year", () => {
  const over = buildFile({ year: 2025, employees: [{ ssn: "512340001", first: "A", last: "B", wages: 20000000, fed: 100 }] });
  assert.deepEqual(validate(over).findings, []);
  const a = lines(over);
  a[2] = put(a[2], 210, String(20000000).padStart(11, "0"));
  const r = validate(join(a));
  assert.ok(codes(r).includes("ss-base"));
});

test("the wage base differs between years", () => {
  const y24 = buildFile({ year: 2024, employees: [{ ssn: "512340001", first: "A", last: "B", wages: 17000000, fed: 100 }] });
  const y25 = buildFile({ year: 2025, employees: [{ ssn: "512340001", first: "A", last: "B", wages: 17000000, fed: 100 }] });
  assert.equal(validate(y24).summary.totals.ssWages, 16860000);
  assert.equal(validate(y25).summary.totals.ssWages, 17000000);
});

test("Medicare additional tax above $200,000 is allowed for", () => {
  const t = buildFile({ year: 2025, employees: [{ ssn: "512340001", first: "A", last: "B", wages: 25000000, fed: 100 }] });
  assert.ok(!codes(validate(t)).includes("med-rate"));
  const a = lines(t);
  a[2] = put(a[2], 243, "00000100000");
  assert.ok(codes(validate(join(a))).includes("med-rate"));
});

test("non-numeric money field and wrong employee count are named", () => {
  const a = lines(sampleFile());
  a[2] = put(a[2], 188, "0005200.00 ");
  const r = validate(join(a));
  assert.ok(codes(r).includes("money"));
  const b = lines(sampleFile());
  b[6] = put(b[6], 8, "000000009");
  assert.ok(codes(validate(join(b))).includes("rf-count"));
});

test("EIN checks: zeros, unassigned prefix, non-digits", () => {
  const mkYear = (ein) => lines(buildFile({ ein, employees: [{ ssn: "512340001", first: "A", last: "B", wages: 100000, fed: 100 }] }));
  assert.ok(codes(validate(join(mkYear("000000000")))).includes("re-ein"));
  assert.ok(codes(validate(join(mkYear("070000000")))).includes("re-ein-prefix"));
  assert.ok(codes(validate(join(mkYear("12AB56000")))).includes("re-ein"));
});

test("resubmission needs a WFID", () => {
  const a = lines(sampleFile());
  a[0] = put(a[0], 29, "1");
  assert.ok(codes(validate(join(a))).includes("ra-wfid"));
  a[0] = put(a[0], 30, "ABC123");
  assert.ok(!codes(validate(join(a))).includes("ra-wfid"));
});

test("lowercase and non-ASCII characters are flagged", () => {
  const a = lines(sampleFile());
  a[2] = put(a[2], 12, "Ava");
  assert.ok(codes(validate(join(a))).includes("lowercase"));
  a[3] = put(a[3], 12, "ÉLENA");
  assert.ok(codes(validate(join(a))).includes("chars"));
});

test("duplicate SSN in one employer group is a warning", () => {
  const a = lines(sampleFile());
  a[3] = put(a[3], 3, "512340001");
  assert.ok(codes(validate(join(a))).includes("ssn-dup"));
});

test("two tax years in one file are an error", () => {
  const a = lines(sampleFile());
  const re2 = put(a[1], 3, "2024");
  const second = [re2, a[2], a[5]];
  const b = [a[0], a[1], a[2], a[3], a[4], a[5], ...second.slice(0, 3), a[a.length - 1]];
  assert.ok(codes(validate(join(b))).includes("year-mix"));
});

test("empty input and cents formatting", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.equal(cents(16150000), "$161,500.00");
  assert.equal(cents(5), "$0.05");
});
