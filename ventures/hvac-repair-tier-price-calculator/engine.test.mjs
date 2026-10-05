import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, DEFAULT_TIERS, priceCall, priceBook, priceTier, partsMarkup, hourlyCost, expectedCall, toCsv, summarize, money, pct, encodeShare, decodeShare, cleanTiers } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("defaults: true cost is $113 an hour, $78 labour and $35 overhead", () => {
  const h = hourlyCost(DEFAULTS);
  close(h.loadedWage, 45);
  close(h.labourPerHour, 78);
  close(h.overheadPerHour, 35);
  close(h.perHour, 113);
});

test("defaults: the diagnostic fee covers 1.5 hours and rounds up to $265", () => {
  const r = priceCall();
  close(r.diag.hours, 1.5);
  close(r.diag.cost, 169.5);
  close(r.diag.fee, 265);
  close(r.diag.profit, 95.5);
});

test("defaults: Good, Better and Best price at $745, $1,480 and $8,890", () => {
  const { good, better, best } = priceCall().tiers;
  close(good.hours, 2.25);
  close(good.markup.markup, 148);
  close(good.price, 745);
  close(good.profit, 288.4);
  assert.equal(pct(good.marginPct), "38.7%");
  close(better.markup.markup, 348);
  close(better.price, 1480);
  close(better.profit, 548.35);
  close(best.markup.markup, 1900);
  close(best.price, 8890);
  close(best.reserve, 266.7);
  close(best.profit, 2434.55);
  assert.equal(pct(best.marginPct), "27.4%");
  close(good.netDue, 480);
});

test("markup tiers are marginal: no cliff at a ceiling, and the big slice earns the least", () => {
  const a = partsMarkup(500).markup;
  const b = partsMarkup(500.01).markup;
  assert.ok(b > a && b - a < 0.01);
  close(partsMarkup(0).markup, 0);
  close(partsMarkup(100).markup, 100);
  close(partsMarkup(5200).markup, 1900);
  assert.equal(partsMarkup(5200).slices.length, 4);
  assert.ok(partsMarkup(5200).effectivePct < partsMarkup(180).effectivePct);
});

test("the callback reserve is carried in the price and the profit is shown after it", () => {
  const noReserve = priceCall({ reservePct: 0 }).tiers.good;
  const withReserve = priceCall().tiers.good;
  assert.ok(withReserve.price >= noReserve.price);
  close(withReserve.reserve, withReserve.price * 0.03);
  close(withReserve.profit, withReserve.price - withReserve.cost - withReserve.reserve);
});

test("with rounding off, margin on time is hit exactly when parts are zero", () => {
  const r = priceCall({ goodParts: 0, roundTo: 0, reservePct: 0 }).tiers.good;
  close(r.marginPct, 35, 1e-9);
});

test("a bigger part never lowers the price, and rounding never takes margin down", () => {
  let last = 0;
  for (let p = 0; p <= 7000; p += 37.5) {
    const t = priceCall({ bestParts: p }).tiers.best;
    assert.ok(t.price >= last, String(p));
    assert.ok(t.price >= t.exact - 1e-9);
    last = t.price;
  }
});

test("expected call: ticket $1,832.20, profit $580.14, against $249.82 for Good alone", () => {
  const r = priceCall();
  close(r.expected.ticket, 1832.2);
  close(r.expected.profit, 580.144);
  close(r.goodOnly.ticket, 649);
  close(r.goodOnly.profit, 249.82);
  close(r.liftVsGoodOnly, 330.324);
  close(r.shiftTenToBest, 171.692);
});

test("expected profit is the weighted sum of the tiers and the declined diagnostics", () => {
  const r = priceCall();
  const hand = 0.8 * (0.5 * r.tiers.good.profit + 0.35 * r.tiers.better.profit + 0.15 * r.tiers.best.profit) + 0.2 * r.diag.profit;
  close(r.expected.profit, hand);
  close(expectedCall(r.tiers, r.diag, { good: 100, better: 0, best: 0 }, 100).profit, r.diag.profit);
});

test("the sensitivity tables rise with Best share and fall with the decline rate", () => {
  const r = priceCall();
  for (let i = 1; i < r.sensitivity.length; i++) assert.ok(r.sensitivity[i].profit > r.sensitivity[i - 1].profit);
  for (let i = 1; i < r.declineSens.length; i++) assert.ok(r.declineSens[i].profit < r.declineSens[i - 1].profit);
  assert.equal(r.sensitivity.find((x) => x.bestShare === 15).goodShare, 50);
  close(r.sensitivity.find((x) => x.bestShare === 15).profit, r.expected.profit);
  // A 100% Better mix leaves no room for Best share rows beyond 0.
  assert.deepEqual(priceCall({ mixGood: 0, mixBetter: 100, mixBest: 0 }).sensitivity.map((x) => x.bestShare), [0]);
});

test("billable hours drive the cost: counting every paid hour as billable under-prices", () => {
  assert.equal(money(priceCall({ billableHours: 2080 }).hourly.perHour), "$65.19");
  assert.equal(money(priceCall({ billableHours: 1000 }).hourly.perHour), "$135.60");
  assert.equal(priceCall({ billableHours: 2080 }).tiers.good.price, 575);
  assert.equal(priceCall({ billableHours: 1000 }).tiers.good.price, 825);
});

test("a tier order warning appears when Better costs less than Good", () => {
  assert.equal(priceCall().ordered, true);
  const r = priceCall({ betterHours: 0.5, betterParts: 0 });
  assert.equal(r.ordered, false);
  assert.match(summarize(r).text, /not in rising price order/);
});

test("price book prices each call type on the shared shop numbers", () => {
  const rows = priceBook([
    { name: "No cool", goodHours: 1.5, goodParts: 180, betterHours: 2.5, betterParts: 520, bestHours: 8, bestParts: 5200 },
    { name: "", goodHours: 1, goodParts: 0, betterHours: 2, betterParts: 150, bestHours: 6, bestParts: 3000 },
  ]);
  assert.equal(rows[0].goodPrice, 745);
  assert.equal(rows[0].bestPrice, 8890);
  assert.equal(rows[1].name, "Call type 2");
  assert.ok(rows[1].bestPrice < rows[0].bestPrice);
  assert.throws(() => priceBook([]), /at least one call type/);
});

test("CSV escapes quotes and commas and defuses spreadsheet formulas", () => {
  const rows = priceBook([{ name: '=HYPERLINK("x"),y', goodHours: 1, goodParts: 0, betterHours: 2, betterParts: 0, bestHours: 3, bestParts: 0 }]);
  const lines = toCsv(rows).trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].startsWith(`"'=HYPERLINK(""x""),y",`), lines[1]);
  assert.ok(lines[0].startsWith("Call type,Good hours"));
});

test("bad input is rejected with a message, not NaN", () => {
  assert.throws(() => priceCall({ wage: "" }), /Hourly wage/);
  assert.throws(() => priceCall({ targetMarginPct: 100 }), /under 100/);
  assert.throws(() => priceCall({ targetMarginPct: 80, reservePct: 25 }), /plus callback reserve/);
  assert.throws(() => priceCall({ billableHours: 3000 }), /more than paid/);
  assert.throws(() => priceCall({ goodHours: 0, travelHours: 0 }), /more than zero/);
  assert.throws(() => priceCall({ bestParts: -1 }), /Parts cost/);
  assert.throws(() => priceCall({ mixGood: 50, mixBetter: 50, mixBest: 15 }), /add up to 100/);
  assert.throws(() => priceCall({ declinePct: 120 }), /cannot be more than 100/);
  assert.throws(() => priceTier(100, { targetMarginPct: 30, reservePct: 0, roundTo: 5, travelHours: 0 }, 0, 0, DEFAULT_TIERS), /more than zero/);
  assert.throws(() => cleanTiers([{ upTo: 100, markupPct: 10 }, { upTo: 50, markupPct: 10 }, { upTo: null, markupPct: 5 }]), /above the one before/);
});

test("share link round-trips every field and the tiers, and ignores junk", () => {
  const inputs = { ...DEFAULTS, wage: 42, bestParts: 6100.5 };
  const tiers = [{ upTo: 150, markupPct: 90 }, { upTo: 900, markupPct: 50 }, { upTo: null, markupPct: 20 }];
  const d = decodeShare("#" + encodeShare(inputs, tiers));
  assert.deepEqual(d.inputs, inputs);
  assert.deepEqual(d.tiers, tiers);
  const bad = decodeShare("#wage=abc&bestParts=-5&evil=1&tiers=9:9,1:1,:2");
  assert.deepEqual(bad.inputs, {});
  assert.equal(bad.tiers, null);
  assert.deepEqual(decodeShare(undefined), { inputs: {}, tiers: null });
});

test("summary names the three prices, the expected call and the mix lift", () => {
  const s = summarize(priceCall());
  assert.equal(s.status, "ok");
  for (const t of ["$113.00 per billable hour", "$265.00", "$745.00", "$1,480.00", "$8,890.00", "$1,832.20", "$580.14", "$330.32", "$171.69"]) assert.ok(s.text.includes(t), t);
});

test("default tiers are the documented ones", () => {
  assert.deepEqual(DEFAULT_TIERS.map((t) => t.markupPct), [100, 60, 40, 30]);
});
