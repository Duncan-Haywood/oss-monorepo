import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutDormer, validateDormer } from "./dormer.mjs";

const base = { width: 96, eaveHeight: 48, pitch: 8, mainPitch: 8 };
const get = (r, part) => r.parts.filter((p) => p.part === part);
const r16 = (n) => Math.round(n * 16) / 16;

test("geometry by hand: 8 ft wide, 4 ft eave, 8:12 on 8:12", () => {
  const r = layoutDormer(base);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.geometry.rise, 32);
  assert.equal(r.geometry.cheekRunToEave, 72); // 48 x 12 / 8
  assert.equal(r.geometry.ridgeLength, 120); // (48 + 32) x 12 / 8
  assert.equal(r.geometry.valleyLength, r16(Math.sqrt(48 * 48 + 48 * 48 + 32 * 32)));
  assert.equal(r.geometry.commonLength, r16(48 * Math.sqrt(1 + (8 / 12) ** 2)));
});

test("cheek studs fall with the main slope and stop where they reach nothing", () => {
  const r = layoutDormer(base);
  const lens = get(r, "cheek stud").map((p) => p.length).sort((a, b) => b - a);
  // x = 16: 48 - 10.667 - 4.5 = 32.83; 32: 22.17; 48: 11.5; 64: 0.83 (< 3, dropped)
  assert.deepEqual(lens, [r16(48 - 16 * 8 / 12 - 4.5), r16(48 - 32 * 8 / 12 - 4.5), 11.5]);
  assert.equal(r.counts.cheekStuds, 6);
});

test("commons while the eave is clear, valley jacks after", () => {
  const r = layoutDormer(base);
  assert.equal(r.counts.commons, 10); // stations 0..64 (x <= 72), two sides
  assert.equal(r.counts.jacks, 6); // 80, 96, 112
  const jacks = get(r, "valley jack").map((p) => p.length).sort((a, b) => b - a);
  const k = Math.sqrt(1 + (8 / 12) ** 2);
  assert.deepEqual(jacks, [r16(40 * k), r16(24 * k), r16(8 * k)]);
});

test("areas: plan 2(48x72 + 48x48/2)/144, sloped", () => {
  const r = layoutDormer(base);
  const plan = 2 * (48 * 72 + 48 * 48 / 2) / 144;
  assert.equal(r.areas.roofSqFt, Math.round(plan * Math.sqrt(1 + (8 / 12) ** 2) * 10) / 10);
});

test("a window replaces layout studs with kings, jacks, header and sill", () => {
  const r = layoutDormer({ ...base, window: { width: 36, height: 24, sill: 12 } });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(get(r, "king stud")[0].count, 2);
  assert.equal(get(r, "window header (2 plies)")[0].count, 2);
});

test("bad dimensions are refused", () => {
  assert.ok(validateDormer({ ...base, width: 10 }).length);
  assert.ok(validateDormer({ ...base, spacing: 20 }).length);
  assert.equal(layoutDormer({ ...base, pitch: 30 }).ok, false);
});
