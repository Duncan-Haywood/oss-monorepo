import test from "node:test";
import assert from "node:assert/strict";
import { ciede2000, parseColour, colourCheck, colourComments, direction } from "./colour.mjs";

// Sharma, Wu, Dalal 2005, supplementary test data (pairs 1-3, 7, 17-19, 25, 26, 30).
const SHARMA = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, -1, 2], [50, 0, 0], 2.3669],
  [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];
for (const [a, b, want] of SHARMA) {
  test(`CIEDE2000 ${a} vs ${b} = ${want}`, () => assert.ok(Math.abs(ciede2000(a, b) - want) < 5e-4, String(ciede2000(a, b))));
}
test("identical colours are 0 and the measure is symmetric", () => {
  assert.equal(ciede2000([40, 10, -20], [40, 10, -20]), 0);
  assert.ok(Math.abs(ciede2000([40, 10, -20], [45, 5, -10]) - ciede2000([45, 5, -10], [40, 10, -20])) < 1e-9);
});
test("parse: hex forms, lab, and plain-sentence errors", () => {
  assert.deepEqual(parseColour("#fff").lab.map(v => Math.abs(Math.round(v))), [100, 0, 0]);
  assert.ok(Math.abs(parseColour("000000").lab[0]) < 1e-9);
  assert.deepEqual(parseColour("lab: 52.1, -3.2 18.4").lab, [52.1, -3.2, 18.4]);
  assert.throws(() => parseColour("red"), /not a hex colour/);
  assert.throws(() => parseColour("lab:120,0,0"), /0 to 100/);
});
test("check: pass at the limit, fail over it, direction named, unmeasured blocks approval", () => {
  const rows = [
    { name: "Burgundy", target: "lab:30,40,20", sample: "lab:30.5,40,20" },
    { name: "Gold", target: "lab:75,10,60", sample: "lab:73,10,65" },
    { name: "Cream", target: "lab:90,2,12", sample: "" },
  ];
  const c = colourCheck(rows, { limit: 2 });
  assert.equal(c.rows[0].verdict, "pass");
  assert.equal(c.rows[1].verdict, "fail");
  assert.deepEqual(c.rows[1].direction, ["2 darker", "5 yellower"]);
  assert.equal(c.rows[2].verdict, "not measured");
  assert.equal(c.approved, false);
  assert.match(c.summary, /1 of 2 colours over/);
  assert.match(colourComments(c), /Gold: ΔE .* \(sample is 2 darker, 5 yellower than the target\)/);
});
test("check: all measured and inside the limit is approved; mixed forms and bad limit refused", () => {
  const ok = colourCheck([{ name: "Navy", target: "#1f2a44", sample: "#1f2a44" }]);
  assert.equal(ok.approved, true);
  assert.equal(ok.rows[0].screenOnly, true);
  assert.match(colourComments(ok), /approved/);
  assert.throws(() => colourCheck([{ target: "#fff", sample: "lab:90,0,0" }]), /same form/);
  assert.throws(() => colourCheck([{ target: "#fff", sample: "#fff" }], { limit: 0 }), /limit/);
  assert.throws(() => colourCheck([]), /at least one/);
  assert.deepEqual(direction([50, 0, 0], [50.2, 0.1, 0]), []);
});
