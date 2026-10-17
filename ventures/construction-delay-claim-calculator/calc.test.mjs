import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDelays, eichleay, plan, sensitivity, sampleInput, toCsv } from "./calc.mjs";

const base = () => ({ ...sampleInput() });

test("parseDelays accepts lines and rejects bad ones", () => {
  assert.equal(parseDelays("A, 5, owner, no\n# skip\nB, 3, weather").delays.length, 2);
  assert.match(parseDelays("A, x, owner").errors[0], /days/);
  assert.match(parseDelays("A, 5, vendor").errors[0], /cause/);
  assert.match(parseDelays("A, 5, owner, maybe").errors[0], /concurrent/);
  assert.match(parseDelays("A").errors[0], /need/);
});

test("Eichleay: share of billings times overhead, per actual day, times delay days", () => {
  const e = eichleay({ contractBillings: 2400000, totalBillings: 9600000, homeOverhead: 1100000, actualDays: 297, delayDays: 21 });
  assert.equal(e.allocated, 275000);
  assert.equal(e.daily, 925.93);
  assert.equal(e.claim, 19444.44);
  assert.equal(eichleay({ contractBillings: 0, totalBillings: 1, homeOverhead: 1, actualDays: 1, delayDays: 1 }).claim, 0);
});

test("sample: time extension, compensable days, LD and net", () => {
  const r = plan(base());
  assert.equal(r.ownerDays, 21);
  assert.equal(r.ownerConcurrent, 14);
  assert.equal(r.neutralDays, 6);
  assert.equal(r.contractorDays, 12);
  assert.equal(r.extensionDays, 41);
  assert.equal(r.adjustedDays, 281);
  assert.equal(r.lateDays, 16);
  assert.equal(r.ld, 24000);
  assert.equal(r.field, 38850);
  assert.equal(r.eichleay.claim, 19444.44);
  assert.equal(r.profit, 2914.72);
  assert.equal(r.claim, 61209.16);
  assert.equal(r.net, 37209.16);
});

test("liquidated damages are held to the cap", () => {
  const r = plan({ ...base(), ldPerDay: 50000 });
  assert.equal(r.ld, 240000);
});

test("finishing inside the adjusted time means no liquidated damages", () => {
  const r = plan({ ...base(), actualDays: 270 });
  assert.equal(r.lateDays, 0);
  assert.equal(r.ld, 0);
  assert.match(r.advice.join(" "), /on time/);
});

test("concurrent owner delay earns time but no money", () => {
  const r = plan({ ...base(), delays: "Owner RFI, 10, owner, yes", homeOverhead: "", contractBillings: "", totalBillings: "" });
  assert.equal(r.compensableDays, 0);
  assert.equal(r.extensionDays, 10);
  assert.equal(r.claim, 0);
});

test("extensions are valued: liquidated damages avoided", () => {
  const r = plan(base());
  assert.equal(r.ldAvoided, 61500);
});

test("input errors are reported, not thrown", () => {
  assert.match(plan({ ...base(), contractDays: 0 }).error, /contract time/);
  assert.match(plan({ ...base(), actualDays: "" }).error, /actually took/);
  assert.match(plan({ ...base(), delays: "" }).error, /at least one/);
  assert.match(plan({ ...base(), totalBillings: 100 }).error, /Eichleay/);
  assert.match(plan({ ...base(), fieldDaily: -1 }).error, /zero or more/);
});

test("sensitivity moves the claim with compensable days", () => {
  const rows = sensitivity(base());
  assert.equal(rows.length, 5);
  assert.ok(rows[4].claim > rows[2].claim && rows[2].claim > rows[0].claim);
  assert.equal(rows[2].claim, plan(base()).claim);
});

test("csv has a header and the headline rows", () => {
  const csv = toCsv(plan(base()));
  assert.match(csv, /^item,value/);
  assert.match(csv, /net_position,37209.16/);
});
