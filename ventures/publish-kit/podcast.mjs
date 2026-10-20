// @ts-check
// Builds a podcast RSS feed from a publish.json project: RSS 2.0 with the
// iTunes namespace Apple Podcasts and Spotify read, the Podcasting 2.0
// namespace (podcast:guid, podcast:locked, podcast:transcript), and
// atom:link rel="self". Also lists what a project is still missing, as
// findings an agent can act on one by one. Pure and browser-safe.

import { xml, cdata, rfc822, podcastGuid } from './util.mjs';
import { hhmmss } from './media.mjs';

/**
 * @typedef {{
 *   title: string, description?: string, file?: string, url?: string,
 *   bytes?: number, duration?: number, mime?: string, pubDate?: string,
 *   guid?: string, season?: number, episode?: number,
 *   episodeType?: 'full'|'trailer'|'bonus', explicit?: boolean, image?: string,
 *   transcript?: {url: string, type: string}, link?: string,
 * }} Episode
 * @typedef {{
 *   title: string, description: string, author?: string,
 *   owner?: {name?: string, email?: string}, language: string, link: string,
 *   feedUrl: string, baseUrl?: string, image: string, categories: string[],
 *   explicit?: boolean, type?: 'episodic'|'serial', copyright?: string,
 *   locked?: boolean, guid?: string, complete?: boolean,
 * }} Show
 * @typedef {{kind?: string, show: Show, episodes: Episode[]}} PodcastProject
 * @typedef {{severity: 'danger'|'notice', field: string, message: string, fix?: string}} Finding
 */

// Apple's documented category list: top level, and the subcategories under
// each. Used both to write <itunes:category> nesting and to flag a typo.
export const APPLE_CATEGORIES = {
  'Arts': ['Books', 'Design', 'Fashion & Beauty', 'Food', 'Performing Arts', 'Visual Arts'],
  'Business': ['Careers', 'Entrepreneurship', 'Investing', 'Management', 'Marketing', 'Non-Profit'],
  'Comedy': ['Comedy Interviews', 'Improv', 'Stand-Up'],
  'Education': ['Courses', 'How To', 'Language Learning', 'Self-Improvement'],
  'Fiction': ['Comedy Fiction', 'Drama', 'Science Fiction'],
  'Government': [],
  'History': [],
  'Health & Fitness': ['Alternative Health', 'Fitness', 'Medicine', 'Mental Health', 'Nutrition', 'Sexuality'],
  'Kids & Family': ['Education for Kids', 'Parenting', 'Pets & Animals', 'Stories for Kids'],
  'Leisure': ['Animation & Manga', 'Automotive', 'Aviation', 'Crafts', 'Games', 'Hobbies', 'Home & Garden', 'Video Games'],
  'Music': ['Music Commentary', 'Music History', 'Music Interviews'],
  'News': ['Business News', 'Daily News', 'Entertainment News', 'News Commentary', 'Politics', 'Sports News', 'Tech News'],
  'Religion & Spirituality': ['Buddhism', 'Christianity', 'Hinduism', 'Islam', 'Judaism', 'Religion', 'Spirituality'],
  'Science': ['Astronomy', 'Chemistry', 'Earth Sciences', 'Life Sciences', 'Mathematics', 'Natural Sciences', 'Nature', 'Physics', 'Social Sciences'],
  'Society & Culture': ['Documentary', 'Personal Journals', 'Philosophy', 'Places & Travel', 'Relationships'],
  'Sports': ['Baseball', 'Basketball', 'Cricket', 'Fantasy Sports', 'Football', 'Golf', 'Hockey', 'Rugby', 'Running', 'Soccer', 'Swimming', 'Tennis', 'Volleyball', 'Wilderness', 'Wrestling'],
  'Technology': [],
  'True Crime': [],
  'TV & Film': ['After Shows', 'Film History', 'Film Interviews', 'Film Reviews', 'TV Reviews'],
};

/** "Arts > Books" -> ["Arts", "Books"] @param {string} c */
export function splitCategory(c) {
  return String(c).split('>').map((s) => s.trim()).filter(Boolean);
}

/**
 * The enclosure URL for an episode: its own `url`, else the show's `baseUrl`
 * joined with the file's name.
 * @param {Show} show @param {Episode} ep
 */
export function enclosureUrl(show, ep) {
  if (ep.url) return ep.url;
  if (!ep.file || !show.baseUrl) return '';
  const name = ep.file.split(/[\\/]/).pop() ?? '';
  return show.baseUrl.replace(/\/?$/, '/') + encodeURIComponent(name);
}

/**
 * Everything the project still lacks before a feed built from it would be
 * accepted, most serious first. An empty list means "build it".
 * @param {PodcastProject} project
 * @returns {Finding[]}
 */
export function lintPodcast(project) {
  /** @type {Finding[]} */
  const out = [];
  const show = project.show ?? /** @type {Show} */ ({});
  /** @param {Finding['severity']} severity @param {string} field @param {string} message @param {string} [fix] */
  const add = (severity, field, message, fix) => out.push({ severity, field, message, ...(fix ? { fix } : {}) });

  for (const f of /** @type {const} */ (['title', 'description', 'language', 'link', 'feedUrl', 'image'])) {
    if (!show[f]) add('danger', `show.${f}`, `show.${f} is empty; Apple Podcasts requires it.`);
  }
  if (!show.owner?.email) add('notice', 'show.owner.email', 'No owner email. Apple and Spotify send ownership-verification mail to itunes:owner, and podcast:locked needs it.');
  if (show.feedUrl && !/^https:\/\//.test(show.feedUrl)) add('notice', 'show.feedUrl', 'feedUrl is not https. Apple Podcasts requires feeds and media served over HTTPS.');
  if (show.image && !/\.(jpe?g|png)(\?|$)/i.test(show.image)) add('notice', 'show.image', 'Cover art should be a .jpg or .png URL.');
  if (show.description && show.description.length > 4000) add('danger', 'show.description', `Description is ${show.description.length} characters; Apple's limit is 4000.`);
  const cats = show.categories ?? [];
  if (!cats.length) add('danger', 'show.categories', 'No category. Apple Podcasts requires at least one itunes:category.', 'e.g. "Technology" or "Arts > Books"');
  for (const c of cats) {
    const [top, sub] = splitCategory(c);
    const subs = APPLE_CATEGORIES[/** @type {keyof typeof APPLE_CATEGORIES} */ (top)];
    if (!subs) add('danger', 'show.categories', `"${top}" is not on Apple's top-level category list.`, `one of: ${Object.keys(APPLE_CATEGORIES).join(', ')}`);
    else if (sub && !subs.includes(sub)) add('danger', 'show.categories', `"${sub}" is not a subcategory of "${top}".`, subs.length ? `one of: ${subs.join(', ')}` : `"${top}" has no subcategories`);
  }
  if (show.explicit === undefined) add('notice', 'show.explicit', 'show.explicit is unset; it will be written as false.');

  const eps = project.episodes ?? [];
  if (!eps.length) add('danger', 'episodes', 'No episodes yet. Apple Podcasts will not accept a feed with none.', 'publish-kit podcast add <audio-file> --title "..."');
  const guids = new Map();
  eps.forEach((ep, i) => {
    const at = `episodes[${i}]`;
    if (!ep.title) add('danger', `${at}.title`, 'Episode has no title.');
    if (!enclosureUrl(show, ep)) add('danger', `${at}.url`, `"${ep.title || i}" has no audio URL.`, 'set episodes[].url, or show.baseUrl so the file name is appended to it');
    if (!ep.bytes) add('danger', `${at}.bytes`, `"${ep.title || i}" has no file size; the enclosure length must be the byte count.`, 'publish-kit podcast add reads it from the file');
    if (!ep.duration) add('notice', `${at}.duration`, `"${ep.title || i}" has no duration.`);
    if (!ep.pubDate) add('danger', `${at}.pubDate`, `"${ep.title || i}" has no publish date.`);
    else if (Number.isNaN(new Date(ep.pubDate).getTime())) add('danger', `${at}.pubDate`, `"${ep.pubDate}" is not a date.`);
    if (!ep.guid) add('danger', `${at}.guid`, `"${ep.title || i}" has no guid. Without a stable one, apps re-show or drop the episode when anything about it changes.`);
    else if (guids.has(ep.guid)) add('danger', `${at}.guid`, `guid "${ep.guid}" is also used by episodes[${guids.get(ep.guid)}].`);
    else guids.set(ep.guid, i);
    if (ep.episodeType && !['full', 'trailer', 'bonus'].includes(ep.episodeType)) add('danger', `${at}.episodeType`, `episodeType must be full, trailer or bonus, not "${ep.episodeType}".`);
    if (show.type === 'serial' && !ep.episode) add('notice', `${at}.episode`, 'Serial shows should number every episode so apps play them in order.');
  });
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : 1));
}

/**
 * Renders the feed. Episodes are written newest first.
 * @param {PodcastProject} project
 * @param {{now?: Date, generator?: string}} [opts]
 */
export function buildPodcastFeed(project, opts = {}) {
  const show = project.show;
  const now = opts.now ?? new Date();
  const bool = (/** @type {boolean|undefined} */ v) => (v ? 'true' : 'false');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '<channel>',
    `  <title>${xml(show.title)}</title>`,
    `  <link>${xml(show.link)}</link>`,
    `  <atom:link href="${xml(show.feedUrl)}" rel="self" type="application/rss+xml"/>`,
    `  <description>${cdata(show.description)}</description>`,
    `  <itunes:summary>${cdata(show.description)}</itunes:summary>`,
    `  <language>${xml(show.language)}</language>`,
    show.copyright ? `  <copyright>${xml(show.copyright)}</copyright>` : '',
    `  <lastBuildDate>${rfc822(now)}</lastBuildDate>`,
    `  <generator>${xml(opts.generator ?? 'publish-kit')}</generator>`,
    `  <podcast:guid>${xml(show.guid || (show.feedUrl ? podcastGuid(show.feedUrl) : ''))}</podcast:guid>`,
    show.owner?.email ? `  <podcast:locked owner="${xml(show.owner.email)}">${show.locked === false ? 'no' : 'yes'}</podcast:locked>` : '',
    show.author ? `  <itunes:author>${xml(show.author)}</itunes:author>` : '',
    show.owner ? `  <itunes:owner>${show.owner.name ? `<itunes:name>${xml(show.owner.name)}</itunes:name>` : ''}${show.owner.email ? `<itunes:email>${xml(show.owner.email)}</itunes:email>` : ''}</itunes:owner>` : '',
    `  <itunes:image href="${xml(show.image)}"/>`,
    `  <image><url>${xml(show.image)}</url><title>${xml(show.title)}</title><link>${xml(show.link)}</link></image>`,
    ...(show.categories ?? []).map((c) => {
      const [top, sub] = splitCategory(c);
      return sub
        ? `  <itunes:category text="${xml(top)}"><itunes:category text="${xml(sub)}"/></itunes:category>`
        : `  <itunes:category text="${xml(top)}"/>`;
    }),
    `  <itunes:explicit>${bool(show.explicit)}</itunes:explicit>`,
    `  <itunes:type>${show.type === 'serial' ? 'serial' : 'episodic'}</itunes:type>`,
    show.complete ? '  <itunes:complete>Yes</itunes:complete>' : '',
  ];
  const eps = [...(project.episodes ?? [])].sort((a, b) => new Date(b.pubDate ?? 0).getTime() - new Date(a.pubDate ?? 0).getTime());
  for (const ep of eps) {
    lines.push(
      '  <item>',
      `    <title>${xml(ep.title)}</title>`,
      ep.description ? `    <description>${cdata(ep.description)}</description>` : '',
      ep.description ? `    <content:encoded>${cdata(ep.description)}</content:encoded>` : '',
      ep.link ? `    <link>${xml(ep.link)}</link>` : '',
      `    <guid isPermaLink="false">${xml(ep.guid)}</guid>`,
      ep.pubDate ? `    <pubDate>${rfc822(ep.pubDate)}</pubDate>` : '',
      `    <enclosure url="${xml(enclosureUrl(show, ep))}" length="${ep.bytes ?? 0}" type="${xml(ep.mime || 'audio/mpeg')}"/>`,
      ep.duration ? `    <itunes:duration>${hhmmss(ep.duration)}</itunes:duration>` : '',
      ep.season ? `    <itunes:season>${ep.season}</itunes:season>` : '',
      ep.episode ? `    <itunes:episode>${ep.episode}</itunes:episode>` : '',
      `    <itunes:episodeType>${ep.episodeType || 'full'}</itunes:episodeType>`,
      `    <itunes:explicit>${bool(ep.explicit ?? show.explicit)}</itunes:explicit>`,
      ep.image ? `    <itunes:image href="${xml(ep.image)}"/>` : '',
      ep.transcript?.url ? `    <podcast:transcript url="${xml(ep.transcript.url)}" type="${xml(ep.transcript.type || 'text/vtt')}"/>` : '',
      '  </item>',
    );
  }
  lines.push('</channel>', '</rss>', '');
  return lines.filter((l) => l !== '').join('\n');
}

/**
 * A plain, indexable HTML page for the show: what search engines and people
 * without a podcast app see, linking the feed and every episode's audio.
 * @param {PodcastProject} project
 */
export function buildShowPage(project) {
  const show = project.show;
  const eps = [...(project.episodes ?? [])].sort((a, b) => new Date(b.pubDate ?? 0).getTime() - new Date(a.pubDate ?? 0).getTime());
  const ld = {
    '@context': 'https://schema.org', '@type': 'PodcastSeries', name: show.title, description: show.description,
    url: show.link, webFeed: show.feedUrl, image: show.image, inLanguage: show.language,
    ...(show.author ? { author: { '@type': 'Person', name: show.author } } : {}),
  };
  const items = eps.map((ep) => `<li><h2>${xml(ep.title)}</h2>${ep.pubDate ? `<p><time datetime="${xml(new Date(ep.pubDate).toISOString())}">${xml(new Date(ep.pubDate).toDateString())}</time>${ep.duration ? ` · ${hhmmss(ep.duration)}` : ''}</p>` : ''}<audio controls preload="none" src="${xml(enclosureUrl(show, ep))}"></audio>${ep.description ? `<div>${ep.description}</div>` : ''}</li>`).join('\n');
  return `<!doctype html>
<html lang="${xml(show.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${xml(show.title)} (podcast)</title>
<meta name="description" content="${xml(String(show.description).replace(/<[^>]+>/g, '').slice(0, 155))}">
<link rel="alternate" type="application/rss+xml" title="${xml(show.title)}" href="${xml(show.feedUrl)}">
<meta property="og:title" content="${xml(show.title)}"><meta property="og:image" content="${xml(show.image)}"><meta property="og:type" content="website">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:720px;margin:auto;padding:24px}img{max-width:180px;border-radius:12px}ul{list-style:none;padding:0}li{border-top:1px solid #ddd;padding:12px 0}audio{width:100%}</style>
</head>
<body>
<header><img src="${xml(show.image)}" alt="${xml(show.title)} cover art"><h1>${xml(show.title)}</h1><p>${xml(String(show.description).replace(/<[^>]+>/g, ''))}</p>
<p><a href="${xml(show.feedUrl)}">RSS feed</a> — paste it into any podcast app to subscribe.</p></header>
<ul>
${items}
</ul>
</body>
</html>
`;
}
