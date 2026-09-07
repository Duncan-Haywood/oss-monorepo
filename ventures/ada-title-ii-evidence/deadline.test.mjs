import test from "node:test";
import assert from "node:assert/strict";
import { resolveDeadline, daysUntil, deadlineAsText } from "./deadline.mjs";

test("a large entity (population >= 50,000) gets the 2027 date", () => {
  assert.equal(resolveDeadline({ entityType: "government", population: 50000 }).date, "2027-04-26");
  assert.equal(resolveDeadline({ entityType: "government", population: 2000000 }).date, "2027-04-26");
});

test("a small entity (population < 50,000) gets the 2028 date", () => {
  assert.equal(resolveDeadline({ entityType: "government", population: 49999 }).date, "2028-04-26");
  assert.equal(resolveDeadline({ entityType: "government", population: 0 }).date, "2028-04-26");
});

test("any special district gets the 2028 date regardless of population", () => {
  assert.equal(resolveDeadline({ entityType: "special-district", population: 5000000 }).date, "2028-04-26");
});

test("resolveDeadline rejects a missing or invalid population for a non-special-district entity", () => {
  assert.throws(() => resolveDeadline({ entityType: "government", population: "" }), /population/);
  assert.throws(() => resolveDeadline({ entityType: "government", population: -5 }), /population/);
  assert.throws(() => resolveDeadline({ entityType: "government", population: "not a number" }), /population/);
});

test("daysUntil counts whole days between now and the target date, both directions", () => {
  assert.equal(daysUntil("2026-09-10", new Date("2026-09-07T15:00:00Z")), 3);
  assert.equal(daysUntil("2026-09-01", new Date("2026-09-07T00:00:00Z")), -6);
});

test("deadlineAsText names the date, the standard, the source, and the not-legal-advice caveat", () => {
  const text = deadlineAsText({ entityType: "government", population: 12000 }, new Date("2026-09-07T00:00:00Z"));
  assert.match(text, /2028-04-26/);
  assert.match(text, /WCAG 2\.1 Level AA/);
  assert.match(text, /federalregister\.gov/);
  assert.match(text, /not legal advice/);
});
