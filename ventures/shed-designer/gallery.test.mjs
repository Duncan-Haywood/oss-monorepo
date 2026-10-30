// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildShed, normalize } from './model.mjs';
import { GALLERY, GALLERY_LIMIT_SQFT, GALLERY_MAX_RATIO, describeGallery, generateGallery, storageOf } from './gallery.mjs';
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

test('each card that claims a first place has it', () => {
  const best = { price: (c) => -c.total, volume: (c) => c.volume, perDollar: (c) => c.perDollar, floor: (c) => c.floor };
  for (const c of cards.filter((x) => x.rank)) {
    const f = best[/** @type {keyof typeof best} */ (c.rank)];
    for (const o of cards) assert.ok(f(c) >= f(o) - 1e-9, `${c.id} claims the best ${c.rank} but ${o.id} beats it`);
  }
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

test('gallery-data.mjs is what the search picks today (re-run make-gallery.mjs if this fails)', () => {
  const now = readFileSync(new URL('./gallery-data.mjs', import.meta.url), 'utf8');
  assert.equal(now, galleryModule(generateGallery()));
});
