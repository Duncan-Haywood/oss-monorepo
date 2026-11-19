// The page calls detectDecimalComma(parseCsv(text, d), d). parseCsv returns { rows, lines },
// and from 2026-11-14 (PR #15815) to 2026-11-19 detectDecimalComma iterated that object and threw
// "table is not iterable" on every file, the sample included. Found by
// platform/ci/check_textarea_edges.js once it served pages over http:// (file:// blocks modules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, detectDelimiter, detectDecimalComma, normalizeBookings, analyze, sampleCsv } from "./calc.mjs";

const pipeline = (text) => {
  const d = detectDelimiter(text);
  return normalizeBookings(parseCsv(text, d), { decimalComma: detectDecimalComma(parseCsv(text, d), d) });
};

test("the page's call reads the sample without throwing and finds bookings", () => {
  const n = pipeline(sampleCsv());
  assert.equal(n.error ?? null, null);
  assert.ok(n.records.length > 0);
  assert.doesNotThrow(() => analyze(n.records, {}));
});

test("an empty paste or a header with no rows gives a message, not a crash", () => {
  assert.equal(pipeline("").error, "The file is empty.");
  const head = sampleCsv().split(/\r?\n/)[0] + "\n";
  assert.doesNotThrow(() => pipeline(head));
});

test("the parser's { rows } shape and a bare array give the same answer", () => {
  const t = "Service;Price\nCut;12,50\nColour;45,00\n";
  const parsed = parseCsv(t, ";");
  assert.equal(detectDecimalComma(parsed, ";"), true);
  assert.equal(detectDecimalComma(parsed.rows, ";"), true);
  const dot = parseCsv("Service,Price\nCut,12.50\n", ",");
  assert.equal(detectDecimalComma(dot, ","), false);
});
