import test from 'node:test';
import assert from 'node:assert/strict';
import { cueRows, cueSheet } from './cues.mjs';
import { run } from './cli.mjs';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ev = [
  { type: 'note', midi: 62, pulses: 2, syllable: 'Ky' },
  { type: 'note', midi: 64, pulses: 4, syllable: 'ri' },
  { type: 'rest', pulses: 2 },
  { type: 'note', midi: 65, pulses: 2, syllable: 'e' },
];

test('bar, beat and seconds follow the pulse grid', () => {
  const r = cueRows(ev, { bpm: 120, pulsesPerBar: 8 });
  assert.deepEqual(r.map((x) => [x.bar, x.beat]), [[1, 1], [1, 2], [2, 1]]);
  assert.equal(r[1].seconds, 0.5);
  assert.equal(r[2].seconds, 2);
  assert.equal(r[0].note, 'D4');
});

test('sheet has a header and one line per note', () => {
  const s = cueSheet(ev, { bpm: 120 });
  assert.equal(s.trim().split('\n').length, 4);
  assert.match(s, /Ky/);
});

test('cli --cues writes the sheet', () => {
  const d = mkdtempSync(join(tmpdir(), 'cf-'));
  const f = join(d, 'a.gabc');
  writeFileSync(f, 'name:T;\nmode:1;\n%%\n(c4) Ky(f)ri(g)e(f)\n');
  const out = join(d, 'cues.txt');
  const r = run([f, '--cues', out]);
  assert.equal(r.code, 0, r.text);
  assert.match(readFileSync(out, 'utf8'), /Ky/);
});

// Per-section singer guidance (cues.mjs sectionCues; cli.mjs --cues with --sections)
import { sectionCues, interval } from './cues.mjs';
import { parseGabc, fitStretch, transposeToFinal, noteName } from './gabc.mjs';
import { sectionPlan, liftEvents } from './sections.mjs';

const hymnPath = new URL('./corpus/pange-lingua-full.gabc', import.meta.url).pathname;

test('interval names the step a singer has to find', () => {
  assert.equal(interval(47, 49), 'a whole tone up');
  assert.equal(interval(52, 47), 'a 4th down');
  assert.equal(interval(52, 45), 'a 5th down');
  assert.equal(interval(40, 60), '20 semitones up');
  assert.equal(interval(50, 50), 'the same note');
});

test('without a plan the sheet has no guidance lines and is unchanged', () => {
  assert.equal(cueSheet(ev, { bpm: 120 }), cueSheet(ev, { bpm: 120, plan: null }));
  assert.deepEqual(sectionCues(ev, {}), []);
  assert.doesNotMatch(cueSheet(ev, { bpm: 120 }), /^--/m);
});

test('one guidance line per sung section, on the note where the lift starts', () => {
  const chant = fitStretch(transposeToFinal(parseGabc(readFileSync(hymnPath, 'utf8')).events, 49), 8);
  const plan = sectionPlan({ events: chant, intro: 2, outro: 2, acappella: true, keyLift: 2 });
  const lifted = liftEvents(chant, plan, { intro: 2 });
  const events = [{ type: 'bar', kind: 'full', pulses: 16 }, ...lifted];
  const g = sectionCues(events, { bpm: 124, plan });
  const sung = plan.filter((s) => s.energy !== 'intro' && s.energy !== 'outro');
  assert.deepEqual(g.map((x) => x.section), sung.map((s) => s.name));
  // each line sits on the first note of its section's bar range
  for (const [i, x] of g.entries()) assert.equal(x.bar, sung[i].start + 1, x.section);
  // the a cappella verse: no backing, pitch from outside, band in on the build bar
  assert.match(g[0].text, /^Choir alone, no backing\. Come in after the 2-bar intro; first note \S+ on "Pan": take it from a pitch pipe/);
  const build = sung[0].start + sung[0].bars;
  assert.match(g[0].text, new RegExp(`build at bar ${build} \\(`));
  // the lifted drop: the guidance falls on exactly the first lifted note, never the shared-bar note before it
  const notes = events.filter((e) => e.type === 'note');
  const drop = g.at(-1);
  assert.equal(drop.lift, 2);
  assert.equal(drop.noteIndex, notes.findIndex((e) => e.lifted));
  const firstLifted = notes[drop.noteIndex];
  assert.equal(drop.note, noteName(firstLifted.midi));
  assert.match(drop.text, new RegExp(`key up 2 semitones\\. First note ${drop.note}.*from your last note \\(${noteName(notes[drop.noteIndex - 1].midi)}\\)\\. In the old key it would be ${noteName(firstLifted.midi - 2)}`));
  // the breakdown says when the band is back
  assert.match(g.find((x) => x.energy === 'breakdown').text, new RegExp(`band is back at bar ${plan.at(-2).start + 1} `));
});

test('cli --cues with --sections puts the guidance above the right rows', () => {
  const d = mkdtempSync(join(tmpdir(), 'cf-'));
  const out = join(d, 'cues.txt');
  const r = run([hymnPath, '--auto-final', '--fit', '8', '--stretch', '--genre', 'deep-house', '--sections', '--intro', '2', '--outro', '2', '--a-cappella', '--key-lift', '2', '--cues', out]);
  assert.equal(r.code, 0, r.text);
  const lines = readFileSync(out, 'utf8').trim().split('\n');
  const guides = lines.filter((l) => l.startsWith('-- '));
  assert.equal(guides.length, 6);
  assert.equal(lines.length - 1 - guides.length, 318, 'one row per note, as before');
  const i = lines.findIndex((l) => l.startsWith('-- Drop 3'));
  const row = lines[i + 1].trim().split(/\s+/);
  assert.equal(row[0], '48');
  assert.match(lines[i], new RegExp(`First note ${row[3]} on "${row[5]}"`));
  // the same command without --sections writes no guidance and the same rows
  const plainOut = join(d, 'plain.txt');
  assert.equal(run([hymnPath, '--auto-final', '--fit', '8', '--stretch', '--intro', '2', '--cues', plainOut]).code, 0);
  assert.doesNotMatch(readFileSync(plainOut, 'utf8'), /^--/m);
});
