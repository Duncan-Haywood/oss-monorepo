import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutStair, sampleStair, STAIR_LIMITS } from "./stairs.mjs";
import { DEPTH } from "./engine.mjs";

// Property test: a random flight is either refused with a reason or laid out with equal risers
// under the code limit that add up to the rise, treads and marks that agree, stringers no farther
// apart than asked, enough tread boards to cover the step, and a bought stringer long enough.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, a) => a[Math.floor(rand() * a.length)];
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test("fuzz: random stair flights lay out with equal legal risers and consistent stringers, treads and marks, or are refused with a reason", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const s = {
      ...sampleStair(),
      totalRise: 8 + Math.floor(rand() * 160),
      tread: rand() < 0.6 ? pick(rand, [9, 10, 10.5, 11, 12]) : undefined,
      stringer: pick(rand, ["2x10", "2x12"]),
      width: 30 + Math.floor(rand() * 100),
      stringerSpacing: pick(rand, [12, 16, 24, 36]),
      treadThickness: pick(rand, [1, 1.5]),
      treadBoard: pick(rand, ["2x6", "2x10", "2x12"]),
      nosing: pick(rand, [0, 0.75, 1, 1.5]),
      openRisers: rand() < 0.3,
    };
    if (s.tread === undefined) delete s.tread;
    if (rand() < 0.4) s.rail = { sides: pick(rand, [1, 2]), handrail: rand() < 0.5 };
    const plan = rand() < 0.5 ? { stock: [10, 12, 14, 16].map((length) => ({ size: s.stringer, length: length * 12 })) } : undefined;
    let l;
    try { l = layoutStair(s, plan); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    const bad = (m) => failures.push(`seed ${seed}: ${m}`);
    if (!l.ok) {
      refused++;
      if (!l.errors?.length) bad("refused with no reason");
      continue;
    }
    laid++;
    if (l.risers < 2 || l.treads !== l.risers - 1) bad(`risers ${l.risers} treads ${l.treads}`);
    if (!(l.riser <= STAIR_LIMITS.maxRiser + 1e-9)) bad(`riser ${l.riser} over limit`);
    if (!close(l.riser * l.risers, s.totalRise)) bad("equal risers do not add up to the rise");
    if (!(l.tread >= STAIR_LIMITS.minTread - 1e-9)) bad(`tread ${l.tread} under minimum`);
    if (!close(l.run, l.tread * l.treads)) bad("run is not tread times treads");
    if (l.marks.length !== l.risers) bad("one mark per riser");
    if (!close(l.marks.reduce((a, m) => a + m.rise, 0), l.sumRise)) bad("marks do not add up to sumRise");
    if (!close(l.sumRise, s.totalRise - s.treadThickness)) bad(`sumRise ${l.sumRise} vs rise less tread thickness`);
    if (!close(l.marks.reduce((a, m) => a + m.run, 0), l.run)) bad("mark runs do not add up to run");
    if (!(l.stringer.count >= 3)) bad(`only ${l.stringer.count} stringers`);
    if (!(l.stringer.spacing <= s.stringerSpacing + 1e-9)) bad(`stringer spacing ${l.stringer.spacing} over ${s.stringerSpacing}`);
    if (!(l.stringer.length >= l.pitch)) bad("stringer shorter than its pitch line");
    if (plan) {
      if (!l.stringerStock || !(l.stringerStock.length >= l.stringer.length - 1e-9)) bad("bought stringer too short");
    }
    if (!(l.treadBoards.coverage >= l.treadBoards.need - 1e-9)) bad("tread boards do not cover the step");
    if (l.treadBoards.count !== l.treadBoards.perStep * l.treads) bad("tread board count");
    if (!(DEPTH[s.stringer] - (l.riser * l.tread) / Math.hypot(l.riser, l.tread) >= 0 || l.notes.length)) bad("negative throat with no note");
    if (l.rail && !(l.rail.guardHeight > 0)) bad("rail without a guard height");
    if (!(l.minOpening > 0)) bad("no stairwell opening length");
  }
  assert.deepEqual(failures.slice(0, 10), []);
  assert.ok(laid > 100, `only ${laid} flights laid out (${refused} refused)`);
  assert.ok(refused > 5, `only ${refused} refusals: the generator should hit the limits too`);
});
