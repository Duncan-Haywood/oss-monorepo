import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("./index.html", import.meta.url), "utf8");
const shrinking = await readFile(new URL("./shrinking.html", import.meta.url), "utf8");

test("trend page names the user problem and stays local", () => {
  assert.match(index, /quietly got smaller/);
  assert.match(index, /Nothing is uploaded|never uploaded/);
  assert.match(index, /No warranty/);
  assert.match(index, /Best-effort hosting, no SLA/);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /load-example/);
  assert.match(index, /Turn usage counting off/);
});

test("shrinking FAQ answers the search question without a warranty", () => {
  assert.match(shrinking, /Why is my backup smaller than yesterday/);
  assert.match(shrinking, /FAQPage/);
  assert.match(shrinking, /test a restore/i);
  assert.match(shrinking, /No warranty/);
  assert.match(shrinking, /no SLA/i);
});
