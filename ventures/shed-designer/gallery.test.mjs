// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildShed, normalize } from './model.mjs';
import { GALLERY, GALLERY_LIMIT_SQFT, GALLERY_MAX_RATIO, RANKS, describeGallery, generateGallery, storageOf } from './gallery.mjs';
import { GALLERY_DESIGNS } from './gallery-data.mjs';
import { galleryModule } from './make-gallery.mjs';

const cards = describeGallery(GALLERY_DESIGNS);

test('the gallery has 8 to 12 designs, one stored for every entry', () => {
  assert.ok(GALLERY.length >= 8 && GALLERY.length <= 12, `${GALLERY.length} entries`);
  assert.deepEqual(GALLERY_DESIGNS.map((g) => g.id), GALLERY.map((g) => g.id));
  assert.equal(new Set(GALLERY.map((g) => g.id)).size, GALLERY.length);
  assert.equal(cards.length, GALLERY.length);
});

test('every gallery design is under the footprint limit, passes every check with margin, and draws without a warning', () => {
  for (const c of cards) {
    assert.ok(c.footprint <= GALLERY_LIMIT_SQFT + 1e-9, `${c.id}: ${c.footprint} sq ft`);
    assert.ok(c.ok, `${c.id} fails a structural or connection check`);
    assert.ok(c.worst <= GALLERY_MAX_RATIO + 1e-9, `${c.id}: a member at ${(c.worst * 100).toFixed(0)}%`);
    assert.deepEqual(buildShed(normalize(c.design)).warnings, [], c.id);
    assert.ok(c.total > 0 && Number.isFinite(c.total), c.id);
  }
});

test('the search left alone what each card is on the list for', () => {
  for (const g of GALLERY) {
    const seed = normalize(g.seed());
    const got = /** @type {any} */ (GALLERY_DESIGNS.find((x) => x.id === g.id)).design;
    for (const k of g.keep) {
      if (k === 'openings') {
        // A stock door or window may replace another; where each sits may not change.
        assert.deepEqual(got.openings.map((o) => [o.id, o.kind, o.wall, o.offset]), seed.openings.map((o) => [o.id, o.kind, o.wall, o.offset]), `${g.id}: openings`);
      } else {
        assert.deepEqual(got[k], seed[k], `${g.id}: ${k}`);
      }
    }
  }
});

test('a card shows its first-place pill only while it leads the gallery on that figure', () => {
  const lead = (/** @type {any[]} */ list) => list.filter((c) => c.first).map((c) => c.id);
  for (const c of cards.filter((x) => x.first)) {
    const f = RANKS[/** @type {keyof typeof RANKS} */ (c.rank)];
    for (const o of cards) assert.ok(f(c) >= f(o) - 1e-9, `${c.id} shows the best ${c.rank} but ${o.id} beats it`);
  }
  // Make the 10x10 the cheapest by fiat: the garden shed loses its pill, nothing else claims it wrongly.
  const priced = describeGallery(GALLERY_DESIGNS, undefined, (shed) => ({ total: shed.design.length === 120 && shed.design.width === 120 ? 1 : 5000, grandTotal: 0 }));
  assert.ok(!lead(priced).includes('garden'));
  assert.ok(lead(priced).every((id) => ['storage', 'square'].includes(id)), lead(priced).join());
});

test('storage figures are measured inside the studs', () => {
  const s = buildShed(normalize(GALLERY[0].seed()));
  const st = storageOf(s);
  const D = s.dims.stud;
  assert.equal(st.footprint, 96);
  assert.ok(Math.abs(st.floor - ((144 - 2 * D) * (96 - 2 * D)) / 144) < 1e-9);
  assert.ok(st.volume > st.floor * 7 && st.volume < st.floor * 12, `${st.volume} cu ft`);
  assert.ok(st.shelf > 0 && st.shelf < (2 * (144 + 96)) / 12);
});

// The search, run now, still produces a gallery that meets every rule above.
// That gallery differing from the stored file is not a failure: other changes
// to the engine or the prices move it all the time. It is reported, and
// `node make-gallery.mjs` brings the file up to date.
test('the search run now still gives a valid gallery; drift from gallery-data.mjs is reported, not failed', (t) => {
  const fresh = generateGallery();
  for (const c of describeGallery(fresh)) {
    assert.ok(c.footprint <= GALLERY_LIMIT_SQFT + 1e-9 && c.ok && c.worst <= GALLERY_MAX_RATIO + 1e-9, c.id);
    assert.deepEqual(buildShed(normalize(c.design)).warnings, [], c.id);
  }
  const now = readFileSync(new URL('./gallery-data.mjs', import.meta.url), 'utf8');
  if (now !== galleryModule(fresh)) {
    const moved = fresh.filter((f) => JSON.stringify(f.design) !== JSON.stringify(GALLERY_DESIGNS.find((g) => g.id === f.id)?.design)).map((f) => f.id);
    t.diagnostic(`gallery-data.mjs is behind the search for: ${moved.join(', ') || 'the change notes'}; run node ventures/shed-designer/make-gallery.mjs`);
  }
  const leaders = describeGallery(fresh).filter((c) => c.rank && !c.first).map((c) => c.id);
  if (leaders.length) t.diagnostic(`no longer first on their figure: ${leaders.join(', ')}`);
});
