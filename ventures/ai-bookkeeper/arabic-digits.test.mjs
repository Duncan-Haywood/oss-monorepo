import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents, parseDate } from "./bank.mjs";

test("Arabic-Indic, Persian and fullwidth digits read as amounts", () => {
  assert.equal(parseCents("١٢٣٫٤٥"), 12345);
  assert.equal(parseCents("١٬٢٣٤٫٥٠"), 123450);
  assert.equal(parseCents("-۱۲۳٫۴۵"), -12345);
  assert.equal(parseCents("１２３.４５"), 12345);
  assert.equal(parseCents("(١٠٫٠٠)"), -1000);
});

test("non-ASCII digits read in dates", () => {
  assert.equal(parseDate("٢٠٢٦-٠٣-١٢"), "2026-03-12");
  assert.equal(parseDate("۱۲/۰۳/۲۰۲۶", true), "2026-03-12");
  assert.equal(parseDate("２０２６-０３-１２"), "2026-03-12");
});

test("ASCII input is unchanged", () => {
  assert.equal(parseCents("1,234.56"), 123456);
  assert.equal(parseDate("2026-03-12"), "2026-03-12");
});
