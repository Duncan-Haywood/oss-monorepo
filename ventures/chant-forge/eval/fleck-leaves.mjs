// node eval/fleck-leaves.mjs --pick
// node eval/fleck-leaves.mjs [--cache DIR] [--out FILE]
//
// A held-out check of the split-head join (scan.mjs readStaff, FLECK;
// eval/fleck-check.md) on pages no piece list reads, made from
// eval/one-step-hollow-leaves.mjs. There is no GABC to align against (the
// 1908 Graduale's GregoBase pieces are used up), so each page is read with
// and without the join and every note that changes is listed, for a person
// to look at as a crop: a precision check, not a recall one.
//
// --pick writes eval/fleck-leaves.json without downloading a page: the
// Graduale leaves 40 to 899 that no eval/*pages*.json and not
// eval/one-step-hollow-leaves.json reads, one in every 16 of them in leaf
// order starting at the 9th (about 30 leaves).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { readPage } from '../scan.mjs';
import { scanCache } from './scan-cache.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ITEM = 'gradualesacrosan0000cath';
const LIST = join(here, 'fleck-leaves.json');

if (args.includes('--pick')) {
  const used = new Set();
  for (const f of readdirSync(here).filter((f) => /pages.*\.json$/.test(f))) {
    for (const p of JSON.parse(readFileSync(join(here, f), 'utf8')).pieces) if (p.archive === ITEM) for (const pg of p.pages) used.add(pg.leaf);
  }
  for (const l of JSON.parse(readFileSync(join(here, 'one-step-hollow-leaves.json'), 'utf8')).leaves) used.add(l);
  const free = [];
  for (let l = 40; l <= 899; l++) if (!used.has(l)) free.push(l);
  const leaves = free.filter((_, i) => i % 16 === 8);
  const note = 'Held-out Graduale Romanum 1908 leaves (archive.org gradualesacrosan0000cath) for the split-head join (FLECK), picked on 2026-11-18 by eval/fleck-leaves.mjs --pick before any was downloaded: leaves 40 to 899 that no eval/*pages*.json and not eval/one-step-hollow-leaves.json reads, one in every 16 in leaf order from the 9th.';
  writeFileSync(LIST, JSON.stringify({ note, archive: ITEM, leaves }, null, 2) + '\n');
  console.log(`${leaves.length} leaves: ${leaves.join(' ')}`);
  process.exit(0);
}

const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const out = opt('--out', join(here, 'fleck-leaves-report.md'));
const { leaves } = JSON.parse(readFileSync(LIST, 'utf8'));
const { page, prefetch } = scanCache(cache);
await prefetch(leaves.map((l) => [ITEM, l]));
const rows = [];
let staves = 0, notes = 0, notesOff = 0;
for (const leaf of leaves) {
  const img = page(ITEM, leaf);
  const on = readPage(img), off = readPage(img, { fleck: false });
  on.forEach((st, k) => {
    staves++;
    notes += st.notes.length;
    const o = off[k] || { notes: [] };
    notesOff += o.notes.length;
    const key = (n) => `${n.x}/${n.rel}/${n.shape}`;
    const a = new Set(st.notes.map(key)), b = new Set(o.notes.map(key));
    const added = st.notes.filter((n) => !b.has(key(n))), removed = o.notes.filter((n) => !a.has(key(n)));
    if (added.length || removed.length) {
      const say = (ns) => ns.map((n) => `${n.rel}${n.shape === 'liquescent' ? '~' : ''} at x ${n.x}`).join(', ') || '-';
      rows.push(`| ${leaf} | ${st.staff} | ${say(added)} | ${say(removed)} |`);
    }
  });
}
const lines = ['# The split-head join on unread Graduale leaves', '',
  `Written by \`node eval/fleck-leaves.mjs\`: ${leaves.length} leaves of eval/fleck-leaves.json, ${staves} staves.`,
  `Notes read: ${notesOff} without the join (\`fleck: false\`), ${notes} with it.`, '',
  'Every note that differs (rel = steps from the clef line; `~` = liquescent):', ''];
if (rows.length) lines.push('| leaf | staff | with the join only | without the join only |', '|---|---|---|---|', ...rows);
else lines.push('None.');
writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.join('\n'));
