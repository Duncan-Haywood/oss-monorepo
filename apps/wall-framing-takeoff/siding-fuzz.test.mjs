import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutSiding, sidingText } from "./siding.mjs";

// Property test: random walls, openings and siding settings are refused with a
// reason, or give counts that cover their own runs, wrap and corner boards,
// with no NaN, no negative quantity, and more waste never giving fewer boards.
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

function randomWall(rand, i) {
  const length = pick(rand, [96, 144, 240, 360, 480]);
  const w = { id: `W${i}`, length };
  if (rand() < 0.15) w.sheathed = false;
  if (rand() < 0.3) w.gable = { pitch: pick(rand, [4, 6, 8, 12]), ...(rand() < 0.4 ? { peak: Math.round(length * pick(rand, [0.3, 0.5, 0.7])) } : {}) };
  // non-overlapping openings: walk left to right
  const ops = [];
  let x = pick(rand, [6, 20, 40]);
  while (rand() < 0.7 && ops.length < 4) {
    const width = pick(rand, [24, 36, 48, 72]);
    if (x + width > length - 6) break;
    const door = rand() < 0.3;
    ops.push({ kind: door ? "door" : "window", offset: x, width, height: door ? 80 : pick(rand, [24, 36, 48]), ...(door ? {} : { headerHeight: pick(rand, [72, 82]) }) });
    x += width + pick(rand, [6, 24, 60]);
  }
  w.openings = ops;
  return w;
}

test("fuzz: random walls and siding settings are refused with a reason or add up", () => {
  let laid = 0, refused = 0, vertical = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const walls = Array.from({ length: 1 + Math.floor(rand() * 4) }, (_, i) => randomWall(rand, i));
    const plan = { studLength: pick(rand, [92.625, 104.625]), defaultHeaderHeight: 82, walls };
    const style = rand() < 0.35 ? "vertical" : "lap";
    const d = {
      style,
      exposure: pick(rand, [4, 6, 7, 8]),
      stock: pick(rand, [96, 144, 192, 240]),
      waste: pick(rand, [0, 0.05, 0.1, 0.2]),
      corners: pick(rand, [0, 4, 6]),
      boardWidth: pick(rand, [8, 11.25, 12]),
      battens: style === "vertical" && rand() < 0.5,
      openingTrim: rand() < 0.4,
      starter: style === "lap" && rand() < 0.4,
      headFlashing: rand() < 0.4,
      openingTape: rand() < 0.4,
      boardPrice: pick(rand, [undefined, 12.5]),
      wrapPrice: pick(rand, [undefined, 120]),
    };
    let s;
    try { s = layoutSiding(d, plan); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!s.ok) { refused++; if (!s.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    if (style === "vertical") vertical++;
    const eps = 1e-6;
    const nums = { boards: s.boards, courses: s.courses, runFeet: s.runFeet, netSqFt: s.netSqFt, openingSqFt: s.openingSqFt, wrapSqFt: s.wrapSqFt, wrapRolls: s.wrapRolls, cornerBoards: s.cornerBoards };
    for (const [k, v] of Object.entries(nums)) if (!Number.isFinite(v) || v < 0) failures.push(`seed ${seed}: ${k} is ${v}`);
    if (s.netSqFt < -eps) failures.push(`seed ${seed}: negative net area`);
    if (s.boards * s.stock + eps < s.runFeet * 12) failures.push(`seed ${seed}: boards cannot hold the runs`);
    if (s.wrapRolls * s.wrapRollSqFt + eps < s.wrapSqFt) failures.push(`seed ${seed}: wrap rolls short`);
    if (s.wrapRolls < 1 && s.wrapSqFt > eps) failures.push(`seed ${seed}: no wrap rolls for wrap area`);
    if (d.corners > 0 && s.cornerBoards * s.cornerStock + eps < 2 * d.corners * s.height) failures.push(`seed ${seed}: corner boards short`);
    if (d.corners === 0 && s.cornerBoards !== 0) failures.push(`seed ${seed}: corner boards with no corners`);
    if (s.cost != null && !(s.cost >= 0 && Number.isFinite(s.cost))) failures.push(`seed ${seed}: bad cost ${s.cost}`);
    if (style === "vertical" && s.starter) failures.push(`seed ${seed}: starter on vertical siding`);
    if (!d.battens && s.battens) failures.push(`seed ${seed}: battens not asked for`);
    if (!d.openingTrim && s.trim) failures.push(`seed ${seed}: trim not asked for`);
    if (sidingText(s).length < 3) failures.push(`seed ${seed}: text too short`);
    // more waste never gives fewer boards
    const more = layoutSiding({ ...d, waste: Math.min(0.3, (d.waste ?? 0.1) + 0.1) }, plan);
    if (more.ok && more.boards < s.boards) failures.push(`seed ${seed}: more waste gave fewer boards`);
  }
  assert.deepEqual(failures, []);
  assert.ok(laid > 100, `laid ${laid}`);
  assert.ok(vertical > 20, `vertical ${vertical}`);
});
