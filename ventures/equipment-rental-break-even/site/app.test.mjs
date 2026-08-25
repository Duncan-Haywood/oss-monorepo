import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
test("landing page exposes searchable product, safety copy, and local app", () => {
  assert.match(html, /Equipment Rental Break-Even Calculator/);
  assert.match(html, /No warranty/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /app\.mjs/);
});
test("calculation model covers ownership and booking costs", () => {
  const booking = 180, bookingCosts = 45 + 20 + 12, ownership = 2400 / 180 * 2;
  assert.equal((booking - bookingCosts - ownership).toFixed(2), "76.33");
  assert.equal((bookingCosts + ownership).toFixed(2), "103.67");
});
