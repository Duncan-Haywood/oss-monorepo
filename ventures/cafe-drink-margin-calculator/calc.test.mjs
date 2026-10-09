import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, drinkEconomics, parseInputs, priceForTarget, toCsv, SHARED_DEFAULTS, ROWS, money, money2 } from "./calc.mjs";

const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const base = () => ({ ...SHARED_DEFAULTS });

test("a latte's cost is built from beans, milk, cup, card fee and make time", () => {
  const a = analyze(base());
  assert.equal(a.ok, true);
  const l = a.rows[1];
  near(l.beansCost, 18 * (14 / 453.592) * 1.08);
  near(l.milkCost, 10 * (4.5 / 128) * 1.08);
  near(l.card, 5.25 * 0.026 + 0.1);
  near(l.labor, (75 / 3600) * 17 * 1.12);
  near(l.contribution, 5.25 - l.beansCost - l.milkCost - 0.26 - l.card - l.labor);
  near(l.margin, l.contribution / 5.25, 1e-9);
});

test("a drink priced at the target-margin price earns exactly the target", () => {
  const v = parseInputs(base(), []);
  for (const r of v.rows) {
    const p = priceForTarget(v, r);
    const e = drinkEconomics(v, { ...r, price: p });
    near(e.margin, v.target / 100, 1e-9);
  }
});

test("make time drives per-barista-hour value: drip beats a flavored latte", () => {
  const a = analyze(base());
  assert.equal(a.bestPerHour.name, "Drip coffee 12 oz");
  assert.equal(a.worstPerHour.name, "Flavored latte 16 oz");
});

test("break-even drinks is the smallest count whose contribution covers a day of fixed cost", () => {
  const a = analyze(base());
  assert.ok(a.breakEvenDrinks * a.avgContribution >= a.totals.fixedDay);
  assert.ok((a.breakEvenDrinks - 1) * a.avgContribution < a.totals.fixedDay);
});

test("monthly profit equals daily profit times days open", () => {
  const a = analyze(base());
  near(a.totals.profitMonth, a.totals.profitDay * 30, 1e-6);
});

test("scenarios move profit in the expected direction", () => {
  const a = analyze(base());
  const by = Object.fromEntries(a.scenarios.map((s) => [s.label, s.change]));
  assert.ok(by["Milk costs 20% more"] < 0);
  assert.ok(by["Beans cost 25% more"] < 0);
  assert.ok(by["Wage up $2 an hour"] < 0);
  assert.ok(by["Every price up $0.25"] > 0);
});

test("alternative milk surcharge covers the extra milk cost and the card fee on it", () => {
  const a = analyze(base());
  near(a.alt.surcharge * (1 - 0.026), a.alt.delta, 1e-9);
  const cheaper = analyze({ ...base(), altMilkGal: "2" });
  assert.equal(cheaper.alt.surcharge, 0);
});

test("empty rows are skipped; bad numbers are reported by name", () => {
  const input = base();
  for (const f of ["name", "price", "beans", "milk", "flavor", "pack", "secs", "perDay"]) input[`${f}5`] = "";
  assert.equal(analyze(input).rows.length, 4);
  const bad = analyze({ ...base(), price2: "abc" });
  assert.equal(bad.ok, false);
  assert.match(bad.warnings.join(" "), /Latte 12 oz: price/);
  const none = analyze(Object.fromEntries(Object.keys(base()).map((k) => [k, ""])));
  assert.equal(none.ok, false);
});

test("a cafe that cannot cover fixed costs is told so, and has no break-even if contribution is negative", () => {
  const a = analyze({ ...base(), fixedMonth: "40000" });
  assert.ok(a.totals.profitDay < 0);
  assert.match(a.warnings.join(" "), /loses money/);
  const neg = analyze({ ...base(), wage: "100", price1: "0.50", price2: "0.50", price3: "0.50", price4: "0.50", price5: "0.50" });
  assert.equal(neg.breakEvenDrinks, null);
});

test("target price is null when card fees plus target leave no room", () => {
  const v = parseInputs({ ...base(), target: "95", cardPct: "10" }, []);
  assert.equal(priceForTarget(v, v.rows[0]), null);
});

test("CSV has a header, one row per drink, and quotes commas", () => {
  const input = { ...base(), name1: 'Mocha, "large"' };
  const csv = toCsv(analyze(input));
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 1 + ROWS);
  assert.match(lines[1], /^"Mocha, ""large"""/);
});

test("money formatters", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(money2(3.456), "$3.46");
});
