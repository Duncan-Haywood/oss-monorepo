// node eval/batch-check.mjs [dir]  -- run the converter over a folder of GABC and print one row per file.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGabc, summarize } from '../gabc.mjs';
const dir = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'corpus', 'gregobase-1908');
let ok = 0, n = 0, warn = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.gabc')).sort()) {
  const p = parseGabc(readFileSync(join(dir, f), 'utf8'));
  const s = summarize(p), notes = p.events.filter((e) => e.type === 'note');
  const syl = notes.filter((e) => e.syllable).length;
  n++; if (s.modeFinalMatches) ok++; warn += s.warnings.length;
  console.log([f, p.header['office-part'], 'mode ' + s.mode, s.notes + ' notes', syl + ' syllables', s.lowest + '-' + s.highest, 'ends ' + s.final, s.modeFinalMatches ? '' : 'FINAL-OFF', s.warnings.length ? s.warnings.length + ' warnings' : ''].join('\t'));
}
console.log(`${n} files, ${ok} end on the mode final, ${warn} warnings`);
