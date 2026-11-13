// Standard MIDI File (format 1) writer for chant events. No dependencies.
//
// Track 0: tempo, 4/4 and the title. Track 1: the chant line (GM "Choir Aahs")
// with each syllable as a lyric event, so a singing synthesiser or a DAW can
// show the Latin under the notes. Track 2 (optional): a drone on the final, an
// octave below, held for the whole piece (GM "Church Organ").

export const PPQ = 480;

export function vlq(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`bad delta time ${n}`);
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n) => [(n >>> 8) & 0xff, n & 0xff];

function meta(type, data) {
  return [0xff, type, ...vlq(data.length), ...data];
}

function chunk(id, data) {
  return [...new TextEncoder().encode(id), ...u32(data.length), ...data];
}

// list of [tick, bytes] -> track bytes, sorted (stable) by tick
function track(timed) {
  const sorted = timed.map((e, i) => [...e, i]).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const out = [];
  let t = 0;
  for (const [tick, bytes] of sorted) {
    out.push(...vlq(tick - t), ...bytes);
    t = tick;
  }
  out.push(0, 0xff, 0x2f, 0x00);
  return chunk('MTrk', out);
}

export function eventsToMidi(events, { bpm = 124, pulsesPerBeat = 2, title = 'chant', drone = false, velocity = 80, backing = null, markers = false } = {}) {
  const ticksPerPulse = PPQ / pulsesPerBeat;
  const usPerBeat = Math.round(60_000_000 / bpm);

  const choir = [[0, [0xc0, 52]]];
  let t = 0;
  let lastMidi = null;
  const phraseStarts = [];
  let newPhrase = true;
  for (const e of events) {
    const len = Math.round(e.pulses * ticksPerPulse);
    if (e.type === 'bar') newPhrase = true;
    if (e.type === 'note' && newPhrase) {
      phraseStarts.push([t, e.syllable || '']);
      newPhrase = false;
    }
    if (e.type === 'note') {
      if (e.syllable) choir.push([t, meta(0x05, [...new TextEncoder().encode(e.syllable)])]);
      choir.push([t, [0x90, e.midi, velocity]]);
      choir.push([t + len, [0x80, e.midi, 0]]);
      lastMidi = e.midi;
    }
    t += len;
  }
  const end = t;

  const conductor = [
    [0, meta(0x03, [...new TextEncoder().encode(title)])],
    [0, meta(0x51, [(usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff])],
    [0, meta(0x58, [4, 2, 24, 8])],
  ];
  if (markers) {
    phraseStarts.forEach(([tick, syl], i) => {
      const label = `Phrase ${i + 1}${syl ? ` ${syl}` : ''}`;
      conductor.push([tick, meta(0x06, [...new TextEncoder().encode(label)])]);
    });
  }
  // song sections from genre.mjs (sections.mjs plan), as DAW locators
  if (backing && backing.sections) {
    for (const sec of backing.sections) conductor.push([sec.tick, meta(0x06, [...new TextEncoder().encode(sec.name)])]);
    conductor.sort((a, b) => a[0] - b[0]);
  }
  // --split-voices: notes tagged 'tenor', 'bass' or 'all' go to a Tenors track (channel 1) and a
  // Basses track (channel 5); 'all' is in both, so each section's part is complete on its own.
  // With baritones (voices like 'tenor+baritone') a Baritones track (channel 6) sits between them
  // and a note goes to every section its voice names.
  const split = events.some((e) => e.type === 'note' && e.voice);
  const sings = (voice, keep) => voice === 'all' || (typeof voice === 'string' && voice.split('+').includes(keep));
  const baritones = split && events.some((e) => e.type === 'note' && sings(e.voice, 'baritone') && e.voice !== 'all');
  const section = (keep, ch, name) => {
    const tl = [[0, meta(0x03, [...new TextEncoder().encode(name)])], [0, [0xc0 | ch, 52]]];
    let tt = 0;
    for (const e of events) {
      const len = Math.round(e.pulses * ticksPerPulse);
      if (e.type === 'note' && sings(e.voice, keep)) {
        if (e.syllable) tl.push([tt, meta(0x05, [...new TextEncoder().encode(e.syllable)])]);
        tl.push([tt, [0x90 | ch, e.midi, velocity]], [tt + len, [0x80 | ch, e.midi, 0]]);
      }
      tt += len;
    }
    return track(tl);
  };
  const tracks = split
    ? [track(conductor), section('tenor', 0, 'Tenors'), ...(baritones ? [section('baritone', 5, 'Baritones')] : []), section('bass', 4, 'Basses')]
    : [track(conductor), track(choir)];
  if (drone && lastMidi !== null && end > 0) {
    const d = lastMidi - 12;
    tracks.push(track([[0, [0xc1, 19]], [0, [0x91, d, 60]], [end, [0x81, d, 0]]]));
  }
  if (backing) {
    // drums on channel 10 (index 9), bass and chords on their own channels
    const part = (list, ch, program) => {
      const tl = program === null ? [] : [[0, [0xc0 | ch, program]]];
      for (const n of list) {
        tl.push([n.tick, [0x90 | ch, n.note, n.vel]], [n.tick + n.len, [0x80 | ch, n.note, 0]]);
      }
      return track(tl);
    };
    tracks.push(part(backing.drums, 9, null), part(backing.bass, 2, 38), part(backing.chords, 3, 89));
  }
  const header = chunk('MThd', [...u16(1), ...u16(tracks.length), ...u16(PPQ)]);
  return Uint8Array.from([...header, ...tracks.flat()]);
}
