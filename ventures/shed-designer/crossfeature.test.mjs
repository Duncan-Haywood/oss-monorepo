// Features from different lanes meeting in one design: every siding with every
// foundation, pad, floor, roof, seat, cover, spacing, trim and door, on every preset. The
// full product is hundreds of thousands of builds, so the matrix is an all-pairs set: each
// value of each axis meets each value of every other axis in at least one
// design. A new option joins by adding its value to AXES below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { buildShed, PRESETS, BLOCKS } from './model.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { invariants } from './invariants.mjs';
import { VIEWS, packetHtml, encodeDesign, decodeDesign } from './hoa.mjs';

/** @type {Record<string, any[]>} */
export const AXES = {
  preset: Object.keys(PRESETS),
  sidingType: ['T1-11', 'LP SmartSide', 'LP SmartSide 7/16', 'board and batten', 'vinyl', 'fiber cement', 'LP SmartSide lap'],
  foundation: ['gravel', ...Object.keys(BLOCKS)],
  pad: ['full', 'under blocks', 'none'],
  floorPanel: ['plywood', 'OSB'],
  joistSize: ['2x6', '2x8'],
  joistSpacing: [16, 24],
  roofType: ['ridgeBeam', 'ridgeBoard'],
  rafterSeat: ['birdsmouth', 'connector'],
  roofCover: ['shingles', 'metal'],
  studSpacing: [16, 24],
  wallTrim: ['1x4', 'none'],
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
test('every pairing of features renders its HOA packet', () => {
  const failures = [];
  for (const row of ROWS) {
    const shed = buildShed(designOf(row));
    let html;
    try { html = packetHtml(shed); } catch (e) { failures.push(`${JSON.stringify(row)}: throws ${e.message}`); continue; }
    const views = [...html.matchAll(/class="hoa-elev" data-view="(\w+)"/g)].map((m) => m[1]).sort();
    if (views.join() !== [...VIEWS].sort().join()) failures.push(`${JSON.stringify(row)}: elevations ${views}`);
    if (/NaN|undefined|Infinity/.test(html)) failures.push(`${JSON.stringify(row)}: NaN/undefined in the packet`);
    if (!/Not engineered or code-checked/.test(html)) failures.push(`${JSON.stringify(row)}: no disclaimer`);
    const back = decodeDesign(`#d=${encodeDesign(shed.design)}`);
    if (JSON.stringify(buildShed(back).design) !== JSON.stringify(shed.design)) failures.push(`${JSON.stringify(row)}: #d= link does not round-trip`);
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

// The design gallery (round 3) is the same promise at a larger scale: every
// design in it must pass as shipped. Until a gallery module lands this skips.
const GALLERY_FILE = new URL('./gallery.mjs', import.meta.url);
test('every gallery design passes every check as shipped', { skip: !existsSync(GALLERY_FILE) && 'no gallery.mjs yet' }, async () => {
  const mod = await import(GALLERY_FILE.href);
  const raw = mod.GALLERY ?? mod.default ?? Object.values(mod).find((v) => Array.isArray(v));
  const list = Array.isArray(raw) ? raw : Object.values(raw ?? {});
  const designs = list.map((g) => (typeof g === 'function' ? g() : g?.design ? (typeof g.design === 'function' ? g.design() : g.design) : g));
  assert.ok(designs.length > 0, 'gallery.mjs exports its designs');
  for (const d of designs) shipsClean(d, d.name);
});
