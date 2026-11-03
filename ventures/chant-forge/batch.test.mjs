// Real-file batch (2026-11-03): 59 GregoBase transcriptions of the Vatican
// Graduale Romanum, 1908 (pre-1929 book; GregoBase releases them CC0).
// Unmodified downloads. See corpus/README.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGabc, summarize } from './gabc.mjs';
import { eventsToMidi } from './midi.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'corpus', 'gregobase-1908');
const files = readdirSync(dir).filter((f) => f.endsWith('.gabc')).sort();
// Parts that end on the mode final. Introits, graduals, alleluias and
// offertories can end on a psalm-tone differentia or a verse, so they are
// reported by eval/batch-check.mjs, not asserted.
const MUST_END_ON_FINAL = new Set(['Communio', 'Tractus', 'Hymnus', 'Sequentia']);

test('the batch has at least 55 real files, each naming its 1908 source', () => {
  assert.ok(files.length >= 55, `only ${files.length} files`);
  for (const f of files) {
    const t = readFileSync(join(dir, f), 'utf8');
    assert.match(parseGabc(t).header.book || '', /1908/, f);
  }
});

test('every real file parses to sane notes, real syllables and a valid MIDI file', () => {
  for (const f of files) {
    const p = parseGabc(readFileSync(join(dir, f), 'utf8'));
    const notes = p.events.filter((e) => e.type === 'note');
    assert.ok(notes.length > 20, `${f}: ${notes.length} notes`);
    for (const n of notes) {
      assert.ok(n.midi >= 36 && n.midi <= 84, `${f}: pitch ${n.midi}`);
      if (n.syllable) assert.doesNotMatch(n.syllable, /[()<>{}[\]|\\]/, `${f}: markup in lyric ${n.syllable}`);
    }
    const s = summarize(p);
    assert.ok(s.ambitus <= 19, `${f}: ambitus ${s.ambitus}`);
    assert.equal(Buffer.from(eventsToMidi(p.events, { bpm: 124 })).subarray(0, 4).toString('ascii'), 'MThd', f);
  }
});

test('communions, tracts, hymns and sequences end on the final of their mode', () => {
  let checked = 0;
  for (const f of files) {
    const p = parseGabc(readFileSync(join(dir, f), 'utf8'));
    if (!MUST_END_ON_FINAL.has(p.header['office-part'])) continue;
    checked++;
    assert.equal(summarize(p).modeFinalMatches, true, `${f} (${p.header.name}) final does not fit mode ${p.header.mode}`);
  }
  assert.ok(checked >= 15, `only ${checked} checked`);
});
