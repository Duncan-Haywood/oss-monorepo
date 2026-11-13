#!/usr/bin/env node
// node cli.mjs piece.gabc [-o out.mid] [--bpm 124] [--fit 8] [--final 50] [--drone] [--json]
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseGabc, fitToBars, fitStretch, halfTime, transposeToFinal, summarize } from './gabc.mjs';
import { eventsToMidi } from './midi.mjs';
import { lrc } from './lrc.mjs';
import { cueSheet } from './cues.mjs';
import { suggestFinal } from './voicefit.mjs';
import { arrange, barsFor, bpmRange, GENRE_NAMES } from './genre.mjs';
import { sectionPlan } from './sections.mjs';

const USAGE = `usage: node cli.mjs piece.gabc [-o out.mid] [--bpm N] [--fit PULSES_PER_BAR] [--stretch] [--halftime] [--repeat N] [--final MIDI] [--drone] [--genre NAME] [--fills] [--sections] [--outro N] [--json]
  --genre   add drums, bass and chords in the chant's mode: ${GENRE_NAMES.join(', ')}
  --fills   with --genre: a snare roll on the last beat of every fourth bar (not the final bar)
  --sections  with --genre: song sections from the chant's double bars (intro, verse, build, drop, outro); the backing changes energy between them
  --outro   N bars after the chant (the backing winds down under them; with --sections it ends on a held chord)
  --bpm     tempo; one chant note is an eighth note (default 124, deep house)
  --fit     pad each full bar so the next phrase starts on a downbeat (8 = one 4/4 bar)
  --stretch with --fit: lengthen the phrase's long notes to fill the bar instead of padding silence
  --halftime  chant at half speed over full-time backing (every duration doubled; for metal)
  --repeat  play the whole chant N times in a row (a 1-minute chant becomes a 3-minute track; backing and cues follow)
  --final   transpose so the last note is this MIDI number (50 = D3, a low men's choir final)
  --drone   add a held drone on the final, an octave below
  --cues    write a singer's cue sheet (bar, beat, seconds, note, syllable) to this file
  --lrc     write timed lyrics (LRC, one line per phrase) to this file
  --suggest-final  print the finals that keep the whole chant in E2-E4 (a men's unison range) and exit
  --auto-final  transpose to the recommended final from --suggest-final (a chant wider than E2-E4 is refused)
  --intro   N bars of silence before the chant (the backing plays under them; cues, lyrics and markers shift to match)
  --markers add a MIDI marker at the start of each phrase (DAW locators)
  --json    print the summary as JSON`;

export function run(argv) {
  const args = { bpm: 124, fit: null, stretch: false, halftime: false, repeat: 1, final: null, drone: false, genre: null, fills: false, markers: false, json: false, suggest: false, auto: false, cues: null, lrc: null, out: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') args.out = argv[++i];
    else if (a === '--bpm') args.bpm = Number(argv[++i]);
    else if (a === '--fit') args.fit = Number(argv[++i]);
    else if (a === '--stretch') args.stretch = true
    else if (a === '--halftime') args.halftime = true;
    else if (a === '--repeat') args.repeat = Number(argv[++i]);
    else if (a === '--final') args.final = Number(argv[++i]);
    else if (a === '--drone') args.drone = true;
    else if (a === '--genre') args.genre = argv[++i];
    else if (a === '--fills') args.fills = true;
    else if (a === '--sections') args.sections = true;
    else if (a === '--outro') args.outro = Number(argv[++i]);
    else if (a === '--markers') args.markers = true;
    else if (a === '--cues') args.cues = argv[++i];
    else if (a === '--lrc') args.lrc = argv[++i];
    else if (a === '--suggest-final') args.suggest = true;
    else if (a === '--auto-final') args.auto = true;
    else if (a === '--intro') args.intro = Number(argv[++i]);
    else if (a === '--json') args.json = true;
    else if (a === '-h' || a === '--help') return { code: 0, text: USAGE };
    else if (!args.file) args.file = a;
    else return { code: 2, text: `unexpected argument ${a}\n${USAGE}` };
  }
  if (!args.file) return { code: 2, text: USAGE };
  if (!(args.bpm > 0)) return { code: 2, text: '--bpm must be a positive number' };

  if (!Number.isInteger(args.repeat) || args.repeat < 1 || args.repeat > 64) return { code: 2, text: '--repeat must be a whole number from 1 to 64' };

  if (args.outro !== undefined && (!Number.isInteger(args.outro) || args.outro < 1 || args.outro > 16)) return { code: 2, text: '--outro must be a whole number of bars from 1 to 16' };

  if (args.intro !== undefined && (!Number.isInteger(args.intro) || args.intro < 1 || args.intro > 16)) return { code: 2, text: '--intro must be a whole number of bars from 1 to 16' };

  const parsed = parseGabc(readFileSync(args.file, 'utf8'));
  let events = parsed.events;
  if (args.suggest) {
    if (!events.some((e) => e.type === 'note')) return { code: 2, text: 'no notes' };
    const r = suggestFinal(events);
    if (args.json) return { code: 0, text: JSON.stringify(r, null, 2) };
    if (!r.fits) return { code: 1, text: `ambitus ${r.ambitus} semitones is ${r.over} wider than ${r.range.join('-')}; split between voices or accept a falsetto/low pedal` };
    return { code: 0, text: `finals that fit ${r.range.join('-')}: ${r.finals.lowestName} to ${r.finals.highestName}; recommended --final ${r.recommended.final} (${r.recommended.name})` };
  }
  if (args.auto) {
    if (args.final !== null) return { code: 2, text: '--auto-final and --final both set the final; use one' };
    if (!events.some((e) => e.type === 'note')) return { code: 2, text: 'no notes' };
    const r = suggestFinal(events);
    if (!r.fits) return { code: 1, text: `--auto-final: ambitus ${r.ambitus} semitones is ${r.over} wider than ${r.range.join('-')}; use --final to choose` };
    args.final = r.recommended.final;
  }
  if (args.final !== null) events = transposeToFinal(events, args.final);
  if (args.fills && !args.genre) return { code: 2, text: '--fills needs --genre' };
  if (args.sections && !args.genre) return { code: 2, text: '--sections needs --genre' };
  if (args.stretch && !args.fit) return { code: 2, text: '--stretch needs --fit' };
  if (args.fit) events = args.stretch ? fitStretch(events, args.fit) : fitToBars(events, args.fit);
  if (args.halftime) events = halfTime(events);
  if (args.repeat > 1) events = Array.from({ length: args.repeat }, () => events).flat().map((e) => ({ ...e }));
  const ppb = 8; // the backing's bar is always 4/4 at two pulses a beat (genre.mjs BAR), whatever --fit says
  const chantPulses = events.reduce((s, e) => s + e.pulses, 0);
  const chantBars = Math.max(1, Math.ceil(chantPulses / ppb - 1e-9));
  const plan = args.sections ? sectionPlan({ events, pulsesPerBar: ppb, intro: args.intro || 0, outro: args.outro || 0 }) : null;
  if (args.outro) events = [...events, { type: 'bar', kind: 'full', pulses: chantBars * ppb - chantPulses + ppb * args.outro }];
  if (args.intro) events = [{ type: 'bar', kind: 'full', pulses: 8 * args.intro }, ...events];
  const summary = summarize({ ...parsed, events }, { bpm: args.bpm, pulsesPerBar: args.fit || 8 });
  if (args.cues) {
    writeFileSync(args.cues, cueSheet(events, { bpm: args.bpm, pulsesPerBar: args.fit || 8 }));
    summary.cues = args.cues;
  }
  if (args.lrc) {
    writeFileSync(args.lrc, lrc(events, { bpm: args.bpm }, parsed.header.name || ''));
    summary.lrc = args.lrc;
  }
  if (args.out) {
    const title = parsed.header.name || basename(args.file, '.gabc');
    let backing = null;
    if (args.genre) {
      const fin = [...events].reverse().find((x) => x.type === 'note');
      if (!fin) return { code: 2, text: 'no notes to arrange under' };
      const mode = Number(parsed.header.mode);
      if (!mode) return { code: 2, text: '--genre needs a mode header in the GABC file (mode: 1;)' };
      try {
        backing = arrange({ genre: args.genre, mode, final: fin.midi, bars: plan ? plan.reduce((m, s) => Math.max(m, s.start + s.bars), 0) : barsFor(events), fills: args.fills, sections: plan });
      } catch (err) {
        return { code: 2, text: err.message };
      }
      const [lo, hi] = bpmRange(args.genre);
      if (args.bpm < lo || args.bpm > hi) summary.warnings.push(`${args.genre} usually runs ${lo}-${hi} BPM; you asked for ${args.bpm}`);
    }
    writeFileSync(args.out, eventsToMidi(events, { bpm: args.bpm, title, drone: args.drone, backing, markers: args.markers }));
    summary.wrote = args.out;
    if (plan) summary.sections = plan.map((s) => `${s.name} bar ${s.start + 1}-${s.start + s.bars}${s.build ? ' (build)' : ''}`);
  }
  const text = args.json
    ? JSON.stringify(summary, null, 2)
    : [
        `${summary.name || args.file}: ${summary.notes} notes, ${summary.lowest}-${summary.highest} (ambitus ${summary.ambitus} semitones), final ${summary.final}`,
        `mode ${summary.mode ?? 'not given'}${summary.modeFinalMatches === false ? ' (final does not match the mode: check the transcription)' : ''}`,
        `${summary.bars.toFixed(2)} bars, ${summary.seconds.toFixed(1)} s at ${args.bpm} BPM`,
        ...(summary.sections ? [`sections: ${summary.sections.join('; ')}`] : []),
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
