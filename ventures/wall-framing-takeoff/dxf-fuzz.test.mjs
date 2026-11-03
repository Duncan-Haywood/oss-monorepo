import { test } from "node:test";
import assert from "node:assert/strict";
import { planFromDxf } from "./dxf.mjs";
import { takeoff } from "./engine.mjs";

// Property test: random drawings (loose lines on wall, door and window layers,
// random units, some lines mangled or cut off) never throw. A read either is
// refused with a reason or yields walls with finite positive lengths, openings
// inside their wall, and a plan the takeoff engine accepts without throwing.
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
const g = (c, v) => `${c}\n${v}\n`;

function drawing(rand) {
  const units = pick(rand, [0, 1, 2, 4, 5, 6]);
  let s = g(0, "SECTION") + g(2, "HEADER") + g(9, "$INSUNITS") + g(70, units) + g(0, "ENDSEC") + g(0, "SECTION") + g(2, "ENTITIES");
  const w = pick(rand, [120, 240, 480, 960, 24, 5]), d = pick(rand, [96, 240, 336, 600, 18]);
  const rect = [[0, 0, w, 0], [w, 0, w, d], [w, d, 0, d], [0, d, 0, 0]];
  const lines = [];
  for (const [x1, y1, x2, y2] of rect) lines.push(["A-WALL", x1, y1, x2, y2]);
  const extra = Math.floor(rand() * 8);
  for (let i = 0; i < extra; i++) {
    const layer = pick(rand, ["A-WALL", "A-WALL", "A-DOOR", "A-GLAZ-WINDOW", "NOTES"]);
    const x = Math.round(rand() * w * 100) / 100, y = Math.round(rand() * d * 100) / 100;
    lines.push([layer, x, y, rand() < 0.5 ? x + Math.round(rand() * 80) : x, rand() < 0.5 ? y : y + Math.round(rand() * 80)]);
  }
  for (const [layer, x1, y1, x2, y2] of lines) {
    s += g(0, "LINE") + g(8, layer) + g(10, x1) + g(20, y1) + g(30, 0) + g(11, x2) + g(21, y2) + g(31, 0);
  }
  s += g(0, "ENDSEC") + g(0, "EOF");
  const mangle = rand();
  if (mangle < 0.1) s = s.slice(0, Math.floor(rand() * s.length));
  else if (mangle < 0.2) s = s.replace(/\n(\d+)\n/, "\nxx\n");
  else if (mangle < 0.25) s = s.replace(/10\n[^\n]*\n/, "10\nNaN\n");
  return s;
}

test("fuzz: random DXF text never throws and a read plan runs the takeoff", () => {
  let ok = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const text = drawing(rand);
    let r;
    try { r = planFromDxf(text); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!r.ok) { refused++; if (!r.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    ok++;
    for (const wall of r.plan.walls) {
      if (!Number.isFinite(wall.length) || wall.length <= 0) failures.push(`seed ${seed}: bad length ${wall.length}`);
      for (const o of wall.openings ?? []) {
        if (!(o.offset >= -1e-6) || !(o.width > 0) || o.offset + o.width > wall.length + 1e-6) failures.push(`seed ${seed}: opening outside wall ${wall.length}: ${o.offset}+${o.width}`);
      }
    }
    try { takeoff(r.plan); } catch (e) { failures.push(`seed ${seed}: takeoff threw ${e.message}`); }
  }
  assert.deepEqual(failures.slice(0, 10), []);
  assert.ok(ok > 100 && refused > 5, `read ${ok}, refused ${refused}`);
});
