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

// `--only=c/<id>`: a category or audience page and every tool it lists.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { categoryFor } from './build.mjs';
import { AUDIENCES, MIN_AUDIENCE_TOOLS, audienceGroups, audiencePageId } from './audiences.mjs';

const venturesDir = fileURLToPath(new URL('../../ventures/', import.meta.url));
const catalogue = readdirSync(venturesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => ({ slug: d.name }));

test('c/<audience> keeps exactly the tools the audience page lists', () => {
  const [{ audience, items }] = audienceGroups(catalogue);
  const kept = onlySurfaces(catalogue, [`c/${audiencePageId(audience)}`]).map((s) => s.slug);
  assert.deepEqual(kept, items.map((s) => s.slug));
  assert.ok(kept.length >= MIN_AUDIENCE_TOOLS);
});

test('c/<category> keeps exactly that category, and mixes with plain slugs', () => {
  const first = catalogue[0].slug;
  const id = categoryFor(first).id;
  const members = catalogue.filter((s) => categoryFor(s.slug).id === id).map((s) => s.slug);
  assert.deepEqual(onlySurfaces(catalogue, [`c/${id}/`]).map((s) => s.slug), members);
  const other = catalogue.find((s) => categoryFor(s.slug).id !== id);
  const mixed = onlySurfaces(catalogue, [`c/${id}`, other.slug]).map((s) => s.slug);
  assert.deepEqual(new Set(mixed), new Set([...members, other.slug]));
});

test('an unknown c/ page throws and names the known ones', () => {
  assert.throws(() => onlySurfaces(catalogue, ['c/for-nobody']), /no category or audience page c\/for-nobody \(known: .*for-/);
});

test('an audience too small for a page is refused, not previewed thin', () => {
  const tiny = AUDIENCES[0];
  const few = catalogue.filter((s) => tiny.match.test(s.slug)).slice(0, MIN_AUDIENCE_TOOLS - 1);
  assert.throws(() => onlySurfaces(few.length ? few : [{ slug: 'x' }], [`c/${audiencePageId(tiny)}`]), /under the \d+ an audience page needs/);
});
