import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutDeck, sampleDeck, deckText, validateDeck } from "./deck.mjs";

test("16 x 12 ft deck: joists on layout, posts even, post length from the surface down", () => {
  const l = layoutDeck(sampleDeck());
  assert.ok(l.ok);
  assert.equal(l.centres.length, 13); // 0.75, 16..176, 191.25
  assert.equal(l.joists[0].length, 144 - 3);
  assert.equal(l.posts.length, 3); // 168 in between posts needs two bays of 84
  assert.deepEqual(l.posts, [12, 96, 180]);
  assert.equal(l.postLength, 36 - (1 + 7.25 + 9.25));
  assert.equal(l.beamBoards.length, 2);
});

test("footing concrete: 3 x 12 in by 42 in piers, 10% waste, 0.6 cu ft bags", () => {
  const l = layoutDeck(sampleDeck());
  const cuft = (Math.PI * 36 * 42 * 3) / 1728;
  assert.ok(Math.abs(l.concrete.yards - cuft / 27) < 1e-9);
  assert.equal(l.concrete.bags, Math.ceil((cuft * 1.1) / 0.6));
});

test("decking rows cover the depth and every joint lands on a joist centre, staggered", () => {
  const l = layoutDeck({ ...sampleDeck(), width: 300 }); // longer than the 20 ft board? 300 > 240
  assert.ok(l.ok);
  assert.equal(l.rows, Math.ceil((144 + 0.1875) / 5.6875));
  const byRow = new Map();
  for (const b of l.deckBoards) byRow.set(b.row, [...(byRow.get(b.row) || []), b.length]);
  const firstJoints = new Set();
  for (const [, ls] of byRow) {
    assert.ok(Math.abs(ls.reduce((s, x) => s + x, 0) - 300) < 1e-6);
    let at = 0;
    for (const x of ls.slice(0, -1)) { at += x; assert.ok(l.centres.some((c) => Math.abs(c - at) < 1e-6), `joint at ${at}`); }
    assert.ok(ls.at(-1) >= 12);
    firstJoints.add(ls[0]);
  }
  assert.ok(firstJoints.size >= 3);
});

test("a 12 ft wide deck needs no joints with 16 ft boards", () => {
  const l = layoutDeck({ ...sampleDeck(), width: 144 });
  assert.equal(l.joints, 0);
});

test("the order covers every piece: each board line lists real stock lengths", () => {
  const l = layoutDeck(sampleDeck());
  for (const o of l.orders) {
    assert.ok(o.bought >= o.needed);
    for (const ln of o.lines) assert.ok([96, 120, 144, 168, 192, 240].includes(ln.length));
  }
  assert.ok(l.cost > 0);
});

test("freestanding swaps the ledger for an inner rim, drops ledger fasteners and doubles the hangers", () => {
  const a = layoutDeck(sampleDeck()), f = layoutDeck({ ...sampleDeck(), freestanding: true });
  assert.ok(a.hardware.some((h) => /ledger fastener/.test(h.item)));
  assert.ok(!f.hardware.some((h) => /ledger/.test(h.item)));
  assert.equal(f.hardware[0].qty, 2 * a.hardware[0].qty);
});

test("user span table: warns when the joist span or cantilever is too long", () => {
  const ok = layoutDeck({ ...sampleDeck(), spanTable: [{ joist: "2x8", spacing: 16, maxSpan: 150 }] });
  assert.deepEqual(ok.warnings, []);
  const bad = layoutDeck({ ...sampleDeck(), spanTable: [{ joist: "2x8", spacing: 16, maxSpan: 100 }] });
  assert.match(bad.warnings[0], /exceeds/);
  const none = layoutDeck({ ...sampleDeck(), spanTable: [{ joist: "2x10", spacing: 16, maxSpan: 200 }] });
  assert.match(none.warnings[0], /no row/);
});

test("rejects nonsense and a deck too low for its framing", () => {
  assert.ok(validateDeck({ ...sampleDeck(), spacing: 20 }).length);
  assert.equal(layoutDeck({ ...sampleDeck(), height: 18 }).ok, false);
  assert.equal(layoutDeck({ ...sampleDeck(), joist: "2x7" }).ok, false);
});

test("text report names the order and the hardware", () => {
  const t = deckText(layoutDeck(sampleDeck())).join("\n");
  assert.match(t, /Lumber order/);
  assert.match(t, /post base/);
});

test("guard: 36 in deck gets posts, balusters under the 4 in gap and PT 2x4 rails in the order", () => {
  const l = layoutDeck(sampleDeck()); // 192 x 144, 36 in high, ledger on the house
  assert.ok(l.guard);
  assert.deepEqual(l.guard.sides, ["outer", "left", "right"]);
  // outer 192 -> 3 bays (72 max), sides 144 -> 2 bays each; posts 4 + 3 + 3 minus 2 shared corners
  assert.equal(l.guard.posts.count, 4 + 3 + 3 - 2);
  assert.equal(l.guard.guardRails.count, 6);
  assert.equal(l.guard.balusters.length, 36 - 3 - 4);
  assert.ok(l.guard.balusters.maxGap <= 4 + 1e-9);
  assert.ok(l.orders.some((o) => o.size === "2x4 PT"));
});

test("guard: low decks skip it, freestanding adds the inner edge, false turns it off, high decks warn", () => {
  assert.equal(layoutDeck({ ...sampleDeck(), height: 24 }).guard, null);
  const f = layoutDeck({ ...sampleDeck(), freestanding: true });
  assert.deepEqual(f.guard.sides, ["outer", "left", "right", "inner"]);
  assert.equal(f.guard.posts.count, 4 + 3 + 3 + 4 - 4);
  const off = layoutDeck({ ...sampleDeck(), guard: false });
  assert.equal(off.guard, null);
  assert.ok(off.warnings.some((w) => /guard/.test(w)));
  assert.ok(deckText(layoutDeck(sampleDeck())).some((t) => /Guard \(outer, left, right\)/.test(t)));
});

test("blocking: off by default; rows split the joist length and one block fills each bay", () => {
  assert.equal(layoutDeck(sampleDeck()).blocking, null);
  const l = layoutDeck({ ...sampleDeck(), blocking: { every: 96 } }); // joists 141 in: 2 parts, 1 row
  assert.equal(l.blocking.rows, 1);
  assert.equal(l.blocking.pieces, 12); // 13 joists, 12 bays
  assert.equal(l.lumber.filter((x) => x.kind === "blocking").length, 12);
  assert.ok(Math.abs(l.blocking.bays[1] - 14.5) < 1e-9); // 16 in centres less one joist
  assert.equal(layoutDeck({ ...sampleDeck(), blocking: { every: 200 } }).blocking, null);
});
