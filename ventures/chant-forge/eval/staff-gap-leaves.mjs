// node eval/staff-gap-leaves.mjs --pick
// node eval/staff-gap-leaves.mjs [--cache DIR] [--out FILE]
//
// A held-out check of the staff-gap join (scan.mjs staffExtent, STAFF_JOIN;
// eval/staff-gap-check.md) on pages no piece list reads, made from
// eval/fleck-leaves.mjs. There is no GABC to align against (the 1908
// Graduale's GregoBase pieces are used up), so each page is read with and
// without the join, and every staff whose read stretch changes is listed
// with the gap it crossed and the notes it gained, for a person to look at
// as a crop: a precision check, not a recall one.
//
// --pick writes eval/staff-gap-leaves.json without downloading a page: the
// Graduale leaves 40 to 899 that no eval/*pages*.json, eval/*leaves.json
// list reads, one in every 6 of them in leaf order starting at the 4th.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readPage, binarize, estimateSkew, shearColumns, findStaves } from '../scan.mjs';
import { scanCache } from './scan-cache.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ITEM = 'gradualesacrosan0000cath';
const LIST = join(here, 'staff-gap-leaves.json');

if (args.includes('--pick')) {
  const used = new Set();
  for (const f of readdirSync(here).filter((f) => /pages.*\.json$/.test(f))) {
    for (const p of JSON.parse(readFileSync(join(here, f), 'utf8')).pieces) if (p.archive === ITEM) for (const pg of p.pages) used.add(pg.leaf);
  }
  for (const f of readdirSync(here).filter((f) => /leaves\.json$/.test(f) && f !== 'staff-gap-leaves.json')) {
    for (const l of JSON.parse(readFileSync(join(here, f), 'utf8')).leaves) used.add(l);
  }
  const free = [];
  for (let l = 40; l <= 899; l++) if (!used.has(l)) free.push(l);
  const leaves = free.filter((_, i) => i % 6 === 3);
  const note = 'Held-out Graduale Romanum 1908 leaves (archive.org gradualesacrosan0000cath) for the staff-gap join (STAFF_JOIN), picked on 2026-11-18 by eval/staff-gap-leaves.mjs --pick before any was downloaded: leaves 40 to 899 that no eval/*pages*.json and no other eval/*leaves.json reads, one in every 6 in leaf order from the 4th.';
  writeFileSync(LIST, JSON.stringify({ note, archive: ITEM, leaves }, null, 2) + '\n');
  console.log(`${leaves.length} leaves: ${leaves.join(' ')}`);
  process.exit(0);
}

const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const out = opt('--out', join(here, 'staff-gap-leaves-report.md'));
const { leaves } = JSON.parse(readFileSync(LIST, 'utf8'));
const { page, prefetch } = scanCache(cache);
await prefetch(leaves.map((l) => [ITEM, l]));
const rows = [];
let staves = 0, stavesOff = 0, changed = 0, notes = 0, notesOff = 0, otherDiff = 0;
for (const leaf of leaves) {
  const img = page(ITEM, leaf);
  const raw = binarize(img);
  const t0 = estimateSkew(raw);
  const bin = t0 ? shearColumns(raw, t0) : raw;
  const ext = findStaves(bin), extOff = findStaves(bin, { staffJoin: false });
  const on = readPage(img), off = readPage(img, { staffJoin: false });
  staves += on.length;
  stavesOff += off.length;
  on.forEach((st, k) => {
    const o = off[k] || { notes: [] };
    notes += st.notes.length;
    notesOff += o.notes.length;
    const a = ext[k], b = extOff[k];
    const moved = a && b && (a.left !== b.left || a.right !== b.right);
    const same = JSON.stringify(st.notes) === JSON.stringify(o.notes);
    if (moved) {
      changed++;
      const gap = a.left < b.left ? `${b.left} (left side joined)` : `${b.right} (right side joined)`;
      rows.push(`| ${leaf} | ${st.staff} | ${b.left}-${b.right} | ${a.left}-${a.right} | ${gap} | ${o.notes.length} | ${st.notes.length} |`);
    } else if (!same) otherDiff++;
  });
}
const lines = ['# The staff-gap join on unread Graduale leaves', '',
  `Written by \`node eval/staff-gap-leaves.mjs\`: ${leaves.length} leaves of eval/staff-gap-leaves.json.`,
  `Staves found: ${stavesOff} without the join (\`staffJoin: false\`), ${staves} with it. Staves whose read stretch changed: ${changed}.`,
  `Notes read: ${notesOff} without the join, ${notes} with it. Staves whose notes differ although their stretch did not change: ${otherDiff}.`, '',
  'Every staff whose stretch changed (x in page pixels; the gap is where the shorter side was cut off before):', ''];
if (rows.length) lines.push('| leaf | staff | stretch before | stretch after | gap at x | notes before | notes after |', '|---|---|---|---|---|---|---|', ...rows);
else lines.push('None.');
writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.join('\n'));
