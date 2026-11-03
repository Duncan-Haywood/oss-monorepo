// The studio page (index.html) runs gabc, midi, genre, voicefit and render in a browser, where there is no Buffer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the page pipeline runs without Buffer', async () => {
  const saved = globalThis.Buffer;
  delete globalThis.Buffer;
  try {
    const { parseGabc, fitStretch, transposeToFinal } = await import('./gabc.mjs');
    const { eventsToMidi } = await import('./midi.mjs');
    const { arrange, barsFor } = await import('./genre.mjs');
    const { renderMidi } = await import('./render.mjs');
    const p = parseGabc(readFileSync(new URL('./examples/dies-irae-incipit.gabc', import.meta.url), 'utf8'));
    const ev = fitStretch(transposeToFinal(p.events, 50), 8);
    const fin = [...ev].reverse().find((x) => x.type === 'note');
    const midi = eventsToMidi(ev, { title: 'Dies irae', backing: arrange({ genre: 'metal', mode: 1, final: fin.midi, bars: barsFor(ev) }) });
    assert.equal(String.fromCharCode(...midi.slice(0, 4)), 'MThd');
    const wav = renderMidi(midi);
    assert.ok(wav.seconds > 2 && wav.channels[0].length > 44100);
  } finally {
    globalThis.Buffer = saved;
  }
});

test('index.html imports only files that exist and has the disclaimer', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  for (const m of html.matchAll(/from "\.\/([\w.-]+)"/g)) assert.ok(readFileSync(new URL(`./${m[1]}`, import.meta.url)), m[1]);
  assert.match(html, /No warranty/);
  assert.match(html, /<title>[^<]{20,}<\/title>/);
});
