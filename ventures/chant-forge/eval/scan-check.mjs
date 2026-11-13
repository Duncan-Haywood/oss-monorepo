// node eval/scan-check.mjs [--cache DIR] [--only NAME] [--out FILE]
//
// Compares corpus GABC files with page scans of the printed book they cite,
// note by note, using scan.mjs. Pages come from archive.org (public-domain
// scans; item, leaf and staves per piece in scan-pages.json), are fetched
// with curl and turned into PGM with ffmpeg, both of which must be on PATH.
// Writes a markdown report: per piece, how many printed notes the reader
// found, how many agree with the GABC, and every disagreement with its page,
// staff and x position, so a person (or a later run) can look at exactly
// those spots on the scan.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readPgm, readPage, gabcSteps, align } from '../scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const only = opt('--only', null);
const out = opt('--out', join(here, 'scan-check-report.md'));
mkdirSync(cache, { recursive: true });

const NAMES = 'abcdefghijklm';

function page(item, leaf, width = 2000) {
  const jpg = join(cache, `${item}-n${leaf}-w${width}.jpg`);
  const pgm = jpg.replace(/\.jpg$/, '.pgm');
  if (!existsSync(jpg)) {
    execFileSync('curl', ['-sSfL', '-m', '120', '-o', jpg, `https://archive.org/download/${item}/page/n${leaf}_w${width}.jpg`]);
  }
  if (!existsSync(pgm)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', jpg, '-pix_fmt', 'gray', pgm]);
  return readPgm(readFileSync(pgm));
}

const manifest = JSON.parse(readFileSync(join(here, 'scan-pages.json'), 'utf8'));
const lines = [
  '# Corpus against the printed book, read off the scans',
  '',
  'Written by `node eval/scan-check.mjs` (scan reader: `scan.mjs`). "Agree" counts',
  'printed notes whose staff position, relative to the clef, matches the GABC note',
  'the alignment pairs them with. "GABC only" are notes the reader did not find on',
  'the page (mostly shapes it cannot read: porrectus strokes, rhombi joined to a',
  'stem, notes on ledger lines); "scan only" are marks it read as notes that the',
  'GABC lacks (flats, the odd custos, specks). Disagreements are listed so each',
  'can be looked at on the scan; the verdicts from looking are in',
  '`scan-check-verdicts.md`.',
  '',
  '| piece | book | pages | notes read | agree | differ | GABC only | scan only | agreement |',
  '|---|---|---|---|---|---|---|---|---|',
];
const details = [];
const summary = [];
for (const piece of manifest.pieces) {
  if (only && piece.name !== only) continue;
  const src = readFileSync(join(root, piece.gabc), 'utf8');
  const g = gabcSteps(src);
  const scanNotes = [];
  for (const p of piece.pages) {
    const staves = readPage(page(piece.archive, p.leaf));
    const [from, to] = p.staves || [1, staves.length];
    for (const s of staves.slice(from - 1, to)) {
      for (const n of s.notes) if (n.rel !== null) scanNotes.push({ ...n, page: p.page, leaf: p.leaf, staff: s.staff });
    }
  }
  const r = align(scanNotes.map((n) => n.rel), g.map((n) => n.rel));
  const span = r.endJ - r.startJ;
  const agreement = r.match / Math.max(1, span);
  summary.push({ name: piece.name, notes: scanNotes.length, ...r, span, agreement });
  lines.push(`| ${piece.name} | ${piece.book} | ${piece.pages.map((p) => p.page).join(', ')} | ${scanNotes.length} | ${r.match} | ${r.sub} | ${r.gabcOnly} | ${r.scanOnly} | ${(100 * agreement).toFixed(1)}% of ${span} GABC notes |`);
  const diffs = [];
  r.pairs.forEach(([p, q], k) => {
    if (p !== null && q !== null && scanNotes[p].rel === g[q].rel) return;
    if (p === null && q !== null) return; // missed notes are listed by count only
    const n = p !== null ? scanNotes[p] : null;
    // syllable context: the GABC syllable this lands on, or the next one
    let qq = q;
    for (let d = k; qq === null && d < r.pairs.length; d++) qq = r.pairs[d][1];
    const syl = qq !== null && qq < g.length ? g[qq].text : '';
    const where = n ? `p. ${n.page} (leaf ${n.leaf}), staff ${n.staff}, x ${n.x}` : '';
    const scanName = n ? NAMES[n.rel + piece.clefLine] || `step ${n.rel}` : '-';
    const gabcName = q !== null ? NAMES[g[q].rel + piece.clefLine] || `step ${g[q].rel}` : '-';
    diffs.push(`| ${syl || '?'} | ${gabcName} | ${scanName} | ${where} |`);
  });
  details.push('', `## ${piece.name}`, '', `${piece.gabc}, ${g.length} GABC notes; scan of ${piece.book} (archive.org item \`${piece.archive}\`).`, '');
  if (diffs.length) details.push('| syllable | GABC | scan | where |', '|---|---|---|---|', ...diffs);
  else details.push('No disagreement among the notes the reader found.');
}
lines.push(...details, '');
writeFileSync(out, lines.join('\n'));
for (const s of summary) console.log(`${s.name}: ${s.notes} notes read, ${s.match} agree, ${s.sub} differ, ${s.gabcOnly} GABC only, ${s.scanOnly} scan only (${(100 * s.agreement).toFixed(1)}% of ${s.span})`);
console.log(`wrote ${out}`);
