// node eval/offfinal-report.mjs [dir]  -- list files that end off the mode final, with the last words and
// last notes, as a checklist for reading against the 1908 Graduale scan. Reads files only; checks nothing against the book.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGabc, summarize, noteName } from '../gabc.mjs';
const dir = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus', 'gregobase-1908');
// What reading each ending against the 1908 scan found (2026-11-13: scan-check-verdicts.md, scan-pages.json;
// 2026-11-14: the supplement pieces, offfinal-supplement-report.md). 'book' = the book prints this ending.
const READ = {
  '3403.gabc': 'book (scan-check-verdicts.md)', '3407.gabc': 'book (scan-check-verdicts.md)',
  '3418.gabc': 'book, last note not read (scan-check-verdicts.md)', '3426.gabc': 'book (scan-check-verdicts.md)',
  '3429.gabc': 'book (scan-check-verdicts.md)', '3434.gabc': 'book (scan-check-verdicts.md)',
  '3453.gabc': 'book (scan-check-verdicts.md)',
  '3402.gabc': 'book, p. [167] (offfinal-supplement-report.md)',
  '3419.gabc': 'book, Gaudeamus pp. 486-487 (offfinal-supplement-report.md)',
  '3451.gabc': 'book, p. [161] (offfinal-supplement-report.md)',
};
const rows = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.gabc')).sort()) {
  const p = parseGabc(readFileSync(join(dir, f), 'utf8'));
  const s = summarize(p);
  if (s.modeFinalMatches) continue;
  const notes = p.events.filter((e) => e.type === 'note');
  const words = notes.filter((e) => e.syllable).slice(-4).map((e) => e.syllable).join('');
  rows.push({ f, part: p.header['office-part'] || '?', mode: s.mode, final: s.final, last: notes.slice(-6).map((e) => noteName(e.midi ?? e.pitch)).join(' '), words });
}
console.log('| file | part | mode | ends | last six notes | last syllables | read against book |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.f} | ${r.part} | ${r.mode} | ${r.final} | ${r.last} | ${r.words} | ${READ[r.f] || '[ ]'} |`);
console.log(`\n${rows.length} files end off the mode final; ${rows.filter((r) => READ[r.f]).length} of them read against the book and found as printed. 3427.gabc ended off its final until 2026-11-14, when its last three notes were corrected from the scan (its correction: header).`);
