/**
 * The fiction section at `stories/`: one page for the creative track's
 * projects, so a visitor finds the stories from the top navigation instead of
 * among ~1,300 tools.
 *
 * The stories themselves stay where they are made and published, as ventures
 * (`ventures/hearth-and-horizon/`, `ventures/saints-by-candlelight/`), each
 * with its own pages and podcast feeds. This page reads the same sources those
 * generators read (story front matter and the audio manifests) and links into
 * them, so a new story shows up here on the next build with nothing to edit.
 *
 * The agents that write them run under `prompts/creative/` (owner,
 * 2026-10-21: about a tenth of scheduled runs; `prompts/routing.json`).
 */
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from '../devlog/markdown.mjs';
import { REPO_URL, SITE_NAME, renderSiteFooterNav, withSiteHeader } from './site-nav.mjs';
import { SHELVES, feedPath } from '../../ventures/hearth-and-horizon/stories.mjs';
import { loadAudio as loadStoryAudio, loadStories } from '../../ventures/hearth-and-horizon/generate.mjs';
import { SHOW } from '../../ventures/saints-by-candlelight/episodes.mjs';
import { loadAudio as loadEpisodeAudio, loadEpisodes } from '../../ventures/saints-by-candlelight/generate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

export const STORIES_PATH = 'stories/';
const HEARTH = 'hearth-and-horizon';
const SAINTS = 'saints-by-candlelight';

/**
 * The ventures whose pages are fiction, by slug, with the short name a
 * breadcrumb shows. The site chrome (`injectChrome` in build.mjs) files their
 * pages under Stories in the header and the trail, not under a tool category:
 * until 2026-11-11 every story page marked "Tools" as the current section and
 * led through "Learning & practice".
 */
export const STORY_VENTURES = Object.freeze({
  [HEARTH]: 'Hearth & Horizon',
  [SAINTS]: SHOW.title,
});
// How many of each shelf's newest pieces the page lists; the rest are one click away.
const NEWEST = 6;
// How many of those a phone shows. Six cards a shelf in one column made the page about 8,300 px
// to "How these are made" at 390 px (2026-11-18); three keep the newest and the "All N" link.
export const PHONE_NEWEST = 3;
// How many of each shelf's newest recorded pieces its "Listen" panel plays in place.
export const LISTEN = 2;

const TITLE = `Stories · ${SITE_NAME}`;
// Under 160 characters: check.mjs holds descriptions to what a search result shows.
const DESCRIPTION =
  'Free AI-written fiction with audio: hopeful science fiction, stories for AI agents, and Catholic bedtime stories of the saints. CC BY-SA 4.0.';

/**
 * A shelf's cover thumbnail, site-relative, or null when the file is missing. The 320 px WebPs
 * (5 to 7 KB each) sit beside the 1,400 px podcast covers (19 to 139 KB), which podcast apps need
 * whole; the hero shows each at about 150 CSS px.
 */
function coverThumb(ventureRoot, prefix, rel) {
  return existsSync(path.join(ventureRoot, rel)) ? `${prefix}${rel}` : null;
}

/** Everything the page shows, read from the ventures' own sources. */
export function loadFiction(root = DEFAULT_ROOT) {
  const hearthRoot = path.join(root, 'ventures', HEARTH);
  const saintsRoot = path.join(root, 'ventures', SAINTS);
  const stories = loadStories(hearthRoot);
  const storyAudio = loadStoryAudio(hearthRoot);
  const episodes = loadEpisodes(saintsRoot);
  const episodeAudio = loadEpisodeAudio(saintsRoot);
  const newestFirst = (a, b) => b.published.localeCompare(a.published) || a.slug.localeCompare(b.slug);
  const shelves = SHELVES.map((shelf) => {
    const mine = stories.filter((s) => s.shelf === shelf.id).sort(newestFirst);
    return {
      id: shelf.id,
      title: shelf.title,
      tagline: shelf.tagline,
      description: shelf.description,
      audience: shelf.audience,
      // Its own section of the venture index: the three shelves share that page, and the first
      // holds 300+ stories, so the bare index buried Little Lamps and For Other Minds below it.
      href: `${HEARTH}/#${shelf.id}`,
      feed: `${HEARTH}/${feedPath(shelf.id)}`,
      cover: coverThumb(hearthRoot, `${HEARTH}/`, `covers/thumbs/${shelf.id}.webp`),
      count: mine.length,
      withAudio: mine.filter((s) => storyAudio[s.slug]).length,
      items: mine.map((s) => ({
        title: s.title,
        href: `${HEARTH}/${s.slug}.html`,
        summary: s.summary,
        meta: s.setting,
        published: s.published,
        minutes: storyAudio[s.slug] ? Math.round(storyAudio[s.slug].seconds / 60) : null,
        audio: storyAudio[s.slug] ? `${HEARTH}/audio/${s.slug}.mp3` : null,
      })),
    };
  });
  const eps = [...episodes].sort(newestFirst);
  shelves.push({
    id: SAINTS,
    title: SHOW.title,
    tagline: SHOW.tagline,
    description: SHOW.description,
    audience: 'For children and grown-ups at bedtime',
    href: `${SAINTS}/`,
    feed: `${SAINTS}/feed.xml`,
    cover: coverThumb(saintsRoot, `${SAINTS}/`, 'cover-320.webp'),
    count: eps.length,
    withAudio: eps.filter((e) => episodeAudio[e.slug]).length,
    items: eps.map((e) => ({
      title: e.title,
      href: `${SAINTS}/${e.slug}.html`,
      summary: e.summary,
      meta: `Episode ${e.number}`,
      published: e.published,
      minutes: episodeAudio[e.slug] ? Math.round(episodeAudio[e.slug].seconds / 60) : null,
      audio: episodeAudio[e.slug] ? `${SAINTS}/audio/${e.slug}.mp3` : null,
    })),
  });
  return shelves;
}

const STYLE = `
  :root { --bg:#f7f8fa; --panel:#fff; --ink:#1b2129; --muted:#56616f; --line:#dde3ea; --accent:#8a3fb0; --soft:#f4eef8; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --panel:#161d26; --ink:#e7edf4; --muted:#a3b0bf; --line:#2a3542;
    --accent:#d2a8f0; --soft:#221b2b; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width:1120px; margin:0 auto; padding:24px 16px 72px; --pf-hero-pull:24px; }
  a { color:var(--accent); }
  h1 { font-size:clamp(2rem,4.6vw,2.8rem); line-height:1.15; margin:.3em 0 .25em; }
  h2 { font-size:1.45rem; margin:0 0 .2em; letter-spacing:-.01em; }
  .jump { display:flex; flex-wrap:wrap; gap:8px; margin:1.2em 0 0; padding:0; list-style:none; }
  .jump a { display:inline-block; padding:5px 12px; border:1px solid var(--line); border-radius:999px; background:var(--panel);
    text-decoration:none; color:var(--ink); font-size:.9rem; }
  /* The shelves as their podcast covers, in the hero's right half on wide screens. Until
     2026-11-17 that half was empty at 1,280 px: the jump links were a row of text chips under
     the dek. One list, two looks: chips on a phone (the covers stay display:none, and lazy
     images that are not rendered are not fetched), a 2 x 2 of covers from 900 px. */
  .jump img { display:none; }
  @media (min-width: 900px) {
    .pf-hero.has-covers { display:grid; grid-template-columns:minmax(0,1fr) 288px; column-gap:40px; align-items:center; }
    .pf-hero.has-covers > .jump { margin:0; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .has-covers .jump a { display:block; padding:0; border:0; background:none; border-radius:12px; color:var(--muted); font-size:.82rem; line-height:1.35; }
    .has-covers .jump img { display:block; width:100%; height:auto; aspect-ratio:1; border-radius:10px; border:1px solid var(--line);
      box-shadow:0 6px 18px rgba(0,0,0,.35); margin:0 0 6px; transition:transform .15s, border-color .15s; }
    .has-covers .jump a:hover img, .has-covers .jump a:focus-visible img { transform:translateY(-2px); border-color:var(--accent); }
    .has-covers .jump a:hover, .has-covers .jump a:focus-visible { color:var(--ink); }
    .has-covers .jump a:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  }
  @media (prefers-reduced-motion: reduce) { .jump img { transition:none; } .has-covers .jump a:hover img { transform:none; } }
  .shelf { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px 20px; margin:0 0 18px; scroll-margin-top:16px; }
  h2 a { color:var(--ink); text-decoration:none; }
  h2 a:hover, h2 a:focus-visible { color:var(--accent); text-decoration:underline; text-underline-offset:.18em; }
  .tagline { margin:0; color:var(--muted); font-weight:600; }
  /* Each shelf wears its cover beside its title. Until 2026-11-18 the covers were only in
     the hero, so a reader who scrolled past it (or arrived at #little-lamps from a link) saw
     four look-alike white panels. Same 320 px thumbnails as the hero, so a wide screen
     fetches nothing new; a phone fetches each (5 to 7 KB) only as its shelf nears the screen. */
  .shelf-title { display:flex; align-items:center; gap:14px; }
  .shelf-title img { flex:none; width:56px; height:56px; border-radius:8px; border:1px solid var(--line); }
  @media (min-width: 900px) { .shelf-title { gap:16px; } .shelf-title img { width:72px; height:72px; border-radius:10px; } }
  .shelf > p, .shelf-intro > p { max-width:68ch; }
  .shelf-intro > p.meta { max-width:none; }
  /* "Listen": the shelf's newest recorded pieces, playable in place. Until
     2026-11-16 the page promised audio in its lede, but none of the 24 newest
     cards had any, and the shelf header's right ~40% was empty at 1,120 px.
     Beside the intro on wide screens; under it, one piece only, on a phone. */
  .listen { margin:.9em 0 0; padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:var(--bg); }
  .listen h3 { margin:0 0 .3em; font-size:.78rem; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
  .listen ol { list-style:none; margin:0; padding:0; display:grid; gap:12px; }
  .listen a { font-weight:650; text-decoration:none; line-height:1.35; }
  .listen a:hover, .listen a:focus-visible { text-decoration:underline; }
  .listen .meta { margin:.1em 0 .35em; }
  .listen audio { display:block; width:100%; height:40px; color-scheme:light dark; }
  @media (max-width: 899px) { .listen li:nth-child(n+2) { display:none; } }
  @media (min-width: 900px) {
    .shelf-head.has-listen { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:0 28px; align-items:start; }
    .shelf-head .listen { margin-top:4px; }
  }
  .meta { font-size:.84rem; color:var(--muted); }
  .meta a { color:inherit; }
  .items { list-style:none; margin:.8em 0 0; padding:0; display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap:10px; }
  /* A card leads with what happens (the hook), not where and when: until
     2026-11-16 the setting line ran 3 to 5 lines on a phone and the hook got
     what was left. The setting keeps one line (full text in its title and on
     the story page); setting, date and audio sit at the foot of the card, lined
     up across a row of cards. The title link covers the card, so the whole card is the target. */
  .items li { position:relative; display:flex; flex-direction:column; border:1px solid var(--line); border-radius:10px; padding:12px 14px;
    background:var(--soft); overflow-wrap:anywhere; transition:border-color .15s; }
  .items li:hover, .items li:focus-within { border-color:var(--accent); }
  .items a { font-weight:650; text-decoration:none; line-height:1.35; }
  .items a::after { content:""; position:absolute; inset:0; border-radius:inherit; }
  .items a:hover { text-decoration:underline; }
  @supports selector(:has(*)) {
    .items a:focus-visible { outline:none; }
    .items li:has(a:focus-visible) { outline:2px solid var(--accent); outline-offset:2px; }
  }
  .items p { margin:.35em 0 0; font-size:.9rem; color:var(--ink); display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
  .items .where { margin:auto 0 0; padding-top:.6em; font-size:.8rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .items .when { margin:.2em 0 0; font-size:.8rem; color:var(--muted); display:flex; flex-wrap:wrap; gap:4px 10px; align-items:center; }
  .items .audio { padding:0 8px; border-radius:999px; border:1px solid var(--line); background:var(--panel); color:var(--ink); }
  @media (prefers-reduced-motion: reduce) { .items li { transition:none; } }
  /* One column (below ~600 px): the PHONE_NEWEST newest cards; "All N" below opens the rest. */
  @media (max-width: 599px) { .items li:nth-child(n+${PHONE_NEWEST + 1}) { display:none; } }
  .more { margin:.9em 0 0; }
  footer { margin-top:3em; font-size:.82rem; color:var(--muted); }
`;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-11-15" as "15 November 2026"; anything else unchanged. */
export function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m || !MONTHS[+m[2] - 1]) return String(iso);
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

/**
 * A shelf's "Listen" panel: its LISTEN newest pieces that have audio, each with a player
 * (`preload="none"`, so nothing downloads until a visitor presses play). Empty when the
 * shelf has no recordings yet.
 */
export function renderListen(shelf, toRoot) {
  const heard = shelf.items.filter((i) => i.audio).slice(0, LISTEN);
  if (!heard.length) return '';
  const id = `${shelf.id}-listen`;
  return `<aside class="listen" aria-labelledby="${esc(id)}">
<h3 id="${esc(id)}">Listen</h3>
<ol>
${heard
  .map(
    (i) => `<li><a href="${esc(toRoot + i.href)}">${esc(i.title)}</a>
<p class="meta">About ${i.minutes} min · <time datetime="${esc(i.published)}">${esc(longDate(i.published))}</time></p>
<audio controls preload="none" src="${esc(toRoot + i.audio)}" aria-label="${esc(`Listen to ${i.title}`)}"></audio></li>`,
  )
  .join('\n')}
</ol>
</aside>`;
}

function renderShelf(shelf, toRoot) {
  const items = shelf.items.slice(0, NEWEST);
  const listen = renderListen(shelf, toRoot);
  return `<section class="shelf" id="${esc(shelf.id)}" aria-labelledby="${esc(shelf.id)}-h">
<div class="shelf-head${listen ? ' has-listen' : ''}">
<div class="shelf-intro">
<div class="shelf-title">${shelf.cover ? `<img src="${esc(toRoot + shelf.cover)}" alt="" width="72" height="72" loading="lazy" decoding="async">` : ''}<div>
<h2 id="${esc(shelf.id)}-h"><a href="${esc(toRoot + shelf.href)}">${esc(shelf.title)}</a></h2>
<p class="tagline">${esc(shelf.tagline)}</p>
</div></div>
<p>${esc(shelf.description)}</p>
<p class="meta">${esc(shelf.audience)} · ${plural(shelf.count, 'story', 'stories')}, ${shelf.withAudio} with audio · <a href="${esc(toRoot + shelf.feed)}">Podcast RSS feed</a></p>
</div>
${listen}
</div>
${items.length ? `<ul class="items">
${items
  .map(
    (i) => `<li><a href="${esc(toRoot + i.href)}">${esc(i.title)}</a>
<p>${esc(i.summary)}</p>
<div class="where" title="${esc(i.meta)}">${esc(i.meta)}</div>
<div class="when"><time datetime="${esc(i.published)}">${esc(longDate(i.published))}</time>${i.minutes ? `<span class="audio">Audio, about ${i.minutes} min</span>` : ''}</div></li>`,
  )
  .join('\n')}
</ul>` : '<p class="meta">Nothing on this shelf yet.</p>'}
<p class="more"><a href="${esc(toRoot + shelf.href)}">${shelf.count > Math.min(items.length, PHONE_NEWEST) ? `All ${shelf.count} on ${esc(shelf.title)} →` : `Open ${esc(shelf.title)} →`}</a></p>
</section>`;
}

/** The page. `toRoot` is the relative path from `stories/` to the site root. */
export function renderStoriesPage(shelves, { baseUrl = '', socialCard = '' } = {}) {
  const toRoot = '../';
  const canonical = baseUrl ? `${baseUrl}${STORIES_PATH}` : '';
  const total = shelves.reduce((n, s) => n + s.count, 0);
  const audio = shelves.reduce((n, s) => n + s.withAudio, 0);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: TITLE,
    description: DESCRIPTION,
    url: canonical || undefined,
    hasPart: shelves.map((s) => ({ '@type': 'CreativeWorkSeries', name: s.title, description: s.tagline, url: baseUrl ? `${baseUrl}${s.href}` : undefined })),
  };
  return withSiteHeader(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(TITLE)}</title>
<meta name="description" content="${esc(DESCRIPTION)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ''}<meta property="og:title" content="${esc(TITLE)}">
<meta property="og:description" content="${esc(DESCRIPTION)}">
<meta property="og:type" content="website">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ''}${socialCard ? `<meta property="og:image" content="${esc(socialCard)}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n` : ''}<meta name="twitter:card" content="${socialCard ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="pf-hero${shelves.every((s) => s.cover) ? ' has-covers' : ''}">
<div class="hero-text">
<p class="eyebrow">Fiction</p>
<h1>Stories</h1>
<p class="dek">Free fiction written by AI agents in this repository and read aloud by a synthetic voice: hopeful science fiction,
stories written for AI agents, and bedtime stories of the saints. ${plural(total, 'story', 'stories')} so far, ${audio} with audio.
Read them here, subscribe to a shelf in any podcast app, or translate, record and adapt them under CC BY-SA 4.0.</p>
</div>
<ul class="jump">${shelves.map((s) => `<li><a href="#${esc(s.id)}">${s.cover ? `<img src="${esc(toRoot + s.cover)}" alt="" width="160" height="160" loading="lazy" decoding="async">` : ''}${esc(s.title)} (${s.count})</a></li>`).join('')}</ul>
</header>
<main>
${shelves.map((s) => renderShelf(s, toRoot)).join('\n')}
<section class="shelf" id="how" aria-labelledby="how-h">
<h2 id="how-h">How these are made</h2>
<p>About one scheduled agent run in ten goes to the creative track instead of tools or research. Each run picks the shelf that
has waited longest, writes one finished piece (or revises one), renders its audio offline with an open-source voice, and
merges it like any other change. The rules each run follows, from science checks to keeping legend apart from history, are
in the repository: the <a href="${REPO_URL}/blob/main/prompts/creative/prompt-0.md">creative track prompt</a>, the
<a href="${REPO_URL}/blob/main/ventures/${HEARTH}/BIBLE.md">Hearth &amp; Horizon series bible</a> and the
<a href="${REPO_URL}/blob/main/ventures/${SAINTS}/PRODUCTION.md">Saints by Candlelight production notes</a>.</p>
</section>
</main>
<footer>
  <p>Fiction, written by Claude (an AI model made by Anthropic) and labelled as such. Settings marked invented are invented, and
  every saints story says what is Scripture, history, legend or our own invention. Provided as-is, with no warranty of any
  kind. Stories are CC BY-SA 4.0; the site code is FSL-1.1-MIT. Generated on every publish from the <a href="${REPO_URL}">repository</a>.</p>
  ${renderSiteFooterNav({ toRoot })}
</footer>
</div>
</body>
</html>
`, { toRoot, current: 'stories' });
}

/** Write `stories/index.html`. */
export async function buildStories(outDir, baseUrl = '', { root = DEFAULT_ROOT, socialCard = '' } = {}) {
  const dir = path.join(outDir, STORIES_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), renderStoriesPage(loadFiction(root), { baseUrl, socialCard }));
}
