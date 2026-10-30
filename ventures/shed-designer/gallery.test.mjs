// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildShed, normalize } from './model.mjs';
import { evaluateDesign } from './designsearch.mjs';
import { GALLERY, GALLERY_LIMIT_SQFT, GALLERY_MAX_RATIO, GALLERY_MAX_PEAK, GALLERY_RULES, HOUSE_FIXED, gallerySearches, generateGallery, sizeOf } from './gallery.mjs';
import { GALLERY_DESIGNS } from './gallery-data.mjs';
import { galleryModule } from './make-gallery.mjs';

const RULES = GALLERY_RULES;

/** Every rule a gallery design must meet, whatever the prices. @param {{ id: string, design: any }[]} list */
function meetsRules(list) {
  for (const g of list) {
    const e = evaluateDesign(g.design, undefined, RULES);
    assert.ok(e.feasible, `${g.id}: ${e.why.join('; ')}`);
    assert.ok(/** @type {any} */ (e.worst).ratio <= GALLERY_MAX_RATIO + 1e-9, `${g.id}: ${JSON.stringify(e.worst)}`);
    assert.ok(e.footprintSqFt <= GALLERY_LIMIT_SQFT + 1e-9, g.id);
    assert.ok(e.peak <= GALLERY_MAX_PEAK + 0.01, `${g.id}: peak ${e.peak}"`);
    assert.deepEqual(buildShed(normalize(g.design)).warnings, [], g.id);
    const card = /** @type {any} */ (GALLERY.find((c) => c.id === g.id));
    if (card.from === 'house') {
      assert.equal(g.design.sidingType, 'fiber cement', `${g.id} keeps the lap siding`);
      assert.equal(g.design.roofCover, 'shingles', `${g.id} keeps the shingles`);
    }
  }
  const keys = list.map((g) => JSON.stringify({ ...g.design, name: '', sidingColor: '' }));
  assert.equal(new Set(keys).size, list.length, 'no two cards are the same shed');
}

test('the stored gallery: 8 to 12 cards, one per entry, each under the limit, every check at 90% or less, no warnings', () => {
  assert.ok(GALLERY.length >= 8 && GALLERY.length <= 12, `${GALLERY.length} cards`);
  assert.deepEqual(GALLERY_DESIGNS.map((g) => g.id), GALLERY.map((g) => g.id));
  meetsRules(GALLERY_DESIGNS);
  assert.ok(new Set(GALLERY_DESIGNS.map((g) => sizeOf(g.design))).size >= 8, 'at least 8 sizes');
  for (const g of GALLERY_DESIGNS) {
    assert.equal(g.design.name, g.title);
    assert.ok(g.reason.length > 20 && !/permit-ready|HOA-approved/i.test(g.reason), g.id);
  }
});

// The search, run now, still gives a gallery that meets every rule, and each
// card's reason is true of the search it came from. The stored file merely
// differing from it is not a failure: other changes to the engine or the
// prices move it all the time. It is reported, and `node make-gallery.mjs`
// brings the file up to date.
test('the search run now gives a valid gallery whose reasons are true; drift from gallery-data.mjs is reported, not failed', (t) => {
  const runs = gallerySearches();
  const fresh = generateGallery(undefined, runs);
  meetsRules(fresh);
  const by = Object.fromEntries(fresh.map((g) => [g.id, g]));
  const cost = (/** @type {any} */ d) => evaluateDesign(d, undefined, RULES).cost;
  const kept = runs.free.kept;
  // No dearer than any kept design: polishCard can make the pick cheaper still.
  if (!/before it in the strip/.test(by.cheapest.reason)) assert.ok(cost(by.cheapest.design) <= Math.min(...kept.map((/** @type {any} */ s) => s.cost)) + 0.005);
  assert.match(by.cheapest.reason, new RegExp(`of the ${kept.length} designs`));
  if (!/before it in the strip/.test(by.value.reason)) {
    const v = (/** @type {any} */ s) => s.storage.usableCuFt / s.cost;
    const e = evaluateDesign(by.value.design, undefined, RULES);
    assert.ok(kept.every((/** @type {any} */ s) => v(s) <= v(e) + 1e-9));
  }
  // "In a size no card before it in the strip shows" is true where it is said.
  fresh.forEach((g, i) => {
    if (/before it in the strip/.test(g.reason)) assert.ok(!fresh.slice(0, i).some((h) => sizeOf(h.design) === sizeOf(g.design)), g.id);
  });
  for (const g of fresh.filter((x) => /** @type {any} */ (GALLERY.find((c) => c.id === x.id)).from === 'house')) {
    for (const k of HOUSE_FIXED) assert.ok(k in g.design, k);
  }
  const now = readFileSync(new URL('./gallery-data.mjs', import.meta.url), 'utf8');
  if (now !== galleryModule(fresh)) {
    const moved = fresh.filter((f) => JSON.stringify(f.design) !== JSON.stringify(GALLERY_DESIGNS.find((g) => g.id === f.id)?.design)).map((f) => f.id);
    t.diagnostic(`gallery-data.mjs is behind the search for: ${moved.join(', ') || 'the reasons'}; run node ventures/shed-designer/make-gallery.mjs`);
  }
});

test('"match a house" keeps exactly the cards in painted lap siding and asphalt shingles', async () => {
  const { galleryEntries, matchesHouse } = await import('./gallery-ui.mjs');
  const all = galleryEntries();
  const house = galleryEntries({ houseOnly: true });
  assert.equal(all.length, GALLERY_DESIGNS.length);
  assert.ok(house.length >= 4 && house.length < all.length, `${house.length} of ${all.length}`);
  for (const e of house) {
    assert.ok(['fiber cement', 'LP SmartSide lap'].includes(e.design.sidingType), e.id);
    assert.equal(e.design.roofCover, 'shingles', e.id);
  }
  // Every card from the lap-and-shingles search is in it.
  for (const c of GALLERY.filter((x) => x.from === 'house')) assert.ok(house.some((e) => e.id === c.id), c.id);
  assert.equal(matchesHouse({ siding: true, sidingType: 'LP SmartSide', roofing: true, roofCover: 'shingles' }), false);
  assert.equal(matchesHouse({ siding: true, sidingType: 'fiber cement', roofing: true, roofCover: 'metal' }), false);
});

test('a first-time visitor opens on the balanced gallery design, which passes cleanly', async () => {
  const { firstDesign } = await import('./gallery-ui.mjs');
  const { structuralChecks } = await import('./checks.mjs');
  const { connectionChecks } = await import('./connections.mjs');
  const d = firstDesign();
  const { estimate } = await import('./estimate.mjs');
  const { defaultDesign } = await import('./model.mjs');
  const cost = (x) => estimate(buildShed(normalize(x))).total;
  const balanced = GALLERY_DESIGNS.find((g) => g.id === 'balanced');
  // The balanced card when it is no dearer than the old 8x12 default; never dearer in any case.
  if (cost(balanced.design) <= cost(defaultDesign()) + 0.005) assert.equal(d.name, balanced.title);
  assert.ok(cost(d) <= cost(defaultDesign()) + 0.005);
  const shed = buildShed(normalize(d));
  assert.deepEqual(shed.warnings, [], 'no "Check these" list on the first view');
  assert.ok(structuralChecks(shed).ok && connectionChecks(shed).ok);
  assert.ok((d.length * d.width) / 144 <= GALLERY_LIMIT_SQFT);
  // A copy: editing the open design never edits the gallery card.
  d.length += 12;
  assert.notEqual(firstDesign().length, d.length);
});
