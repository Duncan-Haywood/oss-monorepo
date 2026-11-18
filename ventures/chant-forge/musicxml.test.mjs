import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spell, bestKey, keyAlter, split, scoreParts, eventsToMusicXml } from './musicxml.mjs';
import { run } from './cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const note = (midi, pulses, syllable = null, wordStart = false, extra = {}) => ({ type: 'note', midi, pulses, syllable, wordStart, ...extra });
const notesOf = (xml, part = 1) => xml.split(`<part id="P${part}">`)[1].split('</part>')[0].match(/<note>.*?<\/note>/g);

test('key signatures and spelling', () => {
  assert.deepEqual(keyAlter(-1), [0, 0, 0, 0, 0, 0, -1]);
  assert.deepEqual(keyAlter(2), [1, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(spell(60, 0), { step: 'C', alter: 0, octave: 4 });
  assert.deepEqual(spell(58, -1), { step: 'B', alter: -1, octave: 3 });
  assert.deepEqual(spell(58, 2), { step: 'A', alter: 1, octave: 3 }); // outside a sharp key: sharp
  assert.deepEqual(spell(61, -1), { step: 'D', alter: -1, octave: 4 }); // outside a flat key: flat
  assert.deepEqual(spell(70, 0), { step: 'B', alter: -1, octave: 4 }); // and in C: B flat, not A sharp
  assert.deepEqual(spell(59, -7 + 1), { step: 'C', alter: -1, octave: 4 }); // Cb4 in 6 flats is B3's pitch
  // a D Dorian line (no accidentals) is C major; the same line up a tone is E Dorian, two sharps
  const dorian = [50, 52, 53, 55, 57, 59, 60, 62];
  assert.equal(bestKey(dorian), 0);
  assert.equal(bestKey(dorian.map((m) => m + 2)), 2);
  assert.equal(bestKey([50, 53, 58, 57]), -1); // a B flat: one flat
});

test('durations split into written values', () => {
  assert.deepEqual(split(5).map(([p]) => p), [4, 1]);
  assert.deepEqual(split(3).map(([, t, d]) => [t, d]), [['quarter', 1]]);
  assert.deepEqual(split(0.75).map(([p]) => p), [0.5, 0.25]);
  assert.throws(() => split(0.1), /32nd/);
});

test('a note across the barline is tied, rests fill the bar, the last bar ends with a final barline', () => {
  const xml = eventsToMusicXml([note(62, 6, 'Ky', true), note(64, 4, 'ri'), note(62, 1, 'e')]);
  const n = notesOf(xml);
  // bar 1: the first note (6 pulses = dotted half), then the second note's first 2 pulses tied
  assert.match(n[0], /<type>half<\/type><dot\/>/);
  assert.match(n[1], /<tie type="start"\/>/);
  assert.match(n[2], /<tie type="stop"\/>/);
  assert.doesNotMatch(n[2], /<lyric/); // the syllable sits on the first piece only
  assert.match(n[1], /<syllabic>middle<\/syllabic><text>ri<\/text>/);
  // bar 2: 2 tied + 1 + 5 pulses of rest
  const bar2 = xml.split('<measure number="2">')[1].split('</measure>')[0];
  assert.equal((bar2.match(/<rest\/>/g) || []).length, 2); // 4 + 1 pulses
  assert.match(xml, /light-heavy/);
  // every bar of every part sums to 4/4: 32 divisions
  for (const m of xml.split('<measure ').slice(1)) {
    const sum = [...m.matchAll(/<duration>(\d+)<\/duration>/g)].reduce((s, x) => s + Number(x[1]), 0);
    assert.equal(sum, 32);
  }
});

test('syllabic, melisma extender and breath marks', () => {
  const ev = [note(62, 1, 'Ky', true), note(64, 1, 'ri'), note(65, 1), note(64, 1, 'e'), { type: 'bar', kind: 'half', pulses: 0 }, note(62, 1, 'e', true), note(62, 1, 'lei', true)];
  const n = notesOf(eventsToMusicXml(ev));
  assert.match(n[0], /<syllabic>begin<\/syllabic>/);
  assert.match(n[1], /<syllabic>middle<\/syllabic><text>ri<\/text><extend\/>/);
  assert.doesNotMatch(n[2], /<lyric/);
  assert.match(n[3], /<syllabic>end<\/syllabic>/);
  assert.match(n[3], /<breath-mark\/>/);
  assert.match(n[4], /<syllabic>single<\/syllabic>/);
  assert.doesNotMatch(n[5], /<breath-mark\/>/); // nothing after the last note
});

test('accidentals: once a measure, a natural when it returns, a courtesy one next bar', () => {
  // key: C (most notes natural); B flat twice, B natural, then next bar B flat again and B
  const ev = [note(70, 1), note(70, 1), note(71, 1), note(72, 1), note(72, 1), note(72, 1), note(72, 1), note(72, 1), note(71, 1), note(71, 1)];
  const n = notesOf(eventsToMusicXml(ev));
  assert.match(n[0], /<accidental>flat<\/accidental>/);
  assert.doesNotMatch(n[1], /<accidental>/);
  assert.match(n[2], /<accidental>natural<\/accidental>/);
  // bar 2: the last bar ended on B natural, which is the key's: no courtesy needed
  assert.doesNotMatch(n[8], /<accidental>/);
  const ev2 = [note(70, 8), note(71, 1), note(72, 1), note(74, 1), note(76, 1), note(77, 1)]; // C major around it
  const n2 = notesOf(eventsToMusicXml(ev2));
  assert.match(n2[1], /<accidental>natural<\/accidental>/); // courtesy after a bar of B flat
});

test('parts follow the split: each section sings its own and the shared notes', () => {
  const ev = [note(50, 2, 'A', true, { voice: 'all' }), note(62, 2, 'B', true, { voice: 'tenor' }), note(45, 2, 'C', true, { voice: 'bass+baritone' })];
  assert.deepEqual(scoreParts(ev).map(([, n]) => n), ['Tenors', 'Baritones', 'Basses']);
  const xml = eventsToMusicXml(ev);
  assert.equal(notesOf(xml, 1).filter((x) => x.includes('<pitch>')).length, 2);
  assert.equal(notesOf(xml, 2).filter((x) => x.includes('<pitch>')).length, 2);
  assert.match(xml.split('<part id="P1">')[1], /<clef-octave-change>-1/); // tenors: treble 8vb
  assert.match(xml.split('<part id="P3">')[1], /<sign>F<\/sign>/); // basses: bass clef
  assert.deepEqual(scoreParts([note(50, 1)]), [[null, 'Choir']]);
});

test('a key lift changes the key signature at its measure, sections are rehearsal marks', () => {
  const line = [50, 52, 53, 55, 57, 59, 60, 62]; // D Dorian: C major; lifted, D major
  const ev = [...line.map((m) => note(m, 1)), ...line.map((m) => note(m + 2, 1, null, false, { lifted: true }))];
  const xml = eventsToMusicXml(ev, { plan: [{ name: 'verse', start: 0, bars: 1 }, { name: 'drop', start: 1, bars: 1 }] });
  assert.match(xml.split('<measure number="1">')[1].split('</measure>')[0], /<fifths>0<\/fifths>.*<rehearsal>Verse<\/rehearsal>/s);
  assert.match(xml.split('<measure number="2">')[1].split('</measure>')[0], /<key><fifths>2<\/fifths><\/key>.*<rehearsal>Drop<\/rehearsal>/s);
});

test('cli --musicxml writes a score with one part per section', () => {
  const d = mkdtempSync(join(tmpdir(), 'cf-'));
  const xml = join(d, 'di.musicxml');
  const r = run([join(here, 'corpus', 'dies-irae.gabc'), '--split-voices', '--baritones', '--musicxml', xml]);
  assert.equal(r.code, 0, r.text);
  assert.match(r.text, /wrote .*di\.musicxml/);
  const s = readFileSync(xml, 'utf8');
  assert.match(s, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(s, /<score-partwise version="4.0">/);
  assert.deepEqual([...s.matchAll(/<part-name>(.*?)<\/part-name>/g)].map((m) => m[1]), ['Tenors', 'Baritones', 'Basses']);
  const f = join(d, 'empty.gabc');
  writeFileSync(f, 'name:E;\n%%\n(c4) (,)\n');
  assert.equal(run([f, '--musicxml', join(d, 'e.musicxml')]).code, 2);
});
