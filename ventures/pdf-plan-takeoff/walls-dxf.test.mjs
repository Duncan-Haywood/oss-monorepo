import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallsDxf } from './measure.mjs';

const S = { ratio: 48, system: 'imperial', label: '1/4" = 1\'-0"' };
const ft = (f) => (f * 12 * 72) / 48; // feet of building to points on the sheet at 1/4"
const box = (w, h) => [{ x: 0, y: 0 }, { x: ft(w), y: 0 }, { x: ft(w), y: ft(h) }, { x: 0, y: ft(h) }, { x: 0, y: 0 }];

test('wall runs become LINEs in real inches on WALLS, openings on DOORS and WINDOWS', () => {
  const r = wallsDxf([
    { type: 'length', page: 1, label: 'Exterior walls', pts: box(30, 20), scale: S },
    { type: 'length', page: 1, label: 'Doors', pts: [{ x: ft(10), y: 0 }, { x: ft(13), y: 0 }], scale: S },
    { type: 'length', page: 1, label: 'Windows', pts: [{ x: ft(30), y: ft(5) }, { x: ft(30), y: ft(8) }], scale: S },
    { type: 'area', page: 1, label: 'Walls', pts: box(1, 1), scale: S },
    { type: 'length', page: 1, label: 'Fence', pts: box(5, 5), scale: S },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual([r.walls, r.doors, r.windows], [1, 1, 1]);
  const lines = r.dxf.split('\n');
  assert.equal(lines.filter((l) => l === 'LINE').length, 6);
  assert.ok(r.dxf.includes('$INSUNITS\n70\n1\n'));
  const i = lines.indexOf('WALLS');
  assert.deepEqual(lines.slice(i + 1, i + 9), ['10', '0', '20', '0', '30', '0', '11', '360']);
  assert.ok(lines.includes('DOORS') && lines.includes('WINDOWS'));
});

test('one scale and one page: runs on another are counted, not mixed in', () => {
  const r = wallsDxf([
    { type: 'length', page: 2, label: 'walls', pts: box(10, 10), scale: S },
    { type: 'length', page: 2, label: 'walls', pts: box(4, 4), scale: { ratio: 96, system: 'imperial' } },
    { type: 'length', page: 2, label: 'walls', pts: box(4, 4), scale: null },
    { type: 'length', page: 3, label: 'walls', pts: box(4, 4), scale: S },
  ]);
  assert.equal(r.page, 2);
  assert.equal(r.walls, 1);
  assert.deepEqual(r.skipped, { noScale: 1, otherScale: 1, otherPage: 1 });
  assert.equal(wallsDxf([{ type: 'length', page: 3, label: 'walls', pts: box(4, 4), scale: S }, { type: 'length', page: 2, label: 'walls', pts: box(4, 4), scale: S }], { page: 2 }).page, 2);
});

test('metric scales are written in inches', () => {
  const r = wallsDxf([{ type: 'length', page: 1, label: 'Wall', pts: [{ x: 0, y: 0 }, { x: 72, y: 0 }], scale: { ratio: 100, system: 'metric' } }]);
  // 1 in of paper at 1:100 is 2540 mm = 100 in
  assert.ok(r.dxf.includes('\n11\n100\n'));
});

test('nothing usable says what to measure', () => {
  for (const list of [[], null, [{ type: 'length', page: 1, label: 'Doors', pts: [{ x: 0, y: 0 }, { x: 9, y: 0 }], scale: S }], [{ type: 'length', page: 1, label: 'walls', pts: box(3, 3), scale: null }]]) {
    const r = wallsDxf(/** @type {any} */ (list));
    assert.equal(r.ok, false);
    assert.match(r.error, /labelled as a wall/);
  }
});
