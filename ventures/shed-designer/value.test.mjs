import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, buildShed } from './model.mjs';
import { estimate } from './estimate.mjs';
import { KITS, valueComparison, valueHtml } from './value.mjs';

test('every kit row is a dated, linked store listing with a price', () => {
  for (const k of KITS) {
    assert.match(k.url, /^https:\/\/www\.(homedepot|lowes)\.com\//, k.name);
    assert.ok(k.price > 500 && k.price < 10000, k.name);
    assert.match(k.seen, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(k.source.length > 0);
    assert.ok(k.lengthFt * k.widthFt <= 100, `${k.name} is over 100 sq ft`);
    assert.ok(!k.specFrom || /^https:\/\//.test(k.specFrom));
  }
  assert.ok(KITS.some((k) => k.installed) && KITS.some((k) => !k.installed));
});

test('storage per dollar for the default design, and kits nearest its size', () => {
  const shed = buildShed(PRESETS['8x12']());
  const est = estimate(shed);
  const c = valueComparison(shed, est, 3);
  assert.equal(c.kits.length, 3);
  for (const k of c.kits) assert.ok(Math.abs(k.sqFt - 96) <= 4);
  assert.ok(Math.abs(c.yours.sqFtPerK - (96 / est.total) * 1000) < 1e-9);
  assert.ok(c.leftOut.Roofing > 0 && c.leftOut.Paint > 0);
  // A DIY kit gets the design's own roofing and paint added, scaled by area; an installed one does not.
  for (const k of c.kits) assert.ok(k.installed ? k.withRoof === k.price : k.withRoof > k.price);
  const html = valueHtml(c);
  assert.match(html, /per \$1,000/);
  assert.match(html, /check the link/);
  assert.ok(!/NaN|undefined/.test(html));
});
