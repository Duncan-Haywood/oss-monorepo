import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutFence, fenceText } from "./fence.mjs";

// Property test: random fences are refused with a reason, or the counts add up:
// bays no wider than the post spacing, posts = corners + line + gate posts, pickets
// cover the fence plus the gate leaves, concrete covers every hole, and the text renders.
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

test("fuzz: random fences add up or are refused with a reason", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const n = 1 + Math.floor(rand() * 6);
    const d = { runs: Array.from({ length: n }, () => 4 + Math.floor(rand() * 60)), fence: {} };
    if (n >= 3 && rand() < 0.4) d.closed = true;
    if (rand() < 0.7) d.fence.height = pick(rand, [36, 48, 60, 72, 84, 96]);
    if (rand() < 0.5) d.fence.postSpacing = pick(rand, [48, 72, 96, 120]);
    if (rand() < 0.5) d.fence.railCount = pick(rand, [1, 2, 3, 4]);
    if (rand() < 0.3) d.fence.postDepth = pick(rand, [24, 30, 36, 48]);
    if (rand() < 0.3) d.fence.waste = pick(rand, [0, 0.05, 0.15]);
    const gates = [];
    for (let g = Math.floor(rand() * 3); g > 0; g--) gates.push({ width: pick(rand, [36, 48, 96]), run: Math.floor(rand() * n) });
    if (gates.length) d.gates = gates;
    let p;
    try { p = layoutFence(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!p.ok) { refused++; if (!p.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const S = d.fence.postSpacing ?? 96, gap = 0.25, pw = 5.5;
    const F = d.fence;
    if (p.posts !== p.cornerPosts + p.linePosts + p.gatePosts) failures.push(`seed ${seed}: post parts do not sum`);
    if (p.gatePosts !== 2 * gates.length) failures.push(`seed ${seed}: gate posts ${p.gatePosts}`);
    if (p.cornerPosts !== (d.closed ? n : n + 1)) failures.push(`seed ${seed}: corner posts ${p.cornerPosts}`);
    if (p.bays * S + 1e-6 < p.fenceInches) failures.push(`seed ${seed}: ${p.bays} bays of at most ${S} cannot span ${p.fenceInches} in`);
    const fenceNet = d.runs.reduce((a, b) => a + b, 0) * 12 - gates.reduce((a, g) => a + g.width, 0);
    if (Math.abs(p.fenceInches - fenceNet) > 1e-6) failures.push(`seed ${seed}: fence inches ${p.fenceInches} vs ${fenceNet}`);
    const minPickets = Math.floor(fenceNet / (pw + gap));
    if (p.pickets < minPickets) failures.push(`seed ${seed}: ${p.pickets} pickets for ${fenceNet} in`);
    if (p.railPieces < (F.railCount ?? 3)) failures.push(`seed ${seed}: too few rails`);
    if (p.concreteBags * 1 + 1e-9 < p.posts * p.concreteBagsPerPost - 1e-6) failures.push(`seed ${seed}: concrete short`);
    if (![96, 120, 144].includes(p.postLength) || p.postLength < (F.height ?? 72) + (F.postDepth ?? 30)) failures.push(`seed ${seed}: post length ${p.postLength}`);
    if (p.hinges !== 2 * gates.length || p.latches !== gates.length) failures.push(`seed ${seed}: hardware`);
    if (!fenceText(p).length) failures.push(`seed ${seed}: no text`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 150, `only ${laid} laid (${refused} refused)`);
});
