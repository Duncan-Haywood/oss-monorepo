// node eval/hook-fresh.mjs
//
// Builds eval/hook-fresh-pages.json, the held-out list for the hook-on-line
// rule (scan.mjs liquescentTail, LIQ.onLine; eval/hook-on-line-check.md).
// Written and run on 2026-11-16 after the rule was set from one cephalicus
// (GregoBase 3464, leaf 604, staff 6, x 1289) and frozen, before any page of
// these pieces was downloaded. Takes, in id order from 3463, the first 15
// GregoBase ids that are in no earlier piece list, whose book: header names
// only the Graduale Romanum, 1908 with a page, and whose GABC has a
// liquescent whose small note sits on a staff line (the pitch letter before
// ~ < > is d, f, h or j, the four lines in GABC's fixed lettering). GABC
// files are saved unmodified to corpus/gregobase-1908-hook/. Page to leaf as
// in the earlier lists: Arabic page p on leaf p+26, bracketed [p] on leaf
// p+585; the two leaves before and the one after are read too and the piece
// found by local alignment.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dir = join(root, 'corpus/gregobase-1908-hook');
mkdirSync(dir, { recursive: true });
const used = new Set();
for (const f of readdirSync(here).filter((f) => /pages.*\.json$/.test(f) && f !== 'hook-fresh-pages.json')) {
  for (const m of readFileSync(join(here, f), 'utf8').matchAll(/(\d{4})\.gabc/g)) used.add(Number(m[1]));
}
// a liquescent whose small note is on a line: the last pitch letter before ~ < >
export const onLineLiquescents = (body) => {
  let n = 0;
  for (const g of body.matchAll(/\(([^)]*)\)/g)) {
    const t = g[1].replace(/\|.*$/, '').replace(/\[[^\]]*\]/g, '');
    for (let i = 0; i < t.length; i++) {
      if (!'~<>'.includes(t[i])) continue;
      let k = i - 1;
      while (k >= 0 && !/[a-mA-M]/.test(t[k])) k--;
      if (k >= 0 && 'dfhj'.includes(t[k])) n++;
    }
  }
  return n;
};
const pieces = [];
for (let id = 3463; id <= 3999 && pieces.length < 15; id++) {
  if (used.has(id)) continue;
  const file = join(dir, `${id}.gabc`);
  let src;
  try {
    src = existsSync(file) ? readFileSync(file, 'utf8') : execFileSync('curl', ['-sSf', '-m', '60', `https://gregobase.selapa.net/download.php?id=${id}&format=gabc&elem=1`], { encoding: 'utf8' });
  } catch { continue; }
  const book = /^book:(.*);/m.exec(src)?.[1]?.trim() ?? '';
  const pg = /^Graduale Romanum, 1908, p\. (\[?)(\d+)\]?$/.exec(book);
  if (!pg) continue;
  const hooks = onLineLiquescents(src.slice(src.indexOf('%%')));
  if (!hooks) continue;
  if (!existsSync(file)) writeFileSync(file, src);
  const leaf = Number(pg[2]) + (pg[1] ? 585 : 26);
  const name = /^name:(.*);/m.exec(src)[1].trim();
  pieces.push({
    name: `GregoBase ${id} (${name})`,
    gabc: `corpus/gregobase-1908-hook/${id}.gabc`,
    book: 'Graduale Romanum, Vatican 1908',
    archive: 'gradualesacrosan0000cath',
    local: true,
    onLineLiquescents: hooks,
    pages: [leaf - 2, leaf - 1, leaf, leaf + 1].map((l) => ({ page: l === leaf ? `${pg[1]}${pg[2]}${pg[1] ? ']' : ''}` : `leaf ${l}`, leaf: l })),
  });
}
const note = 'Fresh held-out pieces for the hook-on-line rule (scan.mjs liquescentTail, LIQ.onLine), chosen on 2026-11-16 by eval/hook-fresh.mjs after the rule was set from one cephalicus (GregoBase 3464, leaf 604) and frozen, and listed before any of their pages was downloaded: in id order from 3463, the first 15 GregoBase ids in no earlier piece list whose book: header names only the Graduale Romanum, 1908, and whose GABC has a liquescent with its small note on a staff line (d, f, h or j before ~ < >). Arabic page p is printed on leaf p+26, bracketed page [p] on leaf p+585; the two leaves before it and the one after are read and the piece found by local alignment. GABC files are unmodified GregoBase downloads (CC0), in corpus/gregobase-1908-hook/.';
writeFileSync(join(here, 'hook-fresh-pages.json'), JSON.stringify({ note, pieces }, null, 2) + '\n');
console.log(pieces.map((p) => `${p.name} leaf ${p.pages[2].leaf}, ${p.onLineLiquescents} on-line liquescents`).join('\n'));
