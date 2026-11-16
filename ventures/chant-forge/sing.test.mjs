import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tuneF1, latinVowel, latinOnset, latinCoda, codaPlan, onsetLength, onsetPlan, singNote, FORMANTS } from './sing.mjs';
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

test('nasal openings on short notes: the mouth closes (15 ms cross-fade) and the reader finds the murmur by its darkness', () => {
  // "ba" then m or n before each vowel, 0.24 s notes at 124 BPM on A2, D3 and G3 (README "Nasal openings:
  // the mouth closes"). Before it, with the 50 ms cross-fade and the level rule, 20 of these 30 read as nasal.
  const SY = ['ma', 'me', 'mi', 'mo', 'mu', 'na', 'ne', 'ni', 'no', 'nu'];
  const count = { now: 0, before: 0, vowels: 0 };
  for (const midi of [45, 50, 55]) {
    const ev = [];
    for (const s of SY) ev.push({ type: 'note', midi, pulses: 1, syllable: 'ba' }, { type: 'note', midi, pulses: 1, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
    const mid = eventsToMidi(ev, { bpm: 124 });
    const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
    const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
    for (const [k, opts, reader] of [['now', { sing: true }, {}], ['before', { sing: true, nasalCut: false }, { darkBy: 0 }], ['vowels', { sing: 'vowels' }, {}]]) {
      const x = renderMidi(mid, { stems: true, ...opts }).stems.choir.channels[0];
      SY.forEach((s, j) => { const t0 = sec(notes[2 * j + 1].tick); if (readOnset(x, rate, t0 - 0.12, t0 + 0.06, { window: 1, ...reader }).cls === 'nasal') count[k]++; });
    }
  }
  assert.ok(count.now >= 24, `nasals read: ${JSON.stringify(count)}`);
  assert.ok(count.now > count.before, `no gain over the old cross-fade and reader: ${JSON.stringify(count)}`);
  assert.equal(count.vowels, 0, `the vowel-only choir read as nasal: ${JSON.stringify(count)}`);
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

test('a final l sits about 4 dB under its vowel at any pitch and after any vowel (one voice); the fixed gain did not', () => {
  const rms = (x, a, b) => { let q = 0; for (let i = Math.round(a * rate); i < Math.round(b * rate); i++) q += x[i] * x[i]; return Math.sqrt(q / ((b - a) * rate)); };
  const dur = 0.6, sg = codaPlan(['l'], dur, dur).segs[0], q = (sg.t1 - sg.t0) / 4;
  const one = { coda: ['l'], detunes: [0], vibratoCents: 0, breath: 0 };
  let over = 0;
  for (const midi of [40, 50, 57, 64]) for (const vowel of ['a', 'e', 'i', 'o', 'u']) {
    const f = 440 * 2 ** ((midi - 69) / 12), lvl = (o) => { const w = singNote(f, dur, rate, { vowel, ...one, ...o }); return 20 * Math.log10(rms(w, sg.t0 + q, sg.t1 - q) / rms(w, 0.2, 0.35)); };
    const d = lvl({});
    assert.ok(d < -3 && d > -5, `${vowel}l on ${midi}: /l/ ${d.toFixed(1)} dB against its vowel`);
    if (lvl({ lateralLevel: false }) > 0) over++;
  }
  assert.ok(over >= 8, `the fixed gain put the /l/ over its vowel on ${over} of 20`);
});

test('an opening l sits under the vowel it goes to by the same few dB at any pitch and before any vowel (one voice); the fixed gain did not', () => {
  const rms = (x, a, b) => { let q = 0; for (let i = Math.round(a * rate); i < Math.round(b * rate); i++) q += x[i] * x[i]; return Math.sqrt(q / ((b - a) * rate)); };
  const dur = 0.6, sg = onsetPlan(['l'], dur).segs[0], q = (sg.t1 - sg.t0) / 4;
  const one = { onset: ['l'], detunes: [0], vibratoCents: 0, breath: 0 };
  const got = [], old = [];
  for (const midi of [40, 50, 55, 60, 64]) for (const vowel of ['a', 'e', 'i', 'o', 'u']) {
    const f = 440 * 2 ** ((midi - 69) / 12), lvl = (o) => { const w = singNote(f, dur, rate, { vowel, ...one, ...o }); return 20 * Math.log10(rms(w, sg.t0 + q, sg.t1 - q) / rms(w, 0.3, 0.45)); };
    got.push(lvl({})); old.push(lvl({ onsetLateral: 'first' }));
  }
  // 4 dB (LATERAL_DB) plus the voices' 30 ms swell over the /l/'s first half: eval/onset-lateral-check.md
  assert.ok(Math.max(...got) < -4.5 && Math.min(...got) > -7.5, `opening /l/ ${Math.min(...got).toFixed(1)} to ${Math.max(...got).toFixed(1)} dB`);
  assert.ok(Math.max(...got) - Math.min(...got) < 2, 'one level whatever the vowel and pitch');
  assert.ok(Math.max(...old) - Math.min(...old) > 8, `the fixed gain spread ${(Math.max(...old) - Math.min(...old)).toFixed(1)} dB`);
});

test('a final nasal hums on through the nose with no blip of bare vowel, and -um after a dark vowel reads as its murmur', async () => {
  const { frameFeatures } = await import('./onsets.mjs');
  // one voice, so the voices' beating does not hide it: before the fix the low-pass lifted for 10 ms between
  // murmur and hum, +12-19 dB above 1 kHz (README "Final consonants, third round")
  for (const vowel of ['u', 'a']) for (const midi of [45, 50, 57]) {
    const f = 440 * 2 ** ((midi - 69) / 12), dur = 0.5;
    const w = singNote(f, dur, rate, { vowel, coda: ['m'], release: 0.3, detunes: [0], vibratoCents: 0, breath: 0 });
    const hiShare = (t) => { const q = frameFeatures(w, Math.round(t * rate), rate); return 10 * Math.log10((q.hi1 + 1e-20) / (q.tot + 1e-20)); };
    const murmur = hiShare(dur - 0.045);
    for (let t = dur - 0.04; t < dur + 0.04; t += 0.0025) assert.ok(hiShare(t) < murmur + 6, `${vowel} on ${midi} at ${(t - dur).toFixed(4)} s: ${(hiShare(t) - murmur).toFixed(1)} dB brighter than the murmur`);
  }
  // through the MIDI path on D3, where the murmur after /u/ is only 8-12 dB darker than the vowel
  const ev = [];
  for (const s of ['um', 'u', 'a']) ev.push({ type: 'note', midi: 50, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 120 });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
  for (const sing of [true, 'vowels']) {
    const x = renderMidi(mid, { stems: true, sing }).stems.choir.channels[0];
    ['um', 'u', 'a'].forEach((s, j) => {
      const got = readCoda(x, rate, sec(notes[j].tick) + 0.1, sec(notes[j].end) + 0.25).cls;
      assert.equal(got, sing === true && s === 'um' ? 'nasal' : 'none', `${s} (${sing}): ${got}`);
    });
  }
});

test('a short final -um is read against the vowel just before it: five beating voices move both together', () => {
  // README "A short final -um against the vowel just before it": the murmur's level against the note's
  // start swung 4-15 dB with the beat, so -num, -tum and -rum on short notes read as nothing
  const SY = ['num', 'tum', 'rum', 'um', 'u', 'o', 'tu'], score = { near: 0, off: 0, all: 0 };
  for (const P of [1, 2]) for (const midi of [48, 50, 53, 64]) {
    const ev = [];
    for (const s of SY) ev.push({ type: 'note', midi, pulses: P, syllable: s }, { type: 'rest', pulses: 2 });
    const mid = eventsToMidi(ev, { bpm: 124 });
    const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
    const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
    for (const sing of [true, 'vowels']) {
      const x = renderMidi(mid, { stems: true, sing }).stems.choir.channels[0];
      SY.forEach((s, j) => {
        const read = (nearVowel) => readCoda(x, rate, sec(notes[j].tick) + 0.05, sec(notes[j].end) + 0.2, { nearVowel }).cls;
        if (sing === true && s.endsWith('m')) { score.all++; if (read(true) === 'nasal') score.near++; if (read(false) === 'nasal') score.off++; }
        else assert.equal(read(true), 'none', `${s} on ${midi}, ${P} pulses (${sing})`);
      });
    }
  }
  // measured 27 of 32 with it, 23 without (2026-11-15)
  assert.ok(score.near >= score.off + 3 && score.near >= 0.8 * score.all, JSON.stringify(score));
});

test('high /i/ and /u/ keep their level: F1 raised to 1.1 x f0 (tuneF1)', () => {
  assert.deepEqual(tuneF1(FORMANTS.a, 440, 1.1), FORMANTS.a); // /a/ F1 730 is above 484
  assert.deepEqual(tuneF1(FORMANTS.i, 440, 1.1).map(Math.round), [484, 2290, 3010]);
  assert.deepEqual(tuneF1(FORMANTS.i, 440, 0), FORMANTS.i); // off
  const db = (w) => { let s = 0; const a = Math.round(0.4 * rate), b = Math.round(1.9 * rate); for (let i = a; i < b; i++) s += w[i] * w[i]; return 10 * Math.log10(s / (b - a)); };
  for (const v of ['i', 'u']) {
    const rel = (f1Tune) => db(singNote(392, 2, rate, { vowel: v, seed: 3, f1Tune })) - db(singNote(392, 2, rate, { vowel: 'a', seed: 3, f1Tune }));
    // untuned, G4's first harmonic sits above /i/'s and /u/'s F1 and the vowel drops 10-16 dB under /a/
    assert.ok(rel(1.1) - rel(0) > 6, `${v}: ${rel(0).toFixed(1)} -> ${rel(1.1).toFixed(1)} dB`);
    assert.ok(rel(1.1) > -6, `${v} tuned at G4: ${rel(1.1).toFixed(1)} dB against /a/`);
  }
});

test('a final r taps and then opens again before the note ends, and reads as a tap right up to the next sound', () => {
  // README "Final consonants, fifth round": sung on the note's last 45 ms, the contact sat 15-25 ms from
  // the next sound with no voice after it inside the note, and after /u/ and /o/ it read as nothing
  for (const dur of [0.197, 0.242, 0.5]) {
    const [r] = codaPlan(['r'], dur, dur).segs, contactEnd = r.t0 + (r.t1 - r.t0) * r.cw;
    assert.ok(dur - contactEnd >= 0.025 - 1e-9, `${dur} s: ${((dur - contactEnd) * 1000).toFixed(1)} ms of voice after the contact`);
  }
  assert.equal(codaPlan(['r', 'k'], 0.3, 0.3).segs[0].at, undefined, 'an r inside a cluster keeps its plain tap');
  for (const vowel of ['u', 'o', 'e', 'a']) for (const dur of [0.197, 0.242]) {
    // the window ends where the note's sound does, as before the next syllable's consonant
    const w = singNote(146.83, dur, rate, { vowel, coda: ['r'], release: 0.015 });
    const got = readCoda(w, rate, 0.05, dur);
    assert.equal(got.cls, 'tap', `${vowel}r at ${dur} s: ${JSON.stringify(got)}`);
  }
});

test('a final l is not a murmur: al and el read as no consonant, am and um as nasals, and the tilt separates them', async () => {
  const { frameFeatures, MURMUR_TILT } = await import('./onsets.mjs');
  const dur = 0.5, tilt = (w) => { // energy above 1 kHz against the band under 500 Hz, over the coda's steady part
    let hi = 0, lo = 0; for (let t = dur - 0.04; t < dur - 0.02; t += 0.005) { const f = frameFeatures(w, Math.round(t * rate), rate); hi += f.hi1; lo += f.low; }
    return 10 * Math.log10(hi / lo);
  };
  for (const f of [110, 146.83, 261.63]) {
    for (const [syl, cls] of [['al', 'none'], ['el', 'none'], ['am', 'nasal'], ['um', 'nasal']]) {
      const r = latinVowel(syl), w = singNote(f, dur, rate, { vowel: r.vowel, coda: latinCoda(syl) });
      const k = tilt(w);
      if (cls === 'none') assert.ok(k > -MURMUR_TILT + 3, `${syl} on ${f} Hz: /l/ tilt ${k.toFixed(1)} dB`);
      else assert.ok(k < -MURMUR_TILT - 3, `${syl} on ${f} Hz: murmur tilt ${k.toFixed(1)} dB`);
      if (!(syl === 'um' && f > 200)) assert.equal(readCoda(w, rate, 0.1, dur + 0.25).cls, cls, `${syl} on ${f} Hz`);
      // and without the rule al reads as a nasal (eval/coda-check-report.md part A, before)
      if (syl === 'al') assert.equal(readCoda(w, rate, 0.1, dur + 0.25, { murmurTilt: 0 }).cls, 'nasal', `al on ${f} Hz, rule off`);
    }
  }
});

test('an opening nasal hums about 7 dB under the vowel it goes to at any pitch and before any vowel (one voice); the first murmur did not', () => {
  const rms = (x, a, b) => { let q = 0; for (let i = Math.round(a * rate); i < Math.round(b * rate); i++) q += x[i] * x[i]; return Math.sqrt(q / ((b - a) * rate)); };
  const dur = 0.6, one = { detunes: [0], vibratoCents: 0, breath: 0 };
  let spread = [99, -99];
  for (const ph of ['m', 'n']) {
    const sg = onsetPlan([ph], dur).segs[0], q = (sg.t1 - sg.t0) / 4;
    for (const midi of [40, 50, 57, 64]) for (const vowel of ['a', 'e', 'i', 'o', 'u']) {
      const f = 440 * 2 ** ((midi - 69) / 12), lvl = (o) => { const w = singNote(f, dur, rate, { vowel, onset: [ph], ...one, ...o }); return 20 * Math.log10(rms(w, sg.t0 + q, sg.t1 - q) / rms(w, 0.3, 0.45)); };
      const d = lvl({});
      assert.ok(d < -6 && d > -9, `${ph}${vowel} on ${midi}: murmur ${d.toFixed(1)} dB against its vowel`);
      const old = lvl({ onsetMurmur: 'first' }); spread = [Math.min(spread[0], old), Math.max(spread[1], old)];
    }
  }
  assert.ok(spread[1] - spread[0] > 8, `the first murmur's level spread ${(spread[1] - spread[0]).toFixed(1)} dB`);
});

// Red team 2026-11-15: synthetic signals at the readers' edges, each pinning a mutant the suite let through.
const harmonic = (t) => { let v = 0; for (let h = 1; h * 150 < 3000; h++) v += Math.sin(2 * Math.PI * 150 * h * t) / h; return v; };

test('readOnset: a tap with one loud frame either side, at the very edges of the window', () => {
  // a 25 ms dip 40 dB down at 0.100 s; t0 0.095 and a 17 ms window leave exactly one louder frame before
  // the dip (the first) and one after it (the last), and both must count
  const x = new Float64Array(Math.round(0.4 * rate));
  for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = 0.2 * (t >= 0.1 && t < 0.125 ? 0.01 : 1) * harmonic(t); }
  assert.equal(readOnset(x, rate, 0.095, 0.25, { window: 0.017 }).cls, 'tap');
  assert.equal(readOnset(x, rate, 0, 0.25).cls, 'tap', 'and with the whole dip inside the window');
});

test('readCoda: a final stop reports its closure length and its voicing', () => {
  let seed = 1; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const make = (closeMs, bar) => {
    const relAt = 0.3 + closeMs / 1000, x = new Float64Array(Math.round(0.6 * rate));
    for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < 0.3 ? 0.2 * harmonic(t) : t < relAt ? (bar ? 0.004 * Math.sin(2 * Math.PI * 150 * t) : 0) : t < relAt + 0.01 ? 0.3 * rnd() : 0; }
    return x;
  };
  for (const ms of [40, 60, 100]) for (const bar of [false, true]) {
    const got = readCoda(make(ms, bar), rate, 0.1, 0.5);
    assert.equal(got.cls, 'stop', `${ms} ms ${bar ? 'voiced' : 'voiceless'}`);
    assert.ok(Math.abs(got.closureMs - ms) <= 5, `${ms} ms closure read as ${got.closureMs} ms`);
    assert.equal(got.voiced, bar, `${ms} ms closure: voice bar ${bar}, read ${got.voiced} (bar ${got.bar.toFixed(1)} dB)`);
  }
});

test('readCoda: the voice bar is read from the closure only, never from the release burst', () => {
  // a silent 35 ms closure, then a 30 ms release (a low thump under some hiss): frames whose 20 ms
  // window reaches the release must stay out of the bar, which then sits at the silence floor
  let seed = 1; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  const relAt = 0.335, x = new Float64Array(Math.round(0.6 * rate));
  for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < 0.3 ? 0.2 * harmonic(t) : t < relAt ? 0 : t < relAt + 0.03 ? 0.005 * Math.sin(2 * Math.PI * 200 * t) + 0.02 * rnd() : 0; }
  const got = readCoda(x, rate, 0.1, 0.5);
  assert.equal(got.cls, 'stop');
  assert.equal(got.voiced, false);
  assert.ok(got.bar < -200, `bar ${got.bar.toFixed(1)} dB: the burst leaked into the closure`);
});

test('the n of a cluster (-unt, -ens, nunc) reads as its murmur, not as the stop or fricative after it', () => {
  // README "-unt read on its stop": the murmur before the obstruent sat only 2-4 dB under its vowel and its
  // darkness wobbled, so every nasal rule missed it and the t was read; the cluster rule (onsets.mjs PRE)
  // reads it by staying dark from an abrupt step right up to the closure
  const POS = ['unt', 'sunt', 'ant', 'ens', 'nunc'], NEG = ['ut', 'up', 'uc', 'ab', 'at', 'us'], score = { on: 0, off: 0, all: 0 };
  for (const midi of [40, 50, 60]) {
    const ev = [];
    for (const s of [...POS, ...NEG]) ev.push({ type: 'note', midi, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
    const mid = eventsToMidi(ev, { bpm: 120 });
    const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
    const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
    const x = renderMidi(mid, { stems: true, sing: true }).stems.choir.channels[0];
    [...POS, ...NEG].forEach((s, j) => {
      const read = (preObstruent) => readCoda(x, rate, sec(notes[j].tick) + 0.1, Math.min(sec(notes[j].end) + 0.25, sec(notes[j + 1]?.tick ?? 1e9)), { preObstruent }).cls;
      if (POS.includes(s)) { score.all++; if (read(true) === 'nasal') score.on++; if (read(false) === 'nasal') score.off++; }
      else if (read(true) === 'nasal') assert.equal(read(false), 'nasal', `${s} on ${midi}: the rule added a nasal`);
    });
  }
  assert.ok(score.on >= score.off + 4 && score.on >= 13, JSON.stringify(score));
});

test('a cluster murmur on C4 is not thrown out by the obstruent after it (nunc, tunc, mens)', () => {
  // README "nunc and mens on C4": vowelAgain read every frame after a murmur, so the bright /s/ of *mens* and
  // the one frame a murmur brightens handing over to its closure read as the vowel coming back; now only the
  // frames before an obstruent that starts within AGAIN.gap frames are read (onsets.mjs AGAIN)
  const POS = ['nunc', 'tunc', 'mens', 'unt'], NEG = ['up', 'uc', 'ub', 'us', 'es', 'ec'], score = { on: 0, off: 0 };
  const ev = [];
  for (const s of [...POS, ...NEG]) ev.push({ type: 'note', midi: 60, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 120 });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
  const x = renderMidi(mid, { stems: true, sing: true }).stems.choir.channels[0];
  [...POS, ...NEG].forEach((s, j) => {
    const read = (againGap) => readCoda(x, rate, sec(notes[j].tick) + 0.1, Math.min(sec(notes[j].end) + 0.25, sec(notes[j + 1]?.tick ?? 1e9)), { againGap }).cls;
    if (POS.includes(s)) { if (read(true) === 'nasal') score.on++; if (read(false) === 'nasal') score.off++; }
    else assert.notEqual(read(true), 'nasal', `${s} on C4 read as a nasal`);
  });
  assert.ok(score.on === POS.length && score.on >= score.off + 2, JSON.stringify(score));
});

test('/i/ is not read as a voiced fricative where its low band beats down, and z and v still are', () => {
  // README "/i/ is not a voiced fricative": where the five voices' fundamentals beat out of phase, /i/ loses
  // most of its energy and looked voiced and noisy; frication now needs energy above 5 kHz (onsets.mjs VFRIC_HI5)
  const I = ['i', 'ip', 'im', 'in'], ZV = ['az', 'oz', 'ev'], score = { off: 0 };
  for (const midi of [53, 57]) {
    const ev = [];
    for (const s of [...I, ...ZV]) ev.push({ type: 'note', midi, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
    const mid = eventsToMidi(ev, { bpm: 104 });
    const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
    const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
    const x = renderMidi(mid, { stems: true, sing: true }).stems.choir.channels[0];
    [...I, ...ZV].forEach((s, j) => {
      const read = (vfricHi5) => readCoda(x, rate, sec(notes[j].tick) + 0.1, Math.min(sec(notes[j].end) + 0.25, sec(notes[j + 1]?.tick ?? 1e9)), vfricHi5 === false ? { vfricHi5 } : {});
      const on = read(), voiced = (r) => r.cls === 'fricative' && r.place === 'voiced';
      if (I.includes(s)) { assert.ok(!voiced(on), `${s} on ${midi} read as a voiced fricative`); if (voiced(read(false))) score.off++; }
      else assert.ok(voiced(on), `${s} on ${midi} read as ${on.cls} ${on.place || ''}`);
    });
  }
  assert.ok(score.off >= 4, `the test should guard a real fault: ${JSON.stringify(score)}`);
});

test('deepMurmur: true reads a deep murmur on an E4 eighth note as its nasal, and a low voice bar still as its stop', () => {
  // README "E4 eighth notes: a murmur read as a closure": the n of *nunc*, *tunc*, *mens* and *sunt* on E4
  // eighths sits 18-33 dB under its vowel, past every nasal rule, and read as a stop (onsets.mjs DEEP, off by
  // default: it failed its pre-registered predictions on held-out parts N and O). Sung in
  // eval/coda-check.mjs part J's order (the beat's phase at each note depends on where it starts).
  const SY = ['unt', 'ant', 'ent', 'int', 'sunt', 'nunc', 'tunc', 'ens', 'mens', 'ans', 'ont', 'at', 'et', 'it', 'ut', 'ot', 'ost', 'ust', 'ad', 'ud', 'ab', 'ub', 'ac', 'uc', 'ap', 'up', 'as', 'us', 'os', 'es', 'ax', 'ux', 'um', 'am', 'un', 'em', 'a', 'u', 'o'];
  const POS = ['sunt', 'nunc', 'tunc', 'mens'], VST = ['ad', 'ud', 'ab', 'ub'], score = { on: 0, off: 0 };
  for (const midi of [40, 45, 64]) {
    const ev = [];
    for (const s of SY) ev.push({ type: 'note', midi, pulses: 2, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
    const mid = eventsToMidi(ev, { bpm: 120 });
    const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
    const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
    const x = renderMidi(mid, { stems: true, sing: true }).stems.choir.channels[0];
    SY.forEach((s, j) => {
      if (!POS.includes(s) && !VST.includes(s)) return;
      const read = (deepMurmur) => readCoda(x, rate, sec(notes[j].tick) + 0.045, Math.min(sec(notes[j].end) + 0.25, sec(notes[j + 1]?.tick ?? 1e9)), { deepMurmur }).cls;
      if (POS.includes(s) && midi === 64) { if (read(true) === 'nasal') score.on++; if (read(false) === 'nasal') score.off++; }
      if (VST.includes(s) && midi < 64) { assert.equal(read(true), 'stop', `${s} on ${midi} eighth`); assert.equal(readCoda(x, rate, sec(notes[j].tick) + 0.045, Math.min(sec(notes[j].end) + 0.25, sec(notes[j + 1]?.tick ?? 1e9))).cls, 'stop', 'the default reader'); }
    });
  }
  assert.ok(score.on === POS.length && score.on >= score.off + 3, JSON.stringify(score));
});

test('a cluster murmur louder than the dip before it reads as its nasal on D#4 (punc, tunt, sons); voiced stops do not', () => {
  // README "A murmur louder than the dip before it": on D4-E4 the vowel dips 7-16 dB as it darkens into the n,
  // and the murmur swells back 5-12 dB over that dip, past the cluster rule's old ceiling (PRE.hi 4, now 12)
  const POS = ['punc', 'tunt', 'sons'], NEG = ['mad', 'bod', 'nod', 'reg'], score = { on: 0, off: 0 };
  const ev = [];
  for (const s of [...POS, ...NEG]) ev.push({ type: 'note', midi: 63, pulses: 2, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 126 });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
  const x = renderMidi(mid, { stems: true, sing: true }).stems.choir.channels[0];
  [...POS, ...NEG].forEach((s, j) => {
    const read = (hi) => readCoda(x, rate, sec(notes[j].tick) + 0.045, Math.min(sec(notes[j].end) + 0.25, sec(notes[j + 1]?.tick ?? 1e9)), hi ? { preOpts: { hi } } : {}).cls;
    if (POS.includes(s)) { if (read() === 'nasal') score.on++; if (read(4) === 'nasal') score.off++; }
    else if (read() === 'nasal') assert.equal(read(4), 'nasal', `${s} on D#4: the change added a nasal`);
  });
  assert.ok(score.on === POS.length && score.on >= score.off + 2, JSON.stringify(score));
});

test('a voiced closure\'s voice bar sits at one level under its vowel across pitch and vowel (one voice); the fixed gain swung', () => {
  const rms = (x, a, b) => { let q = 0; for (let i = Math.round(a * rate); i < Math.round(b * rate); i++) q += x[i] * x[i]; return Math.sqrt(q / ((b - a) * rate)); };
  const dur = 0.6, sg = codaPlan(['b'], dur, dur).segs[0], shut = sg.t0 + sg.closure * sg.k, q = (shut - sg.t0) / 4;
  const one = { coda: ['b'], detunes: [0], vibratoCents: 0, breath: 0 };
  const got = [], old = [];
  for (const midi of [40, 45, 51, 56, 61, 64]) for (const vowel of ['a', 'e', 'i', 'o', 'u']) {
    const f = 440 * 2 ** ((midi - 69) / 12), lvl = (o) => { const w = singNote(f, dur, rate, { vowel, ...one, ...o }); return 20 * Math.log10(rms(w, sg.t0 + q, shut - q) / rms(w, 0.2, 0.35)); };
    got.push(lvl({})); old.push(lvl({ voiceBarLevel: false }));
  }
  const spread = (v) => Math.max(...v) - Math.min(...v);
  assert.ok(spread(got) < 0.6 * spread(old), `spread ${spread(got).toFixed(1)} dB with the per-note gain, ${spread(old).toFixed(1)} fixed`);
  for (const d of got) assert.ok(d < -18 && d > -40, `voice bar ${d.toFixed(1)} dB against its vowel`);
});

test('closeAnchor (opt-in) closes a voice bar against the last vowel-like frames, band by band (eb, ib on D4)', () => {
  // README "Two anchors for one closure": the parallel rule to localRef. On D4 the five voices' slow beat left the
  // 60 ms reference's band under 500 Hz 10-20 dB under the vowel at the closure, and *eb*/*ib* read as no closure
  // against the reference alone. Sung in eval/coda-check.mjs part K's order (the beat's phase depends on where a note starts).
  const SY = ['fons', 'dens', 'pons', 'mons', 'gens', 'hinc', 'runt', 'bunt', 'tent', 'cant', 'frons', 'sanct', 'lunt', 'quent', 'ep', 'ip', 'op', 'ec', 'ic', 'oc', 'eb', 'ib', 'ob'];
  const ev = [];
  for (const s of SY) ev.push({ type: 'note', midi: 62, pulses: 4, syllable: s }, { type: 'bar', kind: 'full', pulses: 4 });
  const mid = eventsToMidi(ev, { bpm: 104 });
  const m = parseMidi(mid), sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const notes = m.notes.filter((n) => n.ch === 0).sort((a, b) => a.tick - b.tick);
  const x = renderMidi(mid, { stems: true, sing: true }).stems.choir.channels[0];
  const read = (j, o) => readCoda(x, rate, sec(notes[j].tick) + 0.1, Math.min(sec(notes[j].end) + 0.25, sec(notes[j + 1]?.tick ?? 1e9)), o);
  for (const s of ['eb', 'ib']) {
    const j = SY.indexOf(s), on = read(j, { localRef: false, closeAnchor: true });
    assert.deepEqual([on.cls, on.voiced, on.place], ['stop', true, 'lab'], `${s} with closeAnchor`);
    assert.equal(read(j, { localRef: false }).cls, 'none', `${s}: the reference alone`);
  }
  for (const s of ['ep', 'ec', 'ic']) assert.equal(read(SY.indexOf(s), { localRef: false, closeAnchor: true }).cls, 'stop', s);
});
