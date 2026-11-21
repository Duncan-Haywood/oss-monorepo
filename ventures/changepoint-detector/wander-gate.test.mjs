import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wanderGate, detectChanges, COUNT_MIDDLE, WANDER_BEFORE } from './watch-core.mjs';
import { main } from './watch.mjs';

// README "A wandering level under Middle" (eval/middle-wander.prereg.md): --wander gated for counts keeps a change on a
// wandering level only where the drift model (random-walk level with jumps) also places a jump.
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, l) => { if (l > 500) return Math.max(0, Math.round(l + Math.sqrt(l) * Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()))); let k = 0, p = Math.exp(-l), c = p; const x = u(); while (x > c) { k++; p *= l / k; c += p; } return k; };
const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const walk = (seed, n = 200, sd = 0.03) => { const u = lcg(seed); let lw = 0; return Array.from({ length: n }, () => { lw += sd * normal(u); return poisson(u, 400 * Math.exp(lw)); }); };
const days = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
const flatStep = (seed, n = 200, at = 150) => { const u = lcg(seed); return Array.from({ length: n }, (_, i) => poisson(u, i < at ? 60 : 36)); };

test('the gate opens on a wandering level and stays shut on a flat level with one fall', () => {
  const w = wanderGate(walk(5));
  assert.equal(w.open, true, `margin ${w.margin}`);
  const f = wanderGate(flatStep(5));
  assert.equal(f.open, false, `margin ${f.margin}`);
  assert.equal(wanderGate([1, 2, 3]).open, false);
});

test('with the gate shut, Middle with --wander gated finds exactly what Middle finds', () => {
  const v = flatStep(9);
  const plain = detectChanges(v, days(v.length), { model: 'poisson', ...COUNT_MIDDLE });
  const gated = detectChanges(v, days(v.length), { model: 'poisson', ...COUNT_MIDDLE, wander: 'gated' });
  assert.deepEqual(gated.map((c) => c.index), plain.map((c) => c.index));
  assert.ok(plain.some((c) => Math.abs(c.index - 150) <= 3), `changes at ${plain.map((c) => c.index)}`);
});

test('on a wandering level the gate keeps fewer changes than Middle alone', () => {
  let plain = 0, gated = 0;
  for (const seed of [21, 22, 23]) {
    const v = walk(seed, 200, 0.03);
    plain += detectChanges(v, days(v.length), { model: 'poisson', ...COUNT_MIDDLE }).length;
    gated += detectChanges(v, days(v.length), { model: 'poisson', ...COUNT_MIDDLE, wander: 'gated' }).length;
  }
  assert.ok(plain > 0 && gated < plain, `Middle ${plain}, gated ${gated}`);
});

test('the gate is for counts, and the watch takes --wander gated for counts only', async () => {
  assert.throws(() => detectChanges(walk(3, 60), days(60), { model: 'mean', detector: 'pelt', wander: 'gated' }), /for counts/);
  assert.throws(() => detectChanges(walk(3, 60), days(60), { model: 'poisson', detector: 'pelt', wander: 'yes' }), /wander takes gated/);
  const dir = mkdtempSync(join(tmpdir(), 'cpd-wander-'));
  const csv = join(dir, 's.csv');
  writeFileSync(csv, 'day,clicks\n' + flatStep(4, 150, 1000).map((x, i) => `${new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)},${x}`).join('\n') + '\n');
  let text = '';
  const code = await main([csv, '--model', 'poisson', '--detector', 'pelt', '--overdispersion', 'nb', '--wander', 'gated', '--dry-run', '--json'], { out: (s) => { text += s; } });
  assert.equal(code, 0);
  assert.equal(JSON.parse(text).alerts.length, 0);
  await assert.rejects(main([csv, '--wander', 'gated', '--dry-run'], { out: () => {} }), /gated is for counts/);
  await assert.rejects(main([csv, '--model', 'poisson', '--wander', 'on', '--dry-run'], { out: () => {} }), /--wander takes gated/);
});

// README "A calmer wander gate" (eval/middle-wander-calm.prereg.md): since 2026-11-21 --wander gated decides whether the
// level wanders on the window before the newest change (WANDER_BEFORE points), so a real fall on a calm site cannot open
// the gate; wanderBefore: false is the first, whole-window gate.
test('the gate decided before the newest change keeps a real fall the whole-window gate drops, and still cuts a wander', async () => {
  const { series, labels } = await import('./eval/gsc-sites.mjs');
  const v = series(9901, 50, 0.2, 0.15).slice(0, 210), l = labels.slice(0, 210), o = { model: 'poisson', ...COUNT_MIDDLE };
  const at = (cs) => cs.filter((c) => Math.abs(c.index - 180) <= 7).length;
  assert.equal(at(detectChanges(v, l, o)), 1);
  assert.equal(at(detectChanges(v, l, { ...o, wander: 'gated', wanderBefore: false })), 0);
  assert.equal(at(detectChanges(v, l, { ...o, wander: 'gated' })), 1);
  assert.equal(WANDER_BEFORE, 60);
  let plain = 0, before = 0;
  for (const seed of [21, 22, 23]) {
    const w = walk(seed, 200, 0.03);
    plain += detectChanges(w, days(w.length), o).length;
    before += detectChanges(w, days(w.length), { ...o, wander: 'gated' }).length;
  }
  assert.ok(before < plain, `Middle ${plain}, before ${before}`);
});
