// Which GABC liquescents end a porrectus (eval/porrectus-liquescent-check.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gabcSteps } from './scan.mjs';
import { porrectusLiquescents } from './eval/porrectus-liquescent-check.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const flagsOf = (s) => porrectusLiquescents(`(c4) a(${s})`);

test('high, low, liquescent above the low note in one element is a porrectus liquescent', () => {
  assert.deepEqual(flagsOf('hfg~'), [false, false, true]);
  assert.deepEqual(flagsOf('dcd~'), [false, false, true]);
  assert.deepEqual(flagsOf('efef~'), [false, false, false, true]);
  assert.deepEqual(flagsOf('ixhgh~'), [false, false, true]); // the flat is not a note
});

test('torculus, separated notes, rhombi, virgas and plain porrectus are not', () => {
  assert.deepEqual(flagsOf('fgf~'), [false, false, false]);
  assert.deepEqual(flagsOf('hf/g~'), [false, false, false]);
  assert.deepEqual(flagsOf('hFg~'), [false, false, false]);
  assert.deepEqual(flagsOf('hvfg~'), [false, false, false]);
  assert.deepEqual(flagsOf('hfg'), [false, false, false]);
});

test('one flag per gabcSteps note on every 1908 GregoBase file', () => {
  let porr = 0;
  for (const dir of ['gregobase-1908', 'gregobase-1908-checked'].map((d) => join(here, 'corpus', d))) for (const f of readdirSync(dir).filter((x) => x.endsWith('.gabc'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    const flags = porrectusLiquescents(src);
    assert.equal(flags.length, gabcSteps(src).length, f);
    const g = gabcSteps(src);
    flags.forEach((fl, i) => { if (fl) { porr++; assert.equal(g[i].shape, 'liquescent', f); } });
  }
  assert.equal(porr, 19);
});
