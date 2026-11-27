import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { samplePack } from "./build-sample-pack.mjs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("the committed sample is what the real bid package produces", () => {
  assert.equal(read("./sample-bid-package.html"), samplePack());
});
test("the sample shows quantities but no unit prices or labor lines, and is noindex", () => {
  const h = read("./sample-bid-package.html");
  assert.match(h, /Quantities from the plans/);
  assert.match(h, /noindex/);
  assert.doesNotMatch(h, /Wall framing|Door and window setting/);
});
test("marketing page links the sample, says it is not on sale, and is in the sitemap and llms.txt", () => {
  const p = read("./branded-bid-package-for-framers.html");
  assert.match(p, /sample-bid-package\.html/);
  assert.match(p, /not on sale yet/);
  assert.match(p, /No warranty/);
  assert.match(read("./sitemap.xml"), /branded-bid-package-for-framers/);
  assert.match(read("./llms.txt"), /branded-bid-package-for-framers/);
});
test("the page says not on sale only while no checkout link is set", async () => {
  const { CHECKOUT_URL } = await import("./checkout.mjs");
  assert.equal(CHECKOUT_URL, "", "when the owner sets the link, update the marketing page's 'not on sale yet' copy and this test");
});
