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
