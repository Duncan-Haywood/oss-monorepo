// Singer's cue sheet: one row per sung note with bar and beat, seconds from
// the start, the syllable and the note name, so a choir or one singer
// multi-tracking can learn the line against the MIDI guide (ROADMAP 5a).
//
// With a section plan (sections.mjs, `--sections`), a guidance line goes above the first note
// of each section: what the band does under it (nothing in an a cappella verse, drums and bass
// out in a breakdown), the first note to pitch from and how far it is from the last one sung,
// when the band comes in after an a cappella verse, and the new key's first note after a key
// lift. Those are the places a singer loses the pitch. Without a plan the sheet is unchanged.
import { noteName } from './gabc.mjs';

const BACKING_PPB = 8; // the backing's bar: 4/4 at two pulses a beat (genre.mjs BAR); plans count in it
const STEP = ['unison', 'a semitone', 'a whole tone', 'a minor 3rd', 'a major 3rd', 'a 4th', 'a tritone', 'a 5th', 'a minor 6th', 'a major 6th', 'a minor 7th', 'a major 7th', 'an octave'];

export function interval(from, to) {
  const d = to - from;
  if (d === 0) return 'the same note';
  const a = Math.abs(d);
  return `${a <= 12 ? STEP[a] : `${a} semitones`} ${d > 0 ? 'up' : 'down'}`;
}

function sectionFor(plan, pulse) {
  const bar = Math.floor(pulse / BACKING_PPB + 1e-9);
  for (const s of plan) if (bar >= s.start && bar < s.start + s.bars) return s;
  return null;
}

// Where each section's singing starts. A section begins at the first note, or at the first note
// after a double bar that falls in a different section (sections.mjs cuts only at double bars,
// and liftEvents starts the lift at the same note), so the last note of a section that shares a
// bar with the next one stays with its own section.
export function sectionCues(events, { bpm = 124, pulsesPerBar = 8, pulsesPerBeat = 2, plan } = {}) {
  if (!plan || !plan.length) return [];
  const sec = (p) => (p / pulsesPerBeat) * (60 / bpm);
  const cueBar = (p) => Math.floor(p / pulsesPerBar + 1e-9) + 1;
  const out = [];
  let p = 0, n = 0, current = null, afterDouble = false, last = null, firstNote = true;
  for (const e of events) {
    if (e.type === 'note') {
      const s = sectionFor(plan, p);
      if (s && s !== current && (firstNote || afterDouble)) {
        out.push({ ...guide(s, e, p, last, plan, { sec, cueBar }), noteIndex: n });
        current = s;
      }
      last = e;
      n++;
      firstNote = false;
      afterDouble = false;
    }
    if (e.type === 'bar' && e.kind === 'double') afterDouble = true;
    p += e.pulses || 0;
  }
  return out;
}

function guide(s, e, p, last, plan, { sec, cueBar }) {
  const first = noteName(e.midi);
  const syl = e.syllable ? ` on "${e.syllable}"` : '';
  const lines = [];
  const i = plan.indexOf(s);
  const prev = plan[i - 1];
  if (s.energy === 'acappella') lines.push('choir alone, no backing');
  else if (s.energy === 'breakdown') lines.push('drums and bass drop out; you carry it over a held chord');
  else if (s.energy === 'drop') lines.push(s.lift ? `full band, key up ${s.lift} semitone${s.lift === 1 ? '' : 's'}` : 'full band');
  else lines.push('band under you');
  if (!last) {
    const lead = prev && prev.energy === 'intro' ? `come in after the ${prev.bars}-bar intro; ` : '';
    const from = s.energy === 'acappella' || !prev ? 'take it from a pitch pipe or the guide track' : 'the intro sits in this key';
    lines.push(`${lead}first note ${first}${syl}: ${from}`);
  } else {
    lines.push(e.midi === last.midi ? `first note ${first}${syl}, the same as your last note` : `first note ${first}${syl}, ${interval(last.midi, e.midi)} from your last note (${noteName(last.midi)})`);
  }
  if (s.lift && e.lifted) lines.push(`in the old key it would be ${noteName(e.midi - s.lift)}; the build bar before it plays the approach into the new key, so pitch from that`);
  if (s.energy === 'acappella' && s.build) {
    const b = (s.start + s.bars - 1) * BACKING_PPB;
    lines.push(`the band comes in on the build at bar ${cueBar(b)} (${sec(b).toFixed(2)} s): hold your pitch, it will not move`);
  }
  const next = plan[i + 1];
  if (s.energy === 'breakdown' && next) {
    const b = next.start * BACKING_PPB;
    lines.push(`the band is back at bar ${cueBar(b)} (${sec(b).toFixed(2)} s)`);
  }
  return { section: s.name, energy: s.energy, bar: cueBar(p), seconds: sec(p), note: first, lift: s.lift || 0, text: lines.map((l) => l[0].toUpperCase() + l.slice(1)).join('. ') + '.' };
}

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
        ...(e.voice ? { voice: e.voice } : {}),
      });
    }
    p += e.pulses;
  }
  return rows;
}

const WHO = { all: 'all', tenor: 'T', baritone: 'Bar', bass: 'B' };
const who = (v) => (typeof v === 'string' && v.split('+').every((x) => Object.hasOwn(WHO, x)) ? v.split('+').map((x) => WHO[x]).join('+') : '?');

export function cueSheet(events, opts = {}) {
  // --split-voices adds a who-sings column: all, T (tenors alone) or B (basses alone); with
  // --baritones also Bar (baritones alone), T+Bar and Bar+B
  const split = events.some((e) => e.type === 'note' && e.voice);
  const lines = [split ? 'bar  beat  time(s)  note  beats  who  syllable' : 'bar  beat  time(s)  note  beats  syllable'];
  const guides = new Map(sectionCues(events, opts).map((g) => [g.noteIndex, g]));
  cueRows(events, opts).forEach((r, i) => {
    const g = guides.get(i);
    if (g) lines.push(`-- ${g.section}, bar ${g.bar}, ${g.seconds.toFixed(2)} s: ${g.text}`);
    lines.push(
      [String(r.bar).padStart(3), String(r.beat).padStart(5), r.seconds.toFixed(2).padStart(8), r.note.padStart(5), String(r.beats).padStart(6), ...(split ? [who(r.voice).padStart(4)] : []), '  ' + r.syllable].join(' '),
    );
  });
  return lines.join('\n') + '\n';
}
