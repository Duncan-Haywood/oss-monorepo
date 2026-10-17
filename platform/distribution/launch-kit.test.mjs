import test from 'node:test';
import assert from 'node:assert/strict';
import { composeKit, plan, render, DEFAULT_MAX } from './launch-kit.mjs';
import { toolUrl } from './bluesky.mjs';

const page = '<title>Mileage Log — Free Tracker</title><meta name="description" content="Log business miles privately. Second sentence.">';

test('composeKit links the canonical page, discloses, and respects venue length limits', () => {
  const k = composeKit({ title: 'Mileage Log — Free Tracker', description: 'Log business miles privately. Second sentence.' }, toolUrl('mileage-log'), 'mileage-log');
  assert.ok(k.showHn.title.startsWith('Show HN: Mileage Log'));
  assert.ok(k.showHn.title.length <= 80);
  assert.ok(k.productHunt.tagline.length <= 60);
  assert.ok(k.productHunt.description.length <= 260);
  assert.match(k.showHn.text, /MIT/);
  assert.match(k.showHn.text, /not professional advice/);
  assert.ok(k.awesomeListLine.includes(toolUrl('mileage-log')));
  assert.ok(!/upvote/i.test(k.reddit.body + k.showHn.text));
});

test('plan caps the run, skips pages without metadata, and honours --slug', async () => {
  const launched = { a: '2026-10-15', b: '2026-10-15', c: '2026-10-15', d: '2026-10-15', gone: '2026-10-15' };
  const readPage = async (s) => (s === 'gone' ? null : page);
  const kits = await plan({ launched, today: '2026-10-16', readPage });
  assert.equal(kits.length, DEFAULT_MAX);
  const one = await plan({ launched, today: '2026-10-16', readPage, slug: 'd' });
  assert.deepEqual(one.map((k) => k.url), [toolUrl('d')]);
});

test('render tells the owner nothing was sent and to read venue rules', async () => {
  const kits = await plan({ launched: { a: '2026-10-15' }, today: '2026-10-16', readPage: async () => page });
  const md = render(kits);
  assert.match(md, /Nothing here was sent/);
  assert.match(md, /rules on the day/);
});
