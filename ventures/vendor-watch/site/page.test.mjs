import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("./index.html", import.meta.url), "utf8");

test("landing page states what the tool does and carries the disclaimer", () => {
  assert.match(index, /word-level diff/i);
  assert.match(index, /inconclusive/);
  assert.match(index, /No warranty/);
  assert.match(index, /not legal, compliance or contract-review advice/i);
});

test("links to its browser sibling", () => {
  assert.match(index, /href="\.\.\/vendor-change-watch\/"/);
});

test("ships no scripts", () => {
  assert.doesNotMatch(index, /<script(?![^>]*ld\+json)/);
});
