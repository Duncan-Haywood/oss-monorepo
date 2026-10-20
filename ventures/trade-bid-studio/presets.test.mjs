import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProfiles, render, GROUPS } from './build-presets.mjs';
import { PRESETS } from './presets.mjs';
import { takeoffTotals, fromPreset } from './takeoff.mjs';
import { calculateBid } from './engine.mjs';

const { profiles, problems } = loadProfiles();
const directory = JSON.parse(readFileSync(new URL('./trades.json', import.meta.url), 'utf8'));

// Bid calculators that are not a contractor pricing a job for a customer:
// each works out the most to pay at an auction, so a takeoff has nothing to
// describe. They stay in the directory; they get no preset.
const NOT_A_SERVICE_JOB = new Set(['liquidation-pallet-bid-calculator', 'storage-auction-max-bid-calculator']);

test('every preset is valid and traced to its specialist', () => {
  assert.deepEqual(problems, []);
});

test('presets.mjs is current (run node build-presets.mjs if this fails)', () => {
  assert.equal(readFileSync(new URL('./presets.mjs', import.meta.url), 'utf8'), render(profiles));
});

test('every trade bid calculator has a preset, except the auction ones', () => {
  const withPreset = new Set(PRESETS.map(p => p.slug));
  const missing = directory.map(t => t.slug).filter(s => !withPreset.has(s) && !NOT_A_SERVICE_JOB.has(s));
  assert.deepEqual(missing, []);
  for (const slug of NOT_A_SERVICE_JOB) assert.ok(!withPreset.has(slug), `${slug} should not have a preset`);
  for (const p of PRESETS) assert.ok(directory.some(t => t.slug === p.slug), `${p.slug} is not in trades.json`);
});

test('every group is used and every preset id is unique', () => {
  const ids = PRESETS.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const g of GROUPS) assert.ok(PRESETS.some(p => p.group === g) || g === 'Events & other services', `no preset in ${g}`);
});

test("every preset's example job prices to a positive bid", () => {
  for (const preset of PRESETS) {
    const { takeoff, form } = fromPreset(preset);
    const t = takeoffTotals(takeoff);
    assert.ok(t.laborHours > 0, `${preset.id}: no labor`);
    const bid = calculateBid({ wage: 30, burdenPct: 25, overheadPct: 10, marginPct: 20, ...form,
      laborHours: t.laborHours, materials: t.materials });
    assert.ok(bid.price > bid.walkAway && bid.walkAway > 0, `${preset.id}: price ${bid.price}`);
    // A preset whose example job is off by orders of magnitude is a units
    // mistake (minutes for hours, cents for dollars), not a big job.
    assert.ok(bid.price < 500000, `${preset.id}: example job prices at ${bid.price}`);
  }
});
