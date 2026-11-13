#!/usr/bin/env node
// node cli.mjs piece.gabc [-o out.mid] [--bpm 124] [--fit 8] [--final 50] [--drone] [--json]
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseGabc, fitToBars, fitStretch, halfTime, transposeToFinal, summarize } from './gabc.mjs';
import { eventsToMidi } from './midi.mjs';
import { lrc } from './lrc.mjs';
import { cueSheet } from './cues.mjs';
import { suggestFinal, splitVoices, describeSplit, MENS_RANGE, TENOR_RANGE, BASS_RANGE } from './voicefit.mjs';
import { arrange, barsFor, bpmRange, GENRE_NAMES } from './genre.mjs';
import { sectionPlan, liftEvents } from './sections.mjs';
import { noteName } from './gabc.mjs';

const USAGE = `usage: node cli.mjs piece.gabc [-o out.mid] [--bpm N] [--fit PULSES_PER_BAR] [--stretch] [--halftime] [--repeat N] [--final MIDI] [--drone] [--genre NAME] [--fills] [--sections] [--no-breakdown] [--a-cappella] [--key-lift N] [--range LOW-HIGH] [--split-voices] [--split-words] [--word-cost N] [--tenor LOW-HIGH] [--bass LOW-HIGH] [--outro N] [--json]
  --genre   add drums, bass and chords in the chant's mode: ${GENRE_NAMES.join(', ')}
  --fills   with --genre: a snare roll on the last beat of every fourth bar (not the final bar)
  --sections  with --genre: song sections from the chant's double bars (intro, verse, build, drop, outro); the backing changes energy between them
  --no-breakdown  with --sections: keep the verse before the last drop a verse (by default a piece with four or more sections turns it into a breakdown: drums and bass out, choir alone, then a swelling chord)
  --a-cappella  with --sections: the first verse is the choir alone (no backing); the band comes in on its build bar
  --key-lift  with --sections: raise the last drop (and the outro) N semitones, 2 = a whole tone; refused if the lifted line leaves the singing range
  --range   singing range as MIDI numbers LOW-HIGH for --suggest-final, --auto-final and the --key-lift check (default 40-64, E2-E4)
  --split-voices  tenors and basses take turns by phrase: the full choir sings every phrase both sections can reach, the rest go to the section that can; picks the final itself unless --final is given; the MIDI gets a Tenors and a Basses track and the cue sheet a who-sings column
  --split-words  with --split-voices: also hand over inside a phrase, at a word, when each handoff wins the full choir more than --word-cost notes (by default a phrase is handed over at a word only when no whole-phrase split fits, as few times as possible)
  --word-cost  a handoff inside a phrase must win the full choir more than this many notes, for --split-words (default 3)
  --tenor, --bass  section ranges for --split-voices as MIDI numbers LOW-HIGH (defaults 48-69, C3-A4, and 40-64, E2-E4)
  --outro   N bars after the chant (the backing winds down under them; with --sections it ends on a held chord)
  --bpm     tempo; one chant note is an eighth note (default 124, deep house)
  --fit     pad each full bar so the next phrase starts on a downbeat (8 = one 4/4 bar)
  --stretch with --fit: lengthen the phrase's long notes to fill the bar instead of padding silence
  --halftime  chant at half speed over full-time backing (every duration doubled; for metal)
  --repeat  play the whole chant N times in a row (a 1-minute chant becomes a 3-minute track; backing and cues follow)
  --final   transpose so the last note is this MIDI number (50 = D3, a low men's choir final)
  --drone   add a held drone on the final, an octave below
  --cues    write a singer's cue sheet (bar, beat, seconds, note, syllable) to this file; with --sections, a guidance line opens each section (backing, first note to pitch from, the band's entry, the lifted key)
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
    else if (a === '--no-breakdown') args.breakdown = false;
    else if (a === '--a-cappella') args.acappella = true;
    else if (a === '--key-lift') args.keyLift = Number(argv[++i]);
    else if (a === '--range') args.range = argv[++i];
    else if (a === '--split-voices') args.split = true;
    else if (a === '--split-words') args.splitWords = true;
    else if (a === '--word-cost') args.wordCost = argv[++i];
    else if (a === '--tenor') args.tenor = argv[++i];
    else if (a === '--bass') args.bass = argv[++i];
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

  if (args.keyLift !== undefined && (!Number.isInteger(args.keyLift) || args.keyLift < 1 || args.keyLift > 7)) return { code: 2, text: '--key-lift must be a whole number of semitones from 1 to 7' };
  let range = MENS_RANGE;
  if (args.range !== undefined) {
    const m = /^(\d{1,3})-(\d{1,3})$/.exec(args.range || '');
    if (!m || Number(m[1]) >= Number(m[2]) || Number(m[2]) > 127) return { code: 2, text: '--range must be two MIDI numbers LOW-HIGH, low first (40-64 is E2-E4)' };
    range = { low: Number(m[1]), high: Number(m[2]) };
  }
  const rangeArg = (v, flag, d) => {
    if (v === undefined) return d;
    const m = /^(\d{1,3})-(\d{1,3})$/.exec(v || '');
    if (!m || Number(m[1]) >= Number(m[2]) || Number(m[2]) > 127) return null;
    return { low: Number(m[1]), high: Number(m[2]) };
  };
  const tenor = rangeArg(args.tenor, '--tenor', TENOR_RANGE);
  const bass = rangeArg(args.bass, '--bass', BASS_RANGE);
  if (!tenor || !bass) return { code: 2, text: '--tenor and --bass must be two MIDI numbers LOW-HIGH, low first (48-69 is C3-A4)' };
  if ((args.tenor !== undefined || args.bass !== undefined) && !args.split) return { code: 2, text: '--tenor and --bass need --split-voices' };
  if ((args.splitWords || args.wordCost !== undefined) && !args.split) return { code: 2, text: '--split-words and --word-cost need --split-voices' };
  if (args.wordCost !== undefined && !args.splitWords) return { code: 2, text: '--word-cost needs --split-words' };
  const wordCost = args.wordCost === undefined ? 3 : Number(args.wordCost);
  if (!(Number.isInteger(wordCost) && wordCost >= 0)) return { code: 2, text: '--word-cost must be a whole number of notes, 0 or more' };
  if (args.split && args.auto) return { code: 2, text: '--split-voices picks the final itself; drop --auto-final' };
  if (args.split && args.suggest) return { code: 2, text: '--suggest-final checks one unison range; drop --split-voices' };
  if (args.auto && args.final !== null) return { code: 2, text: '--auto-final and --final both set the final; use one' };
  if (args.fills && !args.genre) return { code: 2, text: '--fills needs --genre' };
  if (args.sections && !args.genre) return { code: 2, text: '--sections needs --genre' };
  if (args.breakdown === false && !args.sections) return { code: 2, text: '--no-breakdown needs --sections' };
  if (args.acappella && !args.sections) return { code: 2, text: '--a-cappella needs --sections' };
  if (args.keyLift && !args.sections) return { code: 2, text: '--key-lift needs --sections' };
  if (args.keyLift && args.drone) return { code: 2, text: '--drone holds one note under the whole piece, so it cannot follow --key-lift; use one' };
  if (args.stretch && !args.fit) return { code: 2, text: '--stretch needs --fit' };

  const parsed = parseGabc(readFileSync(args.file, 'utf8'));
  let events = parsed.events;
  const hasNotes = events.some((e) => e.type === 'note');
  if ((args.suggest || args.auto) && !hasNotes) return { code: 2, text: 'no notes' };
  // Timing first (bar fitting, half time and repeats never change a pitch), then the section
  // plan, then the key lift, then the pitch choice: so the range check sees the lifted line.
  if (args.fit) events = args.stretch ? fitStretch(events, args.fit) : fitToBars(events, args.fit);
  if (args.halftime) events = halfTime(events);
  if (args.repeat > 1) events = Array.from({ length: args.repeat }, () => events).flat().map((e) => ({ ...e }));
  const ppb = 8; // the backing's bar is always 4/4 at two pulses a beat (genre.mjs BAR), whatever --fit says
  const chantPulses = events.reduce((s, e) => s + e.pulses, 0);
  const chantBars = Math.max(1, Math.ceil(chantPulses / ppb - 1e-9));
  let plan = null;
  if (args.sections && hasNotes) {
    try {
      plan = sectionPlan({ events, pulsesPerBar: ppb, intro: args.intro || 0, outro: args.outro || 0, breakdown: args.breakdown === false ? false : 'auto', acappella: Boolean(args.acappella), keyLift: args.keyLift || 0 });
    } catch (err) {
      return { code: 2, text: err.message };
    }
  }
  const lift = args.keyLift || 0;
  if (lift) events = liftEvents(events, plan, { pulsesPerBar: ppb, intro: args.intro || 0 });
  // --final names the song's key, the final before any lift; the last note sounds `lift` higher
  const keyOf = (r) => r.final - lift;
  if (args.suggest) {
    const r = suggestFinal(events, range);
    if (args.json) {
      if (lift && r.fits) {
        r.keyLift = lift;
        r.recommended = { ...r.recommended, final: keyOf(r.recommended), name: noteName(keyOf(r.recommended)) };
        r.finals = { ...r.finals, lowest: r.finals.lowest - lift, highest: r.finals.highest - lift, lowestName: noteName(r.finals.lowest - lift), highestName: noteName(r.finals.highest - lift) };
      }
      return { code: 0, text: JSON.stringify(r, null, 2) };
    }
    const withLift = lift ? ` with the last drop lifted ${lift}` : '';
    if (!r.fits) return { code: 1, text: `ambitus ${r.ambitus} semitones${withLift} is ${r.over} wider than ${r.range.join('-')}; try --split-voices (tenors and basses by phrase) or accept a falsetto/low pedal` };
    return { code: 0, text: `finals that fit ${r.range.join('-')}${withLift}: ${noteName(r.finals.lowest - lift)} to ${noteName(r.finals.highest - lift)}; recommended --final ${keyOf(r.recommended)} (${noteName(keyOf(r.recommended))})` };
  }
  if (args.auto) {
    const r = suggestFinal(events, range);
    if (!r.fits) return { code: 1, text: `--auto-final: ambitus ${r.ambitus} semitones${lift ? ` with the last drop lifted ${lift}` : ''} is ${r.over} wider than ${r.range.join('-')}; use --final to choose` };
    args.final = keyOf(r.recommended);
  }
  let split = null;
  if (args.split && hasNotes) {
    const fin = events.filter((e) => e.type === 'note').at(-1).midi;
    try {
      split = splitVoices(events, { tenor, bass, words: args.splitWords ? 'prefer' : 'needed', wordCost, shift: args.final !== null ? args.final + lift - fin : null });
    } catch (err) {
      return { code: 2, text: err.message };
    }
    if (!split.fits) return { code: 1, text: `--split-voices: no split at bars or words fits tenors ${noteName(tenor.low)}-${noteName(tenor.high)} and basses ${noteName(bass.low)}-${noteName(bass.high)}: ${split.reason}${args.final !== null ? '; drop --final to let it choose' : ''}` };
    events = split.events;
    args.final = split.final - lift;
  } else if (args.final !== null && hasNotes) events = transposeToFinal(events, args.final + lift);
  if (lift && !split) {
    // the lift is the part this option adds, so check it: the lifted notes must stay in range
    const lifted = events.filter((e) => e.type === 'note' && e.lifted).map((e) => e.midi);
    const top = Math.max(...lifted);
    if (top > range.high) {
      const fin = [...events].reverse().find((e) => e.type === 'note').midi - lift;
      return { code: 1, text: `--key-lift ${lift} puts the last drop up to ${noteName(top)}, above ${noteName(range.high)}; use --final ${fin - (top - range.high)} or lower, --auto-final, a smaller lift, or --range` };
    }
  }
  if (args.outro) events = [...events, { type: 'bar', kind: 'full', pulses: chantBars * ppb - chantPulses + ppb * args.outro }];
  if (args.intro) events = [{ type: 'bar', kind: 'full', pulses: 8 * args.intro }, ...events];
  const summary = summarize({ ...parsed, events }, { bpm: args.bpm, pulsesPerBar: args.fit || 8 });
  // the mode check is about the transcription, so judge the final as written, before --final moves it
  if ('modeFinalMatches' in summary) summary.modeFinalMatches = summarize(parsed).modeFinalMatches;
  if (split) {
    const who = (v) => split.phrases.map((p, k) => (p.voice === v ? k + 1 : 0)).filter(Boolean);
    summary.voices = {
      final: split.finalName,
      unison: split.unison.join('-'),
      allNotes: split.allNotes,
      tenorNotes: split.tenorNotes,
      bassNotes: split.bassNotes,
      tenorPhrases: who('tenor'),
      bassPhrases: who('bass'),
      changes: split.changes,
      handoffs: split.handoffs,
      sharedPhrases: split.phrases.map((p, k) => (p.voice === 'mixed' ? k + 1 : 0)).filter(Boolean),
      line: describeSplit(split),
    };
  }
  if (args.cues) {
    writeFileSync(args.cues, cueSheet(events, { bpm: args.bpm, pulsesPerBar: args.fit || 8, plan }));
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
        backing = arrange({ genre: args.genre, mode, final: fin.midi - lift, bars: plan ? plan.reduce((m, s) => Math.max(m, s.start + s.bars), 0) : barsFor(events), fills: args.fills, sections: plan });
      } catch (err) {
        return { code: 2, text: err.message };
      }
      const [lo, hi] = bpmRange(args.genre);
      if (args.bpm < lo || args.bpm > hi) summary.warnings.push(`${args.genre} usually runs ${lo}-${hi} BPM; you asked for ${args.bpm}`);
    }
    writeFileSync(args.out, eventsToMidi(events, { bpm: args.bpm, title, drone: args.drone, backing, markers: args.markers }));
    summary.wrote = args.out;
    if (plan) summary.sections = plan.map((s) => `${s.name} bar ${s.start + 1}-${s.start + s.bars}${s.build ? ' (build)' : ''}${s.lift && s.energy === 'drop' ? ` (key up ${s.lift})` : ''}`);
  }
  const text = args.json
    ? JSON.stringify(summary, null, 2)
    : [
        `${summary.name || args.file}: ${summary.notes} notes, ${summary.lowest}-${summary.highest} (ambitus ${summary.ambitus} semitones), final ${summary.final}`,
        `mode ${summary.mode ?? 'not given'}${summary.modeFinalMatches === false ? ' (final does not match the mode: check the transcription)' : ''}`,
        `${summary.bars.toFixed(2)} bars, ${summary.seconds.toFixed(1)} s at ${args.bpm} BPM`,
        ...(summary.voices ? [`voices: ${summary.voices.line}`] : []),
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
