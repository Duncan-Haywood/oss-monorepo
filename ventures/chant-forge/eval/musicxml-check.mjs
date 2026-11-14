// node eval/musicxml-check.mjs OUT_DIR
//
// Writes a MusicXML score (cli.mjs --musicxml) for every corpus file under five option sets,
// and next to each one the notes it should hold, taken from the events the CLI also writes to
// MIDI: per part (the same section rule as midi.mjs), every sung note's onset and length in
// quarter notes, its MIDI number and its syllable. eval/musicxml-check.py then validates each
// score against the MusicXML 4.0 XSD and reads it back with music21, an independent parser,
// and compares. Nothing here reads the MusicXML writer's own code.
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../cli.mjs';
import { scoreParts } from '../musicxml.mjs';
import { sings } from '../midi.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = process.argv[2];
if (!out) { console.error('usage: node eval/musicxml-check.mjs OUT_DIR'); process.exit(2); }
mkdirSync(out, { recursive: true });

const files = [
  ...readdirSync(join(root, 'corpus')).filter((f) => f.endsWith('.gabc')).map((f) => join(root, 'corpus', f)),
  ...readdirSync(join(root, 'corpus', 'gregobase-1908')).filter((f) => f.endsWith('.gabc')).sort().map((f) => join(root, 'corpus', 'gregobase-1908', f)),
];
const SETS = {
  unison: ['--auto-final'],
  stretch: ['--fit', '8', '--stretch', '--auto-final'],
  halftime: ['--fit', '8', '--halftime', '--auto-final'],
  ttbb: ['--split-voices', '--baritones', '--second-tenors', '--overlap', '--split-words'],
  song: ['--genre', 'deep-house', '--sections', '--key-lift', '2', '--a-cappella', '--intro', '2', '--outro', '2', '--choir', 'textbook', '--split-voices'],
};
const tally = {};
for (const [set, flags] of Object.entries(SETS)) {
  tally[set] = { written: 0, refused: 0 };
  for (const f of files) {
    const id = `${set}--${basename(f, '.gabc')}`;
    const xml = join(out, `${id}.musicxml`);
    const r = run([f, ...flags, '--musicxml', xml]);
    if (r.code !== 0) { tally[set].refused++; continue; } // a range the piece does not fit: the CLI says so
    tally[set].written++;
    const parts = scoreParts(r.events).map(([key, name]) => {
      const notes = [];
      let p = 0;
      for (const e of r.events) {
        if (e.type === 'note' && (key === null || sings(e.voice, key))) notes.push({ onset: p / 2, dur: e.pulses / 2, midi: e.midi, syllable: e.syllable || null });
        p += e.pulses || 0;
      }
      return { name, notes };
    });
    const total = r.events.reduce((s, e) => s + (e.pulses || 0), 0) / 2;
    writeFileSync(join(out, `${id}.json`), JSON.stringify({ set, file: basename(f), total, parts }));
  }
}
writeFileSync(join(out, 'sets.json'), JSON.stringify({ files: files.length, sets: SETS, tally }, null, 1));
console.log(JSON.stringify(tally));
