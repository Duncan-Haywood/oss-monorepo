import test from "node:test";
import assert from "node:assert/strict";
import { gsmFromOzYd2, ozYd2FromGsm, metresPerKg, convertPrice, orderFromGarments, notes } from "./gsm.mjs";
const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("180 gsm at 150 cm: 0.27 kg a metre, 3.7037 m a kilo (hand sum)", () => {
  close(metresPerKg(180, 150), 1000 / 270);
  const c = convertPrice({ gsm: 180, widthCm: 150, perKg: 10 });
  close(c.kgPerMetre, 0.27); close(c.perMetre, 2.7);
});
test("price round trip", () => {
  const a = convertPrice({ gsm: 220, widthCm: 160, perMetre: 4.4 });
  close(convertPrice({ gsm: 220, widthCm: 160, perKg: a.perKg }).perMetre, 4.4);
});
test("oz per square yard: 1 oz/yd2 = 33.9057 gsm; round trip", () => {
  close(gsmFromOzYd2(1), 33.9057); close(ozYd2FromGsm(gsmFromOzYd2(6)), 6);
});
test("order: 300 tees at 1.3 m, 180 gsm x 150 cm = 105.3 kg; 120 kg minimum rounds up", () => {
  const o = orderFromGarments({ gsm: 180, widthCm: 150, garments: 300, metresPerGarment: 1.3, pricePerKg: 8, minKg: 120 });
  close(o.metres, 390); close(o.kg, 105.3); close(o.kgBought, 120); close(o.surplusKg, 14.7);
  close(o.cost, 960); close(o.costPerGarment, 3.2); close(o.garmentsFromBought, 120 * (1000 / 270) / 1.3);
  const no = orderFromGarments({ gsm: 180, widthCm: 150, garments: 300, metresPerGarment: 1.3, pricePerKg: 8 });
  close(no.surplusKg, 0); close(no.costPerGarment, 105.3 * 8 / 300);
});
test("bad input refused; notes flag light, heavy, narrow", () => {
  assert.throws(() => metresPerKg(0, 150)); assert.throws(() => convertPrice({ gsm: 180, widthCm: 150 }));
  assert.throws(() => orderFromGarments({ gsm: 180, widthCm: 150, garments: 0, metresPerGarment: 1 }));
  assert.equal(notes({ gsm: 100, widthCm: 80 }).length, 2); assert.equal(notes({ gsm: 400, widthCm: 150 }).length, 1);
  assert.equal(notes({ gsm: 180, widthCm: 150 }).length, 0);
});
