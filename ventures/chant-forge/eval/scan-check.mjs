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
import { readPgm, readPage, gabcSteps, align, alignLocal } from '../scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const only = opt('--only', null);
const out = opt('--out', join(here, 'scan-check-report.md'));
const trials = Number(opt('--trials', 200));
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
  '`scan-check-verdicts.md`. The last column is a control: one GABC note that',
  'agrees with the scan is moved a step up or down (seeded, one at a time) and',
  'the check is run again; it counts the trials in which the moved note is',
  'reported, so it says how many real one-step transcription slips this',
  'check would catch.',
  '',
  '| piece | book | pages | notes read | agree | differ | GABC only | scan only | agreement | one-step errors caught |',
  '|---|---|---|---|---|---|---|---|---|---|',
];
const details = [];
const summary = [];
for (const piece of manifest.pieces) {
  if (only && piece.name !== only) continue;
  const src = readFileSync(join(root, piece.gabc), 'utf8');
  const g = gabcSteps(src);
  if (piece.clefLine === undefined) { const c = /\(([cf])b?([1-4])\)/.exec(src.slice(src.indexOf('%%'))); piece.clefLine = 3 + 2 * (Number(c[2]) - 1); }
  const scanNotes = [];
  for (const p of piece.pages) {
    const staves = readPage(page(piece.archive, p.leaf));
    const [from, to] = p.staves || [1, staves.length];
    for (const s of staves.slice(from - 1, to)) {
      for (const n of s.notes) if (n.rel !== null) scanNotes.push({ ...n, page: p.page, leaf: p.leaf, staff: s.staff });
    }
  }
  // `local`: the pages also carry other pieces, so neither sequence's ends count
  const aligner = piece.local ? alignLocal : align;
  const r = aligner(scanNotes.map((n) => n.rel), g.map((n) => n.rel));
  const span = r.endJ - r.startJ;
  // Control: would the check notice a wrong note? Move one GABC note that
  // agrees with the scan up or down a step (seeded), align again, and count
  // the trials where that note no longer pairs with an equal scan note.
  const a = scanNotes.map((n) => n.rel);
  const agreeing = r.pairs.filter(([p, q]) => p !== null && q !== null && a[p] === g[q].rel).map(([, q]) => q);
  let seed = 12345, caught = 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let t = 0; t < trials && agreeing.length; t++) {
    const q = agreeing[Math.floor(rnd() * agreeing.length)];
    const b = g.map((n) => n.rel);
    b[q] += rnd() < 0.5 ? -1 : 1;
    const rr = aligner(a, b);
    if (!rr.pairs.some(([p, qq]) => qq === q && p !== null && a[p] === b[q])) caught++;
  }
  const agreement = r.match / Math.max(1, span);
  summary.push({ name: piece.name, notes: scanNotes.length, ...r, span, agreement, caught });
  lines.push(`| ${piece.name} | ${piece.book} | ${piece.pages.map((p) => p.page).join(', ')} | ${scanNotes.length} | ${r.match} | ${r.sub} | ${r.gabcOnly} | ${r.scanOnly} | ${(100 * agreement).toFixed(1)}% of ${span} GABC notes | ${caught} of ${trials} |`);
  const diffs = [];
  r.pairs.forEach(([p, q], k) => {
    if (p !== null && q !== null && scanNotes[p].rel === g[q].rel) return;
    // a note the reader missed is placed next to the nearest scan note
    let n = p !== null ? scanNotes[p] : null;
    let near = '';
    if (!n) {
      for (let d = 1; !n && d < r.pairs.length; d++) {
        for (const kk of [k - d, k + d]) if (!n && r.pairs[kk] && r.pairs[kk][0] !== null) n = scanNotes[r.pairs[kk][0]];
      }
      near = 'not read; near ';
    }
    // syllable context: the GABC syllable this lands on, or the next one
    let qq = q;
    for (let d = k; qq === null && d < r.pairs.length; d++) qq = r.pairs[d][1];
    const syl = qq !== null && qq < g.length ? g[qq].text : '';
    const where = n ? `${near}p. ${n.page} (leaf ${n.leaf}), staff ${n.staff}, x ${n.x}` : '';
    const scanName = p !== null ? NAMES[scanNotes[p].rel + piece.clefLine] || `step ${scanNotes[p].rel}` : '-';
    const gabcName = q !== null ? NAMES[g[q].rel + piece.clefLine] || `step ${g[q].rel}` : '-';
    diffs.push(`| ${syl || '?'} | ${q !== null ? g[q].group : ''} | ${gabcName} | ${scanName} | ${where} |`);
  });
  details.push('', `## ${piece.name}`, '', `${piece.gabc}, ${g.length} GABC notes; scan of ${piece.book} (archive.org item \`${piece.archive}\`).`, '');
  {
    // the ending: the GABC's last six notes and what the scan has there
    const last = g.slice(-6).map((n, k) => {
      const q = g.length - 6 + k;
      const pr = r.pairs.find(([, qq]) => qq === q);
      const sn = pr && pr[0] !== null ? NAMES[a[pr[0]] + piece.clefLine] : '·';
      return `${NAMES[n.rel + piece.clefLine]}/${sn}`;
    });
    details.push(`Ending, GABC/scan (· = not read or not on these pages): ${last.join(' ')}; GABC notes covered ${r.startJ + 1}-${r.endJ} of ${g.length}.`, '');
  }
  if (diffs.length) details.push('| syllable | GABC group | GABC note | scan | where |', '|---|---|---|---|---|', ...diffs);
  else details.push('No disagreement among the notes the reader found.');
}
lines.push(...details, '');
writeFileSync(out, lines.join('\n'));
for (const s of summary) console.log(`${s.name}: ${s.notes} notes read, ${s.match} agree, ${s.sub} differ, ${s.gabcOnly} GABC only, ${s.scanOnly} scan only (${(100 * s.agreement).toFixed(1)}% of ${s.span}); planted one-step errors caught ${s.caught}/${trials}`);
console.log(`wrote ${out}`);
