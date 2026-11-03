// Genre templates as code: a drum, bass and harmony line in a chant's mode, in MIDI.
//
// Input is the chant's final (MIDI number), its mode (1-8, the church modes) and the
// number of 4/4 bars. Output is timed note lists, one per part, that midi.mjs writes
// as extra tracks. Everything is deterministic: the same inputs give the same file.
// Pure functions, no dependencies, no outside data.
import { PPQ } from './midi.mjs';

export const BAR = PPQ * 4;

// Church modes as scales from the final. Plagal modes share the scale of their
// authentic partner (2 with 1, 4 with 3, 6 with 5, 8 with 7).
export const SCALES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};
const MODE_NAME = { 1: 'dorian', 2: 'dorian', 3: 'phrygian', 4: 'phrygian', 5: 'lydian', 6: 'lydian', 7: 'mixolydian', 8: 'mixolydian' };

// Four-bar loops of scale degrees (0 = the final). Dorian i-IV-i-bVII, Phrygian
// i-bII-i-bVII, the pairs that sound most like the mode rather than major or minor.
const PROGRESSION = {
  dorian: [0, 3, 0, 6],
  phrygian: [0, 1, 0, 6],
  lydian: [0, 1, 0, 4],
  mixolydian: [0, 6, 3, 0],
};

export function modeName(mode) {
  const n = MODE_NAME[Number(mode)];
  if (!n) throw new Error(`mode must be 1-8, got ${mode}`);
  return n;
}

// General MIDI drum map
const D = { kick: 36, snare: 38, clap: 39, closedHat: 42, openHat: 46, crash: 49, ride: 51 };

const e = (tick, note, len, vel) => ({ tick, note, len, vel });
const step = PPQ / 4; // a sixteenth

function chordTones(scale, degree, rootMidi) {
  return [0, 2, 4].map((k) => {
    const idx = degree + k;
    return rootMidi + scale[idx % 7] + 12 * Math.floor(idx / 7);
  });
}

function rootNote(scale, degree, base) {
  return base + scale[degree % 7];
}

// Each genre writes one bar: drums, bass and chords for the bar's degree.
const GENRES = {
  'deep-house': {
    bpm: [120, 126],
    bar(ctx) {
      const { t0, scale, degree, final, bar } = ctx;
      const drums = [];
      for (let b = 0; b < 4; b++) drums.push(e(t0 + b * PPQ, D.kick, step, 110));
      for (const b of [1, 3]) drums.push(e(t0 + b * PPQ, D.clap, step, 100));
      for (let b = 0; b < 4; b++) {
        drums.push(e(t0 + b * PPQ + PPQ / 2, D.openHat, step, 80)); // the offbeat
        drums.push(e(t0 + b * PPQ + step, D.closedHat, step, 50));
        drums.push(e(t0 + b * PPQ + 3 * step, D.closedHat, step, 55));
      }
      const root = rootNote(scale, degree, final - 24);
      const bass = [];
      for (let b = 0; b < 4; b++) bass.push(e(t0 + b * PPQ + PPQ / 2, root + (b === 3 && bar % 2 ? 7 : 0), PPQ / 2 - 20, 95));
      const chords = [];
      for (const [beat, len] of [[0.5, 1], [2.5, 1]]) {
        for (const n of chordTones(scale, degree, final)) chords.push(e(t0 + beat * PPQ, n, len * PPQ - 30, 70));
      }
      return { drums, bass, chords };
    },
  },
  edm: {
    bpm: [126, 150],
    bar(ctx) {
      const { t0, scale, degree, final } = ctx;
      const drums = [];
      for (let b = 0; b < 4; b++) drums.push(e(t0 + b * PPQ, D.kick, step, 115));
      for (const b of [1, 3]) drums.push(e(t0 + b * PPQ, D.snare, step, 100), e(t0 + b * PPQ, D.clap, step, 90));
      for (let i = 0; i < 16; i++) drums.push(e(t0 + i * step, D.closedHat, step, i % 4 === 2 ? 85 : 55));
      const root = rootNote(scale, degree, final - 24);
      const bass = [];
      for (let i = 0; i < 8; i++) bass.push(e(t0 + i * (PPQ / 2) + (i % 2 ? 0 : 0), root, PPQ / 2 - 20, i % 2 ? 100 : 80));
      const chords = chordTones(scale, degree, final).map((n) => e(t0, n, BAR - 40, 65));
      return { drums, bass, chords };
    },
  },
  'hard-rock': {
    bpm: [110, 150],
    bar(ctx) {
      const { t0, scale, degree, final } = ctx;
      const drums = [];
      for (const b of [0, 2]) drums.push(e(t0 + b * PPQ, D.kick, step, 110));
      drums.push(e(t0 + 2.5 * PPQ, D.kick, step, 95));
      for (const b of [1, 3]) drums.push(e(t0 + b * PPQ, D.snare, step, 112));
      for (let i = 0; i < 8; i++) drums.push(e(t0 + i * (PPQ / 2), D.closedHat, step, i % 2 ? 60 : 80));
      if (ctx.bar % 4 === 0) drums.push(e(t0, D.crash, PPQ, 100));
      const root = rootNote(scale, degree, final - 24);
      const bass = [];
      for (let i = 0; i < 8; i++) bass.push(e(t0 + i * (PPQ / 2), root, PPQ / 2 - 30, 95));
      // power chord: root and fifth, an octave up from the bass
      const chords = [];
      for (let i = 0; i < 8; i++) for (const n of [root + 12, root + 19]) chords.push(e(t0 + i * (PPQ / 2), n, PPQ / 2 - 30, 85));
      return { drums, bass, chords };
    },
  },
  metal: {
    bpm: [160, 180],
    // `halfTime` puts the snare on beat 3 only so a chant sung at the same BPM reads as slow.
    bar(ctx) {
      const { t0, scale, degree, final } = ctx;
      const drums = [];
      for (let i = 0; i < 16; i++) drums.push(e(t0 + i * step, D.kick, step, i % 4 === 0 ? 118 : 98)); // double kick, 16ths
      drums.push(e(t0 + 2 * PPQ, D.snare, step, 120));
      for (let i = 0; i < 8; i++) drums.push(e(t0 + i * (PPQ / 2), D.ride, step, 75));
      if (ctx.bar % 4 === 0) drums.push(e(t0, D.crash, PPQ, 110));
      const root = rootNote(scale, degree, final - 24);
      const flat2 = scale[1] === 1 ? scale[1] : null; // Phrygian's b2 as the tension note
      const bass = [];
      const chords = [];
      for (let i = 0; i < 16; i++) {
        // palm-muted chug on the root with the b2 on the last sixteenth of each beat's second half in Phrygian
        const n = flat2 !== null && i % 8 === 7 ? rootNote(scale, 1, final - 24) : root;
        bass.push(e(t0 + i * step, n, step - 10, 100));
        chords.push(e(t0 + i * step, n + 12, step - 10, 90), e(t0 + i * step, n + 19, step - 10, 90));
      }
      return { drums, bass, chords };
    },
  },
};

export const GENRE_NAMES = Object.keys(GENRES);

export function bpmRange(genre) {
  if (!GENRES[genre]) throw new Error(`unknown genre ${genre}; use one of ${GENRE_NAMES.join(', ')}`);
  return GENRES[genre].bpm;
}

// arrange({ genre, mode, final, bars }) -> { drums, bass, chords, mode, progression }
export function arrange({ genre, mode, final, bars }) {
  if (!GENRES[genre]) throw new Error(`unknown genre ${genre}; use one of ${GENRE_NAMES.join(', ')}`);
  if (!Number.isInteger(final)) throw new Error('final must be a MIDI number');
  if (!Number.isInteger(bars) || bars < 1) throw new Error('bars must be a positive integer');
  const name = modeName(mode);
  const scale = SCALES[name];
  const prog = PROGRESSION[name];
  const out = { drums: [], bass: [], chords: [], mode: name, progression: prog };
  for (let bar = 0; bar < bars; bar++) {
    const part = GENRES[genre].bar({ t0: bar * BAR, scale, degree: prog[bar % prog.length], final, bar });
    for (const k of ['drums', 'bass', 'chords']) out[k].push(...part[k]);
  }
  return out;
}

export function barsFor(events, pulsesPerBeat = 2) {
  const pulses = events.reduce((s, ev) => s + ev.pulses, 0);
  return Math.max(1, Math.ceil(pulses / (pulsesPerBeat * 4)));
}
