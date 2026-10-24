import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("links its sibling story venture (platform/pages/siblings.mjs)", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /href="\.\.\/hearth-and-horizon\/"/);
});
