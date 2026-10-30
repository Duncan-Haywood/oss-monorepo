import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../app.mjs';

test('prices broader usage above a basic web license', () => {
  const base = { creative: 1000, images: 4, term: 6, territory: 1, exclusivity: 1, rush: 0, channels: [{ name: 'web', factor: 1 }] };
  const broad = { ...base, term: 12, territory: 1.6, exclusivity: 1.75, channels: [{ name: 'paid', factor: 1.4 }, { name: 'outdoor', factor: 1.6 }] };
  assert.ok(calculate(broad).rights > calculate(base).rights);
});

test('default national web license on a $1,200 creative fee is $525 rights / $1,725 total', () => {
  const result = calculate({
    creative: 1200,
    images: 5,
    term: 6,
    territory: 1.25,
    exclusivity: 1,
    rush: 0,
    channels: [{ name: 'web', factor: 1 }],
  });
  assert.equal(result.rights, 525);
  assert.equal(result.total, 1725);
  assert.equal(result.perImage, 105);
});

test('returns per-image allocation and total', () => {
  const result = calculate({ creative: 1200, images: 6, term: 6, territory: 1.25, exclusivity: 1, rush: 10, channels: [{ name: 'web', factor: 1 }] });
  assert.equal(result.perImage, result.rights / 6);
  assert.equal(result.total, 1200 + result.rights);
});

test('adding a channel never lowers the price, even when it is cheaper than the ones already selected', () => {
  // A plain average of the selected channels' factors is not monotonic: starting from
  // outdoor (1.6) and adding web (1) used to average down to 1.3, quoting *less* for a
  // licence that grants *more* usage rights. Regression for that bug.
  const base = { creative: 1200, images: 5, term: 6, territory: 1.25, exclusivity: 1, rush: 0 };
  const outdoorOnly = calculate({ ...base, channels: [{ name: 'outdoor', factor: 1.6 }] });
  const outdoorPlusWeb = calculate({ ...base, channels: [{ name: 'outdoor', factor: 1.6 }, { name: 'web', factor: 1 }] });
  assert.ok(outdoorPlusWeb.total > outdoorOnly.total, 'adding a usage channel must not reduce the quote');
});

test('single-channel pricing is unchanged: the channel factor is just that channel\'s own factor', () => {
  const result = calculate({ creative: 1200, images: 5, term: 6, territory: 1.25, exclusivity: 1, rush: 0, channels: [{ name: 'outdoor', factor: 1.6 }] });
  assert.equal(result.channelFactor, 1.6);
});

test('all four channels on the $1,200/6-month/national/non-exclusive example matches the FAQ copy', () => {
  const result = calculate({
    creative: 1200,
    images: 5,
    term: 6,
    territory: 1.25,
    exclusivity: 1,
    rush: 0,
    channels: [
      { name: 'web', factor: 1 },
      { name: 'paid', factor: 1.4 },
      { name: 'print', factor: 1.25 },
      { name: 'outdoor', factor: 1.6 },
    ],
  });
  assert.equal(result.channelFactor, 2.1475);
  assert.equal(result.rights, 1127.4375);
  assert.equal(result.total, 2327.4375);
});

test('importing calculate on a page without the quote form does not throw', async () => {
  // license-extension-fee.html imports app.mjs through extension.mjs and has no #quote-form.
  const saved = globalThis.document;
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [] };
  try {
    const mod = await import(`../app.mjs?no-form=${Date.now()}`);
    assert.equal(typeof mod.calculate, 'function');
  } finally {
    if (saved === undefined) delete globalThis.document; else globalThis.document = saved;
  }
});
