// The count watch's default (README "A count default for clumped orders", eval/poisson-window-threshold.prereg.md):
// with --model poisson and nothing named, bocpd-window with the negative-binomial cost at alert threshold 0.3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, COUNT_DEFAULT_LINE } from './watch.mjs';
import { replayWatch, withCountDefaults, COUNT_DEFAULTS, detectChanges } from './watch-core.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const gamma = (u, k, scale) => { const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = normal(u); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale; } };
const nb = (u, mean, f) => poisson(u, gamma(u, mean / (f - 1), f - 1));
const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10);
// Clumped orders, mean 30, variance 90 (cell N5), no change.
const clumped = (seed) => { const u = lcg(seed); return Array.from({ length: 120 }, () => nb(u, 30, 3)); };
const csvOf = (v) => 'date,orders\n' + v.map((x, i) => `${day(i)},${x}`).join('\n') + '\n';
const replay = (v, opts) => replayWatch(v, null, { model: 'poisson', from: 90, budget: Infinity, ...opts }).alerts;

test('the count defaults apply only when no detector, clumping cost or threshold is named, and only to counts', () => {
  assert.deepEqual(withCountDefaults({ model: 'poisson' }), { model: 'poisson', ...COUNT_DEFAULTS });
  for (const named of [{ detector: 'bocpd' }, { overdispersion: 'nb' }, { overdispersion: true }, { threshold: 0.5 }]) {
    const o = { model: 'poisson', ...named };
    assert.equal(withCountDefaults(o), o);
  }
  for (const model of [undefined, 'mean', 'meanvar']) { const o = { model }; assert.equal(withCountDefaults(o), o); }
  // detectChanges and replayWatch run the same thing with nothing named as with the three named
  const v = clumped(5);
  assert.deepEqual(detectChanges(v, v.map((_, i) => i + 1), { model: 'poisson' }), detectChanges(v, v.map((_, i) => i + 1), { model: 'poisson', ...COUNT_DEFAULTS }));
  assert.deepEqual(replay(v, {}), replay(v, COUNT_DEFAULTS));
});

test('CLI: a clumped null shop the old default alerts on stays quiet under the new one; --detector bocpd is the old run', async () => {
  let seed = 1, v;
  for (; seed < 300; seed++) { v = clumped(seed); if (replay(v, { detector: 'bocpd' }).length > 0 && replay(v, {}).length === 0) break; }
  assert.ok(seed < 300, 'no seed where only the old default alerts');
  const run = async (extra) => {
    const dir = mkdtempSync(join(tmpdir(), 'count-default-'));
    const csv = join(dir, 'shop.csv'), state = join(dir, 'state.json');
    let alerts = 0, text = '';
    for (let n = 90; n <= v.length; n++) {
      writeFileSync(csv, csvOf(v.slice(0, n)));
      let o = '';
      await main([csv, '--state', state, '--json', '--column', 'orders', '--model', 'poisson', ...extra], { out: (s) => (o += s) });
      alerts += JSON.parse(o).alerts.length;
    }
    await main([csv, '--dry-run', '--column', 'orders', '--model', 'poisson', ...extra], { out: (s) => (text += s) });
    return { alerts, text, state: JSON.parse(readFileSync(state, 'utf8')) };
  };
  const now = await run([]), old = await run(['--detector', 'bocpd']);
  assert.equal(now.alerts, 0);
  assert.equal(old.alerts, replay(v, { detector: 'bocpd' }).length);
  assert.ok(old.alerts > 0);
  assert.ok(now.text.includes(COUNT_DEFAULT_LINE), now.text);
  assert.ok(!old.text.includes(COUNT_DEFAULT_LINE));
  // --columns prints the same line on a count column that names nothing, and not on one that names its detector
  const dir = mkdtempSync(join(tmpdir(), 'count-default-cols-'));
  const csv = join(dir, 'shop.csv');
  writeFileSync(csv, 'date,orders,cancelled\n' + v.map((x, i) => `${day(i)},${x},${x % 4}`).join('\n') + '\n');
  let t = '';
  await main([csv, '--dry-run', '--columns', 'orders:poisson,cancelled:poisson:bocpd'], { out: (s) => (t += s) });
  assert.ok(t.includes(`== orders ==\n${COUNT_DEFAULT_LINE}`), t);
  assert.ok(!t.includes(`== cancelled ==\n${COUNT_DEFAULT_LINE}`));
});
