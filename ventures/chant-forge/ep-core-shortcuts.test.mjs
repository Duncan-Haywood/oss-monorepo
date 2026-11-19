// Pins the two shortcuts in ep-core.mjs / release-core.mjs (2026-11-18 perf pass) to the plain
// computations they replace: the cover's mirrored glow and the release check reusing an analysis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverPixels, diatonic } from './ep-core.mjs';
import { checkReleaseWith } from './release-core.mjs';
import { analyze } from './master.mjs';

// coverPixels exactly as it was before the mirror (2026-11-18): every glow pixel its own hypot and pow.
function plainCover(midis, { size = 3000, maxNotes = 14 } = {}) {
  const rgb = new Uint8Array(size * size * 3);
  const cx = size / 2, cy = size * 0.47, rmax = Math.hypot(cx, cy);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = Math.min(1, Math.hypot(x - cx, y - cy) / rmax);
      const k = (y * size + x) * 3, f = (1 - t) ** 1.6;
      rgb[k] = 10 + 34 * f; rgb[k + 1] = 9 + 20 * f; rgb[k + 2] = 12 + 14 * f; // warm black, lit from the middle
    }
  }
  const rect = (x0, y0, x1, y1, [r, g, b]) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(size, Math.round(y1)); y++) {
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(size, Math.round(x1)); x++) {
        const k = (y * size + x) * 3; rgb[k] = r; rgb[k + 1] = g; rgb[k + 2] = b;
      }
    }
  };
  const notes = midis.slice(0, maxNotes);
  const space = size * 0.055, line = Math.max(2, size * 0.004), left = size * 0.12, right = size * 0.88;
  const steps = notes.map(diatonic);
  const mid = steps.length ? Math.round((Math.min(...steps) + Math.max(...steps)) / 2) : 0;
  const staffTop = cy - 1.5 * space;
  for (let i = 0; i < 4; i++) rect(left, staffTop + i * space - line / 2, right, staffTop + i * space + line / 2, [178, 34, 34]);
  // the middle step sits in the middle space (between lines 2 and 3); one step is half a space
  const head = space * 0.82, gap = notes.length > 1 ? (right - left - size * 0.08 - head) / (notes.length - 1) : 0;
  steps.forEach((s, i) => {
    const y = cy - (s - mid) * (space / 2), x = left + size * 0.04 + i * gap;
    rect(x, y - head / 2, x + head, y + head / 2, [226, 196, 120]);
    // ledger lines for heads that leave the staff
    for (let ly = staffTop - space; ly >= y - head / 4; ly -= space) rect(x - head * 0.25, ly - line / 2, x + head * 1.25, ly + line / 2, [178, 34, 34]);
    for (let ly = staffTop + 4 * space; ly <= y + head / 4; ly += space) rect(x - head * 0.25, ly - line / 2, x + head * 1.25, ly + line / 2, [178, 34, 34]);
  });
  // a thin gold rule above and below, like a book's border
  rect(size * 0.08, size * 0.08, size * 0.92, size * 0.08 + line, [150, 124, 70]);
  rect(size * 0.08, size * 0.92 - line, size * 0.92, size * 0.92, [150, 124, 70]);
  return rgb;
}

test('cover: the mirrored glow equals the per-pixel formula at whole and fractional centres', () => {
  // 600 and 1400 have a whole-number centre row (rows are mirrored too); 512, 101, 7, 2, 1 do not
  for (const size of [600, 1400, 512, 101, 7, 2, 1]) {
    for (const notes of [[], [62, 64, 65, 67, 69, 67, 65, 64, 62, 60, 62, 64, 65, 67], [40, 88, 41]]) {
      const got = coverPixels(notes, { size }), want = plainCover(notes, { size });
      assert.ok(Buffer.from(got).equals(Buffer.from(want)), `size ${size}, ${notes.length} notes`);
    }
  }
});

test('release check: an analysis handed in through io gives the same checks as analysing the WAV', () => {
  const rate = 44100, n = rate * 2;
  const L = new Float64Array(n), R = new Float64Array(n);
  for (let i = 0; i < n; i++) { L[i] = 0.3 * Math.sin(2 * Math.PI * 220 * i / rate); R[i] = 0.25 * Math.sin(2 * Math.PI * 330 * i / rate); }
  const wav = { rate, channels: [L, R] };
  const rel = { title: 'T', artist: 'A', type: 'single', releaseDate: '2027-01-01', tracks: [{ title: 'x', audio: 'a.wav', language: 'la', explicit: false }] };
  const base = { exists: () => true, bytes: () => new Uint8Array(0), wav: () => wav };
  const plain = checkReleaseWith(rel, base);
  let asked = 0;
  const reused = checkReleaseWith(rel, { ...base, analysis: (p) => { asked++; assert.equal(p, 'a.wav'); return analyze(wav); } });
  assert.equal(asked, 1);
  assert.deepEqual(reused, plain);
  // no analysis on offer (undefined) falls back to analysing the WAV
  assert.deepEqual(checkReleaseWith(rel, { ...base, analysis: () => undefined }), plain);
});
