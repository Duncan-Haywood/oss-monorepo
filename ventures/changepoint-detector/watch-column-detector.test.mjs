// A detector per column in --columns (README "A detector per column"): a count column can take bocpd-window, which
// found 84 of 100 count steps against bocpd's 60 (README "Counts and the windowed detector"), while a level column
// in the same CSV keeps its own default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, columnSpecs } from './watch.mjs';
import { replayWatch } from './watch-core.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10);

test('columnSpecs: a model and a detector after the name, in either order; mistakes refused', () => {
  const csv = 'date,orders,revenue,signups\n2026-01-01,3,10.5,1\n2026-01-02,4,11,2\n';
  assert.deepEqual(columnSpecs(csv, 'orders:poisson:bocpd-window,revenue'), [
    { column: 'orders', model: 'poisson', detector: 'bocpd-window' }, { column: 'revenue', model: null }]);
  assert.deepEqual(columnSpecs(csv, 'orders:bocpd-window:poisson'), [{ column: 'orders', model: 'poisson', detector: 'bocpd-window' }]);
  assert.deepEqual(columnSpecs(csv, 'revenue:pelt'), [{ column: 'revenue', model: null, detector: 'pelt' }]);
  assert.deepEqual(columnSpecs(csv, 'orders:POISSON'), [{ column: 'orders', model: 'poisson' }]);
  assert.throws(() => columnSpecs(csv, 'orders:poisson:meanvar'), /at most one of each/);
  assert.throws(() => columnSpecs(csv, 'orders:bocpd:pelt'), /at most one of each/);
  assert.throws(() => columnSpecs(csv, 'orders:fast'), /a model .* or a detector/);
  assert.throws(() => columnSpecs(csv, ':poisson'), /names no column/);
});

// Orders fall from 30 to 21 a day at day 108 of 120 (cell S2 of eval/poisson-window.mjs, where bocpd found 10 of 20
// and bocpd-window 18 of 20); revenue is a steady level with no change.
function shop(seed) {
  const u = lcg(seed), g = lcg(seed + 7);
  return Array.from({ length: 120 }, (_, i) => ({ orders: poisson(u, i < 108 ? 30 : 21), revenue: 1000 + 40 * normal(g) }));
}
const csvOf = (rows) => 'date,orders,revenue\n' + rows.map((r, i) => `${day(i)},${r.orders},${r.revenue.toFixed(2)}`).join('\n') + '\n';
const heard = (det, rows) => replayWatch(rows.map((r) => r.orders), null, { model: 'poisson', detector: det, from: 90, budget: Infinity })
  .alerts.some((a) => Math.abs(a.index - 108) <= 3);

// Run the daily watch from day 90 to day 120 on a mixed CSV, as the workflow would, and return each run's output.
async function daily(rows, columns, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'col-det-'));
  const csv = join(dir, 'shop.csv'), state = join(dir, 'state.json');
  const outs = [];
  for (let n = 90; n <= rows.length; n++) {
    writeFileSync(csv, csvOf(rows.slice(0, n)));
    let o = '';
    await main([csv, '--state', state, '--columns', columns, '--json', ...extra], { out: (s) => (o += s) });
    outs.push(JSON.parse(o));
  }
  return { outs, state: JSON.parse(readFileSync(state, 'utf8')) };
}
const orderAlerts = (outs) => outs.flatMap((o) => o.columns.find((c) => c.column === 'orders').alerts);

test('CLI: orders:poisson:bocpd-window hears a 30% drop the default misses; revenue beside it is unchanged', async () => {
  // A shop where the two detectors disagree, found by scanning seeds with the replay (the CLI below is the check).
  let seed = 1, rows;
  for (; seed < 200; seed++) { rows = shop(seed); if (!heard('bocpd', rows) && heard('bocpd-window', rows)) break; }
  assert.ok(seed < 200, 'no seed where only the windowed pass hears the drop');
  const plain = await daily(rows, 'orders:poisson,revenue');
  const named = await daily(rows, 'orders:poisson:bocpd-window,revenue');
  assert.equal(orderAlerts(plain.outs).filter((a) => Math.abs(a.index - 108) <= 3).length, 0);
  const hit = orderAlerts(named.outs).filter((a) => Math.abs(a.index - 108) <= 3);
  assert.equal(hit.length, 1, JSON.stringify(orderAlerts(named.outs)));
  assert.ok(hit[0].meanAfter < hit[0].meanBefore, 'the alert is a drop');
  // The named detector is the orders column's alone: revenue's record is the same in both runs.
  assert.deepEqual(named.state.columns.revenue, plain.state.columns.revenue);
  assert.equal(named.outs.at(-1).columns.find((c) => c.column === 'orders').detector, 'bocpd-window');
  assert.equal(named.outs.at(-1).columns.find((c) => c.column === 'revenue').detector, undefined);
  // and the orders record equals a one-column watch with --detector bocpd-window
  const dir = mkdtempSync(join(tmpdir(), 'col-det-one-'));
  const csv = join(dir, 'shop.csv'), state = join(dir, 'one.json');
  for (let n = 90; n <= rows.length; n++) {
    writeFileSync(csv, csvOf(rows.slice(0, n)));
    await main([csv, '--state', state, '--column', 'orders', '--model', 'poisson', '--detector', 'bocpd-window'], { out: () => {} });
  }
  assert.deepEqual(named.state.columns.orders.alerted, JSON.parse(readFileSync(state, 'utf8')).alerted);
});

test('CLI: --detector sets the columns that name none; --detector auto leaves a named one alone', async () => {
  const rows = shop(3).slice(0, 100);
  const dir = mkdtempSync(join(tmpdir(), 'col-det-auto-'));
  const csv = join(dir, 'shop.csv');
  writeFileSync(csv, csvOf(rows));
  let o = '';
  await main([csv, '--state', join(dir, 'a.json'), '--columns', 'orders:poisson:bocpd-window,revenue', '--detector', 'auto'], { out: (s) => (o += s) });
  const st = JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8'));
  assert.equal(st.columns.orders.choice, undefined, 'the named column is not picked for');
  assert.ok(st.columns.revenue.choice, 'the other column is');
  assert.match(o, /== orders ==\nDetector: bocpd-window \(named for this column\)\./);
  assert.match(o, /== revenue ==\nHow eager:/);
  // a plain --detector applies to revenue; orders keeps its own
  let j = '';
  await main([csv, '--dry-run', '--columns', 'orders:poisson:bocpd-window,revenue', '--detector', 'pelt', '--json'], { out: (s) => (j += s) });
  const cols = JSON.parse(j).columns;
  assert.equal(cols.find((c) => c.column === 'orders').detector, 'bocpd-window');
});
