import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { samplePack } from "./build-sample-pack.mjs";

test("the committed sample pack is what the real print pack produces", () => {
  assert.equal(readFileSync(new URL("./sample-season-pack.html", import.meta.url), "utf8"), samplePack());
});
test("marketing page links the sample, says it is not on sale, and is in the sitemap", () => {
  const p = readFileSync(new URL("./season-pack-for-league-organisers.html", import.meta.url), "utf8");
  assert.match(p, /sample-season-pack\.html/);
  assert.match(p, /not on sale yet/);
  assert.match(p, /No warranty/);
  assert.match(readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8"), /season-pack-for-league-organisers/);
});
