import { test } from "node:test";
import assert from "node:assert/strict";
import { calc22083, calc22087, roomForOther, demandOfOther, EXAMPLE_HOUSE, EXAMPLE_LOADS } from "./calc.mjs";
import { largestCharger } from "./report.mjs";

const house = { sqft: "2000", smallApplianceCircuits: "2", laundryCircuits: "1" };

test("220.83(A) by hand: 8 kVA at 100%, the rest at 40%", () => {
  // 2000 x 3 = 6000; 3 circuits x 1500 = 4500; appliances 12000 + 5000 + 4500 + 1200 + 4800 (20 A x 240) + 600 + 11520 (48 A x 240)
  const r = calc22083(EXAMPLE_HOUSE, EXAMPLE_LOADS);
  assert.equal(r.ok, true);
  assert.equal(r.method, "A");
  assert.equal(r.other, 6000 + 4500 + 12000 + 5000 + 4500 + 1200 + 4800 + 600 + 11520);
  assert.equal(r.totalVa, 8000 + 0.4 * (50120 - 8000));
  assert.equal(r.newVa, 11520);
});

test("below 8 kVA everything counts in full", () => {
  assert.equal(demandOfOther(7000), 7000);
  assert.equal(demandOfOther(0), 0);
  const r = calc22083({ sqft: "500", smallApplianceCircuits: "2", laundryCircuits: "0" }, []);
  assert.equal(r.totalVa, 1500 + 3000);
});

test("adding a heat pump switches to 220.83(B): larger of heating or cooling at 100%", () => {
  const loads = [
    { name: "Range", kind: "other", va: "12000" },
    { name: "Old AC", kind: "cooling", va: "4800" },
    { name: "Heat pump", kind: "heatpump", va: "5000", isNew: true },
    { name: "Strips", kind: "heating", va: "10000", isNew: true },
  ];
  const r = calc22083(house, loads);
  assert.equal(r.method, "B");
  assert.equal(r.cooling, 9800);
  assert.equal(r.heating, 15000);
  assert.equal(r.hvac, 15000);
  assert.equal(r.hvacChoice, "heating");
  const other = 6000 + 4500 + 12000;
  assert.equal(r.totalVa, 15000 + 8000 + 0.4 * (other - 8000));
});

test("in 220.83(A) an existing heat pump is one appliance, not cooling plus heating", () => {
  const r = calc22083(house, [{ name: "HP", kind: "heatpump", va: "5000" }]);
  assert.equal(r.method, "A");
  assert.equal(r.other, 6000 + 4500 + 5000);
});

test("bad inputs are named, not guessed", () => {
  const r = calc22083({ sqft: "", smallApplianceCircuits: "2", laundryCircuits: "1" }, [{ name: "Dryer", va: "" }]);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
});

test("room for more appliance load lands exactly on the service rating", () => {
  for (const sqft of ["600", "2000", "4000"]) {
    const r = calc22083({ ...house, sqft }, [{ name: "Range", kind: "other", va: "8000" }]);
    const room = roomForOther(r, 100, 240);
    const after = calc22083({ ...house, sqft }, [{ name: "Range", kind: "other", va: "8000" }, { name: "x", kind: "other", va: String(room) }]);
    assert.ok(Math.abs(after.totalVa - 24000) < 1e-6, sqft);
  }
  const small = calc22083({ sqft: "300", smallApplianceCircuits: "0", laundryCircuits: "0" }, []);
  assert.equal(roomForOther(small, 100, 240), (8000 - 900) + (24000 - 8000) / 0.4);
});

test("220.87: 125% of the peak plus the new load against the rating", () => {
  const c = calc22087(10, 9600, 100, 240);
  assert.equal(c.existingVa, 12500);
  assert.equal(c.totalVa, 22100);
  assert.equal(c.fits, true);
  assert.equal(c.roomVa, 24000 - 22100);
  assert.equal(calc22087(10, 11520, 100, 240).fits, false);
  assert.equal(calc22087(10, 0, 100, 208).capVa, 20800);
});

test("largest charger setting that fits", () => {
  assert.equal(largestCharger(11520, 240), 48);
  assert.equal(largestCharger(11519, 240), 40);
  assert.equal(largestCharger(3000, 240), 0);
  assert.equal(largestCharger(7000, 208), 32);
});
