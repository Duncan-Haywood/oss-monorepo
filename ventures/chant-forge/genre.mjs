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

// A snare roll on the last beat of every fourth bar (a crescendo of sixteenths), so the
// four-bar loop announces its turn. Adds hits only; it never removes the bar's own.
export function fillBar(t0, bar) {
  if (bar % 4 !== 3) return [];
  return [0, 1, 2, 3].map((i) => e(t0 + 3 * PPQ + i * step, D.snare, step, 70 + i * 14));
}

// Section energies (sections.mjs): the genre's own bar is the "drop", and the other
// energies are made from it by taking parts away, so every genre gets them for free.
//   intro  no kick, snare, clap or crash; no bass; chords softer
//   verse  no crash; drums and bass a little softer; no chord part (the choir carries it)
//   breakdown  no drums and no bass: the choir alone over one soft held chord a bar
//   drop   the genre's bar as written, with a crash on the section's first downbeat
//   outro  hats, ride and chords only, softer; the last bar is one held chord and a crash
// A section with `build` ends on a build bar instead of its own last bar: kicks on beats
// 1 and 2, a snare roll that speeds up (quarters, eighths, then sixteenths) and swells, the
// bass and chords on the bar's chord for two beats and then on the chord a fifth above
// the final (the mode's own "dominant"; a fourth when the bar already sits there), a riser
// of eighth notes climbing the mode an octave above the chords and swelling, and the last
// eighth left empty for every part (the "air" before the drop lands).
const PERCUSSION_ONLY = new Set([D.closedHat, D.openHat, D.ride]);
const soften = (list, k) => list.map((n) => ({ ...n, vel: Math.max(1, Math.round(n.vel * k)) }));

function shapeBar(part, energy) {
  if (energy === 'intro') {
    return { drums: part.drums.filter((n) => PERCUSSION_ONLY.has(n.note)), bass: [], chords: soften(part.chords, 0.8) };
  }
  if (energy === 'verse') {
    return { drums: soften(part.drums.filter((n) => n.note !== D.crash), 0.85), bass: soften(part.bass, 0.9), chords: [] };
  }
  if (energy === 'breakdown') {
    const held = part.chords.length ? Math.round(part.chords.reduce((m, n) => m + n.vel, 0) / part.chords.length * 0.7) : 50;
    return { drums: [], bass: [], chords: [], pad: held };
  }
  if (energy === 'outro') {
    return { drums: soften(part.drums.filter((n) => PERCUSSION_ONLY.has(n.note)), 0.7), bass: [], chords: soften(part.chords, 0.75) };
  }
  return part;
}

export function buildBar({ t0, scale, degree, final }) {
  const drums = [e(t0, D.kick, step, 110), e(t0 + PPQ, D.kick, step, 110)];
  const hits = [0, PPQ, PPQ * 1.5, ...Array.from({ length: 6 }, (_, i) => PPQ * 2 + i * step)]; // stops before the last eighth
  hits.forEach((tick, i) => drums.push(e(t0 + tick, D.snare, step, Math.min(127, 60 + i * 8))));
  const air = BAR - PPQ / 2; // the bar's last eighth stays empty
  const lift = degree === 4 ? 3 : 4; // the chord the build turns to on beat 3
  const half = PPQ * 2;
  const bass = [
    e(t0, rootNote(scale, degree, final - 24), half - 20, 90),
    e(t0 + half, rootNote(scale, lift, final - 24), air - half - 20, 100),
  ];
  const chords = [
    ...chordTones(scale, degree, final).map((n) => e(t0, n, half - 20, 70)),
    ...chordTones(scale, lift, final).map((n) => e(t0 + half, n, air - half - 20, 80)),
  ];
  // the riser: seven eighths up the mode from the final, an octave above the chords, swelling
  const steps = air / (PPQ / 2);
  for (let i = 0; i < steps; i++) chords.push(e(t0 + i * (PPQ / 2), final + 12 + scale[i % 7] + 12 * Math.floor(i / 7), PPQ / 2 - 20, 50 + i * 9));
  return { drums, bass, chords };
}

// The breakdown's bar: one held chord of the bar's degree at `vel`, nothing else.
export function padBar({ t0, scale, degree, final }, vel) {
  return { drums: [], bass: [], chords: chordTones(scale, degree, final).map((n) => e(t0, n, BAR - 40, vel)) };
}

export function outroLastBar({ t0, scale, final }) {
  return {
    drums: [e(t0, D.crash, BAR, 90)],
    bass: [e(t0, rootNote(scale, 0, final - 24), BAR - 40, 80)],
    chords: chordTones(scale, 0, final).map((n) => e(t0, n, BAR - 40, 65)),
  };
}

// arrange({ genre, mode, final, bars, fills, sections }) -> { drums, bass, chords, mode, progression, sections? }
// `sections` is a plan from sections.mjs; without one every bar is the genre's bar (as before).
export function arrange({ genre, mode, final, bars, fills = false, sections = null }) {
  if (!GENRES[genre]) throw new Error(`unknown genre ${genre}; use one of ${GENRE_NAMES.join(', ')}`);
  if (!Number.isInteger(final)) throw new Error('final must be a MIDI number');
  if (!Number.isInteger(bars) || bars < 1) throw new Error('bars must be a positive integer');
  const name = modeName(mode);
  const scale = SCALES[name];
  const prog = PROGRESSION[name];
  const out = { drums: [], bass: [], chords: [], mode: name, progression: prog };
  if (sections) out.sections = sections.map((s) => ({ name: s.name, energy: s.energy, start: s.start, bars: s.bars, tick: s.start * BAR }));
  const sectionOf = (bar) => (sections || []).find((s) => bar >= s.start && bar < s.start + s.bars) || null;
  for (let bar = 0; bar < bars; bar++) {
    const ctx = { t0: bar * BAR, scale, degree: prog[bar % prog.length], final, bar };
    const sec = sectionOf(bar);
    const last = sec && bar === sec.start + sec.bars - 1;
    let part;
    if (sec && last && sec.build) part = buildBar(ctx);
    else if (sec && last && sec.energy === 'outro' && bar === bars - 1) part = outroLastBar(ctx);
    else {
      part = GENRES[genre].bar(ctx);
      if (sec) {
        part = shapeBar(part, sec.energy);
        if (part.pad !== undefined) part = padBar(ctx, part.pad);
        if (sec.energy === 'drop' && bar === sec.start && !part.drums.some((n) => n.note === D.crash && n.tick === ctx.t0)) {
          part.drums.push(e(ctx.t0, D.crash, PPQ, 110));
        }
      }
    }
    for (const k of ['drums', 'bass', 'chords']) out[k].push(...part[k]);
    const quiet = sec && (sec.energy === 'intro' || sec.energy === 'outro' || sec.energy === 'breakdown' || (last && sec.build));
    if (fills && bar < bars - 1 && !quiet) out.drums.push(...fillBar(bar * BAR, bar));
  }
  return out;
}

export function barsFor(events, pulsesPerBeat = 2) {
  const pulses = events.reduce((s, ev) => s + ev.pulses, 0);
  return Math.max(1, Math.ceil(pulses / (pulsesPerBeat * 4)));
}
