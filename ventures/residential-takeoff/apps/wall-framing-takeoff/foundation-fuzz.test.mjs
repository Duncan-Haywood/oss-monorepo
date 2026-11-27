import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleFoundation, layoutFoundation, foundationText } from "./foundation.mjs";

// Property test: random foundation inputs come back ok:false with a reason, or
// lay out with positive concrete and rebar, pours that add up to the net
// concrete, an order at least the net, trucks that carry the order, and a text
// report that does not throw.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, xs) => xs[Math.floor(rand() * xs.length)];
const between = (rand, a, b) => a + Math.floor(rand() * (b - a + 1));

test("fuzz: random foundations lay out consistently or are refused with a reason", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const f = {
      type: pick(rand, ["stem", "stem", "monolithic"]),
      width: between(rand, 100, 700), depth: between(rand, 100, 700),
      footing: { width: between(rand, 6, 66), depth: between(rand, 4, 50), bars: between(rand, 0, 9), bar: pick(rand, [3, 4, 5, 6, 7]) },
      stem: { height: between(rand, 6, 130), thickness: between(rand, 5, 20), spacing: between(rand, 6, 100), bar: pick(rand, [3, 4, 5]) },
      slab: { thickness: between(rand, 2, 13), spacing: between(rand, 5, 50), bar: pick(rand, [3, 4]) },
      waste: rand() * 0.32, truck: between(rand, 0, 13),
    };
    if (rand() < 0.5) f.interior = Array.from({ length: between(rand, 1, 3) }, () => ({ length: between(rand, 20, 500), width: between(rand, 6, 30) }));
    if (rand() < 0.4) f.footing.steps = [{ rise: between(rand, 3, 25), length: between(rand, 20, 300) }];
    if (rand() < 0.3) f.stem.walkout = { length: between(rand, 20, 400), extra: between(rand, 1, 100), ...(rand() < 0.5 ? { maxStepRise: between(rand, 4, 24) } : {}) };
    if (rand() < 0.4) f.anchorBolts = { spacing: between(rand, 10, 125), endDistance: between(rand, 3, 25) };
    if (rand() < 0.3) f.piers = [{ count: between(rand, 1, 20), pad: between(rand, 10, 60), padDepth: between(rand, 8, 24), load: between(rand, 1000, 40000) }];
    if (rand() < 0.3) f.soilBearing = between(rand, 1000, 6000);
    if (rand() < 0.3) f.cornerBars = true;
    let l;
    try { l = layoutFoundation(f); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!l.ok) { refused++; if (!l.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const net = l.pours.reduce((s, p) => s + p.cuYd, 0);
    if (!(l.concrete.net > 0)) failures.push(`seed ${seed}: no concrete`);
    if (Math.abs(net - l.concrete.net) > 0.01 * l.pours.length) failures.push(`seed ${seed}: pours ${net} != net ${l.concrete.net}`);
    if (l.concrete.order + 0.01 < l.concrete.net) failures.push(`seed ${seed}: order below net`);
    if (l.concrete.trucks * l.concrete.truck + 1e-6 < l.concrete.order) failures.push(`seed ${seed}: trucks cannot carry the order`);
    if (!(l.rebarLb >= 0) || !(l.forms.contactSqFt >= 0) || !(l.vaporBarrierSqFt > 0)) failures.push(`seed ${seed}: bad quantities`);
    try { if (!foundationText(l).length) failures.push(`seed ${seed}: empty text`); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); }
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 30 && refused > 0, `${laid} laid, ${refused} refused`);
});

test("fuzz: the sample foundation lays out", () => {
  assert.equal(layoutFoundation(sampleFoundation()).ok, true);
});
