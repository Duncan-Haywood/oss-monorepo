// node eval/thick-line-check.mjs [--cache DIR] [--out FILE]
//
// Are staff lines measured at their own thickness, and is every staff
// found? On a line crowded with heads (a recitation on one pitch) the head
// rows alone cover a fifth of the page width, and findStaves used to take
// them as part of the line: a 6 px line came out 19 px thick, readStaff
// then dropped every head sitting on it, and the line's centre moved enough
// that the staff's even-spacing test could fail and the whole staff go
// unread (eval/thick-line-check.md). For every page already scanned (the
// five *pages.json sets) this reads the page with the finder as it was
// (staffV1) and as it is, and reports line thickness in staff spaces,
// staves found and notes read. Needs curl and ffmpeg, like scan-check.mjs.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readPgm, readPage, binarize, findStaves } from '../scan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const out = opt('--out', join(here, 'thick-line-report.md'));
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

const bins = [0.2, 0.3, 0.5, Infinity];
const label = ['under 0.2', '0.2 to 0.3', '0.3 to 0.5', '0.5 or more'];
const tally = { v1: { lines: 0, staves: 0, notes: 0, hist: [0, 0, 0, 0] }, now: { lines: 0, staves: 0, notes: 0, hist: [0, 0, 0, 0] } };
const changed = [];
for (const [item, leaf] of pages.values()) {
  const img = page(item, leaf);
  const bin = binarize(img);
  const res = {};
  for (const [k, o] of [['v1', { staffV1: true }], ['now', {}]]) {
    const staves = findStaves(bin, o);
    const read = readPage(img, o);
    const t = tally[k];
    t.staves += staves.length;
    t.notes += read.reduce((s, st) => s + st.notes.length, 0);
    for (const st of staves) for (const l of st.lines) {
      t.lines++;
      const th = (l.bottom - l.top + 1) / st.space;
      t.hist[bins.findIndex((b) => th < b)]++;
    }
    res[k] = { tops: staves.map((s) => Math.round(s.top)), notes: read.map((s) => s.notes.length) };
  }
  const lost = res.v1.tops.filter((t) => !res.now.tops.some((u) => Math.abs(u - t) < 8));
  const added = res.now.tops.filter((t) => !res.v1.tops.some((u) => Math.abs(u - t) < 8));
  if (lost.length || added.length) changed.push(`| ${item} | ${leaf} | ${res.v1.tops.length} | ${res.now.tops.length} | ${added.join(', ') || '-'} | ${lost.join(', ') || '-'} |`);
}

const v = tally.v1, n = tally.now;
const lines = [
  '# Staff lines at their own thickness: before and after',
  '',
  'Written by `node eval/thick-line-check.mjs` (reader: `scan.mjs`, `findStaves` and `trimLine`). "Before" is the',
  'finder up to 2026-11-14 (`staffV1`); "after" trims each line band to the rows that hold long runs of ink, also',
  'tries the spacing of a staff\'s outer two lines, and drops a "staff" far tighter than the page\'s median.',
  `Every page scanned so far: ${pages.size} pages from the five \`eval/*pages.json\` sets. Why: \`thick-line-check.md\`.`,
  '',
  '| | before | after |',
  '|---|---|---|',
  `| staves found | ${v.staves} | ${n.staves} |`,
  `| staff lines | ${v.lines} | ${n.lines} |`,
  ...label.map((l, i) => `| lines ${l} staff spaces thick | ${v.hist[i]} | ${n.hist[i]} |`),
  `| notes read (every staff, clef-relative or not) | ${v.notes} | ${n.notes} |`,
  '',
  '## Pages where the staves found differ',
  '',
  'Tops in pixels on the 2000 px archive.org page image.',
  '',
  '| item | leaf | staves before | after | added (top) | lost (top) |',
  '|---|---|---|---|---|---|',
  ...changed,
  '',
];
writeFileSync(out, lines.join('\n'));
console.log(`staves ${v.staves} -> ${n.staves}; lines 0.5+ spaces thick ${v.hist[3]} -> ${n.hist[3]}; notes ${v.notes} -> ${n.notes}; ${changed.length} pages differ; wrote ${out}`);
