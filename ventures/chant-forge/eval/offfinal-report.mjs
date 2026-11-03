// node eval/offfinal-report.mjs [dir]  -- list files that end off the mode final, with the last words and
// last notes, as a checklist for reading against the 1908 Graduale scan. Reads files only; checks nothing against the book.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGabc, summarize, noteName } from '../gabc.mjs';
const dir = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus', 'gregobase-1908');
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
for (const r of rows) console.log(`| ${r.f} | ${r.part} | ${r.mode} | ${r.final} | ${r.last} | ${r.words} | [ ] |`);
console.log(`\n${rows.length} files end off the mode final.`);
