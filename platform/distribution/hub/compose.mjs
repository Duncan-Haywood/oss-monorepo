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

const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
export const glen = (s) => [...seg.segment(String(s))].length;
export function clip(s, max) {
  const g = [...seg.segment(String(s))];
  if (g.length <= max) return String(s);
  if (max <= 1) return '';
  return g.slice(0, max - 1).map((x) => x.segment).join('').trimEnd() + '…';
}

const firstSentence = (s) => String(s).split(/(?<=[.!?])\s/)[0].trim();
export const shortName = (title) => String(title).split(/\s[—–|-]\s/)[0].trim();

/** A tool item from its slug, launch date and page metadata. */
export function toolItem(slug, date, { title, description }) {
  return { type: 'tool', id: `tool:${slug}`, slug, date, name: shortName(title), title, description, url: `${BASE_URL}${slug}/` };
}

/** A writing item from a loaded post (`platform/pages/writing.mjs` `loadPosts`). */
export function postItem(post) {
  return {
    type: 'post', id: `post:${post.slug}`, slug: post.slug, date: post.date, name: post.title, title: post.title,
    description: post.description, url: `${BASE_URL}writing/${post.slug}/`, tags: post.tags || [],
  };
}

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

  switch (platform.id) {
    case 'instagram': {
      // Caption links are not clickable on Instagram; the bio link carries ?ref=instagram.
      const text = clip(`${tpl.head(item)}\n\n${item.description}\n\n${free} Link in bio.${label}`, max);
      return { ...base, template: tpl.id, kind: 'caption', text, needsImage: true };
    }
    case 'tiktok':
    case 'youtube': {
      const hook = tpl.head(item);
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
      return { ...base, kind: 'link', title, text: '' };
    }
    case 'email':
    case 'substack':
    case 'medium':
    case 'devto':
    case 'hashnode':
    case 'reddit': {
      const title = clip(item.title, platform.limits.title ?? 150);
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
      const text = shortPost(tpl.head(item), item.description, link, `${free}${label}`, max);
      return { ...base, template: tpl.id, kind: 'short', text };
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
