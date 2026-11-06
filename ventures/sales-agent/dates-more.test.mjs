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

// Added 2026-11-02: return dates written in German, French, Spanish, Portuguese, Italian and Dutch.
test("findDate reads month names in other languages", async () => {
  const { findDate } = await import("./engine.mjs");
  const cases = [
    ["Ich bin bis zum 12. November nicht im Büro", "2026-11-12"],
    ["Je suis absent jusqu'au 16 novembre", "2026-11-16"],
    ["Estaré fuera hasta el 20 de noviembre", "2026-11-20"],
    ["Sono fuori sede fino al 3 dicembre", "2026-12-03"],
    ["Ik ben terug op 5 januari", "2027-01-05"],
    ["Voltarei a 4 de março", "2027-03-04"],
    ["Zurück am 1. Januar", "2027-01-01"],
  ];
  for (const [t, d] of cases) assert.equal(findDate(t, "2026-11-02")?.date, d, t);
});

test("findDate: a day the month does not have is not read as a date (2026-11-06)", () => {
  for (const t of ["back 31 February", "away until Feb 30", "out until 31 Nov"]) assert.equal(findDate(t, "2026-11-06"), null, t);
  assert.equal(findDate("back Feb 29", "2026-11-06")?.date, "2028-02-29", "a leap day waits for a leap year");
});
test("findDate: next and this plus a weekday (2026-11-06)", () => {
  assert.equal(findDate("let's talk next Tuesday", "2026-11-06")?.date, "2026-11-10");
  assert.equal(findDate("free this Thursday", "2026-11-06")?.date, "2026-11-12");
});
