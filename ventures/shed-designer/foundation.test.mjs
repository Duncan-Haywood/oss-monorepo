import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDesign, buildShed, normalize, BLOCKS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { integrity } from './integrity.mjs';
import { buildInstructions, instructionsMarkdown } from './instructions.mjs';
import { leverOptions } from './costlevers.mjs';

const piers = (x = {}) => buildShed(normalize({ ...defaultDesign(), foundation: 'piers', ...x }));

test('a pier is drawn and checked as the square of its tube\'s round area', () => {
  const p = /** @type {any} */ (BLOCKS).piers;
  assert.ok(Math.abs(p.along * p.across - Math.PI * (p.tubeIn / 2) ** 2) < 0.5);
});

test('piers: concrete by the bag from the hole bottom to 4" above grade, tubes cut to length, no gravel', () => {
  const s = piers();
  const k = s.dims;
  assert.equal(k.pierLen, 28);
  // 11-1/2" tube x 28" = 1.684 cu ft a pier; 12 piers = 20.2 cu ft = 34 bags at 0.6.
  assert.ok(Math.abs(k.pierCuFt - (Math.PI * 5.75 ** 2 * 28) / 1728) < 1e-9);
  assert.equal(k.pierBags, Math.ceil((k.blockCount * k.pierCuFt) / 0.6));
  assert.equal(k.pierTubes, k.blockCount, 'a 28" pier leaves no second piece in a 48" tube');
  assert.equal(piers({ pierDepth: 18 }).dims.pierTubes, Math.ceil(k.blockCount / 2), 'two 22" piers a tube');
  assert.equal(k.gravelCuYd + k.baseBags, 0);
  const est = estimate(s);
  const names = est.shopping.map((r) => r.name).join('|');
  assert.match(names, /form tube/);
  assert.match(names, /Concrete mix, 80 lb/);
  assert.doesNotMatch(names, /Paver base|Crushed stone|fabric|Solid concrete block/);
  const bag = est.shopping.find((r) => /Concrete mix/.test(r.name));
  assert.equal(bag.qty, k.pierBags);
  assert.equal(bag.price, 5.91);
});

test('a shed on piers passes integrity, structure and connections, and the steps say to dig to the frost line', () => {
  const s = piers();
  const ig = integrity(s);
  assert.deepEqual([ig.floating.length, ig.clashes.length], [0, 0]);
  assert.ok(structuralChecks(s).ok);
  assert.ok(connectionChecks(s).ok);
  const md = instructionsMarkdown(buildInstructions(s, estimate(s)), s.design.name);
  assert.match(md, /Concrete piers/);
  assert.match(md, /811/);
  assert.match(md, /frost/);
  assert.match(md, /Lay the skids on the 12 piers/);
  assert.doesNotMatch(md, /paver base/i);
});

test('the part options price piers once, with the digging said plainly', () => {
  const rows = leverOptions(defaultDesign()).groups.find((g) => g.title === 'Foundation').rows;
  const p = rows.filter((x) => /piers/.test(x.label));
  assert.equal(p.length, 1);
  assert.ok(p[0].delta > 0);
  assert.match(p[0].note, /811/);
  assert.equal(normalize({ foundation: 'piers', pierDepth: 500 }).pierDepth, 72);
});
