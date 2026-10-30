// Federal estimated-payment due dates move past weekends and DC holidays
// (IRC 7503). Expected dates are the IRS's own announced ones.
import test from "node:test";
import assert from "node:assert/strict";
import { estimatedDueDates } from "./taxforms.mjs";

test("April deadline moves past Emancipation Day (2022, 2023)", () => {
  assert.equal(estimatedDueDates(2022)[0], "2022-04-18");
  assert.equal(estimatedDueDates(2023)[0], "2023-04-18");
});

test("April 15 stays when Emancipation Day is the next day (2024)", () => {
  assert.equal(estimatedDueDates(2024)[0], "2024-04-15");
});

test("January payment after a Sunday 15th and MLK Day is the 17th (2022 plan)", () => {
  assert.equal(estimatedDueDates(2022)[3], "2023-01-17");
});

test("January 15 on MLK Day itself moves to the 16th (2028 plan -> 2029)", () => {
  assert.equal(estimatedDueDates(2028)[3], "2029-01-16");
});

test("ordinary weekend roll still works and dates stay ISO and ascending", () => {
  assert.equal(estimatedDueDates(2026).join(), "2026-04-15,2026-06-15,2026-09-15,2027-01-15");
  for (let y = 2020; y <= 2040; y++) {
    const d = estimatedDueDates(y);
    assert.deepEqual([...d].sort(), d);
    for (const s of d) { const w = new Date(s + "T00:00:00Z").getUTCDay(); assert.ok(w >= 1 && w <= 5, s); }
  }
});
