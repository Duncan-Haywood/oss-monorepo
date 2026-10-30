// Features from different lanes meeting in one design: every siding with every
// foundation, pad, floor, roof, seat, cover, spacing, trim and door, on every preset. The
// full product is hundreds of thousands of builds, so the matrix is an all-pairs set: each
// value of each axis meets each value of every other axis in at least one
// design. A new option joins by adding its value to AXES below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, PRESETS, BLOCKS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { invariants } from './invariants.mjs';
import { VIEWS, packetHtml, encodeDesign, decodeDesign } from './hoa.mjs';
import { presetEntries } from './picker.mjs';
import { GALLERY_DESIGNS } from './gallery-data.mjs';
import { searchDesigns, picks } from './designsearch.mjs';

/** @type {Record<string, any[]>} */
export const AXES = {
  preset: Object.keys(PRESETS),
  sidingType: ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16', 'board and batten', 'vinyl', 'fiber cement', 'LP SmartSide lap'],
  foundation: ['gravel', ...Object.keys(BLOCKS)],
  pad: ['full', 'under blocks', 'none'],
  floorPanel: ['plywood', 'OSB'],
  joistSize: ['2x6', '2x8'],
  joistSpacing: [16, 24],
  roofType: ['ridgeBeam', 'ridgeBoard', 'truss'],
  style: ['gable', 'gambrel'],
  loft: ['none', 'half', 'full'],
  atticStorage: [false, true],
  rafterSeat: ['birdsmouth', 'connector'],
  roofCover: ['shingles', 'metal'],
  studSpacing: [16, 24],
  wallTrim: ['1x4', '5/4', 'none'],
  climate: ['mild', 'freezing'],
  interior: ['none', 'OSB', 'plywood', 'drywall', 'beadboard', 'pegboard', 'teen bedroom'],
  door: ['as drawn', 'site-built'],
};

/** Greedy all-pairs: keep adding the row that covers the most uncovered pairs. */
export function allPairs(axes) {
  const names = Object.keys(axes);
  const key = (a, i, b, j) => `${a}=${i}|${b}=${j}`;
  const todo = new Set();
  names.forEach((a, x) => names.slice(x + 1).forEach((b) => axes[a].forEach((_, i) => axes[b].forEach((_, j) => todo.add(key(a, i, b, j))))));
  const rows = [];
  while (todo.size) {
    // Seed the row with the first uncovered pair, then fill each other axis greedily.
    const [first] = todo;
    const [[a, i], [b, j]] = first.split('|').map((s) => s.split('=')).map(([n, v]) => [n, Number(v)]);
    const row = { [a]: i, [b]: j };
    for (const n of names) {
      if (n in row) continue;
      let best = 0, bestGain = -1;
      axes[n].forEach((_, v) => {
        let gain = 0;
        for (const [m, w] of Object.entries(row)) if (todo.has(names.indexOf(m) < names.indexOf(n) ? key(m, w, n, v) : key(n, v, m, w))) gain++;
        if (gain > bestGain) { best = v; bestGain = gain; }
      });
      row[n] = best;
    }
    names.forEach((p, x) => names.slice(x + 1).forEach((q) => todo.delete(key(p, row[p], q, row[q]))));
    rows.push(Object.fromEntries(names.map((n) => [n, axes[n][row[n]]])));
  }
  return rows;
}

/** A design from one matrix row. */
export function designOf(row) {
  const { preset, door, ...rest } = row;
  const d = { ...PRESETS[preset](), ...rest };
  if (door === 'site-built') d.openings = d.openings.map((o) => (o.kind === 'door' ? { ...o, product: 'site-built' } : o));
  return d;
}

const ROWS = allPairs(AXES);

test('the all-pairs matrix covers every pair of option values', () => {
  const names = Object.keys(AXES);
  for (const [x, a] of names.entries()) {
    for (const b of names.slice(x + 1)) {
      for (const va of AXES[a]) for (const vb of AXES[b]) assert.ok(ROWS.some((r) => r[a] === va && r[b] === vb), `${a}=${va} with ${b}=${vb}`);
    }
  }
  assert.ok(ROWS.length < 80, `${ROWS.length} rows`);
});

test(`every pairing of features keeps every invariant (${ROWS.length} designs)`, () => {
  const failures = [];
  for (const row of ROWS) {
    let bad;
    try { bad = invariants(designOf(row)); } catch (e) { bad = [`throws: ${e.stack.split('\n').slice(0, 3).join(' | ')}`]; }
    if (bad.length) failures.push(`${JSON.stringify(row)}: ${bad.slice(0, 3).join('; ')}`);
  }
  assert.deepEqual(failures, []);
});

// The HOA packet (round 3, lane 5) is drawn from whatever the design is: every
// pairing must give four elevations and a site page with no NaN or undefined,
// and the packet's #d= link must carry the design back intact.
function packetProblems(design) {
  const shed = buildShed(design);
  const html = packetHtml(shed);
  const views = [...html.matchAll(/class="hoa-elev" data-view="(\w+)"/g)].map((m) => m[1]).sort();
  const bad = [];
  if (views.join() !== [...VIEWS].sort().join()) bad.push(`elevations ${views}`);
  if (/NaN|undefined|Infinity/.test(html)) bad.push('NaN/undefined in the packet');
  if (!/Not engineered or code-checked/.test(html)) bad.push('no disclaimer');
  return bad;
}

test('every pairing of features renders its HOA packet', () => {
  const failures = [];
  for (const row of ROWS) {
    const design = designOf(row);
    let bad;
    try { bad = packetProblems(design); } catch (e) { bad = [`throws ${e.message}`]; }
    const shed = buildShed(design);
    const back = decodeDesign(`#d=${encodeDesign(shed.design)}`);
    if (JSON.stringify(buildShed(back).design) !== JSON.stringify(shed.design)) bad.push('#d= link does not round-trip');
    if (bad.length) failures.push(`${JSON.stringify(row)}: ${bad.join('; ')}`);
  }
  assert.deepEqual(failures, []);
});

/** Each starting point a person can pick must pass as shipped: they should not open a preset to a red check. */
function shipsClean(design, label) {
  const shed = buildShed(design);
  const bad = invariants(design);
  for (const r of structuralChecks(shed).rows) if (!r.ok) bad.push(`${r.member} at ${Math.round(r.ratio * 100)}%`);
  for (const r of connectionChecks(shed).rows) if (!r.ok) bad.push(r.check);
  assert.deepEqual(bad, [], label);
}

test('every preset passes every structural and connection check as shipped', () => {
  for (const [name, make] of Object.entries(PRESETS)) shipsClean(make(), name);
});

// The gallery of starting designs is the picker's entries (picker.mjs), and
// the design search's front and named picks are what it offers once a search
// runs. Every one must pass as shipped, and its HOA packet must render: a
// person flicks through these and customises from there.

test('every picker preset entry passes every check as shipped and renders its HOA packet', () => {
  const entries = presetEntries();
  assert.ok(entries.length >= 6);
  for (const e of entries) {
    shipsClean(e.design, e.title);
    assert.deepEqual(packetProblems(e.design), [], e.title);
  }
});

test('every design in the stored gallery passes every check as shipped and renders its HOA packet', () => {
  // The ready designs a person flicks through (gallery-data.mjs, PR #11561). gallery.test.mjs holds
  // them to 90% use and no warnings; here they also keep every fuzz invariant and render their packet.
  assert.ok(GALLERY_DESIGNS.length >= 8);
  for (const g of GALLERY_DESIGNS) {
    shipsClean(g.design, g.title);
    assert.deepEqual(packetProblems(g.design), [], g.title);
  }
});

test('every design on a search front, and every named pick, passes as shipped and renders its HOA packet', () => {
  const r = searchDesigns({ budget: 150 });
  const named = picks(r.front);
  assert.ok(r.front.length > 0 && named.length > 0);
  for (const s of [...r.front, ...named]) {
    shipsClean(s.design, `${s.label || ''} ${s.design.length}x${s.design.width}`);
    assert.deepEqual(packetProblems(s.design), [], s.label);
  }
});

// Round 4 options that act through another setting: the climate picks the fiber
// cement plank (HZ5 or HZ10), and 5/4 trim comes in one length per maker, which
// the haul limit (12 ft by default) must hear about.

test('climate picks HZ5 plank where winters freeze and HZ10 elsewhere, on every preset', () => {
  for (const [name, make] of Object.entries(PRESETS)) {
    for (const climate of ['mild', 'freezing']) {
      const d = { ...make(), sidingType: 'fiber cement', climate };
      const keys = estimate(buildShed(d)).shopping.map((l) => l.source?.key || '');
      const hz5 = keys.some((k) => /lapHardie5$/.test(k)), hz10 = keys.some((k) => /lapHardie$/.test(k));
      assert.deepEqual([hz5, hz10], climate === 'freezing' ? [true, false] : [false, true], `${name} ${climate}`);
    }
  }
});

test('5/4 trim longer than the haul limit is said, and never when it fits', () => {
  const said = (d) => estimate(buildShed(d)).notes.some((n) => /^Wall trim: .*haul limit/.test(n));
  for (const [name, make] of Object.entries(PRESETS)) {
    const base = { ...make(), wallTrim: '5/4' };
    assert.equal(said({ ...base, sidingType: 'LP SmartSide lap', maxHaulFt: 12 }), true, `${name}: LP 540 is 16 ft`);
    assert.equal(said({ ...base, sidingType: 'LP SmartSide lap', maxHaulFt: 16 }), false, `${name}: 16 ft fits`);
    assert.equal(said({ ...base, sidingType: 'fiber cement', maxHaulFt: 12 }), false, `${name}: HardieTrim is 12 ft`);
    assert.equal(said({ ...make(), wallTrim: '1x4', maxHaulFt: 12 }), false, `${name}: 1x4 comes in 8 and 12 ft`);
  }
});
