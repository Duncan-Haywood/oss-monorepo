// Does the rendered audio actually move up a whole tone in the lifted last drop, and is the
// a cappella first verse silent under the choir? Six-verse Pange lingua, every genre, bass part
// only through the preview renderer: the bass fundamental in each bar of Drop 3 (lifted) against
// the Drop 2 bar at the same place in the four-bar loop. Expect 2^(2/12) = 1.1225.
//   node eval/key-lift-check.mjs
import { readFileSync } from 'node:fs';
import { parseGabc, fitStretch, transposeToFinal } from '../gabc.mjs';
import { sectionPlan } from '../sections.mjs';
import { arrange } from '../genre.mjs';
import { eventsToMidi } from '../midi.mjs';
import { renderMidi } from '../render.mjs';

const src = parseGabc(readFileSync(new URL('../corpus/pange-lingua-full.gabc', import.meta.url), 'utf8'));
const ev = fitStretch(transposeToFinal(src.events, 52), 8);
const plan = sectionPlan({ events: ev, intro: 2, outro: 2, acappella: true, keyLift: 2 });
const bars = plan.at(-1).start + plan.at(-1).bars;
const drops = plan.filter((s) => s.energy === 'drop');
const [d2, d3] = drops.slice(-2);
const acap = plan.find((s) => s.energy === 'acappella');

function pitch(x, rate, lo, hi) {
  let best = 0, bestLag = 0;
  for (let lag = Math.floor(rate / hi); lag <= Math.ceil(rate / lo); lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i += 2) s += x[i] * x[i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  return rate / bestLag;
}

console.log('| genre | bars compared | median ratio Drop 3 / Drop 2 | min | max | a cappella verse, backing peak: first bar / later bars |');
console.log('|---|---|---|---|---|---|');
for (const [genre, bpm] of [['deep-house', 124], ['edm', 140], ['hard-rock', 140], ['metal', 170]]) {
  const a = arrange({ genre, mode: 3, final: 52, bars, sections: plan });
  const rate = 22050;
  const bassOnly = { ...a, drums: [], chords: [] };
  const w = renderMidi(eventsToMidi([{ type: 'bar', kind: 'full', pulses: 8 * bars }], { bpm, backing: bassOnly }), { rate });
  const full = renderMidi(eventsToMidi([{ type: 'bar', kind: 'full', pulses: 8 * bars }], { bpm, backing: a }), { rate });
  const barS = (rate * 240) / bpm;
  const seg = (x, b) => x.subarray(Math.floor(b * barS), Math.floor(b * barS + barS / 2));
  const ratios = [];
  for (let k = 0; k < d3.bars - 1; k++) {
    const b3 = d3.start + k;
    const b2 = d2.start + ((((b3 - d2.start) % 4) + 4) % 4); // same loop position (degree) in Drop 2
    if (b2 >= d2.start + d2.bars - 1) continue;
    ratios.push(pitch(seg(w.channels[0], b3), rate, 30, 200) / pitch(seg(w.channels[0], b2), rate, 30, 200));
  }
  ratios.sort((x, y) => x - y);
  // the a cappella bars after the first (the first can carry the intro's release tail)
  let peak = 0, firstBar = 0;
  const L = full.channels[0];
  for (let i = Math.floor(acap.start * barS); i < Math.floor((acap.start + acap.bars - 1) * barS); i++) {
    if (i < (acap.start + 1) * barS) firstBar = Math.max(firstBar, Math.abs(L[i]));
    else peak = Math.max(peak, Math.abs(L[i]));
  }
  console.log(`| ${genre} | ${ratios.length} | ${ratios[ratios.length >> 1].toFixed(4)} | ${ratios[0].toFixed(4)} | ${ratios.at(-1).toFixed(4)} | ${firstBar.toExponential(2)} / ${peak === 0 ? '0 (silent)' : peak.toExponential(2)} |`);
}
