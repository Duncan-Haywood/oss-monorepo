// Tests for scan.mjs on drawn pages: a four-line staff with a c4 clef and
// square heads at known positions, written as a PGM and read back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPgm, readPage, gabcSteps, align, alignLocal, binarize, findStaves } from './scan.mjs';

const S = 36; // staff space in pixels
const H = 21; // head height

function canvas(width, height) {
  return { width, height, data: new Uint8Array(width * height).fill(225) };
}
function rect(img, x0, y0, w, h, v = 30) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
    for (let x = Math.round(x0); x < Math.round(x0 + w); x++) img.data[y * img.width + x] = v;
  }
}
// staff whose top line is at y0; heads given as [x, pos] (pos 0 = bottom line)
function drawStaff(img, y0, heads, { left = 60, right = 1500, clefPos = 6 } = {}) {
  for (let k = 0; k < 4; k++) rect(img, left, y0 + k * S - 1, right - left, 3);
  const bottom = y0 + 3 * S;
  const clefY = bottom - (clefPos * S) / 2;
  rect(img, left + 2, clefY - 0.8 * S, 5, 1.6 * S); // stem
  rect(img, left + 2, clefY - 0.8 * S, 18, 0.65 * S); // upper block
  rect(img, left + 2, clefY + 0.15 * S, 18, 0.65 * S); // lower block
  for (const [x, pos] of heads) rect(img, x, bottom - (pos * S) / 2 - H / 2, 22, H);
}
function toPgm(img) {
  const head = Buffer.from(`P5\n${img.width} ${img.height}\n255\n`);
  return Buffer.concat([head, Buffer.from(img.data)]);
}

test('readPgm reads a binary PGM with a comment', () => {
  const buf = Buffer.concat([Buffer.from('P5\n# made by a test\n3 2\n255\n'), Buffer.from([0, 128, 255, 1, 2, 3])]);
  const img = readPgm(buf);
  assert.equal(img.width, 3);
  assert.equal(img.height, 2);
  assert.deepEqual([...img.data], [0, 128, 255, 1, 2, 3]);
});

test('finds two staves and reads every head relative to the clef line', () => {
  const img = canvas(1600, 700);
  const a = [[200, 0], [280, 1], [360, 2], [440, 3], [520, 4], [600, 5], [680, 6], [760, -1], [840, 7]];
  const b = [[200, 2], [300, 4], [400, 3], [500, 1]];
  drawStaff(img, 120, a);
  drawStaff(img, 420, b);
  const page = readPage(readPgm(toPgm(img)));
  assert.equal(page.length, 2);
  assert.equal(page[0].clefPos, 6);
  assert.deepEqual(page[0].notes.map((n) => n.rel), a.map(([, p]) => p - 6));
  assert.deepEqual(page[1].notes.map((n) => n.rel), b.map(([, p]) => p - 6));
});

test('heads stacked in one column (a podatus) are read bottom-up, a step apart too', () => {
  const img = canvas(1600, 400);
  drawStaff(img, 120, [[300, 1], [300, 3], [420, 2], [420, 3]]);
  const [st] = readPage(readPgm(toPgm(img)));
  assert.deepEqual(st.notes.map((n) => n.rel + 6), [1, 3, 2, 3]);
});

test('a page rule above the staves is not taken for a staff line', () => {
  const img = canvas(1600, 700);
  rect(img, 60, 40, 1440, 3); // running-head rule
  drawStaff(img, 160, [[300, 2]]);
  drawStaff(img, 460, [[300, 4]]);
  const staves = findStaves(binarize(img));
  assert.equal(staves.length, 2);
  assert.ok(Math.abs(staves[0].top - 160) < 3);
});

test('a speck inside a head does not split it', () => {
  const img = canvas(1600, 400);
  drawStaff(img, 120, [[300, 3]]);
  const y = 120 + 3 * S - (3 * S) / 2;
  img.data[y * img.width + 310] = 225; // white fleck
  img.data[(y + 1) * img.width + 310] = 225;
  const [st] = readPage(readPgm(toPgm(img)));
  assert.deepEqual(st.notes.map((n) => n.rel + 6), [3]);
});

test('gabcSteps: clef-relative steps, custos and accidentals skipped, clef changes followed', () => {
  const g = gabcSteps('name:x;\n%%\n(c4) A(fg) B(h+) C(ixhi) D(c3) E(h)');
  // c4 line is j (index 9): f=-4 g=-3 h=-2; ix is a flat sign; then c3 (line h=7)
  assert.deepEqual(g.map((n) => n.rel), [-4, -3, -2, -1, 0]);
  assert.equal(g[0].text, 'A');
  assert.equal(g[0].group, 'fg');
});

test('align: free ends in the GABC, counts agreements, mismatches and gaps', () => {
  const r = align([1, 2, 3, 9, 5], [0, 0, 1, 2, 3, 4, 5, 6]);
  assert.equal(r.startJ, 2);
  assert.equal(r.endJ, 7);
  assert.equal(r.match, 4);
  assert.equal(r.sub, 1);
});

test('alignLocal ignores other pieces on the page', () => {
  const r = alignLocal([7, 7, 7, 1, 2, 3, 4, 7, 7], [1, 2, 3, 4]);
  assert.equal(r.match, 4);
  assert.equal(r.scanOnly, 0);
  assert.equal(r.startI, 3);
});
