// node eval/deskew-synthetic.mjs [--out FILE]
//
// How far can a page be turned before the square reader loses its staves,
// and does straightening (estimateSkew, shearColumns in scan.mjs) bring
// them back? A 2000 x 3000 page of nine drawn staves (99 heads, a c clef
// each) is turned by each angle with bilinear resampling, a light speckle
// is added, and the page is read with { deskew: false } and as it is.
// Lines are drawn 3 px and 6 px thick (the 1908 Graduale prints 0.1 to 0.2
// of a staff space, 4 to 7 px at 2000 px). Drawn pages, not scans: the
// real-page check is eval/deskew-check.mjs, which needs archive.org.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPage, binarize, estimateSkew } from '../scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(here, 'deskew-synthetic-report.md');

const S = 36, H = 21;
const canvas = (w, h) => ({ width: w, height: h, data: new Uint8Array(w * h).fill(225) });
function rect(img, x0, y0, w, h, v = 30) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++) for (let x = Math.round(x0); x < Math.round(x0 + w); x++) img.data[y * img.width + x] = v;
}
function drawStaff(img, y0, heads, line) {
  const left = 60, right = 1500, clefPos = 6;
  for (let k = 0; k < 4; k++) rect(img, left, y0 + k * S - Math.floor(line / 2), right - left, line);
  const bottom = y0 + 3 * S, clefY = bottom - (clefPos * S) / 2;
  rect(img, left + 2, clefY - 0.8 * S, 5, 1.6 * S);
  rect(img, left + 2, clefY - 0.8 * S, 18, 0.65 * S);
  rect(img, left + 2, clefY + 0.15 * S, 18, 0.65 * S);
  for (const [x, pos] of heads) rect(img, x, bottom - (pos * S) / 2 - H / 2, 22, H);
}
function rotate(img, deg) {
  const { width, height, data } = img;
  const o = canvas(width, height);
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = width / 2, cy = height / 2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = c * (x - cx) + s * (y - cy) + cx, v = -s * (x - cx) + c * (y - cy) + cy;
    const x0 = Math.floor(u), y0 = Math.floor(v);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= width || y0 + 1 >= height) continue;
    const fx = u - x0, fy = v - y0, at = (i, j) => data[j * width + i];
    o.data[y * width + x] = Math.round(at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy);
  }
  return o;
}
// a fixed speckle (a seeded LCG), one dark pixel in 2,000, so the page is not
// perfectly clean
function speckle(img) {
  let r = 12345;
  for (let i = 0; i < img.data.length; i++) { r = (r * 1103515245 + 12345) >>> 0; if (r % 2000 === 0) img.data[i] = 40; }
  return img;
}

const angles = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.8, 1.2, 2, 2.5];
const rows = [];
for (const line of [3, 6]) {
  const img = canvas(2000, 3000), heads = [];
  for (let k = 0; k < 9; k++) {
    const h = [];
    for (let i = 0; i < 11; i++) h.push([200 + 110 * i, (i * 3 + k) % 8]);
    heads.push(h);
    drawStaff(img, 160 + k * 310, h, line);
  }
  const want = heads.flat().length;
  const right = (p) => p.reduce((s, st, k) => s + st.notes.filter((n, i) => n.rel + 6 === heads[k]?.[i]?.[1]).length, 0);
  for (const deg of angles) {
    const turned = speckle(rotate(img, deg));
    const off = readPage(turned, { deskew: false });
    const t0 = Date.now();
    const est = (Math.atan(estimateSkew(binarize(turned))) * 180) / Math.PI;
    const ms = Date.now() - t0;
    const on = readPage(turned);
    rows.push(`| ${line} | ${deg} | ${est ? (-est).toFixed(2) : '0 (not straightened)'} | ${off.length} | ${right(off)} | ${on.length} | ${right(on)} | ${want} | ${ms} |`);
  }
}
const md = [
  '# Turned pages, drawn: before and after straightening',
  '',
  'Written by `node eval/deskew-synthetic.mjs`. Nine drawn staves on a 2000 x 3000 page, turned and lightly speckled;',
  '"right" counts heads read at the right clef-relative step in the right order. The slope column is the turn',
  'estimateSkew found (0 when the drift is under `DESKEW_MIN_DRIFT` pixels and the page is read square).',
  '',
  '| line px | turned (deg) | found (deg) | staves, square | right, square | staves, straightened | right, straightened | heads | estimate ms |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
];
writeFileSync(out, md.join('\n'));
console.log(md.join('\n'));
