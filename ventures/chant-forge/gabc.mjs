// GABC (Gregorio chant notation) -> timed note events.
//
// Reads the common subset of GABC: header fields, c and f clefs on lines 1-4
// (with the cb flat clef), pitch letters a-m, flats/naturals/sharps (x, y, #)
// that last to the end of the word or the next bar, the punctum mora (.) and
// horizontal episema (_), custodes (f+) which are not sung, and the four bars
// (, ; : ::). Neume shapes (virga, quilisma, oriscus, liquescents...) are read
// as plain notes: their pitch matters here, their nuance does not yet.
// Unknown characters are skipped, never guessed at.

const DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11]; // do re mi fa sol la ti
const PITCHES = 'abcdefghijklm';

export const DEFAULTS = {
  refC: 60, // MIDI note for "do" in the octave the clef line sits in (C4)
  moraPulses: 1, // extra pulses for a punctum mora (doubles a note)
  episemaPulses: 0.5, // extra pulses for a horizontal episema
  barRests: { comma: 0, half: 1, full: 2, double: 2 }, // rest pulses per bar
};

export function parseHeader(text) {
  const header = {};
  const re = /^\s*([A-Za-z0-9_-]+)\s*:\s*([\s\S]*?);\s*$/gm;
  let m;
  while ((m = re.exec(text))) header[m[1].toLowerCase()] = m[2].trim();
  return header;
}

function parseClef(s) {
  const m = /^([cf])(b?)([1-5])$/.exec(s.trim());
  if (!m) return null;
  return { type: m[1], flatB: m[2] === 'b', line: Number(m[3]) };
}

// MIDI pitch of a GABC pitch letter under a clef, with an accidental (-1/0/+1)
// or null for "use the clef's default".
export function pitchToMidi(letter, clef, accidental = null, refC = DEFAULTS.refC) {
  const idx = PITCHES.indexOf(letter.toLowerCase());
  if (idx < 0) throw new Error(`not a GABC pitch: ${letter}`);
  const lineIdx = 3 + 2 * (clef.line - 1); // line 1 = d, 2 = f, 3 = h, 4 = j
  const doIdx = clef.type === 'c' ? lineIdx : lineIdx - 3; // fa sits 3 steps above do
  const s = idx - doIdx;
  const octave = Math.floor(s / 7);
  const degree = ((s % 7) + 7) % 7;
  let acc = accidental;
  if (acc === null) acc = clef.flatB && degree === 6 ? -1 : 0;
  return refC + 12 * octave + DEGREE_SEMITONES[degree] + acc;
}

const SP = { 'V/': '\u2123', 'R/': '\u211F', "'ae": '\u01FD', "'\u00E6": '\u01FD', "'oe": '\u0153\u0301', "'\u0153": '\u0153\u0301' };

// Lyric text for one GABC syllable. <v> (raw TeX) and <alt> (text above the
// staff) are not sung; <sp> is Gregorio's special-character tag (V/ and R/ are
// the versicle and response signs); other tags only style the text. Centre
// braces, the non-breaking space, and the intonation marks * and the cross
// are not sung either.
export function lyricText(text) {
  return text
    .replace(/<v>[\s\S]*?<\/v>/g, '')
    .replace(/<alt>[\s\S]*?<\/alt>/g, '')
    .replace(/<sp>([\s\S]*?)<\/sp>/g, (_, k) => SP[k.trim()] ?? k.replace(/\//g, ''))
    .replace(/<[^>]*>/g, '')
    .replace(/[{}]/g, '')
    .replace(/~/g, ' ')
    .replace(/[*\u2020\u2021]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseGabc(src, opts = {}) {
  const o = { ...DEFAULTS, ...opts, barRests: { ...DEFAULTS.barRests, ...(opts.barRests || {}) } };
  const sep = src.indexOf('%%');
  const header = sep >= 0 ? parseHeader(src.slice(0, sep)) : {};
  let body = sep >= 0 ? src.slice(sep + 2) : src;
  body = body
    .split(/\r?\n/)
    .map((l) => l.replace(/%.*$/, ''))
    .join('\n');

  const events = [];
  const warnings = [];
  let clef = null;
  let accidentals = {}; // letter -> -1 | 0 | +1, until word end or bar
  let first = true;

  const groupRe = /([^()]*)\(([^)]*)\)/g;
  let g;
  while ((g = groupRe.exec(body))) {
    const rawText = g[1];
    const neumes = g[2].split('|')[0]; // drop any NABC alternation
    const wordStart = first || /^\s/.test(rawText);
    first = false;
    if (wordStart) accidentals = {};

    const maybeClef = parseClef(neumes);
    if (maybeClef) {
      clef = maybeClef;
      continue;
    }

    let syllable = lyricText(rawText);
    let lyricPending = syllable.length > 0;
    let i = 0;
    let lastNote = null;
    while (i < neumes.length) {
      const ch = neumes[i];
      if (ch === '[' || ch === '{') {
        const close = neumes.indexOf(ch === '[' ? ']' : '}', i);
        i = close < 0 ? neumes.length : close + 1;
        continue;
      }
      if (ch === 'c' || ch === 'f') {
        // A clef change inside a group, as in (::c3) or (z c3): digits follow a pitch
        // letter nowhere else (episema and bar digits are eaten with their sign).
        const cm = /^[cf]b?[1-4]/.exec(neumes.slice(i));
        if (cm) {
          clef = parseClef(cm[0]);
          accidentals = {};
          i += cm[0].length;
          continue;
        }
      }
      if (PITCHES.includes(ch.toLowerCase())) {
        const next = neumes[i + 1];
        if (next === 'x' || next === 'y' || next === '#') {
          accidentals[ch.toLowerCase()] = next === 'x' ? -1 : next === '#' ? 1 : 0;
          i += 2;
          continue;
        }
        if (next === '+') {
          i += 2; // custos: shows the next pitch, not sung
          continue;
        }
        if (!clef) {
          warnings.push(`note "${ch}" before any clef; assumed c4`);
          clef = { type: 'c', flatB: false, line: 4 };
        }
        const letter = ch.toLowerCase();
        const acc = letter in accidentals ? accidentals[letter] : null;
        lastNote = {
          type: 'note',
          letter,
          midi: pitchToMidi(letter, clef, acc, o.refC),
          pulses: 1,
          syllable: lyricPending ? syllable : null,
          wordStart: lyricPending ? wordStart : false,
        };
        lyricPending = false;
        events.push(lastNote);
        i += 1;
        continue;
      }
      if (ch === '.' && lastNote) {
        lastNote.pulses += o.moraPulses;
        while (neumes[i] === '.') i += 1; // a double dot is still one mora here
        continue;
      }
      if (ch === '_' && lastNote) {
        lastNote.pulses += o.episemaPulses;
        i += 1;
        while (/[0-9]/.test(neumes[i] || '')) i += 1;
        continue;
      }
      if (ch === ':' || ch === ';' || ch === ',' || ch === '`') {
        let kind;
        if (ch === ':' && neumes[i + 1] === ':') {
          kind = 'double';
          i += 2;
        } else {
          kind = ch === ':' ? 'full' : ch === ';' ? 'half' : 'comma';
          i += 1;
        }
        while (/[0-9?']/.test(neumes[i] || '')) i += 1;
        events.push({ type: 'bar', kind, pulses: o.barRests[kind] });
        accidentals = {};
        lastNote = null;
        continue;
      }
      i += 1; // shape modifiers, spacing and anything unknown
    }
  }
  return { header, events, warnings };
}

// Pad the rest after every full and double bar so the next phrase starts on a
// downbeat. This is the first, simplest answer to "chant has no metre": keep
// each note's length and let phrases breathe until the bar line.
export function fitToBars(events, pulsesPerBar) {
  if (!(pulsesPerBar > 0)) throw new Error('pulsesPerBar must be positive');
  let t = 0;
  return events.map((e) => {
    const out = { ...e };
    t += out.pulses;
    if (out.type === 'bar' && (out.kind === 'full' || out.kind === 'double')) {
      const over = t % pulsesPerBar;
      if (over > 1e-9) {
        out.pulses += pulsesPerBar - over;
        t += pulsesPerBar - over;
      }
    }
    return out;
  });
}

export function transposeToFinal(events, finalMidi) {
  const notes = events.filter((e) => e.type === 'note');
  if (!notes.length) return events;
  const shift = finalMidi - notes[notes.length - 1].midi;
  return events.map((e) => (e.type === 'note' ? { ...e, midi: e.midi + shift } : e));
}

// Modes 1-8 by their usual final: D D E E F F G G (as a step above do).
const MODE_FINAL_DEGREE = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = (m) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

export function summarize(parsed, { refC = DEFAULTS.refC, pulsesPerBar = 8, bpm = 124, pulsesPerBeat = 2 } = {}) {
  const notes = parsed.events.filter((e) => e.type === 'note');
  const pulses = parsed.events.reduce((a, e) => a + e.pulses, 0);
  const out = {
    name: parsed.header.name || null,
    mode: parsed.header.mode || null,
    notes: notes.length,
    pulses,
    bars: pulses / pulsesPerBar,
    seconds: (pulses / pulsesPerBeat) * (60 / bpm),
    warnings: parsed.warnings,
  };
  if (notes.length) {
    const ms = notes.map((n) => n.midi);
    const lo = Math.min(...ms);
    const hi = Math.max(...ms);
    const fin = ms[ms.length - 1];
    Object.assign(out, { lowest: noteName(lo), highest: noteName(hi), ambitus: hi - lo, final: noteName(fin) });
    const want = MODE_FINAL_DEGREE[Number.parseInt(out.mode, 10)];
    if (want !== undefined) {
      const finalDegreeSemis = (((fin - refC) % 12) + 12) % 12;
      out.modeFinalMatches = finalDegreeSemis === DEGREE_SEMITONES[want];
    }
  }
  return out;
}
