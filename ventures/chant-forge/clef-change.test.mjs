// A C clef printed inside a staff (scan.mjs findClefChanges): its blocks are
// not notes, and the notes after it are read against it. Drawn pages, as in
// scan.test.mjs; the real-page check is eval/clef-change-check.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPgm, readPage } from './scan.mjs';

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
// a C clef on line position `pos`, its blocks joined by a stem on the left
function clef(img, x, bottom, pos) {
  const y = bottom - (pos * S) / 2;
  rect(img, x, y - 0.8 * S, 5, 1.6 * S);
  rect(img, x, y - 0.8 * S, 18, 0.65 * S);
  rect(img, x, y + 0.15 * S, 18, 0.65 * S);
}
function staff(img, y0, { left = 60, right = 1500 } = {}) {
  for (let k = 0; k < 4; k++) rect(img, left, y0 + k * S - 1, right - left, 3);
  return y0 + 3 * S;
}
const head = (img, bottom, x, pos) => rect(img, x, bottom - (pos * S) / 2 - H / 2, 22, H);
const toPgm = (img) => Buffer.concat([Buffer.from(`P5\n${img.width} ${img.height}\n255\n`), Buffer.from(img.data)]);

test('notes after a C clef inside the staff are read against it', () => {
  const img = canvas(1600, 400);
  const bottom = staff(img, 120);
  clef(img, 62, bottom, 6); // c4 at the start
  for (const [x, p] of [[200, 2], [300, 4]]) head(img, bottom, x, p);
  clef(img, 500, bottom, 4); // c3 after the double bar
  for (const [x, p] of [[640, 4], [740, 5], [840, 2]]) head(img, bottom, x, p);
  const [st] = readPage(readPgm(toPgm(img)));
  assert.equal(st.clefPos, 6);
  assert.deepEqual(st.clefChanges.map((c) => c.pos), [4]);
  // before the change: relative to line 4 (pos 6); after: to line 3 (pos 4)
  assert.deepEqual(st.notes.map((n) => n.rel), [2 - 6, 4 - 6, 4 - 4, 5 - 4, 2 - 4]);
  // as before 2026-11-14: the clef's blocks read as two notes, the rest against c4
  const [old] = readPage(readPgm(toPgm(img)), { clefChange: false });
  assert.deepEqual(old.notes.map((n) => n.rel), [-4, -2, -3, -1, -2, -1, -4]);
});

test('a podatus a third apart, stem on the right, is not a clef', () => {
  const img = canvas(1600, 400);
  const bottom = staff(img, 120);
  clef(img, 62, bottom, 6);
  head(img, bottom, 400, 3);
  head(img, bottom, 400, 5);
  rect(img, 400 + 22 - 4, bottom - (5 * S) / 2, 4, S); // the stem joins them on the right
  head(img, bottom, 520, 2);
  const [st] = readPage(readPgm(toPgm(img)));
  assert.equal(st.clefChanges, undefined);
  assert.deepEqual(st.notes.map((n) => n.rel + 6), [3, 5, 2]);
});

test('two heads stacked a third apart with nothing joining them are not a clef', () => {
  const img = canvas(1600, 400);
  const bottom = staff(img, 120);
  clef(img, 62, bottom, 6);
  head(img, bottom, 400, 3);
  head(img, bottom, 400, 5);
  const [st] = readPage(readPgm(toPgm(img)));
  assert.equal(st.clefChanges, undefined);
  assert.deepEqual(st.notes.map((n) => n.rel + 6), [3, 5]);
});

// GregoBase 3506, leaf 403 (eval/broken-stroke-check.md): a liquescent's small
// note after a clef change was read against the staff's first clef, because
// readPage built it without an x0 and the clef in force is looked up by x0.
test('a liquescent after a clef inside the staff is read against the new clef (2026-11-15)', () => {
  const img = canvas(1600, 400);
  const bottom = staff(img, 120);
  clef(img, 62, bottom, 6); // c4
  head(img, bottom, 200, 2);
  clef(img, 500, bottom, 4); // c3
  head(img, bottom, 640, 4);
  // cephalicus: a hook below the head's right edge, one step down
  rect(img, 640 + 14, bottom - (4 * S) / 2, 8, S / 2 + 0.25 * S);
  head(img, bottom, 840, 2);
  const [st] = readPage(readPgm(toPgm(img)));
  assert.deepEqual(st.clefChanges.map((c) => c.pos), [4]);
  assert.deepEqual(st.notes.map((n) => n.shape), ['square', 'square', 'liquescent', 'square']);
  assert.deepEqual(st.notes.map((n) => n.rel), [2 - 6, 4 - 4, 3 - 4, 2 - 4]);
});
