import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { calculate, buildSnapshotText } from "./model.mjs";
import { encodeShare, decodeShare } from "./share.mjs";
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./app.mjs", import.meta.url), "utf8");
test("landing page exposes searchable product, safety copy, and local app", () => {
  assert.match(html, /Equipment Rental Break-Even Calculator/);
  assert.match(html, /No warranty/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /app\.mjs/);
  assert.match(html, /Save draft/);
  assert.match(html, /Saved local drafts/);
  assert.match(html, /Copy share link/);
  assert.match(html, /not a recommended price/);
  assert.match(html, /To the maximum extent permitted by law/);
});
test("app wires the share button to encode/decode and applies an incoming link on load", () => {
  assert.match(app, /import \{ encodeShare, decodeShare \} from "\.\/share\.mjs";/);
  assert.match(app, /"copy-share"\)\.addEventListener/);
  assert.match(app, /decodeShare\(location\.hash\)/);
  assert.match(app, /applyDraft\(\{ values: shared \}\)/);
  // `recordUsage` since 2026-09-03: the counting helper moved into usage.mjs
  // and app.mjs's local wrapper is what the call sites name now. Same event,
  // same call site — only the wrapper's name changed.
  assert.match(app, /recordUsage\("share_copied"\)/);
});
test("a decoded share link round-trips into the same field shape applyDraft expects", () => {
  const v = { currency: "USD", booking: 180, rental_days: 2, delivery: 45, cleaning: 20, damage: 12, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 35 };
  const decoded = decodeShare(encodeShare(v));
  assert.deepEqual(decoded, v);
});
test("browser output treats the currency label as text and honors privacy signals", () => {
  assert.match(app, /replaceChildren\(\)/);
  assert.match(app, /textContent = value/);
  // The two privacy signals moved into usage.mjs on 2026-09-03, so assert them
  // where they now live. This is deliberately still a source check on the
  // **same two signals**, so the guarantee is not quietly narrowed by the move
  // — and usage.test.mjs additionally proves each one actually suppresses a
  // recorded event, which this regex never could.
  const usage = fs.readFileSync(new URL("./usage.mjs", import.meta.url), "utf8");
  assert.match(usage, /navigator\?\.doNotTrack === "1"/);
  assert.match(usage, /navigator\?\.globalPrivacyControl === true/);
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
test("days-share is the break-even booking count scaled by rental days, not the raw count", () => {
  // Regression for a bug where the downloaded snapshot reported the raw
  // break-even booking count (0.99) as a "98.7%" utilization figure --
  // roughly 10x the true share of the month's rental-day capacity (9.9%)
  // that this exact booking cadence would actually occupy.
  const result = calculate({ booking: 180, rental_days: 2, delivery: 45, cleaning: 20, damage: 12, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 35 });
  assert.equal(result.daysShare.toFixed(4), "0.0987");
  assert.notEqual(result.daysShare.toFixed(1), result.utilization.toFixed(1));
});
test("days-share is Infinity, not a finite fraction of Infinity, when break-even is never reached", () => {
  const result = calculate({ booking: 50, rental_days: 2, delivery: 45, cleaning: 20, damage: 12, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 35 });
  assert.equal(result.utilization, Infinity);
  assert.equal(result.daysShare, Infinity);
});
test("the downloaded snapshot states break-even as a booking count plus its correct day-share percentage", () => {
  const v = { currency: "USD", booking: 180, rental_days: 2, delivery: 45, cleaning: 20, damage: 12, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 35 };
  const r = calculate(v);
  const text = buildSnapshotText(v, r, "2026-08-30T00:00:00.000Z");
  assert.match(text, /Break-even bookings per month: 0\.99 \(9\.9% of available rental days\)/);
  assert.doesNotMatch(text, /98\.7%/);
  assert.match(text, /Minimum price: USD 111\.17/);
  assert.match(text, /Generated: 2026-08-30T00:00:00\.000Z/);
});
test("the snapshot reports unreached break-even without inventing a percentage", () => {
  const v = { currency: "USD", booking: 50, rental_days: 2, delivery: 45, cleaning: 20, damage: 12, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 35 };
  const r = calculate(v);
  const text = buildSnapshotText(v, r, "2026-08-30T00:00:00.000Z");
  assert.match(text, /Break-even bookings per month: Not reached/);
});
