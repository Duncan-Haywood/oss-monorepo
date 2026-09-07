import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./deadline.html", import.meta.url), "utf8");

test("deadline page names both compliance dates and the source", () => {
  assert.match(page, /April 26, 2027/);
  assert.match(page, /April 26, 2028/);
  assert.match(page, /federalregister\.gov/);
  assert.match(page, /ada\.gov/);
});

test("deadline page can copy its result and links back to the evidence report", () => {
  assert.match(page, /id="copy"/);
  assert.match(page, /Copy result/);
  assert.match(page, /navigator\.clipboard\.writeText\(latestText\)/);
  assert.match(page, /deadline_copied/);
  assert.match(page, /href="\.\/index\.html"/);
});

test("a special district disables the population field rather than silently ignoring it", () => {
  assert.match(page, /entityType\.value === 'special-district'/);
  assert.match(page, /population\.disabled = isSpecial/);
});

test("page carries the no-warranty clause, the not-legal-advice caveat, and a working sponsor link", () => {
  assert.match(page, /no warranty/i);
  assert.match(page, /not legal advice/i);
  assert.match(page, /github\.com\/sponsors\/Duncan-Haywood/);
});
