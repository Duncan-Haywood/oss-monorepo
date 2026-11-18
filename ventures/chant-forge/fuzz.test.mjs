// Fuzz test: the GABC reader and MIDI writer must not throw on odd input and
// must always write a well-formed MIDI file. Inputs are random, made up here
// (seeded, so a failure repeats); no real chant file is involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGabc } from './gabc.mjs';
import { eventsToMidi } from './midi.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
const pick = (r, a) => a[Math.floor(r() * a.length)];

const CLEFS = ['c1', 'c2', 'c3', 'c4', 'f3', 'f4', 'cb3', 'c5', 'x', ''];
const NEUMES = ['f', 'gh', 'ghg', 'h.', 'i_', 'jv', 'ixi', 'e::', 'fg,', 'h/i', 'hr', 'g!hi', 'ghw', 'iy', 'z', 'Z', ';2', '`', 'c3', 'f3', 'A', 'o', 'q', '[', ']', 'ghi|abc', '{', '}'];
const WORDS = ['Do', 'mi{', '}nus', '<i>te</i>', '<sp>R/</sp>', '<v>x</v>', '*', '†', '\r', '%c', '', ' ', 'ae'];

function randomGabc(r) {
  const head = r() < 0.5 ? `name: t;\nmode: ${Math.floor(r() * 12)};\n%%\n` : r() < 0.5 ? '%%\n' : '';
  const nl = r() < 0.3 ? '\r\n' : '\n';
  let out = head + (r() < 0.8 ? `(${pick(r, CLEFS)}) ` : '');
  const n = Math.floor(r() * 60);
  for (let i = 0; i < n; i++) {
    out += pick(r, WORDS) + '(' + pick(r, NEUMES) + (r() < 0.2 ? pick(r, NEUMES) : '') + (r() < 0.95 ? ')' : '') + (r() < 0.1 ? nl : ' ');
  }
  return out;
}

test('2000 random GABC strings never crash the reader or the MIDI writer', () => {
  const r = rng(20261103);
  let total = 0;
  for (let i = 0; i < 2000; i++) {
    const src = randomGabc(r);
    let p;
    try {
      p = parseGabc(src);
    } catch (e) {
      assert.fail(`parseGabc threw on case ${i}: ${e.message}\n${JSON.stringify(src)}`);
    }
    for (const e of p.events.filter((x) => x.type === 'note')) {
      assert.ok(Number.isFinite(e.midi), `non-finite pitch in case ${i}: ${JSON.stringify(src)}`);
      assert.ok(e.midi >= 0 && e.midi <= 127, `pitch ${e.midi} outside MIDI range in case ${i}: ${JSON.stringify(src)}`);
    }
    total += p.events.filter((x) => x.type === "note").length;
    const bytes = eventsToMidi(p.events, { drone: r() < 0.3 });
    const b = Buffer.from(bytes);
    assert.equal(b.subarray(0, 4).toString('latin1'), 'MThd');
    assert.ok(b.includes(Buffer.from('MTrk')), 'no track chunk');
  }
  assert.ok(total > 5000, `fuzz produced only ${total} notes; inputs too weak`);
});
