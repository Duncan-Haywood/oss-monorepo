import test from 'node:test';
import assert from 'node:assert/strict';
import { toolItem, postItem } from './hub/compose.mjs';
import { storyboard, timeline, toSrt, scrollExpr, cardHtml, captionHtml, parseArgs, itemsBySlug, postMarkdown, EXAMPLE_WORDS, READ_RATE, SECONDS } from './shorts.mjs';

const tool = toolItem('container-load-planner', '2026-10-20', {
  title: 'Container Load Planner — 3D load planning',
  description: 'Free container load planner for small exporters. Packs cartons into containers.',
});
const post = postItem({ slug: 'nailer', date: '2026-10-24', title: 'Does recoil slow a robot?', description: 'Recoil waits are shorter than the moves. More detail here.', tags: [] });

test('storyboard: five scenes in order, words from the item, upload text from the hub variants', () => {
  const b = storyboard(tool, { clicked: true, focused: true, figure: { value: '432 of 870', label: 'Units in the first container' } });
  assert.deepEqual(b.scenes.map((s) => s.role), ['hook', 'what', 'scroll', 'hold', 'close']);
  assert.equal(b.scenes[0].text, 'Container Load Planner');
  assert.equal(b.scenes[1].text, 'Free container load planner for small exporters.');
  assert.equal(b.scenes[3].caption, '432 of 870: Units in the first container');
  assert.match(b.scenes[4].small, /not legal, tax, financial or professional advice/);
  assert.match(b.post.tiktok.link, /ref=tiktok/);
  assert.match(b.post.youtube.description, /ref=youtube/);
  assert.match(postMarkdown(b), /## TikTok caption/);
});

test('storyboard: captions claim no more than the capture found', () => {
  const blind = storyboard(tool);
  assert.match(blind.scenes[2].caption, /worked-example defaults/);
  assert.equal(blind.scenes[3].caption, 'Worked out on the page');
  const p = storyboard(post);
  assert.equal(p.scenes[2].caption, 'The full write-up');
  assert.doesNotMatch(p.scenes.map((s) => s.caption || s.text).join(' '), /main result/);
  assert.equal(storyboard(post, { focused: true }).scenes[2].caption, 'The write-up, scrolled to its main result');
});

test('cards stay up long enough to read', () => {
  const long = toolItem('x', '', { title: 'X', description: `${'word '.repeat(40)}end.` });
  const what = storyboard(long).scenes[1];
  assert.ok(what.seconds >= what.text.length / READ_RATE - 0.5);
  assert.equal(storyboard(tool).scenes[0].seconds, SECONDS.hook);
});

test('timeline: narration stretches a scene, never shortens it', () => {
  const t = timeline([{ seconds: 2 }, { seconds: 3 }], [4, 1]);
  assert.deepEqual(t.map((s) => [s.start, s.end]), [[0, 4.5], [4.5, 7.5]]);
});

test('srt: one cue per scene with on-screen words', () => {
  const srt = toSrt(timeline(storyboard(tool).scenes));
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,500\nContainer Load Planner\n/);
  assert.equal(srt.match(/-->/g).length, 5);
});

test('scroll expression eases to the target and holds', () => {
  assert.equal(scrollExpr(0, 5), '0');
  const f = (t) => Function('t', 'pow', 'min', `return ${scrollExpr(1000, 4)}`)(t, Math.pow, Math.min);
  assert.equal(f(0), 0);
  assert.equal(f(2), 500);
  assert.equal(f(4), 1000);
  assert.equal(f(9), 1000);
});

test('html escapes page text', () => {
  assert.doesNotMatch(cardHtml({ role: 'what', kicker: '<b>', text: 'a < b & c' }), /<b>|a < b/);
  assert.match(captionHtml('"x"'), /&quot;x&quot;/);
});

test('example buttons are found by their words', () => {
  for (const t of ['Load an example', 'Load the example (three synthetic months)', 'Try an example']) assert.match(t, EXAMPLE_WORDS);
  for (const t of ['Import', 'Clear', 'Examples of use']) assert.doesNotMatch(t, EXAMPLE_WORDS);
});

test('args', () => {
  assert.deepEqual(parseArgs(['render', '--out', 'v', '--slug', 'a, b']).slug, ['a', 'b']);
  assert.throws(() => parseArgs(['render']), /--out/);
  assert.throws(() => parseArgs(['plan', '--piper', 'p']), /together/);
  assert.throws(() => parseArgs(['upload']), /unknown command/);
});

test('items by slug: a venture page, a post, or an error', async () => {
  const [t] = await itemsBySlug(['container-load-planner']);
  assert.equal(t.type, 'tool');
  const [p] = await itemsBySlug(['nailer'], { posts: [{ slug: 'nailer', date: '2026-10-24', title: 'T', description: 'D' }] });
  assert.equal(p.type, 'post');
  await assert.rejects(itemsBySlug(['no-such-thing'], { posts: [] }), /no tool page or post/);
});
