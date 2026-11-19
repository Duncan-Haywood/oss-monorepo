// node eval/one-step-rhombus-diag.mjs [--cache DIR] ITEM:LEAF:STAFF:X ...
//
// Looks at one place on a page the way readStaff sees it: the staff as read
// (deskewed as readPage does), every head within 2 spaces of x with its box,
// centre, pos, shape measurements and liquescent tail, and the ink around x
// one character a pixel ('#' ink, '-' a staff line row, '.' blank). Written
// for the one-step cephalici whose small note is read as a rhombus
// (eval/one-step-rhombus-check.md).
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { binarize, estimateSkew, shearColumns, findStaves, staffSkew, readStaff, headShape, oneStepCephalicus } from '../scan.mjs';
import { scanCache } from './scan-cache.mjs';

const args = process.argv.slice(2);
const ci = args.indexOf('--cache');
const cache = ci >= 0 ? args[ci + 1] : join(tmpdir(), 'chant-forge-scans');
const places = args.filter((a, i) => a.includes(':') && args[i - 1] !== '--cache').map((a) => { const [item, leaf, staff, x] = a.split(':'); return { item, leaf: +leaf, staff: +staff, x: +x }; });
const { page, prefetch } = scanCache(cache);
await prefetch(places.map((p) => [p.item, p.leaf]));

export function staffAt(img, k) {
  const raw = binarize(img);
  const t0 = estimateSkew(raw);
  const bin0 = t0 ? shearColumns(raw, t0) : raw;
  const staves = findStaves(bin0);
  const staff0 = staves[k - 1];
  let staff = staff0, bin = bin0;
  const r = staffSkew(bin0, staff0);
  if (r) {
    const b2 = shearColumns(raw, t0 + r);
    const mid = (staff0.top + staff0.bottom) / 2;
    const near = findStaves(b2).filter((q) => Math.abs((q.top + q.bottom) / 2 - mid) < staff0.space && Math.abs(q.space - staff0.space) < 0.15 * staff0.space);
    if (near.length) { staff = near[0]; bin = b2; }
  }
  return { bin, staff };
}

for (const p of places) {
  const { bin, staff } = staffAt(page(p.item, p.leaf), p.staff);
  const s = staff.space;
  console.log(`\n## ${p.item} leaf ${p.leaf} staff ${p.staff} x ${p.x} (space ${s.toFixed(1)} px, lines ${staff.lines.map((l) => Math.round(l.y ?? l)).join(' ')})`);
  const heads = readStaff(bin, staff);
  const off = readStaff(bin, staff, { oneStep: false });
  const near = (hs) => hs.filter((h) => Math.abs(h.x - p.x) < 2 * s);
  for (const [name, hs] of [['main', heads], ['oneStep off', off]]) {
    console.log(`${name}:`);
    for (const h of near(hs)) {
      const f = h.feat;
      console.log(`  x ${h.x0}-${h.x1} y ${Math.round(h.y)} pos ${h.pos} ${f ? headShape(f) : '-'}${f ? ` w ${f.w.toFixed(2)} h ${f.h.toFixed(2)} taper ${f.taper.toFixed(2)} fall ${f.fall.toFixed(2)}` : ''}${h.liq ? ` liq pos ${h.liq.pos}${h.oneStep ? ' (one-step)' : ''}` : ''}`);
    }
  }
  const lineRows = new Set();
  for (const l of staff.lines) { const y = Math.round(l.y ?? l); for (let d = -1; d <= 1; d++) lineRows.add(y + d); }
  const xa = Math.round(p.x - 1.6 * s), xb = Math.round(p.x + 1.6 * s);
  const top = near(heads).concat(near(off));
  const ya = Math.round(Math.min(...top.map((h) => h.y), staff.top) - 1.2 * s), yb = Math.round(Math.max(...top.map((h) => h.y)) + 1.5 * s);
  for (let y = ya; y <= yb; y++) {
    let row = '';
    for (let x = xa; x <= xb; x++) row += bin.ink[y * bin.width + x] ? '#' : (lineRows.has(y) ? '-' : '.');
    console.log(`${String(y).padStart(5)} ${row}`);
  }
  console.log(`      x from ${xa}`);
}
