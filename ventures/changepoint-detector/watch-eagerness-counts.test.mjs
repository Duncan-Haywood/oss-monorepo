// The "How eager" hint for counts (README "The How eager hint for counts", eval/watch-eagerness-counts.prereg.md):
// with --model poisson and no clumping cost or threshold named, Quiet is the count default (bocpd-window, NB cost,
// threshold 0.3) and --detector auto stores its cost and threshold, so the watch it picks is the count default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './watch.mjs';
import { eagerSettings, chooseDetector, choiceOptions, eagernessReplay, eagernessText, replayWatch, COUNT_DEFAULTS } from './watch-core.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const gamma = (u, k, scale) => { const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = normal(u); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale; } };
const nb = (u, mean, f) => poisson(u, gamma(u, mean / (f - 1), f - 1));
const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10);
const clumped = (seed, n = 120) => { const u = lcg(seed); return Array.from({ length: n }, () => nb(u, 30, 3)); };
const csvOf = (v) => 'date,orders\n' + v.map((x, i) => `${day(i)},${x}`).join('\n') + '\n';

test('the count ladder: the count default then pelt, unless a clumping cost or threshold is named', () => {
  assert.deepEqual(eagerSettings('poisson'), [{ key: 'quiet', ...COUNT_DEFAULTS }, { key: 'eager', detector: 'pelt' }]);
  for (const named of [{ overdispersion: 'nb' }, { overdispersion: true }, { threshold: 0.5 }]) {
    assert.deepEqual(eagerSettings('poisson', named).map((s) => s.detector), ['bocpd', 'pelt']);
  }
  assert.deepEqual(eagerSettings('mean').map((s) => s.detector), ['bocpd-ar1-window', 'bocpd', 'pelt']);
  // A stored choice from before (a detector only) stays that detector; the count default's comes back whole.
  assert.deepEqual(choiceOptions({ detector: 'bocpd', key: 'quiet' }), { detector: 'bocpd' });
  assert.deepEqual(choiceOptions({ ...COUNT_DEFAULTS, key: 'quiet', n: 90 }), COUNT_DEFAULTS);
  assert.equal(choiceOptions({ detector: 'nonsense' }), null);
  assert.equal(choiceOptions(undefined), null);
});

test('Quiet replays the count default exactly, and the text names its cost and threshold', () => {
  const v = clumped(3);
  const r = eagernessReplay(v, null, { model: 'poisson', keepAlerts: true });
  const direct = replayWatch(v, null, { model: 'poisson' });
  assert.equal(r.settings[0].alerts, direct.alerts.length);
  assert.deepEqual(r.settings[0].alertLabels, direct.alerts.map((a) => a.label));
  assert.match(eagernessText(r), /Quiet \(bocpd-window, negative-binomial cost, alert threshold 0\.3\)/);
  // Under 30 points --detector auto keeps Quiet, which for counts is the count default too.
  const short = chooseDetector(clumped(4, 20), null, { model: 'poisson' });
  assert.equal(short.key, 'quiet');
  assert.deepEqual(choiceOptions(short), COUNT_DEFAULTS);
});

test('CLI --detector auto on a clumped shop stores the count default and the watch runs it; an old bocpd choice is kept', async () => {
  // A clumped null shop whose history is too busy for pelt, so the pick is Quiet.
  let seed = 1, v;
  for (; seed < 200; seed++) { v = clumped(seed, 150); if (chooseDetector(v.slice(0, 120), null, { model: 'poisson' }).key === 'quiet') break; }
  assert.ok(seed < 200);
  const dir = mkdtempSync(join(tmpdir(), 'count-ladder-'));
  const csv = join(dir, 'shop.csv'), state = join(dir, 'state.json');
  writeFileSync(csv, csvOf(v.slice(0, 120)));
  let text = '';
  await main([csv, '--state', state, '--column', 'orders', '--model', 'poisson', '--detector', 'auto'], { out: (s) => (text += s) });
  const choice = JSON.parse(readFileSync(state, 'utf8')).choice;
  assert.deepEqual(choiceOptions(choice), COUNT_DEFAULTS);
  assert.match(text, /How eager: Quiet \(bocpd-window, negative-binomial cost, alert threshold 0\.3\)/);
  // Later runs read the stored choice: the watch's alerts are the count default's, run by run.
  let auto = 0;
  for (let n = 121; n <= v.length; n++) {
    writeFileSync(csv, csvOf(v.slice(0, n)));
    let o = '';
    await main([csv, '--state', state, '--json', '--column', 'orders', '--model', 'poisson', '--detector', 'auto'], { out: (s) => (o += s) });
    auto += JSON.parse(o).alerts.length;
  }
  const want = replayWatch(v, null, { model: 'poisson', ...COUNT_DEFAULTS, from: 120, budget: Infinity }).alerts.length;
  assert.equal(auto, want);
  // A state file written before this change stores { detector: 'bocpd' }: it keeps running plain bocpd.
  const old = join(dir, 'old.json');
  writeFileSync(old, JSON.stringify({ version: 1, alerted: [], n: 0, lastLabel: null, choice: { detector: 'bocpd', key: 'quiet' } }));
  let o = '';
  await main([csv, '--state', old, '--json', '--dry-run', '--column', 'orders', '--model', 'poisson', '--detector', 'auto'], { out: (s) => (o += s) });
  let p = '';
  await main([csv, '--state', old, '--json', '--dry-run', '--column', 'orders', '--model', 'poisson', '--detector', 'bocpd'], { out: (s) => (p += s) });
  assert.deepEqual(JSON.parse(o).alerts, JSON.parse(p).alerts);
});

test('--columns: a count column picked by auto stores the count default too', async () => {
  const v = clumped(11, 120), u = lcg(99);
  const lv = Array.from({ length: 120 }, () => 50 + normal(u));
  const dir = mkdtempSync(join(tmpdir(), 'count-ladder-cols-'));
  const csv = join(dir, 'shop.csv'), state = join(dir, 'state.json');
  writeFileSync(csv, 'date,orders,revenue\n' + v.map((x, i) => `${day(i)},${x},${lv[i].toFixed(2)}`).join('\n') + '\n');
  await main([csv, '--state', state, '--columns', 'orders:poisson,revenue', '--detector', 'auto'], { out: () => {} });
  const st = JSON.parse(readFileSync(state, 'utf8'));
  const ch = st.columns.orders.choice;
  assert.ok(ch.key === 'eager' ? ch.detector === 'pelt' : choiceOptions(ch).overdispersion === 'nb', JSON.stringify(ch));
  assert.ok(['bocpd-ar1-window', 'bocpd', 'pelt'].includes(st.columns.revenue.choice.detector));
});
