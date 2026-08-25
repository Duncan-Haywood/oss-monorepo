import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const seo = readFileSync(
  new URL("./should-i-price-over-amazons-low-price-fba.html", import.meta.url),
  "utf8",
);

test("calculator page wires the Low-Price FBA comparison", () => {
  assert.match(index, /compareLowPriceFba/);
  assert.match(index, /id="lowPriceCompare"/);
  assert.match(index, /id="lowPriceBreakEven"/);
  assert.match(index, /low_price_fba_compared/);
  assert.match(index, /should-i-price-over-amazons-low-price-fba.html/);
  assert.match(index, /Best-effort hosting, no SLA/);
});

test("SEO page states the penny-raise trap and the break-even raise", () => {
  assert.match(seo, /Low-Price FBA/);
  assert.match(seo, /\$11\.05/);
  assert.match(seo, /one-cent raise/);
  assert.match(seo, /No warranty/);
});
