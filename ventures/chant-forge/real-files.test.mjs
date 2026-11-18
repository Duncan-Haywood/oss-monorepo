import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGabc, lyricText } from './gabc.mjs';

const notes = (p) => p.events.filter((e) => e.type === 'note');

test('<sp> keeps the versicle and response signs and the ae ligature; <v> and <alt> are not sung', () => {
  assert.equal(lyricText('<sp>R/</sp>'), '℟');
  assert.equal(lyricText('<sp>V/</sp>'), '℣');
  assert.equal(lyricText("<sp>'ae</sp>"), 'ǽ');
  assert.equal(lyricText('<v>\\greextra</v>Do{mi}nus'), 'Dominus');
  assert.equal(lyricText('<alt>ij.</alt>*'), '');
  assert.equal(lyricText('<i>te</i>~Deum'), 'te Deum');
});

test('a group that only carries a response sign still gets its syllable', () => {
  const p = parseGabc('(c4) <sp>R/</sp>(f) Do{mi}nus(g)');
  assert.deepEqual(notes(p).map((n) => n.syllable), ['℟', 'Dominus']);
});

test('a clef change inside a group after a bar moves the staff for what follows', () => {
  const p = parseGabc('(c4) A(j) b(h::c3) c(h)');
  const ms = notes(p).map((n) => n.midi);
  assert.deepEqual(ms, [60, 57, 60]); // j is do on c4; h under c4 is la below; h on c3 is do
});

test('a clef change after a z line-break marker in one group', () => {
  const p = parseGabc('(c4) A(j) b(hz c3) c(h)');
  assert.deepEqual(notes(p).map((n) => n.midi), [60, 57, 60]);
});

test('pitches c and f next to other letters are still notes, not clefs', () => {
  const p = parseGabc('(c4) A(cdf_0) b(f_1g)');
  assert.equal(notes(p).length, 5);
});

test('NABC alternation, CRLF line endings and % comments in a real-shaped file', () => {
  const src = ['name:Test;', 'mode:1;', 'nabc-lines:1;', '%%', '(c4) % clef', 'Ky(f|vi)ri(g|pu)e(h) 100% (::)'].join('\r\n');
  const p = parseGabc(src);
  assert.equal(p.header['nabc-lines'], '1');
  assert.equal(notes(p).length, 3);
  assert.deepEqual(notes(p).map((n) => n.syllable), ['Ky', 'ri', 'e']);
});
