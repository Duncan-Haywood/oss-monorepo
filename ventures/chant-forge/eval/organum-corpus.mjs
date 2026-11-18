// Organum over the corpus: for every GABC file, at its --auto-final key (E2-E4), add the organal
// voice (organum.mjs) to the whole piece and count its intervals, how often it must hold the
// boundary or meet the chant early, and whether it stays in E2-E4.
// Run: node eval/organum-corpus.mjs > eval/organum-corpus-report.md
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseGabc, transposeToFinal } from '../gabc.mjs';
import { suggestFinal, MENS_RANGE } from '../voicefit.mjs';
import { addOrganum } from '../organum.mjs';

const root = new URL('..', import.meta.url).pathname;
const files = [
  ...readdirSync(join(root, 'corpus')).filter((f) => f.endsWith('.gabc')).map((f) => join('corpus', f)),
  ...readdirSync(join(root, 'corpus/gregobase-1908')).filter((f) => f.endsWith('.gabc')).map((f) => join('corpus/gregobase-1908', f)),
];
const total = {};
let pieces = 0, notes = 0, fitBefore = 0, fitAfter = 0, below = [];
for (const f of files) {
  const ev = parseGabc(readFileSync(join(root, f), 'utf8')).events;
  if (!ev.some((e) => e.type === 'note')) continue;
  const r = suggestFinal(ev, MENS_RANGE);
  if (!r.fits) continue;
  fitBefore++;
  const t = transposeToFinal(ev, r.recommended.final);
  const o = addOrganum(t, { from: 1 });
  pieces++; notes += o.notes;
  for (const [k, n] of Object.entries(o.intervals)) total[k] = (total[k] || 0) + n;
  const low = Math.min(...o.events.filter((e) => e.organal !== undefined).map((e) => e.organal));
  if (low >= MENS_RANGE.low) fitAfter++; else below.push(`${f} (${low})`);
}
const name = { 0: 'unison', 1: 'semitone', 2: 'second', 3: 'minor third', 4: 'major third', 5: 'fourth' };
console.log(`# Organum over the corpus (eval/organum-corpus.mjs)\n`);
console.log(`${files.length} files; ${pieces} fit E2-E4 in unison at --auto-final's key and were voiced (${notes} notes).\n`);
console.log('| interval chant to organal voice | notes | share |\n|---|---|---|');
for (const k of Object.keys(total).sort((a, b) => b - a)) console.log(`| ${name[k] || k} | ${total[k]} | ${((100 * total[k]) / notes).toFixed(1)}% |`);
console.log(`\nOrganal voice still inside E2-E4 at that key: ${fitAfter} of ${fitBefore}.${below.length ? ` Under E2: ${below.join(', ')}.` : ''}`);
