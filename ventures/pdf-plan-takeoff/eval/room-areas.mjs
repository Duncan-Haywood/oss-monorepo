// Click-a-room areas against the areas Revit printed in the room tags.
//   node eval/room-areas.mjs [--gap PTS] [--px K] [--skip-annotation] DIR/sets/*.pdf
// Every "NNN SF" text on a sheet is a room tag Revit filled in from its own
// room boundary (to the wall finish faces, rounded to the square foot). The
// tool is clicked at that text, as a user would click inside the room, and its
// area (at the scale assignScale picks for that spot) is compared with the tag.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readSheets } from '../geometry.mjs';
import { inflate } from '../inflate-browser.mjs';
import { scaleNotes, assignScale, phrases, dimensionMatches } from '../scale.mjs';
import { roomAt, loadImagesNear, annotationWidths } from '../rooms.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); if (i < 0) return d; const v = Number(args[i + 1]); args.splice(i, 2); return v; };
const gap = opt('--gap', 0), px = opt('--px', 2);
const rows = [];
// By default every segment counts; --skip-annotation leaves out segments drawn
// with the pen width of the page's dimension lines (annotationWidths).
const keepAnnotation = !args.includes('--skip-annotation');
for (const f of args.filter((a) => !a.startsWith('--'))) {
  const sheet = await readSheets(new Uint8Array(readFileSync(f)), inflate);
  const { pages } = sheet;
  for (const p of pages) {
    const tags = phrases(p.runs).map((t) => ({ t, m: /^(\d[\d,]*)\s*SF$/i.exec(t.text) })).filter((x) => x.m);
    if (!tags.length) continue;
    const notes = scaleNotes(p.runs);
    const skipWidths = keepAnnotation ? null : annotationWidths(p, dimensionMatches(p));
    for (const { t, m } of tags) {
      const printed = Number(m[1].replace(/,/g, ''));
      const seed = { x: t.cx, y: t.cy };
      const sc = assignScale(notes, [seed]);
      const images = await loadImagesNear(sheet, p, seed);
      const r = roomAt(p, seed, { gap, pxPerPt: px, strokesOnly: true, images, skipWidths });
      let sf = null;
      if (r.ok && sc) sf = (r.areaPt2 / (72 * 72)) * sc.ratio * sc.ratio / 144;
      const err = sf == null ? null : (sf - printed) / printed;
      rows.push({ file: basename(f), page: p.page, printed, sf, err, reason: r.ok ? (sc ? '' : 'no scale') : r.reason });
    }
  }
}
for (const r of rows) console.log(`${r.file} p${r.page}\tprinted ${r.printed}\tmeasured ${r.sf == null ? '-' : r.sf.toFixed(1)}\t${r.err == null ? r.reason : (r.err * 100).toFixed(2) + '%'}`);
const got = rows.filter((r) => r.err != null);
const within = (e) => got.filter((r) => Math.abs(r.sf - r.printed) <= Math.max(e * r.printed, 0.5)).length;
console.log(`\nrooms ${rows.length}; measured ${got.length}; within 1%: ${within(0.01)}; within 2%: ${within(0.02)}; within 5%: ${within(0.05)}; refused ${rows.length - got.length} (gap ${gap} pt, ${px} px/pt)`);
const med = got.map((r) => Math.abs(r.err)).sort((a, b) => a - b)[Math.floor(got.length / 2)];
console.log(`median |error| ${(med * 100).toFixed(2)}%`);
