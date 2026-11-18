import test from "node:test";
import assert from "node:assert/strict";
import { euVatCheck, COUNTRIES, THRESHOLD_EUR } from "./eutax.mjs";

test("cross-border sales count, home sales do not", () => {
  const r = euVatCheck({ home: "DE", rows: [{ country: "DE", netSalesEur: 50000 }, { country: "FR", netSalesEur: 6000 }, { country: "IT", netSalesEur: 3000 }] });
  assert.equal(r.crossBorderEur, 9000);
  assert.equal(r.status, "near");
  assert.equal(r.summary.registerInOss, false);
  assert.equal(r.summary.destVatEur, 0);
});
test("the line is 10,000: exactly 10,000 is not over, one cent more is", () => {
  assert.equal(THRESHOLD_EUR, 10000);
  assert.equal(euVatCheck({ home: "DE", rows: [{ country: "FR", netSalesEur: 10000 }] }).status, "near");
  assert.equal(euVatCheck({ home: "DE", rows: [{ country: "FR", netSalesEur: 10000.01 }] }).status, "over");
});
test("VAT at destination rates applies only to the part above the line, shared by sales", () => {
  // 15,000 across FR (20%) and IT (22%) in 2:1 -> 5,000 above the line; share 1/3 of each country.
  const r = euVatCheck({ home: "DE", rows: [{ country: "FR", netSalesEur: 10000 }, { country: "IT", netSalesEur: 5000 }] });
  const fr = r.rows[0], it = r.rows[1];
  assert.equal(fr.destSales, 3333.33); assert.equal(it.destSales, 1666.67);
  // dest VAT: 3333.33*0.20 + 1666.67*0.22 = 666.67 + 366.67 ; home VAT on the rest at 19%
  assert.equal(r.summary.destVatEur, 1033.34);
  assert.equal(r.summary.homeVatOnCrossEur, r2(6666.67 * 0.19 + 3333.33 * 0.19));
});
const r2 = n => Math.round(n * 100) / 100;
test("a prior year over the line puts every cross-border sale at destination rates", () => {
  const r = euVatCheck({ home: "NL", priorYearEur: 12000, rows: [{ country: "SE", netSalesEur: 1000 }] });
  assert.equal(r.status, "over");
  assert.equal(r.rows[0].destSales, 1000);
  assert.equal(r.summary.destVatEur, 250);
});
test("planned sales warn before the crossing; what you keep per 100 shelf euros falls", () => {
  const r = euVatCheck({ home: "DE", rows: [{ country: "HU", netSalesEur: 6000, plannedEur: 6000 }] });
  assert.equal(r.status, "will-cross");
  const o = euVatCheck({ home: "DE", rows: [{ country: "HU", netSalesEur: 20000 }] }).rows[0];
  assert.equal(o.rateGapPts, 8);
  assert.equal(o.keepPerHundred, r2(100 * 1.19 / 1.27));
});
test("overrides, and bad input is refused with a reason", () => {
  assert.equal(euVatCheck({ home: "DE", thresholdEur: 5000, rows: [{ country: "FR", netSalesEur: 6000 }] }).status, "over");
  assert.equal(euVatCheck({ home: "DE", rows: [{ country: "IE", netSalesEur: 20000, ratePct: 0 }] }).summary.destVatEur, 0.0 + 0);
  assert.equal(euVatCheck({ home: "US", rows: [{ country: "FR", netSalesEur: 1 }] }).ok, false);
  assert.match(euVatCheck({ home: "US", rows: [] }).error, /IOSS/);
  assert.equal(euVatCheck({ home: "DE", rows: [{ country: "XX", netSalesEur: 1 }] }).ok, false);
  assert.equal(euVatCheck({ home: "DE", rows: [{ country: "FR", netSalesEur: -5 }] }).ok, false);
  assert.equal(euVatCheck({ home: "DE", rows: [] }).ok, false);
  assert.equal(euVatCheck(null).ok, false);
  assert.equal(Object.keys(COUNTRIES).length, 27);
});
