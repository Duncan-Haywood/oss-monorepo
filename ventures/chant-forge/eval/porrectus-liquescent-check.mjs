// node eval/porrectus-liquescent-check.mjs [--manifest FILE ...] [--cache DIR] [--out FILE]
//
// Does the scan reader find a liquescent that ends a porrectus (GABC
// `hfg~`, `dcd~`, `efef~`: high, low, then a liquescent above the low note,
// in one neume element)? The liquescent report (liquescent-check-report.md)
// listed these as "not looked for", on the guess that the 1908 type prints
// them as a porrectus stroke with the small note on the stroke's end. This
// check measures it instead: for every piece in the manifests, the scan's
// notes are aligned with the GABC by pitch (as in shape-check.mjs) and each
// porrectus liquescent is reported as read (paired at its pitch and called
// a liquescent), read as another shape, or not paired. The other GABC
// liquescents in the same pieces, and heads the reader calls liquescent
// where the GABC has none, are counted alongside. Default manifests: the
// tuning set (porrectus-liquescent-pages.json) and the held-out set
// (porrectus-liquescent-fresh-pages.json), listed together before either
// was scanned. Needs curl and ffmpeg, like scan-check.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readPage, gabcSteps, align, alignLocal } from '../scan.mjs';
import { scanCache } from './scan-cache.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const manifests = args.flatMap((a, i) => (args[i - 1] === '--manifest' ? [a] : []));
const files = manifests.length ? manifests : [join(here, 'porrectus-liquescent-pages.json'), join(here, 'porrectus-liquescent-fresh-pages.json')];
const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const out = opt('--out', null);

// A liquescent that ends a porrectus: the two notes before it are in the
// same GABC neume element (no / ! , or space between), the first higher
// than the second, the liquescent higher than the second, and neither of
// the two is a rhombus, virga, quilisma or oriscus (those print as their
// own glyphs, not a porrectus).
export function porrectusLiquescents(src) {
  const flags = [];
  const body = src.includes('%%') ? src.slice(src.indexOf('%%') + 2) : src;
  const re = /\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(body.replace(/%[^\n]*/g, '')))) {
    const g = m[1].split('|')[0].replace(/\[[^\]]*\]/g, '');
    if (/^\s*[cf]b?[1-5]\s*$/.test(g)) continue;
    for (const el of g.replace(/[cf]b?[1-5]/g, '').split(/[\/!, ]+/)) {
      const notes = [...el.matchAll(/([a-mA-M])([^a-mA-M]*)/g)]
        .filter((n) => !/^\+/.test(n[2]))
        .flatMap((n) => {
          // an accidental (fx fy f#) is not a note
          if (/^[xy#]/.test(n[2])) return [];
          const rep = /^(v{2,}|s{2,})/.exec(n[2]);
          return Array.from({ length: rep ? rep[0].length : 1 }, () => n);
        });
      notes.forEach((n, i) => {
        let f = false;
        if (/[~<>]/.test(n[2]) && i >= 2) {
          const v = (x) => 'abcdefghijklm'.indexOf(x[1].toLowerCase());
          const [a, b] = [notes[i - 2], notes[i - 1]];
          const plain = (x) => x[1] === x[1].toLowerCase() && !/[vwoVO~<>s]/.test(x[2]);
          f = v(a) > v(b) && v(n) > v(b) && plain(a) && plain(b);
        }
        flags.push(f);
      });
    }
  }
  return flags;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { page, prefetch } = scanCache(cache);
  const sets = files.map((f) => ({ file: basename(f), pieces: JSON.parse(readFileSync(f, 'utf8')).pieces }));
  await prefetch(sets.flatMap((s) => s.pieces.flatMap((p) => p.pages.map((pg) => [p.archive, pg.leaf]))));
  const L = [];
  const rows = [];
  for (const set of sets) {
    const c = { porr: 0, porrRead: 0, porrOther: 0, porrNone: 0, liq: 0, liqRead: 0, others: 0, otherLiq: 0, added: 0 };
    for (const piece of set.pieces) {
      const src = readFileSync(join(root, piece.gabc), 'utf8');
      const g = gabcSteps(src);
      const flags = porrectusLiquescents(src);
      if (flags.length !== g.length) throw new Error(`${piece.name}: ${flags.length} flags for ${g.length} GABC notes`);
      const scan = [];
      for (const p of piece.pages) {
        const staves = readPage(page(piece.archive, p.leaf));
        const [from, to] = p.staves || [1, staves.length];
        for (const s of staves.slice(from - 1, to)) for (const n of s.notes) if (n.rel !== null) scan.push({ ...n, leaf: p.leaf, staff: s.staff });
      }
      const r = (piece.local ? alignLocal : align)(scan.map((n) => n.rel), g.map((n) => n.rel));
      const byQ = new Map(r.pairs.filter(([, q]) => q !== null).map(([p, q]) => [q, p]));
      for (const [p, q] of r.pairs) {
        if (p === null) continue;
        if (scan[p].shape === 'liquescent' && (q === null || scan[p].rel !== g[q].rel)) c.added++;
        if (q === null || scan[p].rel !== g[q].rel) continue;
        if (g[q].shape !== 'liquescent') { c.others++; if (scan[p].shape === 'liquescent') c.otherLiq++; }
      }
      for (let q = r.startJ; q < r.endJ; q++) {
        if (g[q].shape !== 'liquescent') continue;
        const p = byQ.get(q);
        const paired = p !== undefined && p !== null && scan[p].rel === g[q].rel;
        const read = paired && scan[p].shape === 'liquescent';
        if (!flags[q]) { c.liq++; if (read) c.liqRead++; continue; }
        c.porr++;
        if (read) c.porrRead++; else if (paired) c.porrOther++; else c.porrNone++;
        const where = paired ? `leaf ${scan[p].leaf}, staff ${scan[p].staff}, x ${scan[p].x}` : '';
        rows.push(`| ${piece.name} | ${set.file} | ${g[q].text || '?'} | \`${g[q].group}\` | ${read ? 'liquescent' : paired ? scan[p].shape : 'not paired'} | ${where} |`);
      }
    }
    console.log(`${set.file}: porrectus liquescents read ${c.porrRead} of ${c.porr} (read as another shape ${c.porrOther}, not paired ${c.porrNone}); other liquescents read ${c.liqRead} of ${c.liq}; other heads called liquescent ${c.otherLiq} of ${c.others}; added liquescent notes pairing with nothing at their pitch ${c.added}`);
    L.push(`| ${set.file} | ${set.pieces.length} | ${c.porr} | ${c.porrRead} | ${c.porrOther} | ${c.porrNone} | ${c.liqRead} of ${c.liq} | ${c.otherLiq} of ${c.others} | ${c.added} |`);
  }
  if (out) {
    writeFileSync(out, [
      '# Porrectus liquescents: the scan reader against the GABC',
      '',
      'Written by `node eval/porrectus-liquescent-check.mjs` (reader: `scan.mjs`). Pieces are aligned with',
      'their GABC by pitch as in `shape-check.mjs`.',
      '',
      '| manifest | pieces | porrectus liquescents in the aligned span | read as liquescent at their pitch | paired, other shape | not paired | other liquescents read | other heads called liquescent | added liquescent notes with no GABC note at their pitch |',
      '|---|---|---|---|---|---|---|---|---|',
      ...L,
      '',
      '## Every porrectus liquescent',
      '',
      '| piece | manifest | syllable | GABC group | reader | where |',
      '|---|---|---|---|---|---|',
      ...rows,
      '',
    ].join('\n'));
    console.log(`wrote ${out}`);
  }
}
