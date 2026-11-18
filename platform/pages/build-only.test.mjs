// `build.mjs --only=slug[,slug]`: a preview build of a few ventures
// (onlySurfaces in build.mjs). Source-level, so it runs in milliseconds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onlySurfaces } from './build.mjs';

const found = [{ slug: 'ai-bookkeeper' }, { slug: 'shift-roster-builder' }, { slug: 'tip-fica' }];

test('no --only keeps every venture', () => {
  assert.equal(onlySurfaces(found, null), found);
  assert.equal(onlySurfaces(found, []), found);
});

test('--only keeps just the named ventures, in discovery order', () => {
  assert.deepEqual(onlySurfaces(found, ['tip-fica', 'ai-bookkeeper']).map((s) => s.slug),
    ['ai-bookkeeper', 'tip-fica']);
});

test('an unknown slug throws instead of building an empty site', () => {
  assert.throws(() => onlySurfaces(found, ['ai-bookeeper']), /no published venture named ai-bookeeper/);
});
