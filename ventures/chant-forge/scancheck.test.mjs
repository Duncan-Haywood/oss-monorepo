// Scan check (2026-11-13): the corpus files were read note by note against
// public-domain page scans (corpus/scan-check.json, eval/scan-check/README.md).
// These tests keep that record honest: a file that changes after its reading
// fails until someone reads it again, and the full-hymn files must be exactly
// what build-hymns.mjs writes from the checked first verses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGabc, summarize } from './gabc.mjs';
import { HYMNS, buildHymn } from './eval/scan-check/build-hymns.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = join(here, 'corpus');
const record = JSON.parse(readFileSync(join(corpus, 'scan-check.json'), 'utf8'));
const notesOf = (text) => parseGabc(text).events.filter((e) => e.type === 'note');

test('every checked file is unchanged since its reading and has the recorded note count', () => {
  assert.ok(record.checks.length >= 6);
  for (const c of record.checks) {
    const buf = readFileSync(join(corpus, c.file));
    assert.equal(createHash('sha256').update(buf).digest('hex').slice(0, 16), c.sha256, `${c.file} changed since it was read against ${c.witness}`);
    assert.equal(notesOf(buf.toString('utf8')).length, c.notes, c.file);
    assert.match(c.witness, /19(0[0-9]|1[0-9]|2[0-8])/, `${c.file}: witness must be printed before 1929`);
    assert.match(c.scan, /^https:\/\/archive\.org\/details\//);
  }
});

test('all five named corpus pieces have a full reading against a pre-1929 book', () => {
  const full = new Set(record.checks.filter((c) => c.scope === 'every note' && c.result === 'match').map((c) => c.file));
  for (const f of ['dies-irae.gabc', 'pange-lingua.gabc', 'veni-creator.gabc', 'te-deum.gabc', 'salve-regina.gabc']) assert.ok(full.has(f), f);
});

for (const [slug, h] of Object.entries(HYMNS)) {
  test(`${slug}-full.gabc is what build-hymns.mjs writes, every verse on the checked verse-1 pitches`, () => {
    const text = readFileSync(join(corpus, `${slug}-full.gabc`), 'utf8');
    assert.equal(text, buildHymn(h) + '\n');
    const verse1 = notesOf(readFileSync(join(corpus, `${slug}.gabc`), 'utf8')).map((n) => n.midi);
    const all = notesOf(text).map((n) => n.midi);
    assert.equal(all.length, verse1.length * h.verses.length);
    for (let v = 0; v < h.verses.length; v++) assert.deepEqual(all.slice(v * verse1.length, (v + 1) * verse1.length), verse1, `verse ${v + 1}`);
    const p = parseGabc(text);
    assert.ok(summarize(p).modeFinalMatches, 'ends on the mode final');
    const lyrics = notesOf(text).filter((n) => n.syllable).map((n) => n.syllable);
    for (const s of lyrics) assert.doesNotMatch(s, /[|<>()]/, `markup in lyric ${s}`);
  });
}

test('the elided vowel in "Infúnde amórem" stays one syllable on one note', () => {
  const lyrics = notesOf(readFileSync(join(corpus, 'veni-creator-full.gabc'), 'utf8')).filter((n) => n.syllable).map((n) => n.syllable);
  assert.ok(lyrics.includes('dea'), lyrics.slice(0, 40).join(' '));
});
