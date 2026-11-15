import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latinVowel, latinOnset, latinCoda, codaPlan, onsetLength, singNote, FORMANTS } from './sing.mjs';
import { readOnset, readCoda } from './onsets.mjs';
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

test('latinOnset reads the consonants of ecclesiastical Latin syllables', () => {
  const o = (s) => latinOnset(s).join(' ');
  assert.equal(o('Chri'), 'k r'); // ch is k
  assert.equal(o('qui'), 'k w'); // qu
  assert.equal(o('gua'), 'g w'); // lin-gua
  assert.equal(o('ci'), 'tS'); // soft c
  assert.equal(o('cae'), 'tS'); // c before ae
  assert.equal(o('ca'), 'k');
  assert.equal(o('ge'), 'dZ');
  assert.equal(o('glo'), 'g l');
  assert.equal(o('sce'), 'S'); // sc before e
  assert.equal(o('sco'), 's k');
  assert.equal(o('gna'), 'N');
  assert.equal(o('iam'), 'j');
  assert.equal(o('pha'), 'f');
  assert.equal(o('thro'), 't r');
  assert.equal(o('ho'), ''); // h silent
  assert.equal(o('xi'), 'k s');
  assert.equal(o('spi'), 's p');
  assert.equal(o('a'), '');
  assert.equal(o(''), '');
  assert.equal(o('℣'), '');
});

test('renderMidi sing: the opening consonant reads back from the audio, and the vowel-only choir has none', () => {
  // vowel-consonant-vowel pairs on D3: "a" then the syllable; the consonant is sung before the beat
  const SY = { ta: { cls: 'stop', voiced: false, place: 'alv' }, ka: { cls: 'stop', voiced: false, place: 'vel' }, da: { cls: 'stop', voiced: true, place: 'alv' }, sa: { cls: 'fricative', place: 's' }, sce: { cls: 'fricative', place: 'S' }, ci: { cls: 'affricate', voiced: false }, ma: { cls: 'nasal' }, ra: { cls: 'tap' }, a: { cls: 'none' } };
  const ev = [];
  for (const s of Object.keys(SY)) ev.push({ type: 'note', midi: 50, pulses: 4, syllable: 'a' }, { type: 'note', midi: 50, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 120 });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
  for (const sing of [true, 'vowels']) {
    const x = renderMidi(mid, { stems: true, sing }).stems.choir.channels[0];
    Object.entries(SY).forEach(([s, want], j) => {
      const t0 = sec(notes[2 * j + 1].tick);
      const got = readOnset(x, rate, t0 - 0.15, t0 + 0.06, { window: 1 });
      if (sing === true) for (const [k, v] of Object.entries(want)) assert.equal(got[k], v, `${s}: ${JSON.stringify(got)}`);
      else assert.equal(got.cls, 'none', `${s} sung without consonants: ${JSON.stringify(got)}`);
    });
  }
});

test('a consonant before the beat: the vowel is on the beat, the wave starts lead seconds early', () => {
  const plain = singNote(146.83, 0.5, rate, { vowel: 'a', release: 0.05 });
  const w = singNote(146.83, 0.5, rate, { vowel: 'a', release: 0.05, onset: ['s'], lead: onsetLength(['s']), onsetLen: onsetLength(['s']) });
  assert.equal(w.length - plain.length, Math.round(onsetLength(['s']) * rate));
  const lead = onsetLength(['s']);
  assert.equal(nearestVowel(estimateFormants(w, rate, { from: lead + 0.08, to: lead + 0.45 }), FORMANTS), 'a');
  assert.equal(readOnset(w, rate, 0, lead + 0.06).place, 's');
});

test('latinCoda reads the consonants that close a syllable', () => {
  const c = (s) => latinCoda(s).join(' ');
  assert.equal(c('es'), 's');
  assert.equal(c('Di'), '');
  assert.equal(c('num.'), 'm');
  assert.equal(c('Sanc'), 'n k'); // c is hard in a coda
  assert.equal(c('lux'), 'k s'); // x is ks
  assert.equal(c('sunt'), 'n t');
  assert.equal(c('laus'), 's'); // after a diphthong
  assert.equal(c('ae'), '');
  assert.equal(c('tuae'), ''); // two vowels in one syllable: nothing after the last
  assert.equal(c('Christ'), 's t');
  assert.equal(c('Ioseph'), 'f'); // ph is f
  assert.equal(c('ad'), 'd');
  assert.equal(c('℣'), '');
});

test('a coda sits at the end of the note and leaves the vowel before it', () => {
  const p = codaPlan(['s'], 0.6, 0.6);
  assert.equal(p.segs.at(-1).t1, 0.6);
  assert.equal(p.scale, 1);
  // a cluster on a short note keeps its floors (a 45 ms closure, 35 ms of hiss) and may take up to half the note
  const short = codaPlan(['k', 's'], 0.24, 0.24);
  assert.ok(short.scale < 1 && 0.24 - short.codaAt <= 0.5 * 0.24 + 1e-9, JSON.stringify(short));
  const [k, s] = short.segs;
  assert.ok(k.closure * k.k >= 0.045 - 1e-9 && s.t1 - s.t0 >= 0.035 - 1e-9 && Math.abs(s.t1 - 0.24) < 1e-9, JSON.stringify(short));
  // a single consonant that fits in 35% of the note is not stretched
  const one = codaPlan(['t'], 0.24, 0.24);
  assert.ok(0.24 - one.codaAt <= 0.35 * 0.24 + 1e-9, JSON.stringify(one));
  const w = singNote(146.83, 0.6, rate, { vowel: 'a', coda: ['s'], release: 0.2 });
  assert.equal(nearestVowel(estimateFormants(w, rate, { from: 0.1, to: 0.4 }), FORMANTS), 'a');
  // after a final obstruent the voices stop: the release is silent
  let tail = 0; for (let i = Math.round(0.62 * rate); i < w.length; i++) tail = Math.max(tail, Math.abs(w[i]));
  assert.ok(tail < 1e-3, `tail ${tail}`);
});

test('renderMidi sing: the final consonant reads back from the audio, and the vowel-only choir has none', () => {
  // on D3, where eval/coda-check.md part A reads these right (voiced and labial stops, l and clusters it does not)
  const SY = { as: { cls: 'fricative', place: 's' }, et: { cls: 'stop', voiced: false, place: 'alv' }, ad: { cls: 'stop', voiced: true, place: 'alv' }, an: { cls: 'nasal' }, er: { cls: 'tap' }, a: { cls: 'none' } };
  const ev = [];
  for (const s of Object.keys(SY)) ev.push({ type: 'note', midi: 50, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 120 });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
  for (const sing of [true, 'vowels']) {
    const x = renderMidi(mid, { stems: true, sing }).stems.choir.channels[0];
    Object.entries(SY).forEach(([s, want], j) => {
      const got = readCoda(x, rate, sec(notes[j].tick) + 0.1, sec(notes[j].end) + 0.25);
      if (sing === true) for (const [k, v] of Object.entries(want)) assert.equal(got[k], v, `${s}: ${JSON.stringify(got)}`);
      else assert.equal(got.cls, 'none', `${s} sung without consonants: ${JSON.stringify(got)}`);
    });
  }
});

test('a final nasal hums about 7 dB under its vowel at any pitch (one voice), and x reads as its k', () => {
  const rms = (x, a, b) => { let q = 0; for (let i = Math.round(a * rate); i < Math.round(b * rate); i++) q += x[i] * x[i]; return Math.sqrt(q / ((b - a) * rate)); };
  for (const midi of [40, 50, 57, 64]) for (const vowel of ['a', 'u']) {
    const f = 440 * 2 ** ((midi - 69) / 12), dur = 0.6;
    const w = singNote(f, dur, rate, { vowel, coda: ['m'], release: 0.3, detunes: [0], vibratoCents: 0, breath: 0 });
    const d = 20 * Math.log10(rms(w, dur - 0.04, dur - 0.01) / rms(w, 0.2, 0.4));
    assert.ok(d < -5 && d > -9, `${vowel} on ${midi}: murmur ${d.toFixed(1)} dB`);
  }
  for (const dur of [0.242, 0.5]) {
    const w = singNote(146.83, dur, rate, { vowel: 'e', coda: latinCoda('dex'), release: 0.25 });
    const got = readCoda(w, rate, 0.05, dur);
    assert.deepEqual([got.cls, got.voiced, got.place], ['stop', false, 'vel'], `dex at ${dur} s: ${JSON.stringify(got)}`);
  }
});
