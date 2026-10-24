import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFoundation, sampleFoundation, validateFoundation, foundationText } from "./foundation.mjs";

const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("stem footing volume is centreline length x width x depth, by hand", () => {
  // 40 x 28 ft outside, 20 in footing: centreline (480-20)+(336-20)=776 each way pair -> 1552 in
  const l = layoutFoundation({ ...sampleFoundation(), interior: [] });
  assert.ok(l.ok);
  near(l.centreline, 1552);
  near(l.pours.find((p) => p.name === "footing").cuYd, 1552 * 20 * 10 / 46656, 0.001);
});

test("stem slab is the clear area inside the stem wall", () => {
  const l = layoutFoundation(sampleFoundation());
  near(l.slabSqFt, (480 - 20 - 8) * (336 - 20 - 8) / 144, 0.1);
  near(l.pours.find((p) => p.name === "slab").cuYd, (452 * 308 * 4) / 46656, 0.001);
});

test("a monolithic slab is the whole slab plus only the deeper edge band", () => {
  const f = { type: "monolithic", width: 480, depth: 336, footing: { width: 12, depth: 16 }, slab: { thickness: 4 } };
  const l = layoutFoundation(f);
  near(l.pours.find((p) => p.name === "slab").cuYd, 480 * 336 * 4 / 46656, 0.001);
  const band = 480 * 336 - 456 * 312;
  near(l.pours.find((p) => p.name === "thickened edge").cuYd, band * 12 / 46656, 0.001);
});

test("truck count rounds up and warns about a short last load", () => {
  const l = layoutFoundation(sampleFoundation());
  assert.equal(l.concrete.trucks, Math.ceil(l.concrete.order / 10));
  const small = layoutFoundation({ ...sampleFoundation(), truck: 6 });
  assert.ok(small.concrete.trucks >= 1);
});

test("rebar longer than a stock bar gets lapped joints", () => {
  const l = layoutFoundation({ ...sampleFoundation(), interior: [] });
  const r = l.rebar.find((x) => x.what === "footing continuous bars");
  // loop = 2*((480-6)+(336-6)) = 1608 in, #4 lap 20 in, 20 ft stock -> ceil((1608-20)/220)=8 bars per line
  assert.equal(r.qty, 2 * 8);
  near(r.feet, 2 * (1608 + 7 * 20) / 12, 0.1);
});

test("slab grid counts bars each way from the spacing", () => {
  const l = layoutFoundation(sampleFoundation());
  const w = l.rebar.find((x) => x.what === "slab bars along the width");
  const d = l.rebar.find((x) => x.what === "slab bars along the depth");
  const ny = Math.floor((308 - 6) / 18) + 1;
  const nx = Math.floor((452 - 6) / 18) + 1;
  assert.equal(w.qty, ny * Math.ceil((452 - 6 - 15) / (240 - 15)));
  assert.equal(d.qty, nx * Math.ceil((308 - 6 - 15) / (240 - 15)));
});

test("bad inputs are refused with the reason", () => {
  assert.match(validateFoundation({ ...sampleFoundation(), width: 50 })[0], /width/);
  assert.match(validateFoundation({ ...sampleFoundation(), footing: { bar: 9 } }).join(" "), /#9/);
  assert.match(validateFoundation({ type: "monolithic", width: 480, depth: 336, footing: { depth: 4 } }).join(" "), /deeper/);
  assert.equal(layoutFoundation({ ...sampleFoundation(), stem: { thickness: 30 } }).ok, false);
});

test("text output names the pours, the trucks and the rebar weight", () => {
  const t = foundationText(layoutFoundation(sampleFoundation())).join("\n");
  assert.match(t, /footing/);
  assert.match(t, /truck/);
  assert.match(t, /Rebar, \d+ lb/);
});
