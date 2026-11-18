import test from "node:test";
import assert from "node:assert/strict";
import { inkTradeoff } from "./inktradeoff.mjs";
import { separate } from "./separation.mjs";
import { EXAMPLE_SUPPLIER } from "./suppliers.mjs";
import { newDesign, applyOp } from "./design.mjs";

/** Three flat colours on cream: the elbow must be at 3 inks. */
function art() {
  const w = 60, h = 40, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = [245, 240, 225];
    if (x > 5 && x < 55 && y > 4 && y < 36) c = [30, 40, 120];
    if ((x - 20) ** 2 + (y - 20) ** 2 < 100) c = [200, 30, 30];
    if (x > 40 && x < 52 && y > 10 && y < 30) c = [212, 175, 55];
    const i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
const sheet = { ...EXAMPLE_SUPPLIER, example: false };
const design = () => applyOp(newDesign({ quantity: 100, price: 50 }), { op: "add", kind: "motif", motif: "halo", method: "screen", colours: 2 });

test("fidelity improves with more inks and reaches ~0 at the true colour count", () => {
  const a = separate(art(), { colours: 2, smooth: 0 }).meanDeltaE;
  const b = separate(art(), { colours: 3, smooth: 0 }).meanDeltaE;
  assert.ok(a > 5 && b < 1, `${a} then ${b}`);
});

test("cost rises with screens and the elbow is at three inks", () => {
  const r = inkTradeoff(art(), design(), sheet, { smooth: 0 });
  assert.equal(r.recommended, 3);
  for (let i = 1; i < r.table.length; i++) assert.ok(r.table[i].landed >= r.table[i - 1].landed);
  assert.ok(r.table[0].extraCost === 0 && r.table[1].extraCost > 0);
});

test("needs a selected placement", () => {
  const d = { ...design(), selected: null };
  assert.throws(() => inkTradeoff(art(), d, sheet), /select/);
});
