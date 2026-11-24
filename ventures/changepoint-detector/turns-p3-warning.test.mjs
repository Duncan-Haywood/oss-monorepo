import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './eval/turns-p3-warning.mjs';
import { turnsResult, turnsText } from './turns-cli.mjs';
import { TURNS_CSV, TURNS_COLUMNS, TURNS_SD_UNTIL } from './example-turns.mjs';

// README "P3 and the heavy-late warning together" (2026-11-24, pre-registered; J1-J5 pass, P3 ships for composites).
test('pre-registered round: P3 with the warning beats the 6-month rule with it on five makes and keeps NBER 16 of 16', async () => {
  const o = await run();
  assert.equal(o.primary.gain.d.toFixed(3), '0.029');
  assert.equal(o.primary.gain.wins, 78); assert.equal(o.primary.gain.losses, 16);
  assert.equal(o.primary.arms.PW.F.toFixed(3), '0.916');
  assert.equal(o.primary.arms.SW.F.toFixed(3), '0.887');
  for (const g of Object.values(o.guards)) assert.ok(g.arms.PW.F > g.arms.SW.F);
  assert.equal(o.fred.PW.matched, 16); assert.equal(o.fred.PW.falses, 2);
  assert.deepEqual(o.fred.PW.extra, ['peak 2002-11', 'trough 2003-04']);
  assert.deepEqual(o.verdict, { J1: true, J2: true, J3: true, J4: true, J5: true });
  assert.equal(o.ships, true);
});

const cols = TURNS_COLUMNS.split(',').map((c) => c.trim());
test('CLI: a monthly composite defaults to 3-month phases; --min-phase 6 restores the old 16 turns', () => {
  const r = turnsResult({ csv: TURNS_CSV, columns: cols, sdUntil: TURNS_SD_UNTIL });
  assert.equal(r.minPhase, 3);
  assert.ok(r.turns.some((t) => t.kind === 'peak' && t.label === '2002-11'));
  assert.ok(r.turns.some((t) => t.kind === 'trough' && t.label === '2003-04'));
  assert.match(turnsText(r), /phases of at least 3 months/);
  const old = turnsResult({ csv: TURNS_CSV, columns: cols, sdUntil: TURNS_SD_UNTIL, minPhase: 6 });
  assert.equal(old.minPhase, 6);
  assert.equal(old.turns.filter((t) => t.label >= '1969-06' && t.label <= '2020-10').length, 16);
  assert.equal(old.turns.length + 2, r.turns.length);
});

test('CLI: one column keeps 6 months, quarterly keeps 2 quarters, and --min-phase is checked', () => {
  assert.equal(turnsResult({ csv: TURNS_CSV, column: 'payems' }).minPhase, 6);
  assert.equal(turnsResult({ csv: TURNS_CSV, columns: cols, frequency: 'quarterly' }).minPhase, 2);
  assert.equal(turnsResult({ csv: TURNS_CSV, column: 'payems', minPhase: '4' }).minPhase, 4);
  assert.throws(() => turnsResult({ csv: TURNS_CSV, columns: cols, minPhase: 0 }), /--min-phase takes a whole number/);
  assert.throws(() => turnsResult({ csv: TURNS_CSV, columns: cols, minPhase: 2.5 }), /--min-phase takes a whole number/);
});
