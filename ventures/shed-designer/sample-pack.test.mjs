import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { samplePack } from "./build-sample-pack.mjs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("the committed sample pack is what the real build pack produces", () => {
  assert.equal(read("./sample-build-pack.html"), samplePack());
});
test("marketing page links the sample, says it is not on sale, and is in the sitemap", () => {
  const p = read("./branded-shed-plan-pack-for-builders.html");
  assert.match(p, /sample-build-pack\.html/);
  assert.match(p, /not on sale yet/);
  assert.match(p, /No warranty/);
  assert.match(read("./sitemap.xml"), /branded-shed-plan-pack-for-builders/);
  assert.match(read("./llms.txt"), /branded-shed-plan-pack-for-builders/);
});
