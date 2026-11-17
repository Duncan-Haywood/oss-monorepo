// MusicXML 4.0 score of the choir line, one part per section, Latin under the notes.
//
// The MIDI file is a guide for a DAW; a choir director prints parts. This writes the same
// events (the same pitches, the same timing, the same split into sections as midi.mjs) as a
// partwise MusicXML file that MuseScore, Dorico, Sibelius and Finale open, so a section can
// sing from paper against the track. 4/4 at two pulses a beat (the backing's bar, genre.mjs
// BAR): one chant note is an eighth, a note crossing a barline is tied, rests fill the
// padding --fit adds and the intro and outro bars. No dependencies.
//
// Pitch spelling: the key signature is the one (from 6 flats to 6 sharps) whose scale holds
// the most of the line's notes, so a diatonic chant transposed to any final reads with no
// accidentals but its own B flats; a lifted last drop (--key-lift) gets its own key from the
// measure its first lifted note falls in. Notes outside the key are spelled sharp in a sharp
// key, flat otherwise (chant's B flat). Accidentals follow the usual rule: shown on the first altered
// note of a step in a measure, a natural when it returns, nothing for a repeat, and a
// courtesy accidental on the first note of a step the last measure altered otherwise.
//
// Words: each syllable is a lyric with its syllabic (single, begin, middle, end) from the
// GABC word starts, and a melisma (notes with no syllable) gets an extender. A breath mark
// sits on the last note before each GABC bar. Section names (--sections) are rehearsal marks.
import { sings } from './midi.mjs';

export const DIVISIONS = 8; // per quarter: a 32nd note is one division, a pulse (an eighth) four
const PULSES_PER_BAR = 8;

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
// order of sharps and flats by step index
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

// alteration of each step (index 0-6, C-B) in a key of `fifths` (-6..6)
export function keyAlter(fifths) {
  const alt = [0, 0, 0, 0, 0, 0, 0];
  if (fifths > 0) for (let i = 0; i < fifths; i++) alt[SHARP_ORDER[i]] = 1;
  if (fifths < 0) for (let i = 0; i < -fifths; i++) alt[FLAT_ORDER[i]] = -1;
  return alt;
}

const mod = (a, n) => ((a % n) + n) % n;

// MIDI number -> { step, alter, octave } in the key of `fifths`
export function spell(midi, fifths) {
  const alt = keyAlter(fifths);
  const pc = mod(midi, 12);
  let s = -1, a = 0;
  for (let i = 0; i < 7; i++) if (mod(NATURAL_PC[i] + alt[i], 12) === pc) { s = i; a = alt[i]; }
  if (s < 0) {
    // outside the key: the natural if there is one, else sharp in a sharp key, flat otherwise
    // (in C too: chant's altered note is B flat)
    const nat = NATURAL_PC.indexOf(pc);
    if (nat >= 0) { s = nat; a = 0; }
    else if (fifths <= 0) { s = NATURAL_PC.indexOf(pc + 1); a = -1; }
    else { s = NATURAL_PC.indexOf(pc - 1); a = 1; }
  }
  // the octave belongs to the letter: B#3 is C4's pitch, Cb4 is B3's
  const octave = Math.floor((midi - NATURAL_PC[s] - a) / 12) - 1;
  return { step: STEPS[s], alter: a, octave };
}

// the key signature (-6..6) whose scale holds the most of these MIDI notes; ties go to the
// fewest sharps or flats, then to flats (chant's B flat)
export function bestKey(notes) {
  let best = 0, bestIn = -1;
  for (const f of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6]) {
    const alt = keyAlter(f);
    const pcs = new Set(NATURAL_PC.map((p, i) => mod(p + alt[i], 12)));
    const inKey = notes.filter((m) => pcs.has(mod(m, 12))).length;
    if (inKey > bestIn) { best = f; bestIn = inKey; }
  }
  return best;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// note values in pulses (eighths), longest first: [pulses, type, dots]
const VALUES = [[8, 'whole', 0], [7, 'half', 2], [6, 'half', 1], [4, 'half', 0], [3, 'quarter', 1], [2, 'quarter', 0], [1.5, 'eighth', 1], [1, 'eighth', 0], [0.5, '16th', 0], [0.25, '32nd', 0]];
export function split(pulses) {
  const out = [];
  let left = pulses;
  while (left > 1e-9) {
    const v = VALUES.find(([p]) => p <= left + 1e-9);
    if (!v) throw new Error(`musicxml: a duration of ${pulses} pulses is not a sum of 32nd notes`);
    out.push(v);
    left -= v[0];
  }
  return out;
}

// The sections that get a part, in score order, as [voice key, part name]; one 'Choir' part
// when the events carry no voices. Same rule as midi.mjs's tracks.
export function scoreParts(events) {
  const notes = events.filter((e) => e.type === 'note');
  if (!notes.some((e) => e.voice)) return [[null, 'Choir']];
  const own = (k) => notes.some((e) => e.voice !== 'all' && sings(e.voice, k));
  const t2 = own('tenor2');
  return [['tenor', t2 ? 'First tenors' : 'Tenors'], ...(t2 ? [['tenor2', 'Second tenors']] : []), ...(own('baritone') ? [['baritone', 'Baritones']] : []), ['bass', 'Basses']];
}

// syllabic of each sung syllable, from the word starts: index of note -> 'single'|'begin'|'middle'|'end'
function syllabics(events) {
  const syl = events.map((e, i) => [e, i]).filter(([e]) => e.type === 'note' && e.syllable);
  const out = new Map();
  syl.forEach(([e, i], k) => {
    const nextStarts = k + 1 >= syl.length || syl[k + 1][0].wordStart;
    const starts = e.wordStart || k === 0;
    out.set(i, starts ? (nextStarts ? 'single' : 'begin') : nextStarts ? 'end' : 'middle');
  });
  return out;
}

export function eventsToMusicXml(events, { title = 'chant', bpm = 124, plan = null, software = 'chant-forge' } = {}) {
  const parts = scoreParts(events);
  const syllabic = syllabics(events);
  // pulse start of each event, and the breath marks: last note before each bar event
  const at = [];
  let p = 0;
  for (const e of events) { at.push(p); p += e.pulses || 0; }
  const total = p;
  const measures = Math.max(1, Math.ceil(total / PULSES_PER_BAR - 1e-9));
  const breath = new Set();
  let lastNote = -1;
  events.forEach((e, i) => {
    if (e.type === 'note') lastNote = i;
    else if (e.type === 'bar' && lastNote >= 0 && events.slice(i).some((x) => x.type === 'note')) breath.add(lastNote);
  });
  // melismas: a syllable whose next note sings no new syllable gets an extender
  const extend = new Set();
  events.forEach((e, i) => {
    if (e.type !== 'note' || !e.syllable) return;
    const next = events.slice(i + 1).find((x) => x.type === 'note');
    if (next && !next.syllable) extend.add(i);
  });
  // keys: the whole line, then the lifted part from the measure its first lifted note is in
  const all = events.filter((e) => e.type === 'note');
  const firstLift = events.findIndex((e) => e.type === 'note' && e.lifted);
  const keyChanges = [[0, bestKey(all.filter((e) => !e.lifted).map((e) => e.midi))]];
  if (firstLift >= 0) {
    const m = Math.floor(at[firstLift] / PULSES_PER_BAR + 1e-9);
    const k = bestKey(all.filter((e) => e.lifted).map((e) => e.midi));
    if (m === 0) keyChanges[0][1] = k;
    else if (k !== keyChanges[0][1]) keyChanges.push([m, k]);
  }
  const keyAt = (m) => keyChanges.filter(([s]) => s <= m).at(-1)[1];
  const rehearsal = new Map((plan || []).map((s) => [s.start, s.name[0].toUpperCase() + s.name.slice(1)]));

  // one part's timeline: notes it sings, and rests elsewhere, as [start, pulses, event index | -1]
  const timeline = (key) => {
    const out = [];
    events.forEach((e, i) => {
      if (e.type === 'note' && (key === null || sings(e.voice, key))) out.push([at[i], e.pulses, i]);
    });
    return out;
  };

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    `  <work><work-title>${esc(title)}</work-title></work>`,
    `  <identification><encoding><software>${esc(software)}</software></encoding></identification>`,
    '  <part-list>',
    ...parts.map(([, name], k) => `    <score-part id="P${k + 1}"><part-name>${esc(name)}</part-name></score-part>`),
    '  </part-list>',
  ];
  parts.forEach(([key, name], k) => {
    const mine = timeline(key);
    const pitches = mine.map(([, , i]) => events[i].midi);
    // bass clef for basses and baritones, and for a choir line that goes below C3; tenors read
    // the treble clef an octave down
    const low = pitches.length ? Math.min(...pitches) : 48;
    const bassClef = key === 'bass' || key === 'baritone' || (key === null && low < 48);
    const clef = bassClef ? '<clef><sign>F</sign><line>4</line></clef>' : '<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>';
    lines.push(`  <part id="P${k + 1}">`);
    let cursor = 0; // index into mine
    let before = new Map(); // what the last measure left altered against the key: a courtesy accidental restates the key
    for (let m = 0; m < measures; m++) {
      const m0 = m * PULSES_PER_BAR, m1 = m0 + PULSES_PER_BAR;
      lines.push(`    <measure number="${m + 1}">`);
      const change = keyChanges.find(([s]) => s === m);
      if (m === 0) {
        lines.push(`      <attributes><divisions>${DIVISIONS}</divisions><key><fifths>${keyAt(0)}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${clef}</attributes>`);
        if (k === 0) lines.push(`      <direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`);
      } else if (change) lines.push(`      <attributes><key><fifths>${change[1]}</fifths></key></attributes>`);
      if (k === 0 && rehearsal.has(m)) lines.push(`      <direction placement="above"><direction-type><rehearsal>${esc(rehearsal.get(m))}</rehearsal></direction-type></direction>`);
      const fifths = keyAt(m);
      const keyAlt = keyAlter(fifths);
      const shown = new Map(); // step+octave -> alter in force in this measure
      let t = m0;
      const rest = (len) => {
        for (const [pp, type, dots] of split(len)) lines.push(`      <note><rest/><duration>${pp * DIVISIONS / 2}</duration><type>${type}</type>${'<dot/>'.repeat(dots)}</note>`);
      };
      // notes that start before this measure and run into it were carried as ties: find the
      // part's notes overlapping [m0, m1)
      while (cursor < mine.length && mine[cursor][0] + mine[cursor][1] <= m0 + 1e-9) cursor++;
      for (let c = cursor; c < mine.length && mine[c][0] < m1 - 1e-9; c++) {
        const [s, len, i] = mine[c];
        const a = Math.max(s, m0), b = Math.min(s + len, m1);
        if (a > t + 1e-9) rest(a - t);
        const e = events[i];
        const sp = spell(e.midi, fifths);
        const stepIdx = STEPS.indexOf(sp.step);
        const id = `${sp.step}${sp.octave}`;
        const inForce = shown.has(id) ? shown.get(id) : keyAlt[stepIdx];
        // a courtesy accidental: the step's first note in a measure, after the last measure
        // altered it to something else (a singer reads the last accidental seen)
        const courtesy = !shown.has(id) && before.has(id) && before.get(id) !== sp.alter;
        const acc = inForce === sp.alter && !courtesy ? null : sp.alter === 1 ? 'sharp' : sp.alter === -1 ? 'flat' : 'natural';
        shown.set(id, sp.alter);
        const pieces = split(b - a);
        pieces.forEach(([pp, type, dots], j) => {
          const firstPiece = a === s && j === 0;
          const lastPiece = b === s + len && j === pieces.length - 1;
          const tieStart = !lastPiece, tieStop = !firstPiece;
          const ties = `${tieStop ? '<tie type="stop"/>' : ''}${tieStart ? '<tie type="start"/>' : ''}`;
          const tied = `${tieStop ? '<tied type="stop"/>' : ''}${tieStart ? '<tied type="start"/>' : ''}`;
          const marks = lastPiece && breath.has(i) ? '<articulations><breath-mark/></articulations>' : '';
          const notations = tied || marks ? `<notations>${tied}${marks}</notations>` : '';
          let lyric = '';
          if (firstPiece && e.syllable) {
            lyric = `<lyric number="1"><syllabic>${syllabic.get(i)}</syllabic><text>${esc(e.syllable)}</text>${extend.has(i) ? '<extend/>' : ''}</lyric>`;
          }
          const pitch = `<pitch><step>${sp.step}</step>${sp.alter ? `<alter>${sp.alter}</alter>` : ''}<octave>${sp.octave}</octave></pitch>`;
          lines.push(`      <note>${pitch}<duration>${pp * DIVISIONS / 2}</duration>${ties}<type>${type}</type>${'<dot/>'.repeat(dots)}${firstPiece && acc ? `<accidental>${acc}</accidental>` : ''}${notations}${lyric}</note>`);
        });
        t = b;
      }
      if (m1 > t + 1e-9) {
        // a whole bar of silence is one whole-measure rest
        if (t === m0) lines.push(`      <note><rest measure="yes"/><duration>${PULSES_PER_BAR * DIVISIONS / 2}</duration></note>`);
        else rest(m1 - t);
      }
      before = new Map([...shown].filter(([id, alt]) => alt !== keyAlt[STEPS.indexOf(id[0])]));
      if (m === measures - 1) lines.push('      <barline location="right"><bar-style>light-heavy</bar-style></barline>');
      lines.push('    </measure>');
    }
    lines.push('  </part>');
  });
  lines.push('</score-partwise>', '');
  return lines.join('\n');
}
