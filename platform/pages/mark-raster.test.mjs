// The mark's rasteriser against the per-sample polygon walk it replaced
// (2026-11-19, docs/history/pages-build-perf-2026-11-19-mark-row-crossings.md).
// sharecard.mjs now finds each sample row's edge crossings once and counts the
// ones right of each sample; this file keeps the old walk, which tested every
// edge for every sample, and requires the same bytes from drawMark at whole and
// fractional offsets, with and without the plate, in RGB and RGBA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawMark, MARK_GEOMETRY, MARK_GOLD, MARK_NAVY, MARK_PEARL } from './sharecard.mjs';

function inPolygon(pts, u, v) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const reach = (pts) => Math.max(...pts.map(([x, y]) => Math.hypot(x - 0.5, y - 0.5))) + 0.001;
const REACH = { cardinal: reach(MARK_GEOMETRY.cardinal), diagonal: reach(MARK_GEOMETRY.diagonal) };
function oldSample(u, v, plate) {
  const g = MARK_GEOMETRY;
  const d = Math.hypot(u - 0.5, v - 0.5);
  if (d <= g.hub) return MARK_GOLD;
  if (d > g.disc) return null;
  if (d <= REACH.cardinal && inPolygon(g.cardinal, u, v)) return MARK_PEARL;
  if (d <= REACH.diagonal && inPolygon(g.diagonal, u, v)) return MARK_GOLD;
  if (d <= g.ring.outer && d >= g.ring.inner) return MARK_GOLD;
  if (plate && d <= g.disc) return MARK_NAVY;
  return null;
}
// sharecard.mjs's drawMarkDirect before 2026-11-19, with the walk above
function oldDraw(canvas, left, top, size, { channels = 3, plate = true } = {}) {
  const ss = 4;
  for (let y = Math.floor(top); y < Math.ceil(top + size); y += 1) {
    for (let x = Math.floor(left); x < Math.ceil(left + size); x += 1) {
      let hits = 0;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const u = (x + (sx + 0.5) / ss - left) / size;
          const v = (y + (sy + 0.5) / ss - top) / size;
          if (u < 0 || v < 0 || u > 1 || v > 1) continue;
          const c = oldSample(u, v, plate);
          if (!c) continue;
          hits += 1;
          sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
        }
      }
      if (!hits) continue;
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      const c = sum.map((v) => v / hits);
      const a = hits / (ss * ss);
      const at = (y * canvas.width + x) * channels;
      if (channels === 4) {
        const da = canvas.data[at + 3] / 255;
        const oa = a + da * (1 - a);
        for (let i = 0; i < 3; i += 1) {
          canvas.data[at + i] = Math.round(oa ? (c[i] * a + canvas.data[at + i] * da * (1 - a)) / oa : 0);
        }
        canvas.data[at + 3] = Math.round(oa * 255);
      } else {
        for (let i = 0; i < 3; i += 1) canvas.data[at + i] = Math.round(canvas.data[at + i] + (c[i] - canvas.data[at + i]) * a);
      }
    }
  }
}

test('drawMark paints the same bytes as the per-sample polygon walk', () => {
  // whole offsets go through the cached coverage, fractional ones draw directly;
  // sizes cover the favicon, the icons and odd non-integer sizes
  const cases = [
    [0, 0, 16], [0, 0, 32], [0, 0, 48], [0, 0, 180], [0, 0, 192], [10, 10, 172.8],
    [3.5, 2.25, 90], [0.3, 0.7, 40.5], [-5.5, 1.5, 60], [7, -3, 61], [1.125, 4.875, 133.3],
  ];
  for (const [left, top, size] of cases) {
    for (const channels of [3, 4]) {
      for (const plate of [true, false]) {
        const w = Math.ceil(left + size) + 3, h = Math.ceil(top + size) + 3;
        const mk = () => ({ width: w, height: h, data: Buffer.alloc(w * h * channels, channels === 4 ? 0 : 41) });
        const want = mk(), got = mk();
        oldDraw(want, left, top, size, { channels, plate });
        drawMark(got, left, top, size, { channels, plate });
        assert.ok(want.data.equals(got.data), `left ${left} top ${top} size ${size} channels ${channels} plate ${plate}`);
      }
    }
  }
});
