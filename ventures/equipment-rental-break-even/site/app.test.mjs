import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { calculate } from "./model.mjs";
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./app.mjs", import.meta.url), "utf8");
test("landing page exposes searchable product, safety copy, and local app", () => {
  assert.match(html, /Equipment Rental Break-Even Calculator/);
  assert.match(html, /No warranty/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /app\.mjs/);
});
test("browser output treats the currency label as text and honors privacy signals", () => {
  assert.match(app, /replaceChildren\(\)/);
  assert.match(app, /textContent = value/);
  assert.match(app, /navigator\.doNotTrack === "1"/);
  assert.match(app, /navigator\.globalPrivacyControl === true/);
});
test("calculation model covers ownership and booking costs", () => {
  const result = calculate({ booking: 180, rental_days: 2, delivery: 45, cleaning: 20, damage: 12, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 35 });
  assert.equal(result.contribution.toFixed(2), "76.33");
  assert.equal((result.bookingCosts + result.ownershipPerDay * 2).toFixed(2), "103.67");
  assert.equal(result.utilization.toFixed(4), "0.9871");
});
test("invalid assumptions are rejected instead of producing a quote", () => {
  assert.throws(() => calculate({ booking: 180, rental_days: 2, delivery: 0, cleaning: 0, damage: 0, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 100 }), /must be valid/);
});
