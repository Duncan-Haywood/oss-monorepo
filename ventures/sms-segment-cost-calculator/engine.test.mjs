import test from "node:test";
import assert from "node:assert/strict";
import { countSegments, toGsm7, monthlyCost, savingsOptions, DEFAULT_PRICES } from "./engine.mjs";

test("empty message is zero segments", () => {
  assert.equal(countSegments("").segments, 0);
});

test("GSM-7 boundary: 160 chars is one segment, 161 is two", () => {
  assert.equal(countSegments("a".repeat(160)).segments, 1);
  const two = countSegments("a".repeat(161));
  assert.equal(two.segments, 2);
  assert.equal(two.perSegment, 153);
  assert.equal(countSegments("a".repeat(306)).segments, 2);
  assert.equal(countSegments("a".repeat(307)).segments, 3);
});

test("extension characters cost two septets", () => {
  const r = countSegments("[]{}");
  assert.equal(r.units, 8);
  assert.equal(r.encoding, "GSM-7");
  assert.equal(countSegments("a".repeat(159) + "{").segments, 2);
  assert.equal(countSegments("€").units, 2);
});

test("one curly apostrophe flips the message to UCS-2 and triples the cost", () => {
  const plain = "Hi Sam, your appointment is tomorrow at 3pm. Reply C to confirm or R to reschedule. See you then, Dr. Lee's office. Thanks!!";
  const curly = plain.replace("Lee's", "Lee’s");
  assert.ok(plain.length > 70 && plain.length <= 160);
  assert.equal(countSegments(plain).segments, 1);
  const c = countSegments(curly);
  assert.equal(c.encoding, "UCS-2");
  assert.equal(c.segments, Math.ceil(c.units / 67));
  assert.deepEqual(c.offenders, ["’"]);
  assert.ok(c.segments >= 2);
});

test("UCS-2 boundary: 70 single, 71 split at 67", () => {
  assert.equal(countSegments("’" + "a".repeat(69)).segments, 1);
  assert.equal(countSegments("’" + "a".repeat(70)).segments, 2);
  assert.equal(countSegments("’" + "a".repeat(133)).segments, 2);
  assert.equal(countSegments("’" + "a".repeat(134)).segments, 3);
});

test("an emoji counts as two UTF-16 units", () => {
  const r = countSegments("ok \u{1F600}");
  assert.equal(r.encoding, "UCS-2");
  assert.equal(r.units, 5);
});

test("toGsm7 replaces look-alikes and reports what it could not", () => {
  const r = toGsm7("It’s “fine” — ok… \u{1F600}");
  assert.equal(r.text, "It's \"fine\" - ok... \u{1F600}");
  assert.deepEqual(r.remaining, ["\u{1F600}"]);
  assert.equal(r.replaced["’"], 1);
});

test("monthlyCost multiplies segments by volume and adds fixed fees", () => {
  const c = monthlyCost({ segmentsPerMessage: 2, messagesPerMonth: 10000, numbers: 1, campaigns: 1 });
  const rate = DEFAULT_PRICES.perSegment + DEFAULT_PRICES.carrierSurcharge;
  assert.ok(Math.abs(c.usage - 20000 * rate) < 1e-9);
  assert.ok(Math.abs(c.fixed - (DEFAULT_PRICES.numberMonthly + DEFAULT_PRICES.campaignMonthly)) < 1e-9);
  assert.equal(c.segments, 20000);
});

test("savingsOptions finds the GSM-7 fix and prices it", () => {
  const text = "Your table is ready – we’ll hold it for 10 minutes. Reply STOP to opt out. Thanks for choosing us, see you very soon at the restaurant!";
  const r = savingsOptions(text, { messagesPerMonth: 50000 });
  assert.equal(r.now.encoding, "UCS-2");
  assert.equal(r.options[0].id, "gsm7");
  assert.equal(countSegments(r.options[0].text).encoding, "GSM-7");
  assert.ok(r.options[0].saving > 0);
});

test("no options when the message is already one GSM-7 segment", () => {
  assert.deepEqual(savingsOptions("Hello", { messagesPerMonth: 1000 }).options, []);
});

test("bad numbers fall back instead of producing NaN", () => {
  const c = monthlyCost({ segmentsPerMessage: "x", messagesPerMonth: -5 });
  assert.equal(c.total, DEFAULT_PRICES.numberMonthly + DEFAULT_PRICES.campaignMonthly);
});
