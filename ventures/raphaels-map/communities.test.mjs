import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  STALE_DAYS, CAVEAT, daysSince, isStale, venueBadges, safeUrl, normalizeCommunities, distinctValues, citiesIn,
  filterVenues, verificationCounts, setNote, venueHtml, categoryLabel, CATEGORY_LABELS,
} from './communities.mjs';

// Synthetic rows for logic tests only; the real list is checked separately below.
const V = [
  { id: 'a', public_name: 'Alpha Young Adults', category: 'parish_young_adult', city: 'Denver', state: 'CO', verification: 'fetched_official_page', verified_at: '2026-10-01', public_url: 'https://example.org/a', notes: 'monthly' },
  { id: 'b', public_name: 'Beta Campus', category: 'campus_ministry', city: 'Boulder', state: 'CO', verification: 'listed_from_search', verified_at: null, public_url: 'https://example.org/b' },
  { id: 'c', public_name: 'Gamma Office', category: 'diocesan_young_adult_office', city: 'Seattle', state: 'WA', verification: 'fetched_official_page', verified_at: '2025-01-01', public_url: 'javascript:alert(1)' },
];

test('daysSince and the 180-day stale rule', () => {
  assert.equal(daysSince('2026-10-01', '2026-10-29'), 28);
  assert.equal(daysSince(null, '2026-10-29'), null);
  assert.equal(daysSince('not a date', new Date('2026-10-29T12:00:00Z')), null);
  assert.equal(STALE_DAYS, 180);
  assert.equal(isStale({ verified_at: '2026-05-02' }, '2026-10-29'), false); // 180 days: not yet stale
  assert.equal(isStale({ verified_at: '2026-05-01' }, '2026-10-29'), true); // 181 days
  assert.equal(isStale({ verified_at: null }, '2026-10-29'), false, 'unverified is not "stale"');
});

test('badges: not verified is prominent; verified rows carry date and stale flag', () => {
  assert.deepEqual(venueBadges(V[1], '2026-10-29').map((b) => b.kind), ['not_verified']);
  assert.deepEqual(venueBadges(V[0], '2026-10-29').map((b) => b.kind), ['verified']);
  assert.deepEqual(venueBadges(V[2], '2026-10-29').map((b) => b.kind), ['verified', 'stale']);
  // A row claiming fetched but with no date is treated as not verified.
  assert.deepEqual(venueBadges({ verification: 'fetched_official_page', verified_at: null }, '2026-10-29').map((b) => b.kind), ['not_verified']);
});

test('safeUrl allows only http(s)', () => {
  assert.equal(safeUrl('https://example.org/x'), 'https://example.org/x');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl(''), null);
});

test('normalizeCommunities handles missing files and junk rows', () => {
  assert.equal(normalizeCommunities({ missing: true, reason: 'HTTP 404' }).missing, true);
  assert.equal(normalizeCommunities({ missing: true, reason: 'HTTP 404' }).reason, 'HTTP 404');
  assert.equal(normalizeCommunities(null).missing, true);
  const n = normalizeCommunities({ generated: '2026-10-29', venues: [V[0], null, { id: 1 }, { public_name: 'x' }] });
  assert.equal(n.missing, false);
  assert.equal(n.venues.length, 1);
  assert.deepEqual(normalizeCommunities({}).venues, [], 'empty file is an empty list, not missing');
});

test('filters by state, city, category, text and verified-only', () => {
  assert.deepEqual(distinctValues(V, 'state'), ['CO', 'WA']);
  assert.deepEqual(citiesIn(V, 'CO'), ['Boulder', 'Denver']);
  assert.deepEqual(filterVenues(V, { state: 'CO' }).map((v) => v.id), ['b', 'a'], 'sorted by city');
  assert.deepEqual(filterVenues(V, { state: 'CO', city: 'Denver' }).map((v) => v.id), ['a']);
  assert.deepEqual(filterVenues(V, { category: 'campus_ministry' }).map((v) => v.id), ['b']);
  assert.deepEqual(filterVenues(V, { q: 'MONTHLY' }).map((v) => v.id), ['a']);
  assert.deepEqual(filterVenues(V, { verifiedOnly: true }).map((v) => v.id).sort(), ['a', 'c']);
  assert.deepEqual(filterVenues(V, {}).length, 3);
});

test('verification counts and notes', () => {
  assert.deepEqual(verificationCounts(V), { fetched_official_page: 2, listed_from_search: 1 });
  const n1 = setNote({}, 'a', 'went once, friendly');
  assert.deepEqual(n1, { a: 'went once, friendly' });
  assert.deepEqual(setNote(n1, 'a', '  '), {}, 'blank note removes it');
});

test('venueHtml escapes text, drops unsafe links and shows the not-verified badge', () => {
  const h = venueHtml({ ...V[1], public_name: '<b>x</b>', notes: 'a & b' }, '2026-10-29', '<script>');
  assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(h, /a &amp; b/);
  assert.match(h, /&lt;script&gt;/);
  assert.match(h, /badge-not_verified/);
  const bad = venueHtml(V[2], '2026-10-29');
  assert.doesNotMatch(bad, /javascript:/);
  assert.match(bad, /No usable public link/);
  assert.match(bad, /badge-stale/);
});

test('caveat says existence does not prove a dating pool', () => {
  assert.match(CAVEAT, /does not mean it has a sizable group/);
  assert.equal(categoryLabel('campus_ministry'), 'Campus ministry');
  assert.equal(categoryLabel('new_kind'), 'new kind');
});

// The published list: contract checks (ARCHITECTURE.md, communities.json).
test('data/communities.json follows the contract and the curation rules', () => {
  const doc = JSON.parse(readFileSync(new URL('./data/communities.json', import.meta.url), 'utf8'));
  assert.match(doc.generated, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(doc.method.length > 50);
  assert.ok(Array.isArray(doc.venues) && doc.venues.length > 0);
  const ids = new Set();
  for (const v of doc.venues) {
    assert.ok(!ids.has(v.id), `duplicate id ${v.id}`); ids.add(v.id);
    for (const k of ['id', 'public_name', 'category', 'geo_id', 'city', 'state', 'public_url', 'verified_at', 'verification', 'ministry', 'age_scope_published', 'public_event_frequency', 'notes']) {
      assert.ok(k in v, `${v.id} has ${k}`);
    }
    assert.ok(v.category in CATEGORY_LABELS, `${v.id} category ${v.category}`);
    assert.ok(safeUrl(v.public_url)?.startsWith('https://'), `${v.id} has an https URL`);
    assert.ok(['fetched_official_page', 'listed_from_search'].includes(v.verification), v.id);
    if (v.verification === 'listed_from_search') assert.equal(v.verified_at, null, `${v.id}: unverified rows carry no date`);
    else assert.match(v.verified_at, /^\d{4}-\d{2}-\d{2}$/, v.id);
    assert.ok(v.geo_id === null || /^\d{5}$/.test(v.geo_id), `${v.id} geo_id is a 5-digit FIPS string or null`);
    assert.match(v.state, /^[A-Z]{2}$/);
    assert.ok(typeof v.notes === 'string' && v.notes.length > 20, `${v.id} says what the source showed`);
  }
  // SPEC §3: start with the Colorado Front Range.
  assert.ok(doc.venues.filter((v) => v.state === 'CO').length >= 8);
});

import { NOTES_KEY, loadNotes, saveNotes } from './communities.mjs';

test('notes round-trip through their own storage key; junk and blocked storage are tolerated', () => {
  const m = new Map();
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  assert.deepEqual(loadNotes(s), {});
  assert.equal(saveNotes({ a: 'nice group' }, s), true);
  assert.deepEqual(loadNotes(s), { a: 'nice group' });
  m.set(NOTES_KEY, JSON.stringify({ a: 'ok', b: 3 }));
  assert.deepEqual(loadNotes(s), { a: 'ok' });
  m.set(NOTES_KEY, '[1,2]');
  assert.deepEqual(loadNotes(s), {});
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.deepEqual(loadNotes(broken), {});
  assert.equal(saveNotes({}, broken), false);
});
