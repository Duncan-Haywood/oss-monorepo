import assert from "node:assert/strict";
import test from "node:test";
import { checkRuc, checkDigit } from "./peru.mjs";

test("pinned on SUNAT's own RUC", () => {
  assert.equal(checkRuc("20131312955").ok, true);
  assert.equal(checkRuc("20131312955").kind, "company");
  assert.equal(checkRuc("2013 1312 955").ok, true);
});

test("a person's prefix and an unknown prefix", () => {
  const first10 = "1012345678";
  const ruc = first10 + checkDigit(first10);
  assert.equal(checkRuc(ruc).kind, "person");
  const bad = "9912345678";
  assert.match(checkRuc(bad + checkDigit(bad)).problems[0], /prefix/);
});

test("single-digit substitutions: none missed over the first ten places", () => {
  const base = "2013131295";
  let missed = 0, total = 0;
  for (let i = 0; i < base.length; i++) {
    for (const c of "0123456789") {
      if (c === base[i]) continue;
      total++;
      if (checkDigit(base.slice(0, i) + c + base.slice(i + 1)) === "5") missed++;
    }
  }
  assert.equal(total, 90);
  // weights never share a factor with 11, so a changed digit moves the sum off the
  // multiple of 11; remainders folding 10 to 0 and 11 to 1 could in principle hide
  // a change, and on this base none does (measured: 0 of 90)
  assert.equal(missed, 0);
});

test("reports a wrong check digit and a malformed RUC", () => {
  assert.match(checkRuc("20131312956").problems[0], /check digit should be 5/);
  assert.match(checkRuc("abc").problems[0], /11 digits/);
  assert.match(checkRuc("").problems[0], /11 digits/);
  assert.match(checkRuc("2013131295").problems[0], /11 digits/);
});
