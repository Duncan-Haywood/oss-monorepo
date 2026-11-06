import test from "node:test";
import assert from "node:assert/strict";
import { planWholesale } from "./wholesale.mjs";

test("keystone wholesale by hand", () => {
  // retail 60 incl 20% tax -> 50 net; shop keeps 50% -> wholesale 25
  const r = planWholesale({ landed: 10, price: 60, minOrderUnits: 10 });
  assert.equal(r.retailNet, 50);
  assert.equal(r.wholesale, 25);
  assert.equal(r.multipleOfLanded, 2.5);
  assert.equal(r.orderValue, 250);
  // order 250; fee 7.55; allowance 12.5; money 100*.12*60/365 = 1.9726; fixed 25
  // (250 - 7.55 - 12.5 - 1.9726 - 25)/10 - 10 = 20.2977 - 10
  assert.equal(r.wholesaleProfitPerUnit, 10.3);
  // direct: 50 - (1.8 + .3) - 10 = 37.9
  assert.equal(r.directProfitPerUnit, 37.9);
  assert.equal(r.verdict, "worth-it");
  assert.equal(r.cashTiedUp, 100);
});

test("blended profit uses the wholesale share", () => {
  const r = planWholesale({ landed: 10, price: 60, minOrderUnits: 10, wholesaleShare: 50 });
  assert.equal(r.blendedProfitPerUnit, Math.round((r.wholesaleProfitPerUnit + r.directProfitPerUnit) / 2 * 100) / 100);
});

test("thin and loss verdicts, and the price that fixes them", () => {
  const thin = planWholesale({ landed: 14, price: 48 }); // wholesale 20 = 1.43x
  assert.equal(thin.verdict, "thin");
  assert.equal(thin.retailForMultiple, 67.2); // 14*2/.5*1.2
  assert.ok(thin.notes.some((n) => n.includes("67.2")));
  assert.equal(planWholesale({ landed: 22, price: 48 }).verdict, "loses-money");
});

test("hostile input is refused, not computed", () => {
  for (const bad of [{}, { landed: "x", price: 10 }, { landed: 5, price: 0 }, { landed: 5, price: 20, shopMarginPct: 100 }, { landed: 5, price: 20, allowancePct: 100 }, { landed: -1, price: 20 }, { landed: 5, price: 20, termsDays: -3 }]) {
    assert.equal(planWholesale(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(planWholesale(null).ok, false);
});

test("zero landed cost does not divide by zero", () => {
  const r = planWholesale({ landed: 0, price: 30 });
  assert.equal(r.ok, true);
  assert.equal(r.multipleOfLanded, null);
});
