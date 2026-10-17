import test from "node:test";
import assert from "node:assert/strict";
import {
  listStates,
  normalizeState,
  getRule,
  rangeRequiredStates,
  scanPostingText,
  checkPosting,
} from "./engine.mjs";

test("listStates returns all 51 jurisdictions", () => {
  const states = listStates();
  assert.equal(states.length, 51);
  assert.ok(states.includes("District of Columbia"));
  assert.equal(new Set(states).size, 51, "no duplicate jurisdiction names");
});

test("normalizeState accepts abbreviation, full name, and is case-insensitive", () => {
  assert.equal(normalizeState("CO"), "Colorado");
  assert.equal(normalizeState("colorado"), "Colorado");
  assert.equal(normalizeState("Colorado"), "Colorado");
  assert.equal(normalizeState("dc"), "District of Columbia");
});

test("normalizeState throws on garbage input", () => {
  assert.throws(() => normalizeState("Narnia"), /Unrecognized US state/);
  assert.throws(() => normalizeState(""), /Expected a US state/);
});

test("getRule reports range-required for Colorado with a citation and threshold", () => {
  const rule = getRule("CO");
  assert.equal(rule.type, "range-required");
  assert.match(rule.law, /Equal Pay for Equal Work Act/);
  assert.equal(rule.effective, "2021-01-01");
  assert.ok(rule.threshold);
});

test("getRule reports no-posting-requirement for a state with no such law", () => {
  const rule = getRule("Texas");
  assert.equal(rule.type, "no-posting-requirement");
  assert.equal(rule.law, null);
});

test("rangeRequiredStates returns only jurisdictions with a posting law, and every entry round-trips through getRule", () => {
  const states = rangeRequiredStates();
  assert.ok(states.length >= 13);
  for (const name of states) {
    assert.equal(getRule(name).type, "range-required");
  }
});

test("every range-required entry names a law and an effective date", () => {
  for (const name of rangeRequiredStates()) {
    const rule = getRule(name);
    assert.ok(rule.law && rule.law.length > 0, `${name} missing law name`);
    assert.match(rule.effective, /^\d{4}-\d{2}-\d{2}$/, `${name} missing/invalid effective date`);
  }
});

test("scanPostingText detects a clear range", () => {
  const result = scanPostingText("This role pays $60,000 - $80,000 per year, depending on experience.");
  assert.equal(result.classification, "range");
  assert.equal(result.figures.length, 2);
});

test("scanPostingText detects a range joined by the word 'to'", () => {
  const result = scanPostingText("Salary: $28.50 to $34.00 per hour.");
  assert.equal(result.classification, "range");
});

test("scanPostingText detects a single ceiling figure as single-figure, not a range", () => {
  const result = scanPostingText("Compensation up to $95,000 depending on experience.");
  assert.equal(result.classification, "single-figure");
});

test("scanPostingText reports none when no dollar figure appears", () => {
  const result = scanPostingText("Join our fast-growing team as a Senior Engineer!");
  assert.equal(result.classification, "none");
  assert.deepEqual(result.figures, []);
});

test("scanPostingText treats two unrelated distant figures as single-figure, not a manufactured range", () => {
  const text =
    "Base salary $70,000. We also offer a $2,000 signing bonus and a $500 annual wellness stipend " +
    "on top of a comprehensive benefits package that includes health, dental, and vision coverage.";
  const result = scanPostingText(text);
  assert.equal(result.classification, "single-figure");
});

test("checkPosting flags a selected range-required state whose text has no detected range", () => {
  const result = checkPosting("Great opportunity, apply now!", ["Colorado", "Texas"]);
  assert.equal(result.scan.classification, "none");
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].state, "Colorado");
  assert.equal(result.notApplicable.length, 1);
  assert.equal(result.notApplicable[0].state, "Texas");
});

test("checkPosting reports a selected range-required state as covered when a range is present", () => {
  const result = checkPosting("$60,000 - $80,000 per year.", ["Colorado"]);
  assert.equal(result.covered.length, 1);
  assert.equal(result.missing.length, 0);
});

test("checkPosting with no selected states still returns the scan", () => {
  const result = checkPosting("$60,000 - $80,000", []);
  assert.equal(result.scan.classification, "range");
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.covered, []);
});
