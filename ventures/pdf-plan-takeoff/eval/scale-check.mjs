// Scale notes, dimension strings and the sheet verdict on public drawing sets
// (OpeningDesign's open architecture projects; fetch them with
// ventures/drawing-set-index/eval/fetch.sh DIR).
//   node eval/scale-check.mjs DIR/sets/*.pdf
// For every page it prints the notes found, the dimensions matched to a line,
// the verdict (sheetVerdict), and the verdict again on the same page shrunk to
// half size (every coordinate and text size times 0.5, as an 11x17 print of a
// 22x34 set): the half-size check should fire there and nowhere on the originals.
// It also scores the below-left note rule against the nearest-note rule on
// sheets with more than one scale, using dimensions that agree with some note.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readSheets } from '../geometry.mjs';
import { inflate } from '../inflate-browser.mjs';
import { scaleNotes, checkScale, assignScale, dimensionAgrees, sheetVerdict } from '../scale.mjs';

const shrink = (p, k) => ({
  ...p,
  segs: p.segs.map((v) => v * k),
  runs: p.runs.map((r) => ({ ...r, x: r.x * k, y: r.y * k, size: r.size * k, width: r.width * k })),
});
const tot = { files: 0, pages: 0, pagesWithNotes: 0, notes: 0, matched: 0, agree: 0, multiPages: 0, multiDims: 0, multiBelowLeft: 0, multiNearest: 0 };
const verdicts = {}, halfVerdicts = {}, cross = {};
for (const f of process.argv.slice(2)) {
  const { pages } = await readSheets(new Uint8Array(readFileSync(f)), inflate);
  tot.files++;
  for (const p of pages) {
    tot.pages++;
    const notes = scaleNotes(p.runs);
    const usable = notes.filter((n) => n.ratio);
    tot.notes += usable.length;
    if (usable.length) tot.pagesWithNotes++;
    const c = checkScale(p, notes);
    tot.matched += c.matched;
    const agreeing = c.dims.filter((d) => d.agrees);
    tot.agree += agreeing.length;
    if (new Set(usable.map((n) => n.ratio)).size > 1) {
      tot.multiPages++;
      for (const d of agreeing) {
        tot.multiDims++;
        const a = assignScale(notes, [{ x: d.cx, y: d.cy }], 'below-left');
        const b = assignScale(notes, [{ x: d.cx, y: d.cy }], 'nearest');
        if (a && dimensionAgrees(d, a.ratio)) tot.multiBelowLeft++;
        if (b && dimensionAgrees(d, b.ratio)) tot.multiNearest++;
      }
    }
    const v = sheetVerdict(p, notes);
    const h = sheetVerdict(shrink(p, 0.5), notes);
    verdicts[v.verdict] = (verdicts[v.verdict] || 0) + 1;
    halfVerdicts[h.verdict] = (halfVerdicts[h.verdict] || 0) + 1;
    const k = `${v.verdict} -> ${h.verdict}`; cross[k] = (cross[k] || 0) + 1;
    const ratios = [...new Set(usable.map((n) => n.ratio))].join(',');
    console.log(`${basename(f)} p${p.page}\tnotes [${ratios}]\tdims ${c.matched}\tagree ${agreeing.length}\tverdict ${v.verdict}${v.ratio ? ' ' + v.ratio : ''} (${v.support}/${v.of})\thalf-size print: ${h.verdict}${h.ratio ? ' ' + h.ratio : ''}`);
  }
}
console.log('\nTOTAL', JSON.stringify(tot));
console.log('verdicts on the pages as published', JSON.stringify(verdicts));
console.log('verdicts on the same pages shrunk to half size', JSON.stringify(halfVerdicts));
console.log('as published -> shrunk', JSON.stringify(cross));
