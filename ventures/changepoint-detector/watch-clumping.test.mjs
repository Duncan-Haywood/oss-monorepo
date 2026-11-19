// A clumping cost for watched counts (README "Clumped counts in the watch", eval/poisson-window-clumping.out.txt):
// --overdispersion nb|nb1|phi, globally or per count column in --columns (orders:poisson:bocpd-window:nb).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, columnSpecs, parseClumping } from './watch.mjs';
import { replayWatch } from './watch-core.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const gamma = (u, k, scale) => { const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = normal(u); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale; } };
const nb = (u, mean, f) => poisson(u, gamma(u, mean / (f - 1), f - 1));
const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10);

test('parseClumping and columnSpecs: nb, nb1, phi; mistakes refused', () => {
  assert.equal(parseClumping('nb'), 'nb');
  assert.equal(parseClumping('NB1'), 'nb1');
  assert.equal(parseClumping('phi'), true);
  assert.throws(() => parseClumping('negbin'), /takes nb, nb1, phi/);
  const csv = 'date,orders,revenue\n2026-01-01,3,10.5\n2026-01-02,4,11\n';
  assert.deepEqual(columnSpecs(csv, 'orders:poisson:bocpd-window:nb,revenue'), [
    { column: 'orders', model: 'poisson', detector: 'bocpd-window', overdispersion: 'nb' }, { column: 'revenue', model: null }]);
  assert.deepEqual(columnSpecs(csv, 'orders:phi:poisson'), [{ column: 'orders', model: 'poisson', overdispersion: true }]);
  assert.throws(() => columnSpecs(csv, 'orders:poisson:nb:nb1'), /at most one of each/);
});

test('CLI: a clumping cost needs counts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'clump-'));
  const csv = join(dir, 's.csv');
  writeFileSync(csv, 'date,orders,revenue\n' + Array.from({ length: 30 }, (_, i) => `${day(i)},${20 + (i % 5)},${100 + i}`).join('\n') + '\n');
  await assert.rejects(main([csv, '--dry-run', '--column', 'orders', '--overdispersion', 'nb'], { out: () => {} }), /for counts: add --model poisson/);
  await assert.rejects(main([csv, '--dry-run', '--columns', 'orders:poisson,revenue:nb'], { out: () => {} }), /revenue: a clumping cost .* is for counts/);
  // a global --overdispersion applies to the count columns only, so a level column beside them is not refused
  let o = '';
  await main([csv, '--dry-run', '--columns', 'orders:poisson,revenue', '--overdispersion', 'nb', '--json'], { out: (s) => (o += s) });
  const cols = JSON.parse(o).columns;
  assert.equal(cols.length, 2);
});

// Clumped daily orders (negative binomial, mean 30, variance 90: cell N5 of eval/poisson-window-clumping.mjs) with no
// change. Over 200 fresh seeds there, bocpd-window sent 19.35 false alerts per 1,000 checks and with nb 0.16.
function clumpedShop(seed) {
  const u = lcg(seed), g = lcg(seed + 7);
  return Array.from({ length: 120 }, () => ({ orders: nb(u, 30, 3), revenue: 1000 + 40 * normal(g) }));
}
const csvOf = (rows) => 'date,orders,revenue\n' + rows.map((r, i) => `${day(i)},${r.orders},${r.revenue.toFixed(2)}`).join('\n') + '\n';
const falseAlerts = (rows, opts) => replayWatch(rows.map((r) => r.orders), null, { model: 'poisson', from: 90, budget: Infinity, ...opts }).alerts.length;

async function daily(rows, args) {
  const dir = mkdtempSync(join(tmpdir(), 'clump-daily-'));
  const csv = join(dir, 'shop.csv'), state = join(dir, 'state.json');
  let last = null, alerts = 0;
  for (let n = 90; n <= rows.length; n++) {
    writeFileSync(csv, csvOf(rows.slice(0, n)));
    let o = '';
    await main([csv, '--state', state, '--json', ...args], { out: (s) => (o += s) });
    last = JSON.parse(o);
    alerts += last.columns.find((c) => c.column === 'orders').alerts.length;
  }
  return { last, alerts };
}

test('CLI: orders:poisson:bocpd-window:nb stays quiet on clumped orders where bocpd-window alone alerts', async () => {
  // A shop where the plain windowed pass sends a false alert and the clumping cost does not, found with the replay.
  let seed = 1, rows;
  for (; seed < 300; seed++) { rows = clumpedShop(seed); if (falseAlerts(rows, { detector: 'bocpd-window' }) > 0 && falseAlerts(rows, { detector: 'bocpd-window', overdispersion: 'nb' }) === 0) break; }
  assert.ok(seed < 300, 'no seed where only the plain windowed pass alerts');
  const plain = await daily(rows, ['--columns', 'orders:poisson:bocpd-window,revenue']);
  const clumped = await daily(rows, ['--columns', 'orders:poisson:bocpd-window:nb,revenue']);
  assert.ok(plain.alerts > 0, 'the plain windowed pass alerts on this null shop');
  assert.equal(clumped.alerts, 0);
  const col = clumped.last.columns.find((c) => c.column === 'orders');
  assert.equal(col.overdispersion, 'nb');
  assert.equal(col.detector, 'bocpd-window');
  assert.equal(clumped.last.columns.find((c) => c.column === 'revenue').overdispersion, undefined);
  // The text output names the cost on the column's block.
  const dir = mkdtempSync(join(tmpdir(), 'clump-text-'));
  const csv = join(dir, 'shop.csv');
  writeFileSync(csv, csvOf(rows));
  let t = '';
  await main([csv, '--dry-run', '--columns', 'orders:poisson:bocpd-window:nb,revenue'], { out: (s) => (t += s) });
  assert.match(t, /== orders ==\nDetector: bocpd-window, negative-binomial cost \(named for this column\)\./);
});

test('CLI: the one-column --overdispersion matches the replay', async () => {
  const rows = clumpedShop(11);
  const dir = mkdtempSync(join(tmpdir(), 'clump-one-'));
  const csv = join(dir, 'shop.csv'), state = join(dir, 'state.json');
  let alerts = 0;
  for (let n = 90; n <= rows.length; n++) {
    writeFileSync(csv, csvOf(rows.slice(0, n)));
    let o = '';
    await main([csv, '--state', state, '--json', '--column', 'orders', '--model', 'poisson', '--detector', 'bocpd-window', '--overdispersion', 'nb'], { out: (s) => (o += s) });
    alerts += JSON.parse(o).alerts.length;
  }
  assert.equal(alerts, falseAlerts(rows, { detector: 'bocpd-window', overdispersion: 'nb' }));
});
