import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, draw as makerDraw } from './eval/turns-heavy-late.mjs';
import { draw as agencyDraw } from './eval/turns-agency-lines.mjs';
import { heavyLate, relativeLags } from './heavy-late.mjs';
import { turnsResult, turnsText } from './turns-cli.mjs';
import { turnsHtml } from './turns-view.mjs';
import { TURNS_CSV, TURNS_COLUMNS, TURNS_SD_UNTIL } from './example-turns.mjs';

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// README "A heaviest-is-latest warning" (2026-11-24, pre-registered; H1-H5 pass, the warning ships).
test('pre-registered round: the warning helps where it fires, stays quiet on early lines and on FRED; ships', async () => {
  const o = await run();
  assert.equal(o.primary.fired, 262);
  assert.equal(o.primary.gain.d.toFixed(3), '0.072');
  assert.equal(o.primary.late.toFixed(2), '0.94');
  assert.equal(o.primary.early.toFixed(2), '0.08');
  assert.equal(o.guards.agency.followed.toFixed(3), '0.902');
  assert.equal(o.guards.shop.followed.toFixed(3), '0.941');
  assert.equal(o.fred.warning.fires, false);
  assert.deepEqual(o.verdict, { H1: true, H2: true, H3: true, H4: true, H5: true });
  assert.equal(o.ships, true);
});

test('relativeLags: a column two rows behind the others reads +2, the others about -1', () => {
  const a = [{ i: 10, kind: 'peak' }, { i: 30, kind: 'trough' }];
  const shift = (k) => a.map((t) => ({ ...t, i: t.i + k }));
  assert.deepEqual(relativeLags([a, shift(0), shift(3)]), [-1.5, -1.5, 3]);
});

const toCsv = (names, lines) => ['month,' + names.join(',')].concat(lines[0].map((_, t) => `${2000 + Math.floor(t / 12)}-${String(1 + (t % 12)).padStart(2, '0')},` + lines.map((x) => x[t].toPrecision(8)).join(','))).join('\n');

test('CLI and page: an agency draw warns about headcount and dates the composite without it', () => {
  const { lines } = agencyDraw(rng(7), 144, 1);
  const names = ['pipeline', 'hours', 'invoices', 'headcount'];
  const r = turnsResult({ csv: toCsv(names, lines), columns: names });
  assert.ok(r.composite.heavyLate, 'warning should fire');
  assert.equal(r.composite.heavyLate.column, 'headcount');
  assert.ok(r.composite.heavyLate.lag >= 2);
  assert.deepEqual(r.composite.heavyLate.without, ['pipeline', 'hours', 'invoices']);
  assert.ok(r.composite.heavyLate.turns.length > 0);
  assert.match(turnsText(r), /Warning: headcount carries \d+% of the weight and is also the latest column/);
  assert.match(turnsHtml(r), /Heaviest column is also the latest/);
  // quarterly composites are not covered by the round: no warning
  assert.equal(turnsResult({ csv: toCsv(names, lines), columns: names, frequency: 'quarterly' }).composite.heavyLate, null);
});

test('CLI: the FRED example (heaviest column payrolls, not late) gives no warning', () => {
  const r = turnsResult({ csv: TURNS_CSV, columns: TURNS_COLUMNS.split(',').map((c) => c.trim()), sdUntil: TURNS_SD_UNTIL });
  assert.equal(r.composite.heavyLate, null);
  assert.doesNotMatch(turnsText(r), /Warning:/);
});

test('heavyLate: an early heavy line does not fire', () => {
  const u = rng(11);
  let d; do { d = makerDraw(u, 144, 1); } while (d.empLag !== -1);
  const w = heavyLate(d.lines, [0.1, 0.1, 0.1, 0.7]);
  assert.equal(w.fires, false);
});
