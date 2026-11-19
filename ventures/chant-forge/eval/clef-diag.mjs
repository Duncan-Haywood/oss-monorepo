// node eval/clef-diag.mjs ITEM:LEAF:STAFF ... : the start of a staff as readStaff sees it, with
// findClef's answer and the ink one character a pixel ('#' ink, '-' a staff line row, '.' blank).
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { binarize, estimateSkew, shearColumns, findStaves, staffSkew, findClef } from '../scan.mjs';
import { scanCache } from './scan-cache.mjs';

// the staff deskewed as readPage does (same as eval/one-step-rhombus-diag.mjs)
function staffAt(img, k) {
  const raw = binarize(img);
  const t0 = estimateSkew(raw);
  const bin0 = t0 ? shearColumns(raw, t0) : raw;
  const staff0 = findStaves(bin0)[k - 1];
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

const args = process.argv.slice(2);
const places = args.map((a) => { const [item, leaf, staff] = a.split(':'); return { item, leaf: +leaf, staff: +staff }; });
const { page, prefetch } = scanCache(join(tmpdir(), 'chant-forge-scans'));
await prefetch(places.map((p) => [p.item, p.leaf]));
for (const p of places) {
  const { bin, staff } = staffAt(page(p.item, p.leaf), p.staff);
  const s = staff.space;
  console.log(`\n## ${p.item} leaf ${p.leaf} staff ${p.staff}: left ${staff.left}, space ${s.toFixed(1)}, lines ${staff.lines.map((l) => Math.round(l.y ?? l)).join(' ')}; findClef ${JSON.stringify(findClef(bin, staff))}`);
  const lineRows = new Set();
  for (const l of staff.lines) { const y = Math.round(l.y ?? l); for (let d = -1; d <= 1; d++) lineRows.add(y + d); }
  const xa = Math.max(0, Math.round(staff.left - 0.5 * s)), xb = Math.round(staff.left + 3.5 * s);
  for (let y = Math.round(staff.top - 1.5 * s); y <= Math.round(staff.bottom + 1.5 * s); y++) {
    let row = '';
    for (let x = xa; x <= xb; x++) row += bin.ink[y * bin.width + x] ? '#' : (lineRows.has(y) ? '-' : '.');
    console.log(`${String(y).padStart(5)} ${row}`);
  }
  console.log(`      x from ${xa}`);
}
