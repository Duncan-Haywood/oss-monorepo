import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './cli.mjs';

const d = mkdtempSync(join(tmpdir(), 'cf-'));
const f = join(d, 'a.gabc');
writeFileSync(f, 'name:T;\nmode:1;\n%%\n(c4) Ky(f)ri(g)e(f) (:) e(g)lei(f)\n');
const secs = (r) => Number(/([\d.]+) s at/.exec(r.text)[1]);

test('--intro adds bars of silence at the tempo', () => {
  const a = run([f, '--bpm', '120']);
  const b = run([f, '--bpm', '120', '--intro', '2']);
  assert.equal(b.code, 0, b.text);
  assert.ok(Math.abs(secs(b) - secs(a) - 4) < 0.15, `${secs(a)} vs ${secs(b)}`);
});

test('--intro shifts the cue sheet and keeps the backing', () => {
  const c1 = join(d, 'c1.txt'), c2 = join(d, 'c2.txt');
  assert.equal(run([f, '--cues', c1]).code, 0);
  assert.equal(run([f, '--cues', c2, '--intro', '1']).code, 0);
  const rd = (p) => import('node:fs').then((m) => m.readFileSync(p, 'utf8'));
  return Promise.all([rd(c1), rd(c2)]).then(([x, y]) => {
    assert.notEqual(x, y);
    const o = join(d, 'o.mid');
    const r = run([f, '--genre', 'deep-house', '--intro', '1', '-o', o]);
    assert.equal(r.code, 0, r.text);
  });
});

test('--intro refuses bad counts', () => {
  for (const v of ['0', '-1', '2.5', 'x', '17']) assert.equal(run([f, '--intro', v]).code, 2, v);
});
