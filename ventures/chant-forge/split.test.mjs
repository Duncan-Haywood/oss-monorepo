import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseGabc } from './gabc.mjs';
import { splitVoices, phrasesOf, TENOR_RANGE, BASS_RANGE } from './voicefit.mjs';
import { parseMidi } from './render.mjs';
import { run } from './cli.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, 'corpus');
const both = { low: Math.max(TENOR_RANGE.low, BASS_RANGE.low), high: Math.min(TENOR_RANGE.high, BASS_RANGE.high) };
const files = [
  ...readdirSync(join(corpus, 'gregobase-1908')).filter((f) => f.endsWith('.gabc')).map((f) => join(corpus, 'gregobase-1908', f)),
  ...readdirSync(corpus).filter((f) => f.endsWith('.gabc')).map((f) => join(corpus, f)),
];
const load = (f) => parseGabc(readFileSync(f, 'utf8')).events;
const ev = (spec) => spec.split(' ').map((t) => (t === '|' ? { type: 'bar', kind: 'full', pulses: 1 } : { type: 'note', midi: Number(t), pulses: 1 }));

test('every note is in its singers\' range on all 67 corpus files', () => {
  let split = 0;
  for (const f of files) {
    const r = splitVoices(load(f));
    assert.ok(r.fits, f);
    for (const e of r.events.filter((x) => x.type === 'note')) {
      const range = e.voice === 'all' ? both : e.voice === 'tenor' ? TENOR_RANGE : BASS_RANGE;
      assert.ok(e.midi >= range.low && e.midi <= range.high, `${f}: ${e.midi} for ${e.voice}`);
    }
    assert.equal(r.allNotes + r.tenorNotes + r.bassNotes, r.notes);
    if (r.split) split++;
  }
  assert.equal(files.length, 67);
  assert.equal(split, 7); // the seven files with a 17-semitone ambitus, one more than C3-E4 holds
});

test('a chant that fits the unison band is sung by everyone, centred in it', () => {
  const r = splitVoices(ev('50 52 53 | 55 53 52 50'));
  assert.equal(r.split, false);
  assert.ok(r.phrases.every((p) => p.voice === 'all'));
  assert.equal(r.changes, 0);
});

test('a high phrase goes to the tenors, a low one to the basses, the rest to everyone', () => {
  // 26 semitones overall: no unison fit at any final, but each phrase fits one section
  const r = splitVoices(ev('50 52 53 | 62 66 67 69 | 55 53 | 45 43 | 50'));
  assert.ok(r.fits);
  assert.deepEqual(r.phrases.map((p) => p.voice), ['all', 'tenor', 'all', 'bass', 'all']);
  assert.equal(r.shift, 0);
  assert.equal(r.tenorNotes, 4);
  assert.equal(r.bassNotes, 2);
});

test('a phrase wider than either section, or a forced final out of reach, is refused', () => {
  assert.equal(splitVoices(ev('40 70 | 50')).fits, false);
  assert.equal(splitVoices(ev('50 52 | 55'), { shift: 30 }).fits, false);
  assert.throws(() => splitVoices(ev('50'), { tenor: { low: 70, high: 80 }, bass: { low: 40, high: 60 } }), /do not overlap/);
});

test('phrases are cut at every bar kind', () => {
  const e = parseGabc('(c4) A(f)men(g,) al(h;)le(g:)lu(f)ia(e::)').events;
  assert.equal(phrasesOf(e).length, 4);
});

test('CLI: Tenors and Basses tracks, unison notes in both, a who column in the cues', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-split-'));
  const mid = join(dir, 'd.mid'), cues = join(dir, 'd.txt');
  const r = run([join(corpus, 'dies-irae.gabc'), '--split-voices', '--fit', '8', '-o', mid, '--cues', cues]);
  assert.equal(r.code, 0, r.text);
  assert.match(r.text, /full choir on 600 of 613 notes \(C3-E4\); tenors alone on phrase 54 \(13 notes\); final F3/);
  assert.match(r.text, /^mode 1$/m); // the mode check reads the final as written, not as transposed
  const m = parseMidi(readFileSync(mid));
  const byCh = (ch) => m.notes.filter((n) => n.ch === ch).length;
  assert.equal(byCh(0), 613); // tenors: the 600 unison notes and their own 13
  assert.equal(byCh(4), 600); // basses: the unison notes only
  const sheet = readFileSync(cues, 'utf8').split('\n').filter(Boolean);
  assert.match(sheet[0], /who/);
  const who = sheet.slice(1).map((l) => l.trim().split(/\s+/)[5]);
  assert.equal(who.filter((w) => w === 'T').length, 13);
  assert.equal(who.filter((w) => w === 'all').length, 600);
});

test('CLI: without --split-voices the file is unchanged; flag checks', () => {
  const f = join(corpus, 'pange-lingua.gabc');
  const dir = mkdtempSync(join(tmpdir(), 'cf-split-'));
  run([f, '--final', '52', '-o', join(dir, 'a.mid')]);
  run([f, '--split-voices', '--final', '52', '-o', join(dir, 'b.mid')]);
  const a = parseMidi(readFileSync(join(dir, 'a.mid'))), b = parseMidi(readFileSync(join(dir, 'b.mid')));
  assert.equal(a.notes.length, 53);
  assert.equal(b.notes.length, 106); // fits in unison: both sections sing every note
  assert.deepEqual(a.notes.map((n) => n.note), b.notes.filter((n) => n.ch === 0).map((n) => n.note));
  assert.equal(run([f, '--tenor', '48-69']).code, 2);
  assert.equal(run([f, '--split-voices', '--auto-final']).code, 2);
  assert.equal(run([f, '--split-voices', '--bass', '60-40']).code, 2);
  assert.equal(run([join(corpus, 'dies-irae.gabc'), '--split-voices', '--final', '62']).code, 1);
});
