import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, PRESETS, platformNet, directNet, month, analyze, num, toCsv } from "./calc.mjs";

const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);

test("per-booking nets are exact", () => {
  near(platformNet(DEFAULTS), 45 * 0.8 - 4, "platform");
  near(directNet(DEFAULTS), 45 - (45 * 0.029 + 0.3) - 4, "direct");
});

test("a month with no direct share has no fixed cost and equals bookings times platform net", () => {
  const m = month(DEFAULTS, 0);
  assert.equal(m.fixed, 0);
  near(m.net, 30 * platformNet(DEFAULTS), "net");
});

test("direct bookings carry the software and marketing cost", () => {
  const m = month(DEFAULTS, 1);
  near(m.net, 30 * directNet(DEFAULTS) - 55, "net");
  assert.equal(m.onPlatform, 0);
});

test("break-even direct bookings is fixed cost over gain per booking", () => {
  const a = analyze({});
  near(a.breakEvenDirect, 55 / (directNet(DEFAULTS) - platformNet(DEFAULTS)), "be");
  assert.equal(a.breakEvenOk, true);
  assert.equal(analyze({ bookingsPerMonth: 3 }).breakEvenOk, false);
});

test("the platform price that matches a direct booking nets the same", () => {
  const a = analyze({});
  near(a.matchPrice * (1 - a.opts.platformFee) - a.opts.costPerBooking, a.directNet, "match");
  assert.ok(a.matchRaise > 0);
});

test("a higher platform fee makes direct booking worth more", () => {
  const rover = analyze({ platformFee: PRESETS.rover.platformFee });
  const wag = analyze({ platformFee: PRESETS.wag.platformFee });
  assert.ok(wag.annualGain > rover.annualGain);
});

test("grid runs 0 to 100 percent direct and net rises with share at a sensible fee", () => {
  const a = analyze({ bookingsPerMonth: 60 });
  assert.deepEqual(a.grid.map((g) => g.share), [0, 0.25, 0.5, 0.75, 1]);
  assert.ok(a.grid[4].net > a.grid[0].net);
});

test("fees equal price times rate on platform plus card cost on direct", () => {
  const m = month({ ...DEFAULTS, bookingsPerMonth: 10 }, 0.5);
  near(m.fees, 5 * 45 * 0.2 + 5 * (45 * 0.029 + 0.3), "fees");
});

test("warnings: bad input, fee below card cost, price below cost", () => {
  assert.equal(analyze({ price: NaN }).result, null);
  assert.equal(analyze({ platformFee: 1.2 }).result, null);
  assert.ok(analyze({ platformFee: 0.01 }).warnings.some((w) => /below card processing/.test(w)));
  assert.ok(analyze({ price: 3 }).warnings.some((w) => /does not cover/.test(w)));
});

test("num parses money text; CSV has header and five rows", () => {
  assert.equal(num("$1,234"), 1234);
  assert.ok(Number.isNaN(num("")));
  const lines = toCsv(analyze({})).trim().split("\n");
  assert.match(lines[0], /^direct_share,/);
  assert.equal(lines.length, 6);
});
