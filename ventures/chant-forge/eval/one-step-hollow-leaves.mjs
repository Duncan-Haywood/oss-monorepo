// node eval/one-step-hollow-leaves.mjs --pick
// node eval/one-step-hollow-leaves.mjs [--cache DIR] [--out FILE]
//
// A held-out check of the hollow small note bridge (scan.mjs
// oneStepCephalicus, ONE_STEP.gap; eval/one-step-hollow-check.md) on pages
// no piece list reads. GregoBase's Graduale Romanum 1908 pieces are used up
// (eval/one-step-hollow-fresh.mjs found one piece left in ids 3000-6999), so
// there is no GABC to align against: this check reads each page with and
// without the bridge and lists every note that changes, for a person to look
// at as a crop. It measures where the bridge acts and whether those places
// are one-step cephalici, not how many cephalici a page holds.
//
// --pick writes eval/one-step-hollow-leaves.json without downloading a page:
// the Graduale leaves 40 to 899 that no eval/*pages*.json reads, one in
// every 16 of them in leaf order (about 30 leaves).
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
const LIST = join(here, 'one-step-hollow-leaves.json');

if (args.includes('--pick')) {
  const used = new Set();
  for (const f of readdirSync(here).filter((f) => /pages.*\.json$/.test(f))) {
    for (const p of JSON.parse(readFileSync(join(here, f), 'utf8')).pieces) if (p.archive === ITEM) for (const pg of p.pages) used.add(pg.leaf);
  }
  const free = [];
  for (let l = 40; l <= 899; l++) if (!used.has(l)) free.push(l);
  const leaves = free.filter((_, i) => i % 16 === 0);
  const note = 'Held-out Graduale Romanum 1908 leaves (archive.org gradualesacrosan0000cath) for the hollow small note bridge, picked on 2026-11-18 by eval/one-step-hollow-leaves.mjs --pick before any was downloaded: leaves 40 to 899 that no eval/*pages*.json reads, one in every 16 in leaf order.';
  writeFileSync(LIST, JSON.stringify({ note, archive: ITEM, leaves }, null, 2) + '\n');
  console.log(`${leaves.length} leaves: ${leaves.join(' ')}`);
  process.exit(0);
}

const cache = opt('--cache', join(tmpdir(), 'chant-forge-scans'));
const out = opt('--out', join(here, 'one-step-hollow-leaves-report.md'));
const { leaves } = JSON.parse(readFileSync(LIST, 'utf8'));
const { page, prefetch } = scanCache(cache);
await prefetch(leaves.map((l) => [ITEM, l]));
const rows = [];
let staves = 0, notes = 0, liqOn = 0, liqOff = 0;
for (const leaf of leaves) {
  const img = page(ITEM, leaf);
  const on = readPage(img), off = readPage(img, { oneStepGap: false });
  on.forEach((st, k) => {
    staves++;
    notes += st.notes.length;
    const o = off[k] || { notes: [] };
    liqOn += st.notes.filter((n) => n.shape === 'liquescent').length;
    liqOff += o.notes.filter((n) => n.shape === 'liquescent').length;
    const key = (n) => `${n.x}/${n.rel}/${n.shape}`;
    const a = new Set(st.notes.map(key)), b = new Set(o.notes.map(key));
    const added = st.notes.filter((n) => !b.has(key(n))), removed = o.notes.filter((n) => !a.has(key(n)));
    if (added.length || removed.length) {
      const say = (ns) => ns.map((n) => `${n.rel}${n.shape === 'liquescent' ? '~' : ''} at x ${n.x}`).join(', ') || '-';
      rows.push(`| ${leaf} | ${st.staff} | ${say(added)} | ${say(removed)} |`);
    }
  });
}
const lines = ['# The hollow small note bridge on unread Graduale leaves', '',
  `Written by \`node eval/one-step-hollow-leaves.mjs\`: ${leaves.length} leaves of eval/one-step-hollow-leaves.json, ${staves} staves, ${notes} notes read with the bridge.`,
  `Liquescents read: ${liqOff} without the bridge (\`oneStepGap: false\`), ${liqOn} with it.`, '',
  'Every note that differs (rel = steps from the clef line; `~` = liquescent):', ''];
if (rows.length) lines.push('| leaf | staff | with the bridge only | without the bridge only |', '|---|---|---|---|', ...rows);
else lines.push('None.');
writeFileSync(out, lines.join('\n') + '\n');
console.log(lines.join('\n'));
