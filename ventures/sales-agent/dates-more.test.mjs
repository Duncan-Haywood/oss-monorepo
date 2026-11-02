import test from "node:test";
import assert from "node:assert/strict";
import { findDate } from "./engine.mjs";

const TODAY = "2026-11-02";
const cases = [
  ["returning on the first of December", "2026-12-01"],
  ["back in 2 wks", "2026-11-16"],
  ["back in a fortnight", "2026-11-16"],
  ["back tomorrow", "2026-11-03"],
  ["back the day after tomorrow", "2026-11-04"],
  ["back next Tues", "2026-11-03"],
  ["until Thurs", "2026-11-05"],
  ["back at the start of December", "2026-12-01"],
  ["out until mid-December", "2026-12-15"],
  ["back end of Nov", "2026-12-01"],
  ["return: 2026/12/01", "2026-12-01"],
  ["back on 1.12.2026", "2026-12-01"],
  ["back 25.1.27", "2027-01-25"],
  ["back on Thursday the 5th", "2026-11-05"],
];
for (const [text, want] of cases) test(`findDate: ${text}`, () => assert.equal(findDate(text, TODAY)?.date, want));
test("findDate: no date in a plain sentence", () => assert.equal(findDate("thanks, will review", TODAY), null));
test("findDate: an impossible day.month is not read", () => assert.equal(findDate("version 31.13.2026", TODAY)?.date, undefined));
