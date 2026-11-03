// Singer's cue sheet: one row per sung note with bar and beat, seconds from
// the start, the syllable and the note name, so a choir or one singer
// multi-tracking can learn the line against the MIDI guide (ROADMAP 5a).
import { noteName } from './gabc.mjs';

export function cueRows(events, { bpm = 124, pulsesPerBar = 8, pulsesPerBeat = 2 } = {}) {
  const rows = [];
  let p = 0;
  for (const e of events) {
    if (e.type === 'note') {
      const bar = Math.floor(p / pulsesPerBar) + 1;
      const beat = (p % pulsesPerBar) / pulsesPerBeat + 1;
      rows.push({
        bar,
        beat,
        seconds: (p / pulsesPerBeat) * (60 / bpm),
        syllable: e.syllable || '',
        note: noteName(e.midi),
        beats: e.pulses / pulsesPerBeat,
      });
    }
    p += e.pulses;
  }
  return rows;
}

export function cueSheet(events, opts = {}) {
  const lines = ['bar  beat  time(s)  note  beats  syllable'];
  for (const r of cueRows(events, opts)) {
    lines.push(
      [String(r.bar).padStart(3), String(r.beat).padStart(5), r.seconds.toFixed(2).padStart(8), r.note.padStart(5), String(r.beats).padStart(6), '  ' + r.syllable].join(' '),
    );
  }
  return lines.join('\n') + '\n';
}
