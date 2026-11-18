// The --limit render (8 limiter passes) is this venture's slowest test, so it has
// its own file: node --test runs files in parallel, and render.test.mjs no longer
// carries it at the end of the suite. Moved unchanged from render.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGabc, fitToBars, transposeToFinal } from './gabc.mjs';
import { eventsToMidi } from './midi.mjs';
import { arrange, barsFor } from './genre.mjs';
import { renderMidi, encodeWav, readWav } from './render.mjs';
import { analyze } from './master.mjs';
import { run } from './render-cli.mjs';

const piece = () => {
  const p = parseGabc(readFileSync(new URL('./corpus/dies-irae.gabc', import.meta.url), 'utf8'));
  return { p, events: fitToBars(transposeToFinal(p.events, 50), 8) };
};

test('--limit reaches -14 LUFS on deep house with true peak under -1 dBTP, and stems still sum', () => {
  const { p, events } = piece();
  const fin = [...events].reverse().find((e) => e.type === 'note');
  const backing = arrange({ genre: 'deep-house', mode: Number(p.header.mode), final: fin.midi, bars: barsFor(events) });
  const midi = eventsToMidi(events, { bpm: 124, drone: true, backing });
  const r = renderMidi(midi, { targetLufs: -14, limit: true, stems: true });
  const res = analyze(readWav(encodeWav(r)));
  assert.ok(Math.abs(res.lufs + 14) < 0.5, `lufs ${res.lufs}`);
  assert.ok(res.truePeakDb <= -1, `true peak ${res.truePeakDb}`);
  const L = r.channels[0];
  for (const i of [20000, 50000, 90000, 150000]) {
    let s = 0; for (const st of Object.values(r.stems)) s += st.channels[0][i];
    assert.ok(Math.abs(s - L[i]) < 1e-9);
  }
  assert.equal(run(['x.mid', '--limit']).code, 2);
});
