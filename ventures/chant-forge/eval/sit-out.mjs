// What --sit-out N buys and costs on the corpus, for the two example range tests.
// Run: node eval/sit-out.mjs > eval/sit-out-report.md
// The range tests are made up (examples/*.csv), not a real choir: this shows the trade-off
// the option exposes, not what any real choir can sing.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGabc, transposeToFinal } from '../gabc.mjs';
import { suggestFinal, splitVoices } from '../voicefit.mjs';
import { parseSingers, singersChoir, sitOutNotes } from '../singers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = readdirSync(join(here, '..', 'corpus')).filter((f) => f.endsWith('.gabc')).sort();
const rows = [];
for (const csv of ['range-test.csv', 'range-test-sections.csv']) {
  const p = parseSingers(readFileSync(join(here, '..', 'examples', csv), 'utf8'));
  for (const f of corpus) {
    const { events } = parseGabc(readFileSync(join(here, '..', 'corpus', f), 'utf8'));
    const cells = [];
    for (const n of [0, 1, 2]) {
      const sc = singersChoir(p, ['tenor', 'bass'], n);
      const u = sc.unison && suggestFinal(events, sc.unison);
      let how, ev;
      if (u && u.fits) { how = 'unison'; ev = transposeToFinal(events, u.recommended.final); }
      else {
        const c = sc.choir;
        const r = splitVoices(events, { tenor: c.tenor, bass: c.bass, baritone: c.baritone || null, tenor2: c.tenor2 || null });
        if (!r.fits) { cells.push('no fit'); continue; }
        how = `full choir ${r.allNotes}/${r.notes}`;
        ev = r.events;
      }
      const out = sitOutNotes(ev, sc);
      const most = out[0] ? `${out[0].notes}/${out[0].of}` : '0';
      cells.push(`${how}; ${out.length} sit out, most ${most}`);
    }
    rows.push(`| ${csv} | ${f} | ${cells.join(' | ')} |`);
  }
}
console.log(`# --sit-out on the corpus

\`node eval/sit-out.mjs\`. **The two range tests are made up** (\`examples/\`, placeholder names), not a real
choir, so this shows what the option trades, not what any real choir can sing. For each N: whether the
chant fits in unison (on the band all but N singers reach) or else how many notes the whole choir sings
in a tenor/bass split (sections from the file, or divided by range for the unsectioned file), then how
many singers sit at least one note out and the most notes one singer sits out.

| range test | chant | N = 0 | N = 1 | N = 2 |
|---|---|---|---|---|
${rows.join('\n')}
`);
