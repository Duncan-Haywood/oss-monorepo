import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latinVowel, singNote, FORMANTS } from './sing.mjs';
import { estimateFormants, nearestVowel, polyRoots } from './formants.mjs';
import { eventsToMidi } from './midi.mjs';
import { renderMidi, parseMidi, tickToSeconds } from './render.mjs';

const rate = 44100;

test('latinVowel reads ecclesiastical Latin syllables', () => {
  const v = (s) => { const r = latinVowel(s); return r && (r.glide ? `${r.vowel}>${r.glide}` : r.vowel); };
  assert.equal(v('DI'), 'i');
  assert.equal(v('rae,'), 'e'); // ae
  assert.equal(v('cæ'), 'e');
  assert.equal(v('cǽ'), 'e');
  assert.equal(v('cœ'), 'e');
  assert.equal(v('qui'), 'i'); // u after q is a consonant
  assert.equal(v('gua'), 'a'); // lin-gua
  assert.equal(v('guis'), 'i'); // san-guis
  assert.equal(v('gu'), 'u'); // Au-gu-sti: u after g with no vowel after it is sung
  assert.equal(v('iam'), 'a'); // i before a vowel opening a syllable is j
  assert.equal(v('Ie'), 'e');
  assert.equal(v('ius'), 'u');
  assert.equal(v('Ky'), 'i');
  assert.equal(v('víl'), 'i'); // accents dropped
  assert.equal(v('lau'), 'a>u');
  assert.equal(v('Eu'), 'e>u');
  assert.equal(v('huic'), 'u>i');
  assert.equal(v('℣'), null);
  assert.equal(v(''), null);
  assert.equal(v(null), null);
});

test('polyRoots finds the roots of a known polynomial', () => {
  // (z - 0.5)(z + 0.25)(z^2 + 0.81) = z^4 - 0.25 z^3 + 0.685 z^2 - 0.2025 z - 0.10125
  const r = polyRoots([1, -0.25, 0.685, -0.2025, -0.10125]).map(([a, b]) => [Math.round(a * 1e6) / 1e6 || 0, Math.round(b * 1e6) / 1e6 || 0]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  assert.deepEqual(r, [[-0.25, 0], [0, -0.9], [0, 0.9], [0.5, 0]]);
});

test('each sung vowel measures within 10% of its F1 and 5% of its F2 on D3 and reads as itself', () => {
  for (const [v, F] of Object.entries(FORMANTS)) {
    const e = estimateFormants(singNote(146.83, 1.2, rate, { vowel: v }), rate, { from: 0.35, to: 1.15 });
    assert.ok(Math.abs(e[0] - F[0]) / F[0] < 0.1, `${v} F1 ${e[0]}`);
    assert.ok(Math.abs(e[1] - F[1]) / F[1] < 0.05, `${v} F2 ${e[1]}`);
    assert.equal(nearestVowel(e, FORMANTS), v);
  }
});

test('a diphthong glides: the end of "lau" reads /u/, its start /a/', () => {
  const w = singNote(110, 2, rate, { vowel: 'a', glide: 'u' });
  assert.equal(nearestVowel(estimateFormants(w, rate, { from: 0.3, to: 1.1 }), FORMANTS), 'a');
  assert.equal(nearestVowel(estimateFormants(w, rate, { from: 1.75, to: 1.98 }), FORMANTS), 'u');
});

test('renderMidi sing: the choir sings the lyric under each note, a melisma keeps its vowel', () => {
  const ev = [
    { type: 'note', midi: 50, pulses: 8, syllable: 'li' },
    { type: 'note', midi: 52, pulses: 8, syllable: null }, // melisma on li
    { type: 'note', midi: 50, pulses: 8, syllable: 'bo' },
  ];
  const mid = eventsToMidi(ev, { bpm: 120 });
  const m = parseMidi(mid);
  const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
  assert.deepEqual(notes.map((n) => n.lyric), ['li', 'li', 'bo']);
  assert.equal(notes[0].syl, notes[1].syl);
  assert.notEqual(notes[1].syl, notes[2].syl);
  const r = renderMidi(mid, { stems: true, sing: true });
  const sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const got = notes.map((n) => nearestVowel(estimateFormants(r.stems.choir.channels[0], rate, { from: sec(n.tick) + 0.3, to: sec(n.end) - 0.05 }), FORMANTS));
  assert.deepEqual(got, ['i', 'i', 'o']);
  // deterministic, and sing off is the pad as before
  assert.deepEqual(renderMidi(mid, { sing: true }).channels[0], r.channels[0]);
  assert.notDeepEqual(renderMidi(mid).channels[0], r.channels[0]);
});
