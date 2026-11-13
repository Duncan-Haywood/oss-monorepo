// node eval/shape-check.mjs [--cache DIR] [--out FILE]
//
// Does the scan reader tell a rhombus from a square? For every piece in
// scan-pages.json, the scan's notes are aligned with the GABC by pitch (as
// in scan-check.mjs) and, for each pair that agrees in pitch, the shape the
// reader saw (scan.mjs headShape) is set against the shape the GABC writes
// (gabcShape: upper-case letter = rhombus, w = quilisma, ~ < > = liquescent,
// v = virga). The first five pieces are the ones the thresholds were set on;
// the seven GregoBase pieces after them are held out, and the nine in
// shape-fresh-pages.json were added (and first scanned) after the quilisma
// rule was fixed, so they are held out from that too. Every pair where the
// two disagree about a rhombus is listed with its page, staff and x, so it
// can be looked at on the scan. Needs curl and ffmpeg, like scan-check.mjs.
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
const out = opt('--out', join(here, 'shape-check-report.md'));
mkdirSync(cache, { recursive: true });
const TUNED = 5; // pieces 1-5 set the thresholds; the rest are held out

function page(item, leaf, width = 2000) {
  const jpg = join(cache, `${item}-n${leaf}-w${width}.jpg`);
  const pgm = jpg.replace(/\.jpg$/, '.pgm');
  if (!existsSync(jpg)) execFileSync('curl', ['-sSfL', '-m', '120', '-o', jpg, `https://archive.org/download/${item}/page/n${leaf}_w${width}.jpg`]);
  if (!existsSync(pgm)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', jpg, '-pix_fmt', 'gray', pgm]);
  return readPgm(readFileSync(pgm));
}

const manifest = JSON.parse(readFileSync(join(here, 'scan-pages.json'), 'utf8'));
const fresh = JSON.parse(readFileSync(join(here, 'shape-fresh-pages.json'), 'utf8')).pieces.map((p) => ({ ...p, fresh: true }));
const SHAPES = ['punctum', 'virga', 'rhombus', 'quilisma', 'liquescent', 'oriscus', 'stropha'];
const empty = () => Object.fromEntries(SHAPES.map((k) => [k, { inGabc: 0, paired: 0, rhombus: 0, quilisma: 0, square: 0, none: 0 }]));
const SETS = { tuned: 'tuned on', held: 'held out', fresh: 'fresh' };
const sets = { tuned: empty(), held: empty(), fresh: empty() };
const oddQ = [];
const perPiece = [];
const odd = [];
[...manifest.pieces, ...fresh].forEach((piece, idx) => {
  const set = piece.fresh ? 'fresh' : idx < TUNED ? 'tuned' : 'held';
  const g = gabcSteps(readFileSync(join(root, piece.gabc), 'utf8'));
  const scan = [];
  for (const p of piece.pages) {
    const staves = readPage(page(piece.archive, p.leaf));
    const [from, to] = p.staves || [1, staves.length];
    for (const s of staves.slice(from - 1, to)) for (const n of s.notes) if (n.rel !== null) scan.push({ ...n, page: p.page, leaf: p.leaf, staff: s.staff });
  }
  const r = (piece.local ? alignLocal : align)(scan.map((n) => n.rel), g.map((n) => n.rel));
  const t = empty();
  for (let q = r.startJ; q < r.endJ; q++) { t[g[q].shape].inGabc++; sets[set][g[q].shape].inGabc++; }
  for (const [p, q] of r.pairs) {
    if (p === null || q === null || scan[p].rel !== g[q].rel) continue;
    const want = g[q].shape, saw = scan[p].shape || 'none';
    for (const c of [t[want], sets[set][want]]) { c.paired++; c[saw]++; }
    if ((want === 'rhombus') !== (saw === 'rhombus') && saw !== 'none' && ['punctum', 'rhombus'].includes(want)) {
      odd.push(`| ${piece.name} | ${SETS[set]} | ${g[q].text || '?'} | ${g[q].group} | ${want} | ${saw} | p. ${scan[p].page} (leaf ${scan[p].leaf}), staff ${scan[p].staff}, x ${scan[p].x} |`);
    }
    if ((want === 'quilisma') !== (saw === 'quilisma') && saw !== 'none') {
      oddQ.push(`| ${piece.name} | ${SETS[set]} | ${g[q].text || '?'} | ${g[q].group} | ${want} | ${saw} | p. ${scan[p].page} (leaf ${scan[p].leaf}), staff ${scan[p].staff}, x ${scan[p].x} |`);
    }
  }
  perPiece.push({ name: piece.name, set, t });
});

const pct = (a, b) => (b ? `${a} of ${b} (${((100 * a) / b).toFixed(1)}%)` : '-');
const L = [
  '# Head shapes: the scan reader against the GABC',
  '',
  'Written by `node eval/shape-check.mjs` (reader: `scan.mjs`, `headShape`). Notes are paired by',
  'pitch as in `scan-check.mjs`; for each pair that agrees in pitch, the shape the reader saw is set',
  'against the shape the GABC writes. "Tuned on" is the five corpus pieces the thresholds were chosen on:',
  'a rhombus is under 0.42 staff spaces wide with end columns under 0.8 of the middle ones\' height; a',
  'quilisma has three or more rows, in its upper half, that cross two or more separate runs of ink',
  '(`notchRows`, `QUILISMA_ROWS`). "Held out" is the seven GregoBase pieces from the 1908 Graduale',
  'that played no part in the rhombus rule; they were looked at while the quilisma measure was being',
  'chosen, so for quilismas they are not a clean test. "Fresh" is the nine pieces in',
  '`shape-fresh-pages.json`, chosen and first scanned after the quilisma rule was fixed.',
  '',
  '**Version 2.** One rule was added after the fresh pieces had been looked at: a notched head',
  'whose left neighbour at its height is wider than 0.8 staff spaces and ends within 0.2 spaces of it',
  'continues a porrectus stroke the reader cut in two, and is not a quilisma (`afterStroke`). On the',
  'fresh set the frozen rule without it called 18 of 1,849 other heads quilismas; with it, 12, with no',
  'quilisma lost. So the fresh false-call figure below is no longer a clean held-out number; the',
  'quilisma recall on it is (the added rule can only remove calls). The eye check of the fresh calls',
  'is in `quilisma-eye-check.md`.',
  '',
  '| set | GABC shape | in the GABC span | paired by pitch | read as rhombus | read as quilisma | read as square |',
  '|---|---|---|---|---|---|---|',
];
for (const set of Object.keys(SETS)) {
  for (const k of SHAPES) {
    const c = sets[set][k];
    if (!c.inGabc) continue;
    L.push(`| ${SETS[set]} | ${k} | ${c.inGabc} | ${c.paired} | ${pct(c.rhombus, c.paired)} | ${pct(c.quilisma, c.paired)} | ${pct(c.square, c.paired)} |`);
  }
}
L.push('', '## Per piece', '', '| piece | set | rhombi in GABC | paired | read as rhombus | quilismas in GABC | paired | read as quilisma | squares (punctum, virga) paired | read as rhombus | read as quilisma |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const p of perPiece) {
  const sq = { paired: p.t.punctum.paired + p.t.virga.paired, rhombus: p.t.punctum.rhombus + p.t.virga.rhombus, quilisma: p.t.punctum.quilisma + p.t.virga.quilisma };
  L.push(`| ${p.name} | ${SETS[p.set]} | ${p.t.rhombus.inGabc} | ${p.t.rhombus.paired} | ${p.t.rhombus.rhombus} | ${p.t.quilisma.inGabc} | ${p.t.quilisma.paired} | ${p.t.quilisma.quilisma} | ${sq.paired} | ${sq.rhombus} | ${sq.quilisma} |`);
}
const head = ['| piece | set | syllable | GABC group | GABC shape | scan shape | where |', '|---|---|---|---|---|---|---|'];
L.push('', '## Rhombus disagreements to look at', '');
if (odd.length) L.push(...head, ...odd);
else L.push('None.');
L.push('', '## Quilisma disagreements to look at', '');
if (oddQ.length) L.push(...head, ...oddQ);
else L.push('None.');
L.push('');
writeFileSync(out, L.join('\n'));
for (const set of Object.keys(SETS)) {
  const c = sets[set];
  const other = SHAPES.filter((k) => k !== 'quilisma').reduce((n, k) => n + c[k].quilisma, 0);
  const otherPaired = SHAPES.filter((k) => k !== 'quilisma').reduce((n, k) => n + c[k].paired, 0);
  console.log(`${set}: rhombi ${c.rhombus.rhombus}/${c.rhombus.paired} read as rhombus; squares called rhombus ${c.punctum.rhombus + c.virga.rhombus}/${c.punctum.paired + c.virga.paired}; quilismas ${c.quilisma.quilisma}/${c.quilisma.paired} read as quilisma (${c.quilisma.inGabc} in GABC); other heads called quilisma ${other}/${otherPaired}; liquescents paired ${c.liquescent.paired}/${c.liquescent.inGabc}`);
}
console.log(`${odd.length} rhombus and ${oddQ.length} quilisma disagreement(s); wrote ${out}`);
