import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, sweepCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("price follows the stated rule on the sample", () => {
  const r = compute(raw());
  const completed = 90 * 0.8;
  const variable = 6 * 14 * 4.25 + 150 + 60;
  const price = (variable + (21000 + 40000) / completed) / 0.97;
  assert.ok(Math.abs(r.price - price) < 0.01);
  assert.equal(r.completed, completed);
  assert.ok(Math.abs(r.perAngler - price / 4) < 0.01);
});

test("break-even is below the target price and equals zero profit", () => {
  const r = compute(raw({ currentPrice: "" }));
  assert.ok(r.breakEven < r.price);
  const be = compute(raw({ currentPrice: String(r.breakEven) }));
  assert.ok(Math.abs(be.current.profitYear) < 5);
});

test("a price under break-even is a high finding with the annual loss", () => {
  const r = compute(raw({ currentPrice: "300" }));
  assert.ok(r.current.profitYear < 0);
  assert.equal(r.findings[0].severity, "high");
});

test("more weather cancellations raise the price", () => {
  assert.ok(compute(raw({ cancelPct: "40" })).price > compute(raw({ cancelPct: "0" })).price);
});

test("fuel swing is gallons per trip over the fee factor", () => {
  const r = compute(raw());
  assert.ok(Math.abs(r.fuelSwing - (6 * 14) / 0.97) < 1e-9);
});

test("trips needed at the current price can exceed what is booked", () => {
  const r = compute(raw({ currentPrice: "700" }));
  assert.ok(r.current.tripsForTarget > 90 * 0.8);
  assert.ok(r.findings.some((f) => /completed trips .*to hit/.test(f.title)));
  assert.equal(compute(raw({ currentPrice: "100" })).current.tripsForTarget, null);
});

test("optional fields can be blank", () => {
  const r = compute(raw({ anglers: "", currentPrice: "", deckhand: "", bait: "", cancelPct: "", feePct: "" }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.perAngler, null);
  assert.equal(r.current, null);
});

test("validation names the bad field and does not compute", () => {
  assert.ok(parse(raw({ hours: "" })).errors[0].includes("trip length"));
  assert.ok(compute(raw({ booked: "0" })).errors.length > 0);
  assert.ok(compute(raw({ cancelPct: "100" })).errors.length > 0);
  assert.ok(compute(raw({ feePct: "60" })).errors.length > 0);
  assert.ok(compute(raw({ anglers: "0" })).errors.length > 0);
});

test("sweep shows price falling as volume rises", () => {
  const s = compute(raw()).sweep;
  assert.equal(s.length, 5);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].price < s[i - 1].price);
});

test("dollars, summary and csv render", () => {
  const r = compute(raw());
  assert.equal(dollars(1234.5), "$1,234.50");
  assert.match(summaryText(r), /Break-even price: \$/);
  assert.equal(sweepCsv(r).split("\n").length, 6);
});

// Quality audit 2026-11-22 (portfolio/quality/audits/2026-11-22-fishing-charter-trip-pricing-calculator.json).
test("trips-needed warning compares completed with completed, not with booked", () => {
  // $1,400: contribution 1400*0.97-567 = 791; (21000+40000)/791 = 77.1 completed trips,
  // more than the 72 completed of 90 booked, though fewer than 90.
  const r = compute(raw({ currentPrice: "1400" }));
  assert.ok(Math.abs(r.current.tripsForTarget - 61000 / 791) < 1e-9);
  const f = r.findings.find((x) => /completed trips .*to hit/.test(x.title));
  assert.ok(f, "warning fires at 77.1 needed vs 72 completed");
  assert.match(f.title, /about 78 completed trips \(about 97 bookings at 20% weather loss\)/);
  assert.match(f.title, /more than the 72 completed from the 90/);
  // $1,500 is above the target price, so no warning.
  assert.ok(!compute(raw({ currentPrice: "1500" })).findings.some((x) => /to hit your target/.test(x.title)));
});

test("weather finding is the target price minus the no-cancellation price", () => {
  // (567 + 61000/72)/0.97 - (567 + 61000/90)/0.97 = 174.68
  const r = compute(raw());
  const f = r.findings.find((x) => /Weather cancellations/.test(x.title));
  assert.match(f.title, /add \$174\.68 to every trip/);
  assert.ok(!compute(raw({ cancelPct: "10" })).findings.some((x) => /Weather cancellations/.test(x.title)));
  assert.ok(compute(raw({ cancelPct: "15" })).findings.some((x) => /Weather cancellations/.test(x.title)));
});

test("a price between break-even and target is a medium miss, not a loss", () => {
  const r = compute(raw({ currentPrice: "1000" }));
  assert.equal(r.findings[0].severity, "medium");
  assert.match(r.findings[0].title, /against your \$40,000\.00 target/);
  assert.ok(!compute(raw({ currentPrice: "1500" })).findings.some((x) => /against your/.test(x.title)));
});

test("more than six anglers warns about the six-pack passenger limit", () => {
  assert.ok(compute(raw({ anglers: "12" })).findings.some((x) => /at most 6 passengers/.test(x.title)));
  assert.ok(!compute(raw({ anglers: "6" })).findings.some((x) => /at most 6 passengers/.test(x.title)));
});

test("typed text in the optional fields is an error, not silently skipped", () => {
  assert.ok(compute(raw({ anglers: "four" })).errors.some((e) => /Anglers/.test(e)));
  assert.ok(compute(raw({ currentPrice: "about 800" })).errors.some((e) => /Current price/.test(e)));
});

test("fuel finding says price, and names the cost it grosses up", () => {
  const f = compute(raw()).findings.find((x) => /per gallon/.test(x.title));
  assert.match(f.title, /price you need per trip by about \$86\.60 \(\$84\.00 of cost/);
});
