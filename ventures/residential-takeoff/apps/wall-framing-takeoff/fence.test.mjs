import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFence, validateFence, fenceText } from "./fence.mjs";

test("one 24 ft straight run, hand count", () => {
  // 288 in / 96 = 3 bays; posts 4 (2 ends + 2 line); 3 rails x 3 bays = 9 pieces of 96 in
  const p = layoutFence({ runs: [24] });
  assert.equal(p.ok, true);
  assert.equal(p.bays, 3); assert.equal(p.posts, 4); assert.equal(p.linePosts, 2);
  assert.equal(p.railPieces, 9);
  assert.equal(p.pickets, Math.ceil(Math.ceil((288 + 0.25) / 5.75) * 1.05 - 1e-9)); // 51 -> 54
  assert.equal(p.postLength, 120); // 72 + 30 = 102 -> 120
});
test("a closed rectangle shares corners; a gate adds two posts and splits the run", () => {
  const sq = layoutFence({ runs: [16, 8, 16, 8], closed: true });
  assert.equal(sq.cornerPosts, 4); assert.equal(sq.bays, 2 + 1 + 2 + 1); assert.equal(sq.posts, 4 + 2);
  const g = layoutFence({ runs: [20], gates: [{ width: 48 }] });
  // 240 - 48 = 192 in in 2 sections of 96: 1 bay each, no line posts; 2 end + 2 gate posts
  assert.equal(g.posts, 4); assert.equal(g.bays, 2); assert.equal(g.hinges, 2);
});
test("rails of short stock carry fewer bays; concrete by volume", () => {
  const p = layoutFence({ runs: [24], fence: { railStock: 48, postSpacing: 48 } });
  assert.equal(p.railPieces, 3 * 6); // 6 bays of 48, one per board
  const c = layoutFence({ runs: [8], fence: { holeDiameter: 10, postDepth: 30 } });
  const cu = (Math.PI * 25 * 30 - 3.5 * 3.5 * 30) / 1728;
  assert.ok(Math.abs(c.concreteBagsPerPost - cu / 0.6) < 1e-9);
});
test("refusals and notes", () => {
  assert.ok(validateFence({ runs: [] }).length);
  assert.ok(validateFence({ runs: [-4] }).length);
  assert.ok(validateFence({ runs: [4], gates: [{ width: 60 }] }).length);
  assert.equal(layoutFence({ runs: [10], fence: { height: 120, postDepth: 60 } }).ok, false);
  assert.ok(layoutFence({ runs: [10], fence: { height: 96 } }).notes.some((n) => /permit/.test(n)));
  assert.ok(fenceText(layoutFence({ runs: [10], fence: { picketPrice: 2 } })).join("\n").includes("Fence cost"));
});
