// Mean power per song section of the six-verse Pange lingua, backing only, through the
// preview renderer, for each genre. Reproduces the README "Song sections" tables.
//   node eval/section-levels.mjs [--no-breakdown]
import { readFileSync } from 'node:fs';
import { parseGabc, fitStretch, transposeToFinal } from '../gabc.mjs';
import { sectionPlan } from '../sections.mjs';
import { arrange } from '../genre.mjs';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi } from '../render.mjs';

const breakdown = process.argv.includes('--no-breakdown') ? false : 'auto';
const src = parseGabc(readFileSync(new URL('../corpus/pange-lingua-full.gabc', import.meta.url), 'utf8'));
const ev = fitStretch(transposeToFinal(src.events, 52), 8);
const plan = sectionPlan({ events: ev, intro: 2, outro: 2, breakdown });
const bars = plan.at(-1).start + plan.at(-1).bars;
const db = (x) => (20 * Math.log10(x)).toFixed(1);
const energies = ['intro', 'verse', 'drop', 'breakdown', 'build', 'outro'];
console.log(`| genre | ${energies.join(' | ')} |`);
console.log(`|---|${energies.map(() => '---').join('|')}|`);
for (const [genre, bpm] of [['deep-house', 124], ['edm', 140], ['hard-rock', 140], ['metal', 170]]) {
  const a = arrange({ genre, mode: Number(src.headers?.mode || 3), final: 52, bars, sections: plan });
  const wav = renderMidi(eventsToMidi([{ type: 'bar', kind: 'full', pulses: 8 * bars }], { bpm, backing: a }), { targetPeak: 0.8 });
  const L = wav.channels[0];
  const rate = wav.sampleRate || 44100;
  const barSamples = (rate * 240) / bpm;
  const acc = Object.fromEntries(energies.map((k) => [k, [0, 0]]));
  for (const s of plan) {
    for (let b = s.start; b < s.start + s.bars; b++) {
      const kind = s.build && b === s.start + s.bars - 1 ? 'build' : s.energy;
      for (let i = Math.floor(b * barSamples); i < Math.floor((b + 1) * barSamples) && i < L.length; i++) { acc[kind][0] += L[i] * L[i]; acc[kind][1]++; }
    }
  }
  console.log(`| ${genre}, ${bpm} BPM | ${energies.map((k) => (acc[k][1] ? `${db(Math.sqrt(acc[k][0] / acc[k][1]))} dB` : '-')).join(' | ')} |`);
}
