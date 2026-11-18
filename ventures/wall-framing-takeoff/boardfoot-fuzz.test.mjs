import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutBoardFoot, validateBoardFoot, boardFootText } from "./boardfoot.mjs";

// Property test: random lumber lists are refused with a reason, or the totals
// tie to the lines and to closed-form bounds (milled never above sold, the
// order never below the net, cost only when a line is priced).
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

test("fuzz: random board-foot lists tie out or are refused with a reason", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const lines = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => {
      const l = {
        thickness: rand() < 0.04 ? pick(rand, [0, -1, "x", 30]) : pick(rand, [1, 2, 3, 4, "4/4", "8/4", "5/4", 1.25]),
        width: rand() < 0.04 ? pick(rand, [0, 60]) : pick(rand, [2, 3, 4, 5, 6, 8, 10, 12, 7.5]),
        length: rand() < 0.04 ? pick(rand, [0, 50]) : pick(rand, [6, 8, 10, 12, 16, 2.5]),
      };
      if (rand() < 0.5) l.count = rand() < 0.04 ? pick(rand, [0, 1.5]) : pick(rand, [1, 2, 10, 250]);
      const p = rand();
      if (p < 0.2) l.pricePerBf = 3.25; else if (p < 0.35) l.pricePerPiece = 7.5; else if (p < 0.45) l.pricePerFt = 0.9;
      else if (p < 0.47) { l.pricePerBf = 2; l.pricePerPiece = 5; }
      return l;
    });
    const d = { lines };
    if (rand() < 0.5) d.basis = rand() < 0.05 ? "other" : pick(rand, ["nominal", "actual"]);
    if (rand() < 0.4) d.waste = rand() < 0.05 ? 1.5 : pick(rand, [0, 0.05, 0.15, 1]);
    let r;
    try { r = layoutBoardFoot(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    const errs = validateBoardFoot(d);
    if (!r.ok) { refused++; if (!r.errors?.length || !errs.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    if (errs.length) failures.push(`seed ${seed}: validate/layout disagree`);
    laid++;
    for (const k of ["boardFeet", "boardFeetWithWaste", "boardFeetToBuy", "cubicFeet", "milledBoardFeet"]) {
      if (!Number.isFinite(r[k]) || r[k] <= 0) failures.push(`seed ${seed}: bad ${k} ${r[k]}`);
    }
    const sum = r.lines.reduce((s, l) => s + l.bf, 0);
    if (Math.abs(sum - r.boardFeet) > 0.005 * r.lines.length + 0.005) failures.push(`seed ${seed}: lines ${sum} vs ${r.boardFeet}`);
    if (r.lines.reduce((s, l) => s + l.count, 0) !== r.pieces) failures.push(`seed ${seed}: pieces do not add`);
    if (Math.abs(r.cubicFeet - r.boardFeet / 12) > 0.01) failures.push(`seed ${seed}: cubic feet off`);
    if (r.boardFeetToBuy + 1e-9 < r.boardFeetWithWaste) failures.push(`seed ${seed}: buy below with-waste`);
    if (r.boardFeetWithWaste + 0.01 < r.boardFeet) failures.push(`seed ${seed}: with-waste below net`);
    for (const l of r.lines) {
      if (l.milledBfEach != null && l.milledBfEach > l.soldBfEach + 1e-9) failures.push(`seed ${seed}: milled above sold`);
      if (r.basis === "nominal" && Math.abs(l.bfEach - l.soldBfEach) > 1e-9) failures.push(`seed ${seed}: nominal not sold size`);
    }
    if (r.basis === "actual" && r.boardFeet > r.lines.reduce((s, l) => s + l.soldBfEach * l.count, 0) + 0.01) failures.push(`seed ${seed}: actual above sold`);
    const priced = lines.some((l) => l.pricePerBf != null || l.pricePerPiece != null || l.pricePerFt != null);
    if (!priced && r.cost !== null) failures.push(`seed ${seed}: cost without price`);
    if (priced && !(r.cost >= 0)) failures.push(`seed ${seed}: priced but no cost`);
    try { if (boardFootText(r).length < 1) failures.push(`seed ${seed}: empty text`); } catch (e) { failures.push(`seed ${seed}: text threw ${e.message}`); }
  }
  assert.deepEqual(failures, []);
  assert.ok(laid >= 50, `only ${laid} laid out (${refused} refused)`);
  assert.ok(refused >= 10, `only ${refused} refused`);
});
