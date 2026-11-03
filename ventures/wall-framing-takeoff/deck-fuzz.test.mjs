import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutDeck, sampleDeck, defaultDeckStock } from "./deck.mjs";

// Property test: random decks either come back ok:false with a reason or lay out with
// posts no farther apart than allowed, every lumber piece inside a bought board, and
// the order covering the pieces' total length.
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

test("fuzz: random decks lay out with posts, boards and orders that add up, or are refused with a reason", () => {
  let laid = 0, refused = 0;
  const failures = [];
  for (let seed = 1; seed <= 300; seed++) {
    const rand = rng(seed);
    const d = {
      ...sampleDeck(),
      width: 72 + Math.floor(rand() * 40) * 6,
      depth: 72 + Math.floor(rand() * 25) * 6,
      height: 18 + Math.floor(rand() * 40) * 3,
      joist: pick(rand, ["2x8", "2x10", "2x12"]),
      beam: pick(rand, ["2x8", "2x10", "2x12"]),
      spacing: pick(rand, [12, 16, 24]),
      beamPlies: pick(rand, [1, 2, 3]),
      postSize: pick(rand, ["4x4", "6x6"]),
      overhang: Math.floor(rand() * 4) * 6,
      freestanding: rand() < 0.3,
    };
    if (rand() < 0.4) d.border = pick(rand, [1, 2, 3]);
    if (rand() < 0.3) d.blocking = { every: pick(rand, [48, 96]) };
    let l;
    try { l = layoutDeck(d); } catch (e) { failures.push(`seed ${seed}: threw ${e.message}`); continue; }
    if (!l.ok) { refused++; if (!l.errors?.length) failures.push(`seed ${seed}: refused with no reason`); continue; }
    laid++;
    const stock = defaultDeckStock();
    const longest = (s) => Math.max(...stock.filter((x) => x.size === s).map((x) => x.length));
    for (const p of l.lumber) if (p.length > longest(p.size) + 1e-6 || !(p.length > 0)) failures.push(`seed ${seed}: ${p.kind} ${p.length} in ${p.size}`);
    for (let i = 1; i < l.posts.length; i++) if (l.posts[i] - l.posts[i - 1] > 96 + 1e-6) failures.push(`seed ${seed}: posts ${l.posts[i] - l.posts[i - 1]} apart`);
    for (const o of l.orders) {
      const need = l.lumber.filter((p) => p.size === o.size).reduce((s, p) => s + p.length, 0);
      if (o.bought + 1e-6 < need) failures.push(`seed ${seed}: ${o.size} bought ${o.bought} < ${need}`);
    }
    if (Math.abs(l.beamPieces.reduce((s, x) => s + x, 0) - d.width) > 1e-6) failures.push(`seed ${seed}: beam pieces do not sum to width`);
    if (!(l.cost > 0)) failures.push(`seed ${seed}: no cost`);
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.ok(laid > 100, `only ${laid} laid (${refused} refused)`);
});
