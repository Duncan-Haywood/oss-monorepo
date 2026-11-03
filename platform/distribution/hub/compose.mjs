// One content item in, one fitted variant per platform out.
//
// An item is either a newly launched tool (`platform/pages/launched.json`
// plus the tool page's <title> and meta description) or a new post in
// `docs/posts/` (served at `writing/<slug>/`). Every variant says only what
// the item's own title and description say, links back with the platform's
// `?ref=` tag (so arrivals are counted per platform by the site's counter),
// and states that the tool is free and open source.
//
// COPY TEMPLATES (the experiment)
//
// Short posts rotate between a few honest templates (`TEMPLATES`). The pick is
// a hash of item id and platform, so it is deterministic (a re-run produces
// the same text, which keeps de-duplication stateless) and spreads evenly
// across items. Each template opens with a fixed marker, so `metrics.mjs` can
// read a post back and tell which template it used, and the scoreboard can
// compare them. No template adds a claim the description does not make.

import crypto from 'node:crypto';
import { tagUrl } from '../attribution.mjs';
import { glen, graphemes, extract, thread, longPost, redditBody, hnComment, slides, videoScript } from './content.mjs';

export const BASE_URL = 'https://duncan-haywood.github.io/oss-monorepo/';

/** Short-post templates. `marker` must be the start of every post using it and unique among templates. */
export const TEMPLATES = Object.freeze({
  tool: [
    { id: 'launch', marker: 'New free tool: ', head: (it) => `New free tool: ${it.name}` },
    { id: 'free-first', marker: 'Free and open source: ', head: (it) => `Free and open source: ${it.name}` },
    { id: 'plain', marker: '→ ', head: (it) => `→ ${it.name}` },
  ],
  post: [
    { id: 'writeup', marker: 'New write-up: ', head: (it) => `New write-up: ${it.name}` },
    { id: 'research', marker: 'From our open research: ', head: (it) => `From our open research: ${it.name}` },
  ],
});

/** Which template a post's text used, or null. */
export function templateOf(text) {
  const t = String(text || '').trimStart();
  for (const list of Object.values(TEMPLATES)) for (const tpl of list) if (t.startsWith(tpl.marker)) return tpl.id;
  return null;
}

export function pickTemplate(item, platformId) {
  const list = TEMPLATES[item.type];
  const h = crypto.createHash('sha256').update(`${item.id}|${platformId}`).digest();
  return list[h.readUInt32BE(0) % list.length];
}

export { glen };
export function clip(s, max) {
  if (glen(s) <= max) return String(s);
  if (max <= 1) return '';
  return graphemes(s, max - 1).trimEnd() + '…';
}

const firstSentence = (s) => String(s).split(/(?<=[.!?])\s/)[0].trim();
export const shortName = (title) => String(title).split(/\s[—–|-]\s/)[0].trim();

/** A tool item from its slug, launch date and page metadata. */
export function toolItem(slug, date, { title, description }) {
  return { type: 'tool', id: `tool:${slug}`, slug, date, name: shortName(title), title, description, url: `${BASE_URL}${slug}/` };
}

/** A writing item from a loaded post (`platform/pages/writing.mjs` `loadPosts`). */
export function postItem(post) {
  const item = {
    type: 'post', id: `post:${post.slug}`, slug: post.slug, date: post.date, name: post.title, title: post.title,
    description: post.description, url: `${BASE_URL}writing/${post.slug}/`, tags: post.tags || [],
  };
  // Not enumerable, so JSON plans and the email digest's `source` do not carry whole posts.
  if (post.body) Object.defineProperty(item, 'body', { value: post.body, enumerable: false });
  return item;
}

/** Native platforms that get content from the post body (drafts the owner posts by hand, plus the carousel). */
export const RICH = Object.freeze(['x', 'linkedin', 'reddit', 'hackernews', 'tiktok', 'youtube', 'instagram', 'medium', 'substack']);

/** The post's own lead, findings and limits, or null when the item has no body worth extracting from. */
export function contentOf(item) {
  if (item.type !== 'post' || !item.body) return null;
  const c = extract(item.body, { description: item.description });
  return c.points.length ? { ...c, title: item.title, description: item.description } : null;
}

/** Disclosure for content the owner posts by hand in a community (Reddit, HN): affiliation and AI authorship, stated plainly. */
export const DISCLOSURE = 'Disclosure: this is from my own open-source project; the write-up was drafted by AI agents under my direction. Everything is free and open source.';

const FREE_LINE = { tool: 'Free and open source (MIT), no account needed.', post: 'Open data and code; written by AI agents under the owner\'s direction.' };

/** Fit head + one sentence + link + footer into `max` graphemes; the link and footer are never clipped. */
export function shortPost(head, description, url, footer, max) {
  const tail = `\n\n${url}${footer ? `\n\n${footer}` : ''}`;
  const headFit = clip(head, Math.max(1, max - glen(tail)));
  const room = max - glen(headFit) - glen(tail) - 1;
  // A sentence cut to a few words reads worse than none, so short room drops it and a cut ends on a word.
  const sentence = firstSentence(description);
  let body = '';
  if (glen(sentence) <= room) body = `\n${sentence}`;
  else if (room >= 40) body = `\n${clip(sentence, room).replace(/\s+\S*…$/, '…')}`;
  return headFit + body + tail;
}

/**
 * The variant for one platform. Returns { platform, kind, template, text, title?, body?, script?, url, link } where
 * `url` is the clean canonical page and `link` the tagged one readers follow.
 * `automated` adds the "Automated post." label that bot accounts must carry.
 */
export function variant(item, platform, { automated = platform.mode === 'api' || platform.mode === 'delegated' } = {}) {
  const link = platform.ref ? tagUrl(item.url, platform.ref) : item.url;
  const tpl = pickTemplate(item, platform.id);
  const free = FREE_LINE[item.type];
  const label = automated ? ' Automated post.' : '';
  const base = { platform: platform.id, item: item.id, url: item.url, link, template: null };
  const max = platform.limits.text;
  const c = RICH.includes(platform.id) ? contentOf(item) : null;

  switch (platform.id) {
    case 'instagram': {
      // Caption links are not clickable on Instagram; the bio link carries ?ref=instagram.
      const text = clip(`${tpl.head(item)}\n\n${item.description}\n\n${free} Link in bio.${label}`, max);
      const extra = c ? { slides: slides(c, { close: `${free} Link in bio.` }) } : {};
      return { ...base, template: tpl.id, kind: 'caption', text, needsImage: true, ...extra };
    }
    case 'tiktok':
    case 'youtube': {
      const hook = tpl.head(item);
      const where = platform.id === 'youtube' ? 'in the description' : 'in bio';
      if (c) {
        const script = videoScript(c, { url: item.url, close: `${free} Link ${where}.` });
        const title = clip(item.name, platform.limits.title ?? 100);
        const findings = c.points.map((p) => `- ${p}`).join('\n');
        const body = platform.id === 'youtube'
          ? clip(`${item.description}\n\n${findings}\n\n${link}\n\n${free}`, max)
          : clip(`${hook}. ${item.description} ${free} Link in bio.`, max);
        return { ...base, template: tpl.id, kind: 'video', title, text: body, script };
      }
      const script = [
        `HOOK (0-2 s, on screen): ${hook}`,
        `WHAT (2-10 s): ${firstSentence(item.description)}`,
        item.type === 'tool'
          ? `SHOW (10-25 s): screen-record ${item.url} working through one real example`
          : `SHOW (10-25 s): scroll ${item.url} to its main chart or table and read out one number from it`,
        `CLOSE (25-30 s): "${free} Link ${platform.id === 'youtube' ? 'in the description' : 'in bio'}."`,
      ].join('\n');
      const title = clip(item.name, platform.limits.title ?? 100);
      const body = platform.id === 'youtube' ? `${item.description}\n\n${link}\n\n${free}` : clip(`${hook}. ${item.description} ${free} Link in bio.`, max);
      return { ...base, template: tpl.id, kind: 'video', title, text: body, script };
    }
    case 'hackernews': {
      const title = clip(item.type === 'tool' ? `Show HN: ${item.name} – ${firstSentence(item.description).replace(/\.$/, '')}` : item.title, 80);
      // HN posts are a title and a link; the submitter's first comment is where context goes.
      return { ...base, kind: 'link', title, text: '', ...(c ? { comment: hnComment(c, { link, disclosure: DISCLOSURE }) } : {}) };
    }
    case 'email':
    case 'substack':
    case 'medium':
    case 'devto':
    case 'hashnode':
    case 'reddit': {
      const title = clip(item.title, platform.limits.title ?? 150);
      if (c && platform.id === 'reddit') return { ...base, kind: 'article', title, text: clip(redditBody(c, { link, disclosure: DISCLOSURE }), max) };
      if (c && (platform.id === 'medium' || platform.id === 'substack')) {
        // The whole post, with the canonical link both platforms' importers honour.
        const text = `${item.body.trim()}\n\n---\n\n${free}\n\n*Originally published at ${item.url}*`;
        return { ...base, kind: 'article', title, text: clip(text, max) };
      }
      const body = [
        item.description,
        '',
        `**[${item.type === 'tool' ? `Open ${item.name}` : 'Read the full write-up'}](${link})**`,
        '',
        free,
        item.type === 'tool' ? 'Results are estimates from the inputs you give, not legal, tax, financial or professional advice.' : '',
        platform.id === 'medium' || platform.id === 'devto' || platform.id === 'hashnode' ? `\n*Originally published at ${item.url}*` : '',
      ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim();
      return { ...base, kind: 'article', title, text: clip(body, max) };
    }
    default: {
      if (c && platform.id === 'linkedin') {
        const text = longPost({ head: tpl.head(item), ...c }, { max, link, footer: `${free}${label}` });
        return { ...base, template: tpl.id, kind: 'short', text };
      }
      const text = shortPost(tpl.head(item), item.description, link, `${free}${label}`, max);
      const extra = c && platform.id === 'x' ? { thread: thread(c, { max, link, footer: free }) } : {};
      return { ...base, template: tpl.id, kind: 'short', text, ...extra };
    }
  }
}

/** One email (or newsletter issue) for many items: the digest a subscriber gets per run. */
export function digest(items, platform, { date }) {
  const lines = [`What's new on the free tools catalogue (${date}).`, ''];
  for (const it of items) {
    const link = platform.ref ? tagUrl(it.url, platform.ref) : it.url;
    lines.push(`- **[${it.name}](${link})**: ${it.description}`);
  }
  lines.push('', 'Everything here is free and open source (MIT). Tool results are estimates from the inputs you give, not professional advice.');
  lines.push('You get this because you subscribed; the unsubscribe link is below.');
  const subject = items.length === 1 ? `New: ${items[0].name}` : `${items.length} new free tools and write-ups`;
  return { platform: platform.id, kind: 'digest', title: clip(subject, platform.limits.title ?? 150), text: lines.join('\n'), items: items.map((i) => i.id), source: items };
}

/** Thread-shaped platforms the kit lays a post out for, with their per-post limits. */
const THREADED = Object.freeze({ x: 280, bluesky: 300, threads: 500, mastodon: 500 });

/**
 * Every native shape for one post, for the owner to post or schedule by hand:
 * threads per platform, LinkedIn, Reddit, the HN first comment, carousel
 * slides and a video script. Null when the post has no findings to extract.
 * Links carry each platform's own `?ref=` tag. Pure.
 */
export function kit(item, platforms) {
  const c = contentOf(item);
  if (!c) return null;
  const ref = (id) => { const p = platforms.find((x) => x.id === id); return p?.ref ? tagUrl(item.url, p.ref) : item.url; };
  const free = FREE_LINE.post;
  const threads = Object.fromEntries(Object.entries(THREADED).map(([id, max]) => [id, thread(c, { max, link: ref(id), footer: free })]));
  const tpl = pickTemplate(item, 'linkedin');
  return {
    item: item.id, title: item.title, url: item.url, content: c, threads,
    linkedin: longPost({ head: tpl.head(item), ...c }, { max: 3000, link: ref('linkedin'), footer: free }),
    reddit: { title: clip(item.title, 300), body: redditBody(c, { link: ref('reddit'), disclosure: DISCLOSURE }) },
    hackernews: { title: clip(item.title, 80), url: ref('hackernews'), comment: hnComment(c, { link: ref('hackernews'), disclosure: DISCLOSURE }) },
    slides: slides(c, { close: `${free} Link in bio.` }),
    video: videoScript(c, { url: item.url, close: `${free} Link in the description.` }),
  };
}

/** The kit as one paste-ready markdown file. */
export function kitMarkdown(k) {
  const fence = (t) => ['```', t, '```', ''];
  const out = [`# ${k.title}`, '', `Canonical page: ${k.url}`, '',
    'Every sentence below is quoted from the post; only the labels and the disclosure line are added. Read each venue\'s rules on the day you post. Nothing here was sent.', ''];
  for (const [id, posts] of Object.entries(k.threads)) {
    out.push(`## Thread: ${id} (${posts.length} posts)`, '');
    for (const p of posts) out.push(...fence(p));
  }
  out.push('## LinkedIn', '', ...fence(k.linkedin));
  out.push('## Reddit', '', 'Only in a community whose current rules allow it, once, with the disclosure kept.', '', `**Title:** ${k.reddit.title}`, '', ...fence(k.reddit.body));
  out.push('## Hacker News', '', `**Title:** ${k.hackernews.title}`, `**URL:** ${k.hackernews.url}`, '', 'First comment:', '', ...fence(k.hackernews.comment));
  out.push('## Carousel slides (Instagram, LinkedIn document)', '');
  k.slides.forEach((s, i) => out.push(`${i + 1}. *(${s.role})* ${s.text}`));
  out.push('', '## Short video script', '', ...fence(k.video));
  return out.join('\n');
}
