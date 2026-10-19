import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHANNEL_REFS, REFS, tagUrl, channelTotals, readChannels, report, CHANNELS } from './attribution.mjs';
import { toolUrl } from './bluesky.mjs';
import { composeArticle } from './devto.mjs';
import { composeArticle as composeHashnode } from './hashnode.mjs';

test('every mapped channel exists in channels.yaml, and the tags are exactly what the counter accepts', () => {
  const ids = new Set(readChannels(fs.readFileSync(CHANNELS, 'utf8')).map((c) => c.id));
  for (const id of Object.keys(CHANNEL_REFS)) assert.ok(ids.has(id), `${id} is not in channels.yaml`);
  assert.deepEqual([...new Set(Object.values(CHANNEL_REFS))].sort(), [...REFS].sort());
});

test('tagUrl adds one ref and refuses tags outside the list', () => {
  assert.equal(tagUrl(toolUrl('a'), 'npm'), `${toolUrl('a')}?ref=npm`);
  assert.equal(tagUrl(`${toolUrl('a')}?ref=pypi`, 'npm'), `${toolUrl('a')}?ref=npm`);
  assert.throws(() => tagUrl(toolUrl('a'), 'npmjs'));
});

test('cross-posts tag the links readers follow but keep the canonical URL clean', () => {
  const meta = { title: 'Mileage Log — free', description: 'Logs miles.' };
  const a = composeArticle(meta, toolUrl('m'));
  assert.equal(a.canonical_url, toolUrl('m'));
  assert.match(a.body_markdown, /\?ref=devto/);
  const h = composeHashnode(meta, toolUrl('m'));
  assert.equal(h.originalArticleURL, toolUrl('m'));
  assert.match(h.contentMarkdown, /\?ref=hashnode/);
  assert.doesNotMatch(h.contentMarkdown, /ref=devto/);
});

test('channelTotals separates page loads from channel arrivals', () => {
  const days = { '2026-10-15': { hub: 3, 'ref:npm': 1 }, '2026-10-16': { a: 2, 'ref:npm': 2, 'ref:retired': 9 } };
  assert.deepEqual(channelTotals(days).pageLoads, 5);
  assert.equal(channelTotals(days).refs.npm, 3);
  assert.equal(channelTotals(days).firstDay.npm, '2026-10-15');
  assert.ok(!('retired' in channelTotals(days).refs));
});

test('report suggests "measured" only from a non-zero reading, and says plainly when there is none', () => {
  const channels = [{ id: 'npm-cli-packages', rung: 'live' }, { id: 'bluesky-bot', rung: 'artifact' }, { id: 'nix-flake', rung: 'artifact' }];
  const on = report({ channels, days: { d: { 'ref:npm': 4 } }, counterOn: true }).rows;
  assert.equal(on[0].suggest, 'measured');
  assert.equal(on[1].suggest, null);
  assert.match(on[1].reading, /^0 page loads/);
  assert.match(on[2].reading, /^untagged/);
  const off = report({ channels, days: {}, counterOn: false }).rows;
  assert.match(off[0].reading, /counter is off/);
});

test('the store listings link their web version with their own channel tag', () => {
  assert.equal(CHANNEL_REFS['android-play-store'], 'android');
  assert.equal(CHANNEL_REFS['ios-app-store'], 'ios');
  assert.equal(tagUrl('https://example.com/x/', 'android'), 'https://example.com/x/?ref=android');
});
