import test from 'node:test';
import assert from 'node:assert/strict';
import { checkListing, hasBlocking, LIMITS, summarizeLimits } from './engine.mjs';

const ids = (r) => r.findings.map((f) => f.id);

test('clean iOS listing has no findings', () => {
  const r = checkListing({ store: 'ios', fields: { name: 'Streakly', subtitle: 'Daily habit tracker', keywords: 'routine,goals,planner,checklist,reminder,journal,mood,focus,timer,diary,wellness,notes,calendar', description: 'Build habits that stick.' } });
  assert.deepEqual(ids(r), []);
});

test('over-limit name and keywords are danger', () => {
  const r = checkListing({ store: 'ios', fields: { name: 'x'.repeat(31), keywords: 'a'.repeat(101) } });
  assert.equal(r.findings.filter((f) => f.id === 'over-limit').length, 2);
  assert.ok(hasBlocking(r.findings));
});

test('limits count code points, not UTF-16 units', () => {
  const r = checkListing({ store: 'play', fields: { title: '🎯'.repeat(30) } });
  assert.ok(!ids(r).includes('over-limit'));
});

test('empty required field', () => {
  assert.ok(ids(checkListing({ store: 'play', fields: {} })).includes('missing-required'));
});

test('keyword field: spaces, duplicates, plurals, name overlap, generic words', () => {
  const r = checkListing({ store: 'ios', fields: { name: 'Streakly Habit', keywords: 'habit, routine,routine,goal,goals,app,free' } });
  for (const id of ['keyword-spaces', 'keyword-duplicate', 'keyword-plural', 'keyword-in-name', 'keyword-generic']) assert.ok(ids(r).includes(id), id);
});

test('keyword field separated by spaces', () => {
  assert.ok(ids(checkListing({ store: 'ios', fields: { name: 'A', keywords: 'habit routine goals' } })).includes('keyword-separator'));
});

test('empty keyword entry and unused room', () => {
  const r = checkListing({ store: 'ios', fields: { name: 'A', keywords: 'habit,,goals,' } });
  assert.ok(ids(r).includes('keyword-empty-entry'));
  assert.ok(ids(r).includes('keyword-unused'));
});

test('play title: promo claim and emoji are danger', () => {
  const r = checkListing({ store: 'play', fields: { title: '#1 Best Habit App 🎯' } });
  assert.ok(ids(r).includes('promo-in-name'));
  assert.ok(ids(r).includes('emoji-in-title'));
  assert.ok(hasBlocking(r.findings));
});

test('ios promo name is a notice, not a block', () => {
  const r = checkListing({ store: 'ios', fields: { name: 'Best Habit Tracker' } });
  assert.ok(ids(r).includes('promo-in-name'));
  assert.ok(!hasBlocking(r.findings));
});

test('"free" inside another word is not a promo term', () => {
  assert.ok(!ids(checkListing({ store: 'ios', fields: { name: 'Carefree Planner' } })).includes('promo-in-name'));
});

test('placeholder text', () => {
  assert.ok(ids(checkListing({ store: 'ios', fields: { name: 'A', description: 'Lorem ipsum dolor' } })).includes('placeholder'));
});

test('subtitle that repeats the name', () => {
  assert.ok(ids(checkListing({ store: 'ios', fields: { name: 'Streakly Habit Tracker', subtitle: 'Habit tracker' } })).includes('subtitle-repeats-name'));
});

test('keyword stuffing in a description', () => {
  const stuffed = Array(12).fill('tracker').join(' ') + ' ' + Array.from({ length: 40 }, (_, i) => 'word' + 'abcdefghij'[i % 10] + i).join(' ');
  assert.ok(ids(checkListing({ store: 'ios', fields: { name: 'A', description: stuffed } })).includes('keyword-stuffing'));
});

test('other-platform mention', () => {
  assert.ok(ids(checkListing({ store: 'ios', fields: { name: 'A', description: 'Also on Android.' } })).includes('other-platform'));
  assert.ok(ids(checkListing({ store: 'play', fields: { title: 'A', full_description: 'Loved on iPhone.' } })).includes('other-platform'));
});

test('avoid terms are danger and case-insensitive', () => {
  const r = checkListing({ store: 'ios', fields: { name: 'A', keywords: 'uber,rides' }, avoid: ['Uber'] });
  assert.ok(ids(r).includes('avoided-term'));
  assert.ok(hasBlocking(r.findings));
});

test('unknown store throws; summarizeLimits reports usage', () => {
  assert.throws(() => checkListing({ store: 'x' }));
  const s = summarizeLimits('ios', { name: 'abc' });
  assert.equal(s.find((x) => x.field === 'name').used, 3);
  assert.equal(s.find((x) => x.field === 'name').max, LIMITS.ios.name);
});
