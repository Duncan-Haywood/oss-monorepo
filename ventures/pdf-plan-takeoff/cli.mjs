#!/usr/bin/env node
// Scale report for a drawing PDF: every page's scale notes, its dimension
// strings matched to their lines, and the verdict (confirmed, half size,
// inferred, mismatch, unchecked).
//   node cli.mjs set.pdf [--json]
import { readFileSync } from 'node:fs';
import { readSheets } from './geometry.mjs';
import { inflate } from './inflate-browser.mjs';
import { scaleNotes, sheetVerdict, dimensionMatches } from './scale.mjs';

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) { console.error('usage: node cli.mjs drawing.pdf [more.pdf] [--json]'); process.exit(2); }
const out = [];
for (const f of files) {
  const { pages, flags } = await readSheets(new Uint8Array(readFileSync(f)), inflate);
  if (flags.notPdf || flags.encrypted) { console.error(`${f}: ${flags.notPdf ? 'not a PDF' : 'encrypted'}`); continue; }
  for (const p of pages) {
    const notes = scaleNotes(p.runs).filter((n) => n.ratio || n.nts);
    const v = sheetVerdict(p, notes);
    out.push({ file: f, page: p.page, segments: p.paint.length, images: (p.images || []).length, notes: notes.map((n) => n.label), dimensions: dimensionMatches(p).length, ...v });
  }
}
if (args.includes('--json')) console.log(JSON.stringify(out, null, 2));
else for (const r of out) {
  const what = { confirmed: `confirmed at 1:${r.ratio}`, 'half size': `HALF-SIZE PRINT: notes say 1:${r.ratio / 2}, the sheet measures 1:${r.ratio}`, inferred: `no note; dimensions say ${r.label}`, mismatch: `CHECK: dimensions say ${r.label}, no note does`, unchecked: 'not enough dimensions to check' }[r.verdict];
  console.log(`${r.file} p${r.page}\t${r.notes.join(', ') || 'no scale note'}\t${r.dimensions} dims\t${what}${r.support ? ` (${r.support}/${r.of})` : ''}`);
}
