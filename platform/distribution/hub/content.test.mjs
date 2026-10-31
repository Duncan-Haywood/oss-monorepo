import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plain, blocks, sentences, extract, thread, longPost, redditBody, slides, videoScript, clipWords } from './content.mjs';
import { postItem, variant, kit, kitMarkdown, glen, TEMPLATES, DISCLOSURE } from './compose.mjs';
import { PLATFORMS, byId } from './platforms.mjs';
import { loadPosts } from '../../pages/writing.mjs';
import { main } from '../hub.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const BODY = `The \`detector\`'s **bootstrap** option sets the penalty from [resampled residuals](https://example.org/x) instead of a fixed rule. It had only been tested on simulated noise.

A sweep over 33 real series shows it returns fewer changes on 22 and more on none.

## What changed

- Annual sunspots go from 5 changes to 0, and daily index returns from 7 to 1.
- UK driver deaths keeps its three, including the 1983 seat-belt step.

\`\`\`
not prose 1 2 3 4 5 6 7 8 9
\`\`\`

| a | b |
|---|---|
| 1 | 2 |

The cost: US accidental deaths loses its single cut, a step in 1973 that is believed real. Without labels these are counts, not error rates.

Script: \`ventures/changepoint-detector/eval/real-bootstrap-sweep.mjs\`; output beside it.
`;

const post = postItem({ slug: 'boot', date: '2026-10-31', title: 'What a bootstrap penalty does to 33 real series', description: 'Fewer changes on 22 of 33 real series.', tags: [], body: BODY });

test('plain: links keep their words, markup goes, code spans are kept exactly', () => {
  assert.equal(plain('See [the page](https://x.y/) and **this** _one_.'), 'See the page and this one.');
  assert.equal(plain('Branch `fix-<n>` and `x * pitch / 12` here'), 'Branch fix-<n> and x * pitch / 12 here');
  assert.equal(plain('a <b>bold</b> word'), 'a bold word');
});

test('blocks: drops code fences and tables, keeps headings and list items apart', () => {
  const b = blocks(BODY);
  assert.ok(!b.some((x) => /not prose|\| a \|/.test(x.text)));
  assert.deepEqual(b.filter((x) => x.kind === 'h').map((x) => x.text), ['What changed']);
  assert.equal(b.filter((x) => x.kind === 'li').length, 2);
});

test('sentences: decimals and abbreviations do not split', () => {
  assert.deepEqual(sentences('It rose 1.5 points, e.g. in May. Then it fell.'), ['It rose 1.5 points, e.g. in May.', 'Then it fell.']);
  assert.deepEqual(sentences('The U.S. series is long. So is the U.K. one.'), ['The U.S. series is long.', 'So is the U.K. one.']);
});

test('extract: lead from the opening, numeric findings in post order, limits apart, housekeeping out', () => {
  const c = extract(BODY, { description: post.description });
  assert.match(c.lead, /^The detector's bootstrap option/);
  assert.ok(c.points.length >= 3);
  assert.ok(c.points.every((p) => /\d/.test(p)), c.points.join(' | '));
  const at = (s) => BODY.replace(/[`*]/g, '').indexOf(s.slice(0, 20));
  assert.deepEqual([...c.points].sort((a, b) => at(a) - at(b)), c.points, 'kept in the post\'s order');
  assert.ok(c.limits.some((l) => /simulated noise|counts, not error rates/.test(l)));
  assert.ok(![c.lead, ...c.points, ...c.limits].some((s) => /Script:|\.mjs/.test(s)), 'file paths never reach a feed');
});

test('extract: every sentence is quoted from the post, never written', () => {
  const c = extract(BODY);
  const text = blocks(BODY).map((b) => b.text).join('\n');
  for (const s of [c.lead, ...c.points, ...c.limits]) assert.ok(text.includes(s), s);
});

test('thread: every post fits, is numbered, and the last carries the link and footer whole', () => {
  const c = { title: 'T', ...extract(BODY) };
  for (const max of [280, 300, 500]) {
    const t = thread({ ...c, points: [...c.points, 'Word '.repeat(200)] }, { max, link: 'https://e.org/p/?ref=x', footer: 'Free.' });
    assert.ok(t.length <= 6);
    t.forEach((p, i) => { assert.ok(glen(p) <= max, `${max}: ${glen(p)}`); assert.ok(p.endsWith(` ${i + 1}/${t.length}`)); });
    assert.match(t.at(-1), /https:\/\/e\.org\/p\/\?ref=x[\s\S]*Free\./);
  }
});

test('longPost: drops findings before clipping, and the link survives any length', () => {
  const many = Array.from({ length: 40 }, (_, i) => `Finding ${i} is a long sentence about ${i * 3} series and their changes over time.`);
  const t = longPost({ head: 'New write-up: X', lead: 'Lead.', points: many, limits: ['Only simulated.'] }, { max: 3000, link: 'https://e.org/?ref=linkedin', footer: 'Free.' });
  assert.ok(glen(t) <= 3000);
  assert.ok(t.startsWith('New write-up: X'));
  assert.match(t, /\n\nFull write-up: https:\/\/e\.org\/\?ref=linkedin\n\nFree\.$/);
  assert.ok(!t.includes('…'), 'whole findings dropped, not cut mid-sentence');
});

test('redditBody, slides and videoScript carry the findings and the disclosure', () => {
  const c = { title: 'T', description: 'D.', ...extract(BODY) };
  const r = redditBody(c, { link: 'L', disclosure: DISCLOSURE });
  assert.match(r, /^\*\*TL;DR:\*\* D\.[\s\S]*What we found[\s\S]*Limits[\s\S]*Disclosure: this is from my own open-source project/);
  const s = slides(c, { close: 'Close.' });
  assert.equal(s[0].role, 'title');
  assert.equal(s.at(-1).text, 'Close.');
  assert.ok(s.every((x) => glen(x.text) <= 220));
  assert.match(videoScript(c, { url: 'U', close: 'C' }), /^HOOK[\s\S]*SAY[\s\S]*\d[\s\S]*CLOSE: "C"$/);
});

test('clipWords ends on a word with an ellipsis', () => {
  assert.equal(clipWords('alpha beta gamma delta', 13), 'alpha beta…');
  assert.equal(clipWords('short', 10), 'short');
});

test('variant: a post with a body gets native content on the rich platforms, and still fits', () => {
  const x = variant(post, byId('x'));
  assert.ok(x.thread.length >= 3 && x.thread.every((t) => glen(t) <= 280));
  assert.ok(x.thread.at(-1).includes(x.link));
  const li = variant(post, byId('linkedin'));
  assert.ok(TEMPLATES.post.some((t) => li.text.startsWith(t.marker)), 'keeps the template marker the scoreboard reads');
  assert.match(li.text, /What the data showed:\n• /);
  assert.ok(li.text.includes(li.link));
  assert.match(variant(post, byId('reddit')).text, /\*\*What we found\*\*[\s\S]*Disclosure:/);
  assert.match(variant(post, byId('hackernews')).comment, /Limits:[\s\S]*\?ref=hn/);
  assert.ok(variant(post, byId('instagram')).slides.length >= 4);
  assert.match(variant(post, byId('youtube')).script, /^HOOK[\s\S]*SAY/);
  assert.match(variant(post, byId('medium')).text, /Originally published at https:/);
  for (const p of PLATFORMS.filter((q) => q.mode !== 'discovery')) {
    const v = variant(post, p);
    if (p.limits.text) assert.ok(glen(v.text) <= p.limits.text, p.id);
  }
});

test('variant: api and delegated platforms post exactly what they did before', () => {
  const bare = postItem({ slug: 'boot', date: '2026-10-31', title: post.title, description: post.description, tags: [] });
  for (const p of PLATFORMS.filter((q) => q.mode === 'api' || q.mode === 'delegated')) {
    assert.equal(variant(post, p).text, variant(bare, p).text, p.id);
  }
  assert.ok(!('body' in JSON.parse(JSON.stringify(post))), 'whole posts stay out of JSON plans');
});

test('kit: every shape for one post, links tagged per platform; markdown says it was not sent', () => {
  const k = kit(post, PLATFORMS);
  assert.deepEqual(Object.keys(k.threads), ['x', 'bluesky', 'threads', 'mastodon']);
  assert.ok(k.threads.mastodon.at(-1).includes('?ref=mastodon'));
  assert.ok(k.reddit.body.includes('?ref=reddit') && k.hackernews.url.endsWith('?ref=hn'));
  const md = kitMarkdown(k);
  assert.match(md, /Nothing here was sent\./);
  assert.match(md, /## Thread: x[\s\S]*## LinkedIn[\s\S]*## Reddit[\s\S]*## Hacker News[\s\S]*## Carousel[\s\S]*## Short video script/);
  assert.equal(kit(postItem({ slug: 'n', date: '2026-10-31', title: 'T', description: 'D', tags: [], body: 'Too short.' }), PLATFORMS), null);
});

test('hub kit --slug prints the kit for a real post', async () => {
  const [p] = loadPosts(REPO_ROOT);
  const out = [];
  await main(['kit', '--slug', p.slug], { log: (s) => out.push(s) });
  assert.match(out.join('\n'), /## Thread: x|No posts with findings/);
  await assert.rejects(() => main(['kit', '--slug', 'no-such-post-anywhere'], { log: () => {} }), /no post with slug/);
});

test('every real post: kits quote the post verbatim and fit every limit', () => {
  const posts = loadPosts(REPO_ROOT);
  let kits = 0;
  for (const p of posts) {
    const it = postItem(p);
    const k = kit(it, PLATFORMS);
    if (!k) continue;
    kits += 1;
    const text = blocks(p.body).map((b) => b.text).join('\n');
    for (const s of [k.content.lead, ...k.content.points, ...k.content.limits]) assert.ok(s === p.description || text.includes(s), `${p.slug}: ${s}`);
    for (const [id, ts] of Object.entries(k.threads)) for (const t of ts) assert.ok(glen(t) <= { x: 280, bluesky: 300, threads: 500, mastodon: 500 }[id], `${p.slug} ${id}`);
    for (const pl of PLATFORMS.filter((q) => q.mode === 'draft')) {
      const v = variant(it, pl);
      if (pl.limits.text) assert.ok(glen(v.text) <= pl.limits.text, `${p.slug} ${pl.id}`);
    }
  }
  // Nearly every post has findings worth a thread (1,456 of 1,470 on 2026-10-31).
  assert.ok(kits >= posts.length * 0.9, `${kits} of ${posts.length}`);
});
