// Tests for scan.mjs on drawn pages: a four-line staff with a c4 clef and
// square heads at known positions, written as a PGM and read back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPgm, readPage, gabcSteps, gabcShape, align, alignLocal, binarize, findStaves, trimLine, estimateSkew, shearColumns, headShape, isQuilisma, QUILISMA_MAX_FALL, RHOMBUS_MIN_H } from './scan.mjs';

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

test('a line crowded with heads keeps its own thickness, and the heads on it are read', () => {
  // a recitation on one line: the heads alone cover over a fifth of the page
  // width in the rows just above and below it (leaf 747 of the 1908
  // Graduale, eval/thick-line-check.md)
  const img = canvas(1600, 700);
  const crowd = [];
  for (let x = 140; x < 1440; x += 30) crowd.push([x, 4]);
  drawStaff(img, 120, crowd);
  drawStaff(img, 420, [[300, 2]]);
  const bin = binarize(img);
  const staves = findStaves(bin);
  assert.equal(staves.length, 2);
  for (const l of staves[0].lines) assert.ok(l.bottom - l.top + 1 <= 5, `line ${l.top}-${l.bottom}`);
  const page = readPage(readPgm(toPgm(img)));
  assert.equal(page[0].notes.length, crowd.length);
  assert.ok(page[0].notes.every((n) => n.rel === 4 - 6));
  // trimLine on its own: a band of head rows around a 3 px line
  const y = 120 + S - 1;
  assert.deepEqual(trimLine(bin, y - 9, y + 11), [y - 1, y + 3]);
});

test('a staff whose second line sits a few pixels low is still found', () => {
  // a tilted page moves one line's centre: the spacing from the first two
  // lines then misses the last line, the spacing from the outer two does not
  const img = canvas(1600, 400);
  for (const [k, dy] of [[0, 0], [1, 4], [2, 0], [3, 0]]) rect(img, 60, 120 + k * S + dy - 1, 1440, 3);
  const staves = findStaves(binarize(img));
  assert.equal(staves.length, 1);
  assert.ok(Math.abs(staves[0].space - S) < 1);
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

// a printed rhombus: about a third of a space wide, its corners blunted as
// in the 1908 Vatican type, narrowing to the left and right
function diamond(img, cx, cy, w = 0.4 * S, h = 0.72 * S) {
  for (let x = Math.round(cx - w / 2); x <= Math.round(cx + w / 2); x++) {
    const half = (h / 2) * Math.min(1, 1.5 * (1 - Math.abs(x - cx) / (w / 2)));
    rect(img, x, cy - half, 1, 2 * half);
  }
}

test('rhombi are told from squares by width and taper; descending rhombi read in order', () => {
  const img = canvas(1600, 400);
  drawStaff(img, 120, [[300, 4], [600, 3]]);
  const bottom = 120 + 3 * S;
  diamond(img, 380, bottom - (3 * S) / 2);
  diamond(img, 420, bottom - (2 * S) / 2);
  const [st] = readPage(readPgm(toPgm(img)));
  assert.deepEqual(st.notes.map((n) => n.rel + 6), [4, 3, 2, 3]);
  assert.deepEqual(st.notes.map((n) => n.shape), ['square', 'rhombus', 'rhombus', 'square']);
});

test('gabcShape names the printed shape the GABC asks for', () => {
  const shapes = (g) => [...g].map((ch, i) => (/[a-mA-M]/.test(ch) ? gabcShape(g, i) : null)).filter(Boolean);
  assert.deepEqual(shapes('gh!iw!jvHGhi'), ['punctum', 'punctum', 'quilisma', 'virga', 'rhombus', 'rhombus', 'punctum', 'punctum']);
  assert.deepEqual(shapes('gh~'), ['punctum', 'liquescent']);
  assert.deepEqual(shapes('fe<'), ['punctum', 'liquescent']);
  assert.deepEqual(shapes('ho'), ['oriscus']);
  assert.deepEqual(shapes('gss'), ['stropha']);
  const g = gabcSteps('(c4) San(gh!iw!jvHGhi)ctus(h)');
  assert.deepEqual(g.map((n) => n.shape), ['punctum', 'punctum', 'quilisma', 'virga', 'rhombus', 'rhombus', 'punctum', 'punctum', 'punctum']);
});

// a printed quilisma: a solid base under three teeth with white notches
// between them, the head's width and height as a square's
function quilisma(img, x, cy) {
  const top = cy - H / 2;
  rect(img, x, top + 0.25 * H, 22, 0.75 * H);
  for (const dx of [0, 8, 16]) rect(img, x + dx, top, 6, 0.25 * H + 1);
}

test('a saw-toothed head is a quilisma; a notched head that continues a wide stroke is not', () => {
  const img = canvas(1600, 400);
  drawStaff(img, 120, [[300, 3], [700, 4]]);
  const bottom = 120 + 3 * S;
  quilisma(img, 360, bottom - (4 * S) / 2);
  // a wide piece of stroke (a porrectus the reader cut in two), then a
  // notched head touching its end
  rect(img, 500, bottom - (5 * S) / 2 - H / 2, S, H);
  quilisma(img, 500 + S + 4, bottom - (5 * S) / 2);
  const [st] = readPage(readPgm(toPgm(img)));
  assert.deepEqual(st.notes.map((n) => n.rel + 6), [3, 4, 5, 5, 4]);
  assert.deepEqual(st.notes.map((n) => n.shape), ['square', 'quilisma', 'square', 'square', 'square']);
});

// Version 3 of the quilisma rule (eval/quilisma-stroke-check.md): notched
// heads that are a falling piece of a porrectus stroke, the top note of a
// stack, or an epiphonus head with its tail are squares.
test('a notched head that falls like a stroke, sits on another head or carries a liquescent tail is not a quilisma', () => {
  const q = { w: 0.5, h: 0.6, fill: 0.6, taper: 1, notch: 4, afterStroke: false, fall: 0, under: false, liq: false };
  assert.equal(headShape(q), 'quilisma');
  assert.equal(isQuilisma({ ...q, fall: -0.4 }), true); // rising: a quilisma joined to the note above
  assert.equal(headShape({ ...q, fall: QUILISMA_MAX_FALL }), 'square');
  assert.equal(headShape({ ...q, w: 0.95, fall: 0.2 }), 'square');
  assert.equal(headShape({ ...q, under: true }), 'square');
  assert.equal(headShape({ ...q, liq: true }), 'square');
  assert.equal(headShape({ ...q, notch: 2 }), 'square');
  // features measured before version 3 (no fall, under or liq) keep their old reading
  assert.equal(headShape({ w: 0.5, h: 0.6, fill: 0.6, taper: 1, notch: 4, afterStroke: false }), 'quilisma');
});

// The rhombus height floor (eval/rhombus-height-check.md): a worn square
// whose white flecks cut its edge columns measures narrow and tapered like
// a rhombus but stands no taller than a square, so it stays a square. The
// measurements are of real heads on the 1908 scan (leaf:staff:x).
test('a narrow, tapered head as short as a square is a square, not a rhombus', () => {
  const worn = { w: 0.37, h: 0.58, fill: 0.87, taper: 0.76, notch: 0 }; // 754:7:367
  const rhombus = { w: 0.35, h: 0.74, fill: 0.76, taper: 0.65, notch: 0 }; // 754:7:918
  assert.equal(headShape(worn), 'square');
  assert.equal(headShape(rhombus), 'rhombus');
  assert.equal(headShape({ ...worn, h: RHOMBUS_MIN_H }), 'rhombus');
  assert.equal(headShape({ ...rhombus, h: 1.04 }), 'rhombus'); // a rhombus touching its neighbour reads tall
  assert.equal(headShape({ ...rhombus, w: 0.5 }), 'square');
});

// Liquescents as printed in the 1908 type: a small note hung off the head's
// right edge on a thick short stem. The epiphonus's small head sits above,
// the cephalicus's hook below. A virga's stem is thin; a podatus's stem
// ends on a full head. Neither is a liquescent.
test('a small note on a short thick stem is a liquescent, read after its head at its own pitch', () => {
  const img = canvas(1600, 400);
  const bottom = 120 + 3 * S;
  const cy = (pos) => bottom - (pos * S) / 2;
  drawStaff(img, 120, [[300, 2], [500, 4], [700, 4], [900, 2], [900, 4], [1100, 3]]);
  // epiphonus g-h~ (positions 2 then 3): stem up from the head to a small head
  rect(img, 300 + 15, cy(3) - 0.25 * S, 7, cy(2) - cy(3)); // stem
  rect(img, 300 + 12, cy(3) - 0.25 * S, 10, 0.3 * S); // small head
  // cephalicus (positions 4 then 3): a hook below the head's right edge
  rect(img, 500 + 14, cy(4), 8, cy(3) - cy(4) + 0.25 * S);
  // virga: a thin stem down the right edge
  rect(img, 700 + 19, cy(4), 3, 1.2 * S);
  // podatus: the stem joins two full heads
  rect(img, 900 + 16, cy(4), 6, cy(2) - cy(4));
  const [st] = readPage(readPgm(toPgm(img)));
  assert.deepEqual(st.notes.map((n) => n.rel + 6), [2, 3, 4, 3, 4, 2, 4, 3]);
  assert.deepEqual(st.notes.map((n) => n.shape), ['square', 'liquescent', 'square', 'liquescent', 'square', 'square', 'square', 'square']);
});

// turn a drawn page by `deg` degrees about its centre (bilinear, as a
// scanner's slightly turned page would come out)
function rotate(img, deg) {
  const { width, height, data } = img;
  const out = canvas(width, height);
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const cx = width / 2, cy = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = c * (x - cx) + s * (y - cy) + cx, v = -s * (x - cx) + c * (y - cy) + cy;
      const x0 = Math.floor(u), y0 = Math.floor(v);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= width || y0 + 1 >= height) continue;
      const fx = u - x0, fy = v - y0, at = (i, j) => data[j * width + i];
      out.data[y * width + x] = Math.round(
        at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy);
    }
  }
  return out;
}
function threeStaves() {
  const img = canvas(1600, 1000);
  const heads = [
    [[200, 0], [300, 2], [400, 4], [500, 3], [600, 6], [700, 5], [800, 1], [1000, 2], [1200, 4], [1350, 3]],
    [[220, 4], [320, 4], [420, 4], [520, 4], [620, 4], [720, 4], [820, 5], [920, 3], [1100, 2]],
    [[200, 1], [330, 3], [460, 2], [590, -1], [720, 0], [850, 2], [980, 4], [1200, 6]],
  ];
  heads.forEach((h, k) => drawStaff(img, 160 + k * 280, h));
  return { img, heads };
}

test('a square page is not straightened: estimateSkew gives 0 and readPage reads as before', () => {
  const { img, heads } = threeStaves();
  assert.equal(estimateSkew(binarize(img)), 0);
  const page = readPage(img);
  assert.deepEqual(page, readPage(img, { deskew: false }));
  assert.deepEqual(page.map((st) => st.notes.map((n) => n.rel + 6)), heads.map((h) => h.map(([, p]) => p)));
});

for (const deg of [0.8, -1.2, 2.5]) {
  test(`a page turned ${deg} degrees is straightened and every staff read (leaf 424)`, () => {
    const { img, heads } = threeStaves();
    const turned = rotate(img, deg);
    const bin = binarize(turned);
    const t = estimateSkew(bin);
    // the shear that levels the lines undoes the turn: within 0.05 degrees
    assert.ok(Math.abs((Math.atan(t) * 180) / Math.PI + deg) < 0.05, `estimated ${(Math.atan(t) * 180) / Math.PI}`);
    const before = readPage(turned, { deskew: false });
    const page = readPage(turned);
    assert.equal(page.length, 3);
    assert.deepEqual(page.map((st) => st.notes.map((n) => n.rel + 6)), heads.map((h) => h.map(([, p]) => p)));
    assert.ok(Math.abs(page[0].skew + deg) < 0.05);
    // without straightening the same page loses staves or notes
    const want = heads.flat().length;
    const got = (p) => p.reduce((s, st) => s + st.notes.length, 0);
    assert.ok(before.length < 3 || got(before) < want || before.some((st, k) => st.notes.some((n, i) => n.rel + 6 !== heads[k]?.[i]?.[1])));
    // note y is given on the page as scanned: the first head of each staff
    // sits where the turned page has ink
    for (const st of page) {
      const n = st.notes[0];
      assert.equal(bin.ink[n.y * bin.width + n.x], 1, `staff ${st.staff} first head at ${n.x},${n.y}`);
    }
  });
}

test('shearColumns moves whole columns and keeps every ink pixel on the page', () => {
  const bin = { width: 10, height: 10, ink: new Uint8Array(100) };
  bin.ink[5 * 10 + 0] = 1; bin.ink[5 * 10 + 9] = 1;
  const out = shearColumns(bin, 0.4);
  assert.equal(out.ink.reduce((a, b) => a + b, 0), 2);
  assert.equal(out.ink[(5 - 2) * 10 + 0], 1); // column 0: (0 - 5) * 0.4 = -2
  assert.equal(out.ink[(5 + 2) * 10 + 9], 1); // column 9: (9 - 5) * 0.4 = 1.6, rounds to 2
});

test('gabcSteps gives a bivirga or tristropha one step per printed head, each with its shape (2026-11-14)', () => {
  const s = gabcSteps('(c4) a(kvvJH) b(gsss) c(gv)');
  assert.deepEqual(s.map((n) => `${n.rel}${n.shape[0]}`), ['1v', '1v', '0r', '-2r', '-3s', '-3s', '-3s', '-3v']);
});
