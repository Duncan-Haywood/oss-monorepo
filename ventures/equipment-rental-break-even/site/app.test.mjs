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
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /entirely optional and never changes what the tool does/);
});
// Closest sibling: same break-even shape (fixed ownership/overhead cost spread
// over bookings vs. lesson slots), but equipment rental bookings rather than
// music lesson time. Without a crawlable link here, a crawler entering on the
// equipment rental calculator never reaches the music lesson calculator in
// one hop.
test("index links one hop to the music-lesson-break-even sibling", () => {
  assert.match(
    html,
    /href="\.\.\/music-lesson-break-even\/"/,
    "index must link ../music-lesson-break-even/ so crawlers reach the music lesson calculator in one hop",
  );
});
// Closest equipment sibling: same ownership-cost decision for an independent
// operator, but a lease buyout vs. return-and-replace rather than a rental
// booking price. Without a crawlable link here, a crawler entering on the
// rental calculator never reaches the lease buyout calculator in one hop.
test("index links one hop to the equipment-lease-buyout-calculator sibling", () => {
  assert.match(
    html,
    /href="\.\.\/equipment-lease-buyout-calculator\/"/,
    "index must link ../equipment-lease-buyout-calculator/ so crawlers reach the lease buyout calculator in one hop",
  );
  assert.match(html, /equipment lease buyout calculator/i);
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
  // Break-even bookings per month = fixed overhead / contribution, where
  // contribution is already net of this booking's own ownership-cost share:
  // $75 / $76.33 = 0.9825, not the $101.67 / $103 = 0.9871 an earlier version
  // of this formula produced by adding one booking's ownership cost into the
  // numerator without also netting it out of (or scaling it with) the
  // denominator. See the regression test below for why that mismatch is not
  // just a rounding difference.
  assert.equal(result.utilization.toFixed(4), "0.9825");
});

test("a booking that does not cover its own ownership cost never breaks even, however small fixed overhead is", () => {
  // Pre-ownership profit ($100 - $77 = $23) is positive, so the retired
  // formula (fixed_monthly + one booking's ownership cost) / pre-ownership
  // profit still produced a plausible-looking finite answer here (~4.42
  // bookings/month) for a booking that in fact loses $3.67 the moment its
  // own ownership share is charged against it -- every additional booking of
  // this shape deepens the loss, so no volume of them ever recovers even a
  // single dollar of fixed overhead, let alone $75 of it.
  const result = calculate({ booking: 100, rental_days: 2, delivery: 45, cleaning: 20, damage: 12, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 35 });
  assert.ok(result.contribution < 0, "this booking should lose money after its own ownership cost");
  assert.equal(result.utilization, Infinity);
  assert.equal(result.daysShare, Infinity);
});
test("invalid assumptions are rejected instead of producing a quote", () => {
  assert.throws(() => calculate({ booking: 180, rental_days: 2, delivery: 0, cleaning: 0, damage: 0, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 100 }), /must be valid/);
});
test("days-share is the break-even booking count scaled by rental days, not the raw count", () => {
  // Regression for a bug where the downloaded snapshot reported the raw
  // break-even booking count (0.98) as a "98.3%" utilization figure --
  // roughly 10x the true share of the month's rental-day capacity (9.8%)
  // that this exact booking cadence would actually occupy.
  const result = calculate({ booking: 180, rental_days: 2, delivery: 45, cleaning: 20, damage: 12, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 35 });
  assert.equal(result.daysShare.toFixed(4), "0.0983");
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
  assert.match(text, /Break-even bookings per month: 0\.98 \(9\.8% of available rental days\)/);
  assert.doesNotMatch(text, /98\.3%/);
  assert.match(text, /Minimum price: USD 111\.17/);
  assert.match(text, /Generated: 2026-08-30T00:00:00\.000Z/);
});
test("the snapshot reports unreached break-even without inventing a percentage", () => {
  const v = { currency: "USD", booking: 50, rental_days: 2, delivery: 45, cleaning: 20, damage: 12, purchase: 2400, life: 180, fixed_monthly: 75, available: 20, target_margin: 35 };
  const r = calculate(v);
  const text = buildSnapshotText(v, r, "2026-08-30T00:00:00.000Z");
  assert.match(text, /Break-even bookings per month: Not reached/);
});

// Regression: sitemap.xml listed only vs-booqable.html and missed the
// how-much pricing walkthrough linked from index.html — same incomplete
// hand-authored sitemap class fixed fleet-wide in #3292.
test("every .html file in the venture is reachable from the sitemap", () => {
  const sitemap = fs.readFileSync(new URL("./sitemap.xml", import.meta.url), "utf8");
  const htmlFiles = fs.readdirSync(new URL("./", import.meta.url)).filter((name) => name.endsWith(".html"));
  for (const name of htmlFiles) {
    if (name === "index.html" || name === "offline.html") continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, "\\.")), `${name} is missing from sitemap.xml`);
  }
});
