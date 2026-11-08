import test from "node:test";
import assert from "node:assert/strict";
import { shrinkage, summarise, cutSize, clothUplift, notes } from "./shrink.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("one reading by hand: 50 cm marked, 47 after = 6%", () => close(shrinkage(50, 47), 0.06));
test("growth is negative", () => close(shrinkage(50, 51), -0.02));

test("average of three readings", () => {
  const s = summarise([{ before: 50, after: 47 }, { before: 50, after: 47.5 }, { before: 50, after: 46.5 }]); // 6, 5, 7 %
  close(s.mean, 0.06); close(s.min, 0.05); close(s.max, 0.07); close(s.spread, 0.02); assert.equal(s.n, 3);
});

test("cut size: 70 cm finished length at 6% shrink is 74.468... cm; ignored it ends 65.8", () => {
  const c = cutSize(70, "length", { length: 0.06, width: 0.02 });
  close(c.cut, 70 / 0.94); close(c.ifIgnored, 65.8); close(c.shortBy, 4.2);
  close(cutSize(50, "width", { length: 0.06, width: 0.02 }).cut, 50 / 0.98);
});

test("washed cut size returns the finished size", () => {
  const sh = { length: 0.07, width: 0.03 };
  close(cutSize(70, "length", sh).cut * (1 - sh.length), 70);
});

test("cloth uplift: 6% x 2% needs 1/(0.94 x 0.98) = 8.55% more", () => {
  const u = clothUplift({ length: 0.06, width: 0.02, clothPerGarment: 1.3, pricePerUnit: 5, garments: 100 });
  close(u.factor, 1 / (0.94 * 0.98)); close(u.extraPct, (1 / 0.9212 - 1) * 100);
  close(u.extraPerGarment, 1.3 * (1 / 0.9212 - 1)); close(u.extraCostRun, u.extraPerGarment * 5 * 100);
});

test("bad input is refused", () => {
  assert.throws(() => shrinkage(0, 1)); assert.throws(() => summarise([])); assert.throws(() => summarise([{ before: 50, after: 20 }]));
  assert.throws(() => cutSize(70, "diagonal", { length: 0, width: 0 }));
});

test("notes flag few, spread, big and negative", () => {
  assert.equal(notes(summarise([{ before: 50, after: 50 }]), "Length").length, 1);
  assert.ok(notes(summarise([{ before: 50, after: 46 }, { before: 50, after: 47 }, { before: 50, after: 49 }]), "Width").some(n => /differ/.test(n)));
  assert.ok(notes(summarise([{ before: 50, after: 51 }, { before: 50, after: 51 }, { before: 50, after: 51 }]), "Width").some(n => /grew/.test(n)));
});
