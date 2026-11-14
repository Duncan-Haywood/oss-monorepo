// node eval/rhombus-check.mjs [--cache DIR] [--out FILE] [--sweep] [--held-out]
//
// Does a height floor stop worn squares being read as rhombi? A rhombus
// (punctum inclinatum) is a square turned on its corner, so it stands
// taller than a square (about 0.7 staff spaces against 0.58). A square whose
// worn print shows white flecks loses its edge columns to the flecks and
// comes out narrow and tapered like a rhombus (eval/rhombus-height-check.md),
// but no taller. For every piece already scanned (scan-pages.json and the
// three fresh sets) and the held-out pieces in rhombus-fresh-pages.json,
// notes are paired with the GABC by pitch as in shape-check.mjs, and every
// pair whose GABC note is a punctum or a rhombus is scored under the rule
// before (w < 0.42 and taper < 0.8) and after (the same and h >= RHOMBUS_MIN_H).
// --sweep prints the counts for a range of floors on the pieces the floor
// was chosen on. Needs curl and ffmpeg, like scan-check.mjs.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readPgm, readPage, gabcSteps, align, alignLocal, RHOMBUS_MIN_H } from '../scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const out = opt('--out', join(here, 'rhombus-height-report.md'));
mkdirSync(cache, { recursive: true });

function page(item, leaf, width = 2000) {
  const jpg = join(cache, `${item}-n${leaf}-w${width}.jpg`);
  const pgm = jpg.replace(/\.jpg$/, '.pgm');
  if (!existsSync(jpg)) execFileSync('curl', ['-sSfL', '-m', '120', '-o', jpg, `https://archive.org/download/${item}/page/n${leaf}_w${width}.jpg`]);
  if (!existsSync(pgm)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', jpg, '-pix_fmt', 'gray', pgm]);
  return readPgm(readFileSync(pgm));
}

const load = (f, set) => JSON.parse(readFileSync(join(here, f), 'utf8')).pieces.map((p) => ({ ...p, set }));
const pieces = [
  ...load('scan-pages.json', 'chosen on'),
  ...load('shape-fresh-pages.json', 'chosen on'),
  ...load('liquescent-fresh-pages.json', 'chosen on'),
  ...load('quilisma-fresh-pages.json', 'chosen on'),
  ...(args.includes('--held-out') ? load('rhombus-fresh-pages.json', 'held out') : []),
];

const oldRule = (f) => f.w < 0.42 && f.taper < 0.8;
const newRule = (f, H = RHOMBUS_MIN_H, T = Infinity) => oldRule(f) && f.h >= H && f.h <= T;
const heads = []; // { set, piece, want, f, where }
for (const piece of pieces) {
  const g = gabcSteps(readFileSync(join(root, piece.gabc), 'utf8'));
  const scan = [];
  for (const p of piece.pages) {
    const staves = readPage(page(piece.archive, p.leaf), { features: true });
    const [from, to] = p.staves || [1, staves.length];
    for (const s of staves.slice(from - 1, to)) for (const n of s.notes) if (n.rel !== null) scan.push({ ...n, leaf: p.leaf, staff: s.staff });
  }
  const r = (piece.local ? alignLocal : align)(scan.map((n) => n.rel), g.map((n) => n.rel));
  for (const [p, q] of r.pairs) {
    if (p === null || q === null || scan[p].rel !== g[q].rel || !scan[p].feat) continue;
    const want = g[q].shape;
    if (!['punctum', 'rhombus'].includes(want)) continue;
    heads.push({ set: piece.set, piece: piece.name, want, f: scan[p].feat, where: `${scan[p].leaf}:${scan[p].staff}:${scan[p].x}`, text: g[q].text || '?' });
  }
}

function score(set, rule) {
  const hs = heads.filter((h) => h.set === set);
  const rh = hs.filter((h) => h.want === 'rhombus'), sq = hs.filter((h) => h.want === 'punctum');
  return { rhombi: rh.length, rhombiRead: rh.filter((h) => rule(h.f)).length, squares: sq.length, squaresCalled: sq.filter((h) => rule(h.f)).length };
}
const f2 = (x) => x.toFixed(2);
const L = [
  '# Rhombus height floor: before and after',
  '',
  'Written by `node eval/rhombus-check.mjs` (reader: `scan.mjs`, `headShape`). Pairs whose GABC note is',
  'a punctum (square) or a rhombus and whose scan head agrees in pitch. "Before" is the rule up to',
  `2026-11-14 (w < 0.42 and taper < 0.8); "after" adds h >= ${RHOMBUS_MIN_H} staff spaces (RHOMBUS_MIN_H). The sweep also tried a ceiling and dropped it.`,
  '"Chosen on" is every piece scanned before the floor was picked (50 pieces); "held out" is the six',
  'pieces in `rhombus-fresh-pages.json`, listed and committed before any of their pages was downloaded.',
  'Why and what the heads look like: `rhombus-height-check.md`.',
  '',
  '| set | rhombi paired | read as rhombus, before | after | squares paired | called rhombus, before | after |',
  '|---|---|---|---|---|---|---|',
];
for (const set of ['chosen on', 'held out']) {
  const a = score(set, oldRule), b = score(set, newRule);
  L.push(`| ${set} | ${a.rhombi} | ${a.rhombiRead} | ${b.rhombiRead} | ${a.squares} | ${a.squaresCalled} | ${b.squaresCalled} |`);
}
L.push('', '## Every head the two rules disagree on, and every head still wrong after', '',
  '| set | piece | syllable | GABC | w | h | fill | taper | before | after | leaf:staff:x |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const h of heads) {
  const a = oldRule(h.f), b = newRule(h.f);
  const wrongAfter = b !== (h.want === 'rhombus');
  if (a === b && !wrongAfter) continue;
  L.push(`| ${h.set} | ${h.piece} | ${h.text} | ${h.want} | ${f2(h.f.w)} | ${f2(h.f.h)} | ${f2(h.f.fill)} | ${f2(h.f.taper)} | ${a ? 'rhombus' : 'square'} | ${b ? 'rhombus' : 'square'} | ${h.where} |`);
}
if (args.includes('--sweep')) {
  L.push('', '## Floor and ceiling sweep on the pieces they were chosen on', '', '| floor | ceiling | rhombi read | squares called rhombus |', '|---|---|---|---|');
  for (const T of [0.85, 0.9, 0.95, 1.0, Infinity]) for (let H = 0.5; H <= 0.721; H += 0.02) {
    const s = score('chosen on', (f) => newRule(f, H, T));
    L.push(`| ${f2(H)} | ${T} | ${s.rhombiRead} of ${s.rhombi} | ${s.squaresCalled} of ${s.squares} |`);
  }
  const hsOf = (want) => heads.filter((h) => h.set === 'chosen on' && h.want === want && oldRule(h.f)).map((h) => h.f.h).sort((a, b) => a - b);
  const rh = hsOf('rhombus'), sq = hsOf('punctum');
  L.push('', `Heights of rhombi the old rule reads (chosen-on set): lowest ten ${rh.slice(0, 10).map(f2).join(', ')}; highest ten ${rh.slice(-10).map(f2).join(', ')}`,
    `Heights of squares the old rule calls rhombi (chosen-on set, all): ${sq.map(f2).join(', ')}`);
}
writeFileSync(out, L.join('\n') + '\n');
console.log(L.slice(9, 13).join('\n'));
