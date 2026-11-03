#!/usr/bin/env node
// node cli.mjs piece.gabc [-o out.mid] [--bpm 124] [--fit 8] [--final 50] [--drone] [--json]
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseGabc, fitToBars, fitStretch, transposeToFinal, summarize } from './gabc.mjs';
import { eventsToMidi } from './midi.mjs';
import { arrange, barsFor, bpmRange, GENRE_NAMES } from './genre.mjs';

const USAGE = `usage: node cli.mjs piece.gabc [-o out.mid] [--bpm N] [--fit PULSES_PER_BAR] [--stretch] [--final MIDI] [--drone] [--genre NAME] [--json]
  --genre   add drums, bass and chords in the chant's mode: ${GENRE_NAMES.join(', ')}
  --bpm     tempo; one chant note is an eighth note (default 124, deep house)
  --fit     pad each full bar so the next phrase starts on a downbeat (8 = one 4/4 bar)
  --stretch with --fit: lengthen the phrase's long notes to fill the bar instead of padding silence
  --final   transpose so the last note is this MIDI number (50 = D3, a low men's choir final)
  --drone   add a held drone on the final, an octave below
  --json    print the summary as JSON`;

export function run(argv) {
  const args = { bpm: 124, fit: null, stretch: false, final: null, drone: false, genre: null, json: false, out: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') args.out = argv[++i];
    else if (a === '--bpm') args.bpm = Number(argv[++i]);
    else if (a === '--fit') args.fit = Number(argv[++i]);
    else if (a === '--stretch') args.stretch = true
    else if (a === '--final') args.final = Number(argv[++i]);
    else if (a === '--drone') args.drone = true;
    else if (a === '--genre') args.genre = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '-h' || a === '--help') return { code: 0, text: USAGE };
    else if (!args.file) args.file = a;
    else return { code: 2, text: `unexpected argument ${a}\n${USAGE}` };
  }
  if (!args.file) return { code: 2, text: USAGE };
  if (!(args.bpm > 0)) return { code: 2, text: '--bpm must be a positive number' };

  const parsed = parseGabc(readFileSync(args.file, 'utf8'));
  let events = parsed.events;
  if (args.final !== null) events = transposeToFinal(events, args.final);
  if (args.stretch && !args.fit) return { code: 2, text: '--stretch needs --fit' };
  if (args.fit) events = args.stretch ? fitStretch(events, args.fit) : fitToBars(events, args.fit);
  const summary = summarize({ ...parsed, events }, { bpm: args.bpm, pulsesPerBar: args.fit || 8 });
  if (args.out) {
    const title = parsed.header.name || basename(args.file, '.gabc');
    let backing = null;
    if (args.genre) {
      const fin = [...events].reverse().find((x) => x.type === 'note');
      if (!fin) return { code: 2, text: 'no notes to arrange under' };
      const mode = Number(parsed.header.mode);
      if (!mode) return { code: 2, text: '--genre needs a mode header in the GABC file (mode: 1;)' };
      try {
        backing = arrange({ genre: args.genre, mode, final: fin.midi, bars: barsFor(events) });
      } catch (err) {
        return { code: 2, text: err.message };
      }
      const [lo, hi] = bpmRange(args.genre);
      if (args.bpm < lo || args.bpm > hi) summary.warnings.push(`${args.genre} usually runs ${lo}-${hi} BPM; you asked for ${args.bpm}`);
    }
    writeFileSync(args.out, eventsToMidi(events, { bpm: args.bpm, title, drone: args.drone, backing }));
    summary.wrote = args.out;
  }
  const text = args.json
    ? JSON.stringify(summary, null, 2)
    : [
        `${summary.name || args.file}: ${summary.notes} notes, ${summary.lowest}-${summary.highest} (ambitus ${summary.ambitus} semitones), final ${summary.final}`,
        `mode ${summary.mode ?? 'not given'}${summary.modeFinalMatches === false ? ' (final does not match the mode: check the transcription)' : ''}`,
        `${summary.bars.toFixed(2)} bars, ${summary.seconds.toFixed(1)} s at ${args.bpm} BPM`,
        ...summary.warnings.map((w) => `warning: ${w}`),
        ...(summary.wrote ? [`wrote ${summary.wrote}`] : []),
      ].join('\n');
  return { code: 0, text };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run(process.argv.slice(2));
  (r.code ? process.stderr : process.stdout).write(r.text + '\n');
  process.exit(r.code);
}
