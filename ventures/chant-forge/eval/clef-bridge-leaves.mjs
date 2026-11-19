// node eval/clef-bridge-leaves.mjs --pick
// node eval/clef-bridge-leaves.mjs [--cache DIR] [--out FILE] [--crops DIR]
//
// A held-out check of the F clef bridge (scan.mjs findClef, CLEF_BRIDGE;
// eval/clef-bridge-check.md) on Graduale leaves no piece list and no other
// leaves list reads, made from eval/staff-gap-leaves.mjs. There is no GABC
// for them, so each page is read with and without the bridge and every staff
// whose clef position changes is listed (with its notes, which move with it)
// for a person to look at as a crop: a precision check, not a recall one.
// --crops DIR writes each changed staff's start as a PNG (ImageMagick).
//
// --pick writes eval/clef-bridge-leaves.json without downloading a page: the
// Graduale leaves 40 to 899 that no eval/*pages*.json and no eval/*leaves.json
// list reads, one in every 6 of them in leaf order starting at the 1st.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPage, binarize, estimateSkew, shearColumns, findStaves } from '../scan.mjs';
import { scanCache } from './scan-cache.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ITEM = 'gradualesacrosan0000cath';
const LIST = join(here, 'clef-bridge-leaves.json');

if (args.includes('--pick')) {
  const used = new Set();
  for (const f of readdirSync(here).filter((f) => /pages.*\.json$/.test(f))) {
    for (const p of JSON.parse(readFileSync(join(here, f), 'utf8')).pieces) if (p.archive === ITEM) for (const pg of p.pages) used.add(pg.leaf);
  }
  for (const f of readdirSync(here).filter((f) => /leaves\.json$/.test(f) && f !== 'clef-bridge-leaves.json')) {
    for (const l of JSON.parse(readFileSync(join(here, f), 'utf8')).leaves) used.add(l);
  }
  const free = [];
  for (let l = 40; l <= 899; l++) if (!used.has(l)) free.push(l);
  const leaves = free.filter((_, i) => i % 6 === 0);
  const note = 'Held-out Graduale Romanum 1908 leaves (archive.org gradualesacrosan0000cath) for the F clef bridge (CLEF_BRIDGE), picked on 2026-11-19 by eval/clef-bridge-leaves.mjs --pick before any was downloaded: leaves 40 to 899 that no eval/*pages*.json and no eval/*leaves.json reads, one in every 6 in leaf order from the 1st.';
  writeFileSync(LIST, JSON.stringify({ note, archive: ITEM, leaves }, null, 2) + '\n');
  console.log(`${leaves.length} leaves: ${leaves.join(' ')}`);
  process.exit(0);
}

const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const out = opt('--out', join(here, 'clef-bridge-leaves-report.md'));
const crops = opt('--crops', '');
if (crops) mkdirSync(crops, { recursive: true });
const { leaves } = JSON.parse(readFileSync(LIST, 'utf8'));
const { page, prefetch } = scanCache(cache);
await prefetch(leaves.map((l) => [ITEM, l]));
const rows = [];
let staves = 0, changed = 0, otherDiff = 0, noClef = 0;
for (const leaf of leaves) {
  const img = page(ITEM, leaf);
  const on = readPage(img), off = readPage(img, { clefBridge: false });
  staves += on.length;
  on.forEach((st, k) => {
    const o = off[k] || { notes: [] };
    if (st.clefPos == null) noClef++;
    if (st.clefPos !== o.clefPos) {
      changed++;
      rows.push(`| ${leaf} | ${st.staff} | ${o.clefPos} | ${st.clefPos} | ${st.notes.length} |`);
      if (crops) {
        const raw = binarize(img);
        const t0 = estimateSkew(raw);
        const bin = t0 ? shearColumns(raw, t0) : raw;
        const f = findStaves(bin)[k];
        const s = f.space, x = Math.max(0, Math.round(f.left - s)), y = Math.round(f.top - 2 * s);
        const w = Math.round(8 * s), h = Math.round(f.bottom - f.top + 4 * s);
        execFileSync('convert', [join(cache, `${ITEM}-n${leaf}-w2000.jpg`), '-crop', `${w}x${h}+${x}+${y}`, '-scale', '300%', join(crops, `${leaf}-${st.staff}.png`)]);
      }
    } else if (JSON.stringify(st.notes) !== JSON.stringify(o.notes)) otherDiff++;
  });
}
const lines = ['# The F clef bridge on unread Graduale leaves', '',
  `Written by \`node eval/clef-bridge-leaves.mjs\`: ${leaves.length} leaves of eval/clef-bridge-leaves.json, ${staves} staves (${noClef} with no clef found).`,
  `Staves whose clef position changed with the bridge (\`clefBridge: false\` before): ${changed}. Staves whose notes differ although the clef did not change: ${otherDiff}.`, '',
  'Every staff whose clef changed (position 0 is the bottom line, 6 the top; every note on the staff moves with it):', ''];
if (rows.length) lines.push('| leaf | staff | clef before | clef after | notes |', '|---|---|---|---|---|', ...rows);
else lines.push('None.');
writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.join('\n'));
