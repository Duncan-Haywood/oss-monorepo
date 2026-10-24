// node --test research/civ-levers/app/tests/model.test.mjs
// Checks the browser port against vectors written by the Python model (hk_testvectors.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apply, hkRun, ladderPositions, measures, polarizedSociety, rng, step } from "../model.js";

const V = JSON.parse(readFileSync(new URL("./hk_testvectors.json", import.meta.url)));

test("Hegselmann-Krause matches the Python model", () => {
  for (const c of V.hk) {
    const y = hkRun(c.x, c.eps);
    y.forEach((v, i) => assert.ok(Math.abs(v - c.y[i]) < 1e-9, `eps ${c.eps} agent ${i}`));
  }
});

test("ladder positions match the Python model", () => {
  for (const [eps, want] of Object.entries(V.ladder)) {
    const got = ladderPositions(Number(eps));
    assert.equal(got.length, want.length);
    got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-12));
  }
});

test("network has the requested size and cross-camp share", () => {
  const s = polarizedSociety({ seed: 3 });
  assert.equal(s.edges.length, 5000);
  const cross = s.edges.filter(([a, b]) => s.group[a] !== s.group[b]).length / s.edges.length;
  assert.ok(Math.abs(cross - 0.05) < 0.005);
});

function finish(lever, dose, eps, tau, seed) {
  const { soc, kw } = apply(lever, dose, eps, seed);
  const r = rng(seed + 99);
  for (let t = 0; t < 400; t++) step(soc, r, { ...kw, tau });
  return measures(soc);
}

test("headline cases agree with the Python sweep", () => {
  // results.txt: bridging 25% at eps 0.3 is harmless without repulsion, extreme with tau 0.7
  assert.equal(finish("bridge", 0.25, 0.3, Infinity, 1).extreme, 0);
  assert.ok(finish("bridge", 0.25, 0.3, 0.7, 1).extreme > 0.9);
  // a moderate broadcast at 10% merges the camps at eps 0.3
  assert.ok(finish("broadcast", 0.1, 0.3, Infinity, 1).gap < 0.05);
  // with no lever and no repulsion the camps stay about 0.6 apart
  assert.ok(Math.abs(finish("none", 0, 0.3, Infinity, 1).gap - 0.6) < 0.05);
});
