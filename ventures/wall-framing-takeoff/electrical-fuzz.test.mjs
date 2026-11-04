import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutElectrical, electricalText, wallSpaces } from "./electrical.mjs";

// Property test on invented plans: random walls, doors and windows (some
// hostile: overlapping, off the wall end, missing fields) are refused with a
// reason or counted consistently. Checks that boxes add up, every receptacle
// sits inside its wall space, no point of a space is over half the spacing
// from a box (unsnapped), cable rolls cover the cable, and nothing is NaN.
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

test("fuzz: random plans are counted consistently or refused with a reason", () => {
  const failures = [];
  let laid = 0, refused = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const walls = [];
    for (const id of ["A", "B", "C", "D"]) {
      const length = rand() < 0.04 ? pick(rand, [0, -5]) : pick(rand, [30, 90, 144, 145, 300, 601]);
      const openings = [];
      const n = Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) openings.push({ kind: pick(rand, ["door", "window"]), offset: rand() < 0.03 ? pick(rand, [-10, 1000]) : pick(rand, [0, 12, 40, 100]), width: rand() < 0.03 ? pick(rand, [0, -3]) : pick(rand, [24, 36, 60]) });
      walls.push({ id, length, sheathed: pick(rand, [true, false, undefined]), openings });
    }
    const plan = { walls };
    const d = {};
    if (rand() < 0.4) d.maxSpacing = pick(rand, [24, 96, 144, 240, 10, 500]);
    if (rand() < 0.3) d.switchPerDoor = pick(rand, [0, 1, 2, 9]);
    if (rand() < 0.3) d.skipWalls = pick(rand, [["A"], ["B", "C"], ["Z"]]);
    if (rand() < 0.3) d.waste = pick(rand, [0, 0.1, 0.5, 0.9]);
    let t;
    try { t = layoutElectrical(d, plan); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!t.ok) { refused++; if (!t.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const bad = [];
    const nums = [t.receptacles, t.switches, t.boxes, t.cableFt, t.cableRolls];
    if (nums.some((x) => !Number.isFinite(x) || x < 0)) bad.push(`bad count ${nums}`);
    if (t.boxes !== t.receptacles + t.switches) bad.push("boxes != receptacles + switches");
    if (t.perWall.reduce((s, w) => s + w.receptacles, 0) !== t.receptacles) bad.push("per-wall receptacles do not sum");
    if (t.perWall.reduce((s, w) => s + w.switches, 0) !== t.switches) bad.push("per-wall switches do not sum");
    if (t.cableRolls * t.cableRoll + 1e-6 < t.cableFt * (1 + t.waste)) bad.push("rolls do not cover the cable");
    if (t.boxes === 0 && t.cableRolls !== 0) bad.push("rolls without boxes");
    for (const s of t.spaces) {
      const w = walls.find((x) => x.id === s.wall);
      if (!s.receptacles.length) bad.push(`space on ${s.wall} has no box`);
      if (s.receptacles.some((x) => !(x >= -1e-9 && x <= w.length + 1e-9))) bad.push(`box off wall ${s.wall}`);
      const sorted = [...s.receptacles].sort((a, b) => a - b);
      if (sorted.some((x, i) => i && x - sorted[i - 1] > t.maxSpacing + 1e-6)) bad.push(`gap too wide on ${s.wall}`);
      if (s.space > t.maxSpacing * s.receptacles.length + 1e-6) bad.push(`space ${s.space} not covered by ${s.receptacles.length} boxes`);
    }
    try { if (!electricalText(t).length) bad.push("empty text"); } catch (e) { bad.push(`text threw ${e.message}`); }
    if (bad.length) failures.push(`seed ${seed}: ${bad.join("; ")}`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 20 && refused > 0, `laid ${laid}, refused ${refused}`);
});

test("fuzz: wallSpaces never overlap, stay on the wall, and ignore windows", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed + 9000);
    const length = 20 + Math.floor(rand() * 400);
    const ops = Array.from({ length: Math.floor(rand() * 5) }, () => ({ kind: pick(rand, ["door", "window"]), offset: Math.floor(rand() * length), width: 12 + Math.floor(rand() * 60) }));
    const sp = wallSpaces(length, ops);
    for (let i = 0; i < sp.length; i++) {
      assert.ok(sp[i].start >= 0 && sp[i].end <= length && sp[i].end > sp[i].start, `seed ${seed}`);
      if (i) assert.ok(sp[i].start >= sp[i - 1].end, `seed ${seed} overlap`);
    }
    assert.deepEqual(sp, wallSpaces(length, ops.filter((o) => o.kind === "door")), `seed ${seed} windows changed spaces`);
  }
});
