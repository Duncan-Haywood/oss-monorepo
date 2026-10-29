import test from 'node:test';
import assert from 'node:assert/strict';
import { actual, fmtIn, fmtFtIn, ceil16, examplePrice, nominalOf, isTreated } from './lumber.mjs';

test('dimensional lumber is framed at its dressed size', () => {
  assert.deepEqual(actual('2x4'), { thick: 1.5, depth: 3.5 });
  assert.deepEqual(actual('2x6'), { thick: 1.5, depth: 5.5 });
  assert.deepEqual(actual('2x8'), { thick: 1.5, depth: 7.25 });
  assert.deepEqual(actual('2x10'), { thick: 1.5, depth: 9.25 });
  assert.deepEqual(actual('2x12'), { thick: 1.5, depth: 11.25 });
  assert.deepEqual(actual('PT 4x6'), { thick: 3.5, depth: 5.5 });
  assert.throws(() => actual('2x5'));
  assert.equal(nominalOf('PT 2x6'), '2x6');
  assert.ok(isTreated('PT 2x6'));
  assert.ok(!isTreated('2x6'));
});

test('lengths print the way a framer reads a tape', () => {
  assert.equal(fmtIn(91.5), '91-1/2"');
  assert.equal(fmtIn(0.0625), '1/16"');
  assert.equal(fmtIn(69), '69"');
  assert.equal(fmtFtIn(144), `12' 0"`);
  assert.equal(fmtFtIn(107.75), `8' 11-3/4"`);
  assert.equal(ceil16(68.9927), 69);
  assert.equal(ceil16(5.75), 5.75);
});

test('example prices scale with length and carry a long-board premium', () => {
  assert.equal(examplePrice('2x4', 8), 4.4);
  assert.ok(examplePrice('2x4', 20) / 20 > examplePrice('2x4', 16) / 16);
});
