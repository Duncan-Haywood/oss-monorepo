import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultDesign, normalize, buildShed } from './model.mjs';
import { estimate, examplePrices } from './estimate.mjs';
import { buildInstructions } from './instructions.mjs';
import { solidsOf, FINISH } from './render3d.mjs';
import { PAINTS, SIDING_FINISHES, TRIM_FINISHES, DOOR_FINISHES, SHINGLE_FAMILIES, paletteOf, hexToRgb, rgbToHex, finishName } from './looks.mjs';

test('old saved colours still load, new ones and hex codes are kept, junk falls back', () => {
  for (const c of ['natural', 'unfinished', 'red', 'pink', 'hot pink', 'lavender', 'mint', 'gray', 'blue', 'green', 'white']) assert.equal(normalize({ sidingColor: c }).sidingColor, c);
  for (const c of ['charcoal', 'brown', 'pink', 'purple', 'teal']) assert.equal(normalize({ roofColor: c }).roofColor, c);
  for (const c of ['white', 'purple', 'pink', 'black', 'gold']) assert.equal(normalize({ trimColor: c }).trimColor, c);
  assert.equal(normalize({ sidingColor: 'sage' }).sidingColor, 'sage');
  assert.equal(normalize({ sidingColor: '#A1B2C3' }).sidingColor, '#a1b2c3');
  assert.equal(normalize({ sidingColor: 'javascript:1' }).sidingColor, 'natural');
  assert.equal(normalize({ roofColor: '#123456' }).roofColor, 'charcoal', 'shingles come in families, not any colour');
  assert.equal(normalize({}).doorColor, 'stained');
  assert.equal(normalize({ doorColor: 'match siding' }).doorColor, 'match siding');
});

test('hex round trip', () => {
  for (const h of ['#000000', '#ffffff', '#5a6e8c']) assert.equal(rgbToHex(hexToRgb(h)), h);
});

test('the door can follow the siding or the trim', () => {
  const d = normalize({ sidingColor: 'navy', trimColor: 'cream', doorColor: 'match trim' });
  assert.deepEqual(paletteOf(d).door, TRIM_FINISHES.cream.rgb);
  assert.deepEqual(paletteOf({ ...d, doorColor: 'match siding' }).door, PAINTS.navy.rgb);
  const shed = buildShed(d);
  const doors = solidsOf(shed).filter((s, i) => shed.fixtures.some((f) => f.kind === 'door' && f.geom === s.geom));
  assert.ok(doors.length > 0);
  for (const s of doors) assert.deepEqual(s.color, TRIM_FINISHES.cream.rgb);
});

test('shingles carry the course texture and their family blend; metal does not', () => {
  const shed = buildShed(normalize({ roofColor: 'gray-brown blend' }));
  const roof = solidsOf(shed).filter((s) => s.layer === 'roofing');
  assert.ok(roof.length);
  for (const s of roof) {
    assert.equal(Math.floor(s.flags) & FINISH.shingle, FINISH.shingle);
    assert.ok(Math.abs(s.flags - Math.floor(s.flags) - SHINGLE_FAMILIES['gray-brown blend'].blend) < 1e-9);
  }
  for (const s of solidsOf(buildShed(normalize({ roofCover: 'metal' }))).filter((x) => x.layer === 'roofing')) assert.equal(s.flags, FINISH.metal);
});

test('lap siding, board and batten and T1-11 each get their own texture', () => {
  // Window glass has its own flag on the siding layer (a sky reflection); it is not the siding's texture.
  const tex = (sidingType) => solidsOf(buildShed(normalize({ sidingType }))).find((s) => s.layer === 'siding' && s.flags && s.flags !== FINISH.glass)?.flags;
  const glass = solidsOf(buildShed(normalize({}))).filter((s) => s.flags === FINISH.glass);
  assert.equal(glass.length, buildShed(normalize({})).fixtures.filter((f) => f.kind === 'window').length, 'every window, and only windows, reflect the sky');
  // Fiber cement is built course by course (lap.mjs), so its shadow lines are real geometry, not a texture.
  assert.equal(tex('fiber cement'), undefined);
  assert.ok(buildShed(normalize({ sidingType: 'fiber cement' })).panels.some((p) => p.kind === 'lap siding'));
  assert.equal(tex('vinyl'), FINISH.lap);
  assert.equal(tex('board and batten'), FINISH.batten);
  assert.equal(tex('T1-11'), FINISH.grooves);
});

test('a paint colour reads by its name in the shopping list and the steps', () => {
  const d = normalize({ ...defaultDesign(), sidingColor: '#5a6e8c' });
  const shed = buildShed(d);
  const est = estimate(shed, examplePrices());
  assert.match(JSON.stringify(est.shopping), /custom colour #5a6e8c/);
  assert.match(JSON.stringify(buildInstructions(shed, est)), /custom colour #5a6e8c/);
  assert.equal(finishName('sage', SIDING_FINISHES), 'sage green');
});

test('colour names are generic, not a maker\'s colour names', () => {
  // A few well-known paint and shingle colour names that would need a citation.
  const brand = /weathered wood|driftwood|onyx black|estate gray|pewter|timberwood|barkwood|hickory|arctic white|iron gray|evening blue|mountain sage/i;
  for (const t of [SIDING_FINISHES, TRIM_FINISHES, DOOR_FINISHES, SHINGLE_FAMILIES]) for (const [k, v] of Object.entries(t)) assert.doesNotMatch(`${k} ${v.label}`, brand);
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, brand);
});
