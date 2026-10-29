import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { connectionChecks } from './connections.mjs';

const variants = [{}, { foundation: 'blocks' }, { roofType: 'ridgeBoard' }, { roofType: 'ridgeBeam' }, { length: 240 }, { studSize: '2x6' }, { overhang: 0 }];

test('every preset and variation ties together', () => {
  for (const [name, make] of Object.entries(PRESETS)) {
    for (const v of variants) {
      const r = connectionChecks(buildShed({ ...make(), ...v }));
      assert.deepEqual(r.rows.filter((x) => !x.ok).map((x) => `${x.check}: ${x.detail}`), [], `${name} ${JSON.stringify(v)}`);
    }
  }
});

test('the cap plates interlock: long walls stop short, end walls lap over', () => {
  const s = buildShed(defaultDesign());
  const cap = (g) => s.members.filter((m) => m.group === `wall:${g}` && m.kind === 'cap plate');
  assert.deepEqual(cap('front').map((m) => m.length), [144 - 7]);
  assert.deepEqual(cap('left').map((m) => m.length), [96]);
  const top = (g) => s.members.filter((m) => m.group === `wall:${g}` && m.kind === 'top plate');
  assert.deepEqual(top('front').map((m) => m.length), [144]);
  assert.deepEqual(top('left').map((m) => m.length), [96 - 7]);
});

// The check has to fail when the frame is wrong, or it proves nothing.
test('a missing jack, a floating cripple and an unlapped corner are each caught', () => {
  const s = buildShed(PRESETS['8x12 classic']());
  const noJack = { ...s, walls: { ...s.walls, front: { ...s.walls.front, members: s.walls.front.members.filter((m, i, a) => !(m.kind === 'jack stud' && a.findIndex((x) => x.kind === 'jack stud') === i)) } } };
  assert.ok(!connectionChecks(noJack).rows.find((r) => r.check === 'front wall: headers bear on jacks').ok);

  const back = s.walls.back.members.map((m) => (m.kind === 'bottom cripple' ? { ...m, local: { ...m.local, z1: m.local.z1 - 1 } } : m));
  const floating = { ...s, walls: { ...s.walls, back: { ...s.walls.back, members: back } } };
  assert.ok(!connectionChecks(floating).rows.find((r) => r.check === 'back wall: cripples and sills bear').ok);

  const unlapped = { ...s, members: s.members.filter((m) => !(m.group === 'wall:left' && m.kind === 'cap plate')) };
  assert.ok(!connectionChecks(unlapped).rows.find((r) => r.check === 'Cap plates lap the corners').ok);
});
