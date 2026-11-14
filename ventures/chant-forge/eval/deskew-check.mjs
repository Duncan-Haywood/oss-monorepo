// node eval/deskew-check.mjs [--cache DIR] [--out FILE]
//
// Does straightening tilted pages (estimateSkew and shearColumns in
// scan.mjs, 2026-11-14) find staves the square reader misses, and does it
// lose any? For every page already scanned (the five *pages.json sets) this
// reads the page with { deskew: false } and as it is, and lists each page's
// estimated slope, staves found and notes read, and every page where the
// two differ. Then run scan-check.mjs and shape-check.mjs as usual: a page
// whose staves changed should agree with its GABC on as many notes or more.
// Needs curl and ffmpeg, and archive.org, like scan-check.mjs (the page
// images are not kept in the tree).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readPgm, readPage, binarize, estimateSkew } from '../scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const out = opt('--out', join(here, 'deskew-report.md'));
mkdirSync(cache, { recursive: true });

function page(item, leaf, width = 2000) {
  const jpg = join(cache, `${item}-n${leaf}-w${width}.jpg`);
  const pgm = jpg.replace(/\.jpg$/, '.pgm');
  if (!existsSync(jpg)) execFileSync('curl', ['-sSfL', '-m', '120', '-o', jpg, `https://archive.org/download/${item}/page/n${leaf}_w${width}.jpg`]);
  if (!existsSync(pgm)) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', jpg, '-pix_fmt', 'gray', pgm]);
  return readPgm(readFileSync(pgm));
}

const pages = new Map();
for (const f of readdirSync(here).filter((f) => /pages\.json$/.test(f)).sort()) {
  for (const p of JSON.parse(readFileSync(join(here, f), 'utf8')).pieces) for (const pg of p.pages) pages.set(`${p.archive}:${pg.leaf}`, [p.archive, pg.leaf]);
}

const tally = { off: { staves: 0, notes: 0 }, on: { staves: 0, notes: 0 }, straightened: 0 };
const slopes = [];
const changed = [];
for (const [item, leaf] of pages.values()) {
  const img = page(item, leaf);
  const t = estimateSkew(binarize(img));
  const deg = (Math.atan(t) * 180) / Math.PI;
  if (t) { tally.straightened++; slopes.push(`${leaf}: ${deg.toFixed(2)}`); }
  const off = readPage(img, { deskew: false }), on = readPage(img);
  const notes = (p) => p.reduce((s, st) => s + st.notes.length, 0);
  tally.off.staves += off.length; tally.on.staves += on.length;
  tally.off.notes += notes(off); tally.on.notes += notes(on);
  if (off.length !== on.length || notes(off) !== notes(on)) changed.push(`| ${item} | ${leaf} | ${deg.toFixed(2)} | ${off.length} | ${on.length} | ${notes(off)} | ${notes(on)} |`);
}

const lines = [
  '# Tilted pages straightened: before and after',
  '',
  'Written by `node eval/deskew-check.mjs` (reader: `scan.mjs`, `estimateSkew` and `shearColumns`). "Before" reads',
  'every page square (`{ deskew: false }`); "after" straightens a page whose slope moves a line `DESKEW_MIN_DRIFT`',
  `pixels or more across it. Every page scanned so far: ${pages.size} pages from the five \`eval/*pages.json\` sets.`,
  '',
  '| | before | after |',
  '|---|---|---|',
  `| staves found | ${tally.off.staves} | ${tally.on.staves} |`,
  `| notes read (every staff) | ${tally.off.notes} | ${tally.on.notes} |`,
  `| pages straightened | - | ${tally.straightened} |`,
  '',
  `Slopes found, degrees (leaf: slope): ${slopes.join('; ') || 'none'}`,
  '',
  '## Pages where the reading differs',
  '',
  '| item | leaf | slope (deg) | staves before | after | notes before | after |',
  '|---|---|---|---|---|---|---|',
  ...changed,
  '',
];
writeFileSync(out, lines.join('\n'));
console.log(`staves ${tally.off.staves} -> ${tally.on.staves}; notes ${tally.off.notes} -> ${tally.on.notes}; ${tally.straightened} pages straightened; ${changed.length} differ; wrote ${out}`);
