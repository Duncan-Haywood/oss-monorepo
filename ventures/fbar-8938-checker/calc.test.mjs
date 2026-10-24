import { test } from "node:test";
import assert from "node:assert/strict";
import { FBAR_THRESHOLD, FORM_8938_THRESHOLDS, KINDS, EXAMPLE_ASSETS, analyze, num, money, toCsv } from "./calc.mjs";

const acct = (maxLocal, endLocal = maxLocal, kind = "bank", rate = 1) => ({ name: "x", kind, maxLocal, endLocal, rate });

test("statutory thresholds", () => {
  assert.equal(FBAR_THRESHOLD, 10000);
  assert.deepEqual(FORM_8938_THRESHOLDS.us.single, [50000, 75000]);
  assert.deepEqual(FORM_8938_THRESHOLDS.us.mfj, [100000, 150000]);
  assert.deepEqual(FORM_8938_THRESHOLDS.abroad.single, [200000, 300000]);
  assert.deepEqual(FORM_8938_THRESHOLDS.abroad.mfj, [400000, 600000]);
});

test("FBAR: exactly $10,000 does not trigger, a dollar more does", () => {
  assert.equal(analyze([acct(10000)]).result.fbar.required, false);
  assert.equal(analyze([acct(10001)]).result.fbar.required, true);
});

test("FBAR aggregates accounts that are each under $10,000", () => {
  const a = analyze([acct(6000), acct(5000)]);
  assert.equal(a.result.fbar.total, 11000);
  assert.equal(a.result.fbar.required, true);
});

test("FBAR uses each account's highest value, not its year-end value", () => {
  const a = analyze([acct(50000, 100)]);
  assert.equal(a.result.fbar.total, 50000);
  assert.equal(a.result.f8938.endTotal, 100);
});

test("a peak typed below the year-end value is lifted to the year-end value", () => {
  assert.equal(analyze([acct(100, 9000)]).result.fbar.total, 9000);
});

test("currency conversion applies the typed rate", () => {
  const a = analyze([acct(900000, 850000, "fund", 0.012)]);
  assert.ok(Math.abs(a.result.fbar.total - 10800) < 1e-6);
  assert.equal(a.result.fbar.required, true);
});

test("directly held foreign stock counts for Form 8938 only", () => {
  const a = analyze([acct(80000, 80000, "stock")]);
  assert.equal(a.result.fbar.required, false);
  assert.equal(a.result.f8938.required, true);
  assert.equal(a.result.f8938OnlyCount, 1);
});

test("signature authority adds to the FBAR but not to Form 8938", () => {
  const a = analyze([acct(2000)], { signatureOnly: 9000 });
  assert.equal(a.result.fbar.total, 11000);
  assert.equal(a.result.fbar.required, true);
  assert.equal(a.result.f8938.endTotal, 2000);
});

test("Form 8938 thresholds depend on residence and filing status", () => {
  const assets = [acct(120000)];
  assert.equal(analyze(assets, { filingStatus: "single" }).result.f8938.required, true);
  assert.equal(analyze(assets, { filingStatus: "mfj" }).result.f8938.required, true); // any-time ceiling 120k <= 150k, year-end 120k > 100k
  assert.equal(analyze(assets, { filingStatus: "single", livesAbroad: "yes" }).result.f8938.required, false);
  assert.equal(analyze(assets, { filingStatus: "mfj", livesAbroad: "yes" }).result.f8938.required, false);
});

test("Form 8938 can be triggered by the any-time test alone, and says so", () => {
  const a = analyze([acct(80000, 20000)]);
  assert.equal(a.result.f8938.required, true);
  assert.equal(a.result.f8938.onlyByAnyTime, true);
});

test("both tests are strictly 'more than'", () => {
  assert.equal(analyze([acct(50000, 50000)], {}).result.f8938.required, false);
  assert.equal(analyze([acct(50001, 50001)], {}).result.f8938.required, true);
});

test("the example assets file an FBAR and need no Form 8938", () => {
  const a = analyze(EXAMPLE_ASSETS);
  assert.equal(a.result.fbar.required, true);
  assert.equal(a.result.f8938.required, false);
});

test("bad inputs produce warnings, not numbers", () => {
  assert.ok(analyze([{ name: "bad", kind: "nope", maxLocal: 1, endLocal: 1 }]).warnings.length);
  assert.ok(analyze([{ name: "bad", kind: "bank", maxLocal: -5, endLocal: 1 }]).warnings.length);
  assert.ok(analyze([{ name: "bad", kind: "bank", maxLocal: 5, endLocal: 1, rate: 0 }]).warnings.length);
  assert.equal(analyze([acct(5)], { filingStatus: "zzz" }).result, null);
});

test("no assets is a valid, empty answer", () => {
  const a = analyze([]);
  assert.equal(a.result.fbar.required, false);
  assert.equal(a.result.f8938.required, false);
});

test("every kind says where it counts", () => {
  for (const k of Object.values(KINDS)) assert.ok(typeof k.fbar === "boolean" && typeof k.f8938 === "boolean" && k.label);
});

test("helpers and csv", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  const csv = toCsv(analyze(EXAMPLE_ASSETS));
  assert.match(csv, /^asset,kind,/);
  assert.match(csv, /FBAR aggregate/);
});

test("life insurance with cash value counts for both forms", () => {
  assert.equal(analyze([acct(60000, 60000, "insurance")]).result.fbar.required, true);
  assert.equal(analyze([acct(60000, 60000, "insurance")]).result.f8938.required, true);
  assert.deepEqual(KINDS.insurance, { label: "Life insurance with cash value", fbar: true, f8938: true });
});

test("onlyByAnyTime is false when the year-end test already decides it, and when nothing is required", () => {
  const yearEnd = analyze([acct(80000, 60000)]).result.f8938;
  assert.equal(yearEnd.required, true);
  assert.equal(yearEnd.onlyByAnyTime, false);
  const none = analyze([acct(1000)]).result.f8938;
  assert.equal(none.required, false);
  assert.equal(none.onlyByAnyTime, false);
});

test("the example assets keep their documented figures", () => {
  assert.deepEqual(EXAMPLE_ASSETS[0], { name: "UK current account", kind: "bank", maxLocal: 6200, endLocal: 4100, rate: 1.27 });
});

test("csv rows carry two-decimal dollar figures", () => {
  const rows = toCsv(analyze([{ name: "a", kind: "bank", maxLocal: 100.5, endLocal: 50, rate: 1.1 }])).split("\n");
  assert.equal(rows[1], "a,bank,110.55,55.00,yes,yes");
});

test("csv: a name cannot start a spreadsheet formula or break the row", () => {
  const csv = toCsv(analyze([{ name: '=HYPERLINK("http://x")\n+evil', kind: "bank", maxLocal: 1, endLocal: 1, rate: 1 }]));
  const rows = csv.trimEnd().split("\n");
  assert.equal(rows.length, 4); // header, one asset, two totals
  assert.ok(!/^[=+\-@]/.test(rows[1]));
  assert.ok(!rows[1].includes('"'));
});
