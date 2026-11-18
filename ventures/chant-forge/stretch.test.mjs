import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseGabc, fitStretch, fitToBars } from './gabc.mjs';
import { run } from './cli.mjs';

const here = new URL('.', import.meta.url).pathname;
const note = (pulses) => ({ type: 'note', midi: 60, pulses });
const bar = (kind = 'full') => ({ type: 'bar', kind, pulses: 0 });
const phraseEnds = (events, ppb) => {
  let t = 0;
  const ends = [];
  for (const e of events) {
    t += e.pulses;
    if (e.type === 'bar' && (e.kind === 'full' || e.kind === 'double')) ends.push(t);
  }
  return ends.every((x) => Math.abs(x % ppb) < 1e-9);
};

test('stretch lengthens the longest note first, the phrase-final note on a tie', () => {
  const ev = [note(1), note(2), note(1), note(1), bar()]; // 5 pulses, 3 short of a bar of 8
  const out = fitStretch(ev, 8);
  assert.equal(out.reduce((a, e) => a + e.pulses, 0), 8);
  assert.ok(out[1].pulses > 2 && out[1].stretched > 0);
  assert.equal(out.at(-1).pulses, 0, 'no rest needed when the notes can absorb it');
  assert.equal(ev[1].pulses, 2, 'input is not mutated');
});

test('stretch respects maxGrow and pads the rest', () => {
  const ev = [note(1), note(1), bar()]; // 2 pulses, 6 short
  const out = fitStretch(ev, 8, { maxGrow: 2 });
  assert.deepEqual(out.slice(0, 2).map((n) => n.pulses), [2, 2]);
  assert.equal(out[2].pulses, 4);
  assert.ok(phraseEnds(out, 8));
});

test('already full bars and half bars are left alone', () => {
  const ev = [note(4), note(4), bar(), note(1), bar('half'), note(1), bar()];
  const out = fitStretch(ev, 8);
  assert.equal(out[0].pulses, 4);
  assert.equal(out[2].pulses, 0);
  assert.ok(phraseEnds(out, 8));
});

test('every corpus piece lands every phrase on a downbeat, stretching more than padding', () => {
  const dir = join(here, 'corpus');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.gabc'))) {
    const p = parseGabc(readFileSync(join(dir, f), 'utf8'));
    const s = fitStretch(p.events, 8);
    assert.ok(phraseEnds(s, 8), f);
    const rest = (ev) => ev.filter((e) => e.type === 'bar').reduce((a, e) => a + e.pulses, 0);
    assert.ok(rest(s) <= rest(fitToBars(p.events, 8)) + 1e-9, f);
    s.filter((e) => e.type === 'note').forEach((n) => assert.ok(n.pulses > 0));
  }
});

test('CLI: --stretch needs --fit', () => {
  const f = join(here, 'examples/dies-irae-incipit.gabc');
  assert.equal(run([f, '--stretch']).code, 2);
  assert.equal(run([f, '--fit', '8', '--stretch']).code, 0);
});
