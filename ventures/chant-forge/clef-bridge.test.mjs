// An F clef whose stem stands a pixel or two apart from its blocks (scan.mjs
// findClef, CLEF_BRIDGE): the clef line is still the F line, not the middle
// of the stem alone. Drawn pages, as in clef-change.test.mjs; the real page
// is leaf 434 staff 3, eval/clef-bridge-check.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPgm, readPage, CLEF_BRIDGE } from './scan.mjs';

const S = 36;
const H = 21;
function canvas(width, height) {
  return { width, height, data: new Uint8Array(width * height).fill(225) };
}
function rect(img, x0, y0, w, h, v = 30) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
    for (let x = Math.round(x0); x < Math.round(x0 + w); x++) img.data[y * img.width + x] = v;
  }
}
function staff(img, y0) {
  for (let k = 0; k < 4; k++) rect(img, 60, y0 + k * S - 1, 1440, 3);
  return y0 + 3 * S;
}
// an F clef on line position `pos`, drawn after leaf 434's: a square on the
// line with a stem down its right side to the next line, then (after `gap` px
// of white) the C clef's two blocks joined by a curve on their left
function fClef(img, x, bottom, pos, gap) {
  const y = bottom - (pos * S) / 2;
  rect(img, x, y - 0.33 * S, 18, 0.66 * S); // the square
  // its stem, down a little past the next line: the stem's own middle is then
  // over half a space below the F line (on leaf 434 the lines are also unevenly
  // spaced, which has the same effect)
  rect(img, x + 14, y - 0.33 * S, 4, 1.8 * S);
  const c = x + 18 + gap;
  rect(img, c, y - 0.8 * S, 4, 1.6 * S); // the blocks' curve
  rect(img, c, y - 0.8 * S, 18, 0.65 * S);
  rect(img, c, y + 0.15 * S, 18, 0.65 * S);
}
const head = (img, bottom, x, pos) => rect(img, x, bottom - (pos * S) / 2 - H / 2, 22, H);
const toPgm = (img) => Buffer.concat([Buffer.from(`P5\n${img.width} ${img.height}\n255\n`), Buffer.from(img.data)]);
const page = (gap) => {
  const img = canvas(1600, 400);
  const bottom = staff(img, 120);
  fClef(img, 64, bottom, 4, gap);
  for (const [x, p] of [[220, 3], [320, 5], [420, 4]]) head(img, bottom, x, p);
  return readPgm(toPgm(img));
};

test('an F clef whose stem touches its blocks is read on the F line', () => {
  const [st] = readPage(page(0));
  assert.equal(st.clefPos, 4);
  assert.deepEqual(st.notes.map((n) => n.rel), [-1, 1, 0]);
});

test('an F clef with a white gap between stem and blocks is read on the F line (2026-11-19)', () => {
  for (const gap of [1, 2, 3, 5]) {
    assert.ok(gap <= Math.round(CLEF_BRIDGE * S));
    const [st] = readPage(page(gap));
    assert.equal(st.clefPos, 4, `gap ${gap}`);
    assert.deepEqual(st.notes.map((n) => n.rel), [-1, 1, 0], `gap ${gap}`);
  }
  // as before: the stem alone was the clef, a step below the line, so every note read two steps high
  const [old] = readPage(page(2), { clefBridge: false });
  assert.equal(old.clefPos, 2);
  assert.deepEqual(old.notes.map((n) => n.rel), [1, 3, 2]);
});
