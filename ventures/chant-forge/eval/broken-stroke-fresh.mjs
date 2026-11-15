// node eval/broken-stroke-fresh.mjs
//
// Builds eval/broken-stroke-fresh-pages.json, the held-out list for the
// broken-stroke rule (scan.mjs readStaff, BROKEN_STROKE;
// eval/broken-stroke-check.md). Written and run on 2026-11-15 after the rule
// was set from one stroke (GregoBase 3679, leaf 721) and frozen, before any
// page of these pieces was downloaded. Takes, in id order from 3463, the
// first 15 GregoBase ids that are in no earlier piece list, whose book:
// header names only the Graduale Romanum, 1908 with a page, and whose GABC
// has a porrectus (three pitch letters in a row, high-low-high, inside one
// group). GABC files are saved unmodified to corpus/gregobase-1908-stroke/.
// Arabic page p is printed on leaf p+26, bracketed page [p] on leaf p+585
// (as in the earlier lists); the two leaves before and the one after are
// read too and the piece found by local alignment.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dir = join(root, 'corpus/gregobase-1908-stroke');
const used = new Set();
for (const f of readdirSync(here).filter((f) => /pages.*\.json$/.test(f) && f !== 'broken-stroke-fresh-pages.json')) {
  for (const m of readFileSync(join(here, f), 'utf8').matchAll(/(\d{4})\.gabc/g)) used.add(Number(m[1]));
}
const porrectus = (body) => {
  for (const g of body.matchAll(/\(([^)]*)\)/g)) {
    const t = g[1].replace(/\|.*$/, '');
    for (let i = 0; i + 2 < t.length; i++) {
      const [a, b, c] = [t[i], t[i + 1], t[i + 2]];
      if (/[a-m]/.test(a) && /[a-m]/.test(b) && /[a-m]/.test(c) && a > b && c > b) return true;
    }
  }
  return false;
};
const pieces = [];
for (let id = 3463; id <= 3800 && pieces.length < 15; id++) {
  if (used.has(id)) continue;
  const file = join(dir, `${id}.gabc`);
  const src = existsSync(file) ? readFileSync(file, 'utf8') : execFileSync('curl', ['-sSf', '-m', '60', `https://gregobase.selapa.net/download.php?id=${id}&format=gabc&elem=1`], { encoding: 'utf8' });
  const book = /^book:(.*);/m.exec(src)?.[1]?.trim() ?? '';
  const pg = /^Graduale Romanum, 1908, p\. (\[?)(\d+)\]?$/.exec(book);
  if (!pg) continue;
  if (!porrectus(src.slice(src.indexOf('%%')))) continue;
  if (!existsSync(file)) writeFileSync(file, src);
  const leaf = Number(pg[2]) + (pg[1] ? 585 : 26);
  const name = /^name:(.*);/m.exec(src)[1].trim();
  pieces.push({
    name: `GregoBase ${id} (${name})`,
    gabc: `corpus/gregobase-1908-stroke/${id}.gabc`,
    book: 'Graduale Romanum, Vatican 1908',
    archive: 'gradualesacrosan0000cath',
    local: true,
    pages: [leaf - 2, leaf - 1, leaf, leaf + 1].map((l) => ({ page: l === leaf ? `${pg[1]}${pg[2]}${pg[1] ? ']' : ''}` : `leaf ${l}`, leaf: l })),
  });
}
const note = 'Fresh held-out pieces for the broken-stroke rule (scan.mjs readStaff, BROKEN_STROKE), chosen on 2026-11-15 by eval/broken-stroke-fresh.mjs after the rule was set from one stroke (GregoBase 3679, leaf 721) and frozen, and listed before any of their pages was downloaded: in id order from 3463, the first 15 GregoBase ids in no earlier piece list whose book: header names only the Graduale Romanum, 1908, and whose GABC has a porrectus. Arabic page p is printed on leaf p+26, bracketed page [p] on leaf p+585; the two leaves before it and the one after are read and the piece found by local alignment. GABC files are unmodified GregoBase downloads (CC0), in corpus/gregobase-1908-stroke/.';
writeFileSync(join(here, 'broken-stroke-fresh-pages.json'), JSON.stringify({ note, pieces }, null, 2) + '\n');
console.log(pieces.map((p) => `${p.name} leaf ${p.pages[2].leaf}`).join('\n'));
