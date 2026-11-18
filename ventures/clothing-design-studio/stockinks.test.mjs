import test from "node:test";
import assert from "node:assert/strict";
import { separate } from "./separation.mjs";
import { parseStockList, nearestStock, assignToScreens, chooseStockInks, stockBrief, STARTER_STOCK } from "./stockinks.mjs";

function img(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; }
  return { data, width: w, height: h };
}

test("a pasted stock list: names and colours in either order, hex or RGB, bad lines reported", () => {
  const { inks, errors } = parseStockList("Kelly green, #00863D\n#f00 Red\nNavy\t1d2948\nGold 245 179 0\n# a comment\n\nRed 185\nBad 300 2 2\nDup #FF0000");
  assert.deepEqual(inks, [{ name: "Kelly green", hex: "#00863d" }, { name: "Red", hex: "#ff0000" }, { name: "Navy", hex: "#1d2948" }, { name: "Gold", hex: "#f5b300" }]);
  assert.deepEqual(errors.map(e => e.line), [7, 8], "three bare digits are not a colour; RGB over 255 is refused");
});

test("the starter shelf parses back from its own text and has no repeated colours", () => {
  const text = STARTER_STOCK.map(s => `${s.name}, ${s.hex}`).join("\n");
  assert.deepEqual(parseStockList(text).inks, STARTER_STOCK);
});

test("nearest stock inks never repeat, and screens keep the order of the flat inks they replace", () => {
  const stock = ["#000000", "#ff0000", "#0000ff", "#ffff00"];
  const n = nearestStock(["#e01010", "#d02020"], stock);
  assert.equal(new Set(n).size, 2);
  assert.ok(n.includes(1), "red goes to one of the reds");
  assert.deepEqual(assignToScreens(["#0000f0", "#f00000", "#101010"], stock, [0, 1, 2]), [2, 1, 0]);
});

test("a stock pick on a two-colour image beats or ties the pick by eye, uses only stock inks, and says which screen gets which", () => {
  // a red-to-blue ramp on white: the flat inks are mid-tones; a stock with pure red and blue should do at least as well as nearest
  const im = img(60, 30, x => { const t = x / 59; return [Math.round(220 * (1 - t) + 20 * t), 30, Math.round(30 * (1 - t) + 200 * t)]; });
  const base = separate(im, { colours: 2, garment: "#ffffff", widthCm: 10 });
  const pick = chooseStockInks(im, base, STARTER_STOCK, { metres: 1, samples: 300 });
  assert.equal(pick.inks.length, 2);
  for (const h of pick.inks) assert.ok(STARTER_STOCK.some(s => s.hex === h), `${h} is on the shelf`);
  assert.ok(pick.candidates.every(c => c.deltaE >= Math.min(...pick.candidates.map(x => x.deltaE))));
  assert.ok(pick.gain >= 0, "never worse than nearest stock");
  assert.equal(pick.idx.palette.slice(0, 2).join(), pick.inks.join(), "the winning separation dots with these inks");
  const brief = stockBrief(pick, base);
  assert.match(brief, /Screen 1: .+ \(#[0-9a-f]{6}\), in place of flat colour #[0-9a-f]{6}/);
});

test("too short a stock list is refused with a reason", () => {
  const im = img(20, 20, x => (x < 10 ? [200, 0, 0] : [0, 0, 200]));
  const base = separate(im, { colours: 2, garment: "#ffffff", widthCm: 5 });
  assert.throws(() => chooseStockInks(im, base, [{ name: "Black", hex: "#000000" }]), /needs 2/);
});
