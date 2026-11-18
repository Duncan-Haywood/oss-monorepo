import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arrange, fillBar, GENRE_NAMES, BAR } from './genre.mjs';
import { run } from './cli.mjs';

const here = new URL('.', import.meta.url).pathname;
const gabc = join(here, 'examples/dies-irae-incipit.gabc');

test('fills are off by default and leave the output unchanged', () => {
  for (const genre of GENRE_NAMES) {
    assert.deepEqual(arrange({ genre, mode: 1, final: 50, bars: 8 }), arrange({ genre, mode: 1, final: 50, bars: 8, fills: false }));
  }
});

test('fills add a four-hit snare roll to bars 4 and 8 but not the last bar', () => {
  const base = arrange({ genre: 'edm', mode: 1, final: 50, bars: 8 });
  const f = arrange({ genre: 'edm', mode: 1, final: 50, bars: 8, fills: true });
  assert.equal(f.drums.length, base.drums.length + 4); // bar 3 only; bar 7 is the last
  const roll = f.drums.filter((d) => d.tick >= 3 * BAR + 3 * 480 && d.tick < 4 * BAR && d.note === 38);
  assert.ok(roll.length >= 4);
  assert.deepEqual(f.bass, base.bass);
  assert.deepEqual(fillBar(0, 0), []);
  const v = fillBar(0, 3).map((d) => d.vel);
  assert.deepEqual(v, [...v].sort((a, b) => a - b)); // crescendo
});

test('cli --fills writes a larger file and needs --genre', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fills-'));
  const a = join(dir, 'a.mid'), b = join(dir, 'b.mid');
  assert.equal(run([gabc, '-o', a, '--genre', 'metal', '--fit', '8', '--repeat', '3']).code, 0);
  assert.equal(run([gabc, '-o', b, '--genre', 'metal', '--fit', '8', '--repeat', '3', '--fills']).code, 0);
  assert.ok(readFileSync(b).length > readFileSync(a).length);
  assert.equal(run([gabc, '--fills']).code, 2);
});
