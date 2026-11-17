// node eval/one-step-hollow-fresh.mjs
//
// Builds eval/one-step-hollow-fresh-pages.json, the held-out list for the
// hollow small note bridge in the one-step cephalicus rule (scan.mjs
// oneStepCephalicus, ONE_STEP.gap; eval/one-step-hollow-check.md). Made from
// eval/one-step-fresh.mjs and run on 2026-11-17 after the bridge was set
// from three misses on the twelve tuning lists (GregoBase 3478, 3481, 3448)
// and frozen, before any page of these pieces was downloaded. Takes, in id
// order from 3000 to 6999, the first 15 GregoBase ids that are in no earlier
// piece list (the thirteen, one-step-fresh-pages.json included), none of
// whose four leaves any earlier list (or an earlier piece of this one)
// reads, whose book:
// header names only the Graduale Romanum, 1908 with a page, and whose GABC
// has a one-step cephalicus: a liquescent (~) whose note just before it, in
// the same group, is a plain lowercase pitch one letter higher (gf~, fe~).
// GABC files are saved unmodified to corpus/gregobase-1908-onestep/. Page to
// leaf as in eval/hook-fresh.mjs: Arabic page p on leaf p+26, bracketed [p]
// on leaf p+585; the two leaves before and the one after are read too and
// the piece found by local alignment.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dir = join(root, 'corpus/gregobase-1908-onestep');
const OUT = 'one-step-hollow-fresh-pages.json';
mkdirSync(dir, { recursive: true });
const used = new Set(), usedLeaves = new Set();
for (const f of readdirSync(here).filter((f) => /pages.*\.json$/.test(f) && f !== OUT)) {
  for (const m of readFileSync(join(here, f), 'utf8').matchAll(/(\d{4})\.gabc/g)) used.add(Number(m[1]));
  for (const p of JSON.parse(readFileSync(join(here, f), 'utf8')).pieces) for (const pg of p.pages) usedLeaves.add(pg.leaf);
}
const L = 'abcdefghijklm';
export const oneStepCephalici = (body) => {
  let n = 0;
  for (const g of body.matchAll(/\(([^)]*)\)/g)) {
    const t = g[1].replace(/\|.*$/, '').replace(/\[[^\]]*\]/g, '');
    for (const m of t.matchAll(/([a-m])([a-m])~/g)) if (L.indexOf(m[1]) - L.indexOf(m[2]) === 1) n++;
  }
  return n;
};
const pieces = [];
for (let id = 3000; id <= 6999 && pieces.length < 15; id++) {
  if (used.has(id)) continue;
  const file = join(dir, `${id}.gabc`);
  let src;
  try {
    src = existsSync(file) ? readFileSync(file, 'utf8') : execFileSync('curl', ['-sSf', '-m', '60', `https://gregobase.selapa.net/download.php?id=${id}&format=gabc&elem=1`], { encoding: 'utf8' });
  } catch { continue; }
  const book = /^book:(.*);/m.exec(src)?.[1]?.trim() ?? '';
  const pg = /^Graduale Romanum, 1908, p\. (\[?)(\d+)\]?$/.exec(book);
  if (!pg) continue;
  const k = oneStepCephalici(src.slice(src.indexOf('%%')));
  if (!k) continue;
  const leaf = Number(pg[2]) + (pg[1] ? 585 : 26);
  // no leaf any earlier list reads: the rule was tuned on those pages
  if ([leaf - 2, leaf - 1, leaf, leaf + 1].some((l) => usedLeaves.has(l) || pieces.some((q) => q.pages.some((pp) => pp.leaf === l)))) continue;
  if (!existsSync(file)) writeFileSync(file, src);
  const name = /^name:(.*);/m.exec(src)[1].trim();
  pieces.push({
    name: `GregoBase ${id} (${name})`,
    gabc: `corpus/gregobase-1908-onestep/${id}.gabc`,
    book: 'Graduale Romanum, Vatican 1908',
    archive: 'gradualesacrosan0000cath',
    local: true,
    oneStepCephalici: k,
    pages: [leaf - 2, leaf - 1, leaf, leaf + 1].map((l) => ({ page: l === leaf ? `${pg[1]}${pg[2]}${pg[1] ? ']' : ''}` : `leaf ${l}`, leaf: l })),
  });
}
const note = 'Fresh held-out pieces for the hollow small note bridge in the one-step cephalicus rule (scan.mjs oneStepCephalicus, ONE_STEP.gap), chosen on 2026-11-17 by eval/one-step-hollow-fresh.mjs after the bridge was set from three misses on the twelve tuning lists (GregoBase 3478, 3481, 3448) and frozen, and listed before any of their pages was downloaded: in id order from 3000 to 6999, the first 15 GregoBase ids in no earlier piece list (one-step-fresh-pages.json included), none of whose four leaves any earlier list (or an earlier piece of this list) reads, whose book: header names only the Graduale Romanum, 1908, and whose GABC has a one-step cephalicus (a liquescent whose note before it in the group is a plain pitch one letter higher). Arabic page p is printed on leaf p+26, bracketed page [p] on leaf p+585; the two leaves before it and the one after are read and the piece found by local alignment. GABC files are unmodified GregoBase downloads (CC0), in corpus/gregobase-1908-onestep/.';
writeFileSync(join(here, OUT), JSON.stringify({ note, pieces }, null, 2) + '\n');
console.log(pieces.map((p) => `${p.name} leaf ${p.pages[2].leaf}, ${p.oneStepCephalici} one-step cephalici`).join('\n'));
