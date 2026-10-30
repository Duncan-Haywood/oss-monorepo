import assert from "node:assert/strict";
import test from "node:test";
import { corporateCheckDigit, checkRegistrationNumber, transitionalShare } from "./japan.mjs";

test("check digit matches the tax agency's own corporate number", () => {
  assert.equal(corporateCheckDigit("000012050002"), 7);
  assert.equal(checkRegistrationNumber("T7000012050002").kind, "corporate");
});

test("accepts spacing, hyphens, lower case and a full-width T", () => {
  for (const v of ["t7000012050002", "T 7000-0120-50002", "Ｔ7000012050002"]) {
    assert.equal(checkRegistrationNumber(v).number, "T7000012050002", v);
  }
});

test("a mistyped corporate digit is flagged as maybe an individual's number", () => {
  const r = checkRegistrationNumber("T7000012050004");
  assert.equal(r.kind, "other");
  assert.match(r.problems[0], /would be 5/);
  assert.match(r.problems[0], /individual/);
});

test("shape errors are named", () => {
  assert.match(checkRegistrationNumber("7000012050002").problems[0], /starts with the letter T/);
  assert.match(checkRegistrationNumber("T700001205000").problems[0], /13 digits; this has 12/);
  assert.match(checkRegistrationNumber("T70000120500AB").problems[0], /digits only/);
  assert.equal(checkRegistrationNumber("").ok, false);
});

test("single-digit typos are caught except a 0 and 9 swapped, which mod 9 cannot see", () => {
  const base = "7000012050002";
  let caught = 0;
  let missed = 0;
  for (let i = 0; i < 13; i++) {
    for (let d = 0; d < 10; d++) {
      if (String(d) === base[i]) continue;
      const t = base.slice(0, i) + d + base.slice(i + 1);
      const swap09 = (base[i] === "0" && d === 9) || (base[i] === "9" && d === 0);
      if (checkRegistrationNumber("T" + t).kind === "corporate") {
        missed++;
        assert.ok(swap09, `unexpected miss ${t}`);
      } else caught++;
    }
  }
  assert.equal(missed, 8);
  assert.equal(caught, 13 * 9 - 8);
});

test("transitional share by purchase date", () => {
  assert.equal(transitionalShare("2023-09-30"), null);
  assert.equal(transitionalShare("2023-10-01"), 0.8);
  assert.equal(transitionalShare("2026-09-30"), 0.8);
  assert.equal(transitionalShare("2026-10-01"), 0.5);
  assert.equal(transitionalShare("2029-09-30"), 0.5);
  assert.equal(transitionalShare("2029-10-01"), 0);
  assert.equal(transitionalShare("x"), null);
});
