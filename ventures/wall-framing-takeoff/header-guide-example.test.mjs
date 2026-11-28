// Pins every figure the customer header guide quotes
// (docs/posts/2026-11-28-window-and-door-headers-size-plies-jacks-and-what-to-order.md).
import test from "node:test";
import assert from "node:assert/strict";
import { checkerExample, tooWide, doorHeaders, garageDoor, wideWindow, ganged, shallow } from "./header-guide-example.mjs";

test("the checker on the page's made-up table: set, ok, under", () => {
  assert.deepEqual(checkerExample().map((r) => [r.required, r.chosen, r.status]), [
    ["2 x 2x8", "2 x 2x8", "set"],
    ["2 x 2x6", "2 x 2x6", "ok"],
    ["2 x 2x10", "2 x 2x8", "under"],
  ]);
});

test("an opening wider than the table's longest row is refused, not guessed", () => {
  const [e] = tooWide();
  assert.match(e, /16' 0" is wider than the table's longest span \(10' 0"\)/);
});

test("a 36 in door: 39 in header, 2, 3 or 1 plies, spacer notes", () => {
  const d = doorHeaders();
  for (const k of ["bearing2x4", "bearing2x6", "partition"]) {
    assert.equal(d[k].headerLength, 39);
    assert.equal(d[k].jacks, 2);
    assert.equal(d[k].kings, 2);
    assert.equal(d[k].jackLength, 81);
    assert.equal(d[k].topCripple, 2.375);
  }
  assert.equal(d.bearing2x4.headerPieces, 2);
  assert.equal(d.bearing2x6.headerPieces, 3);
  assert.equal(d.partition.headerPieces, 1);
  assert.match(d.bearing2x4.notes[0], /Door \(1\/2"\)/);
  assert.match(d.bearing2x6.notes[0], /Door \(1"\)/);
  assert.match(d.partition.notes[0], /single-ply/);
});

test("a 16 ft garage door's 195 in header is longer than any listed board", () => {
  const g = garageDoor();
  assert.equal(g.ok, false);
  assert.match(g.errors[0], /up to 195" is longer than the longest 2x12 board listed \(192"\)/);
});

test("a 6 ft window: 75 in header on one jack a side, 78 in on two, and the note", () => {
  const w = wideWindow();
  assert.equal(w.default.headerLength, 75);
  assert.equal(w.default.jacks, 2);
  assert.match(w.default.note, /wider than 4 ft/);
  assert.equal(w.twoJacks.headerLength, 78);
  assert.equal(w.twoJacks.jacks, 4);
  assert.equal(w.twoJacks.note, null);
});

test("two 36 in windows 3 in apart frame as one 75 in opening", () => {
  assert.equal(ganged().width, 75);
});

test("a 2x10 under an 85-1/2 in head is 5/8 in too deep; the shallow swap takes a 2x8", () => {
  const s = shallow();
  assert.equal(s.topCripple, -0.625);
  assert.equal(s.newHeader, "2x8");
});
