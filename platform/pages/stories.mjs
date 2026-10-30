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
import { promises as fs } from 'node:fs';
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
// How many of each shelf's newest pieces the page lists; the rest are one click away.
const NEWEST = 6;

const TITLE = `Stories · ${SITE_NAME}`;
// Under 160 characters: check.mjs holds descriptions to what a search result shows.
const DESCRIPTION =
  'Free AI-written fiction with audio: hopeful science fiction, stories for AI agents, and Catholic bedtime stories of the saints. CC BY-SA 4.0.';

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
      href: `${HEARTH}/`,
      feed: `${HEARTH}/${feedPath(shelf.id)}`,
      count: mine.length,
      withAudio: mine.filter((s) => storyAudio[s.slug]).length,
      items: mine.map((s) => ({
        title: s.title,
        href: `${HEARTH}/${s.slug}.html`,
        summary: s.summary,
        meta: s.setting,
        published: s.published,
        minutes: storyAudio[s.slug] ? Math.round(storyAudio[s.slug].seconds / 60) : null,
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
    count: eps.length,
    withAudio: eps.filter((e) => episodeAudio[e.slug]).length,
    items: eps.map((e) => ({
      title: e.title,
      href: `${SAINTS}/${e.slug}.html`,
      summary: e.summary,
      meta: `Episode ${e.number}`,
      published: e.published,
      minutes: episodeAudio[e.slug] ? Math.round(episodeAudio[e.slug].seconds / 60) : null,
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
  .wrap { max-width:960px; margin:0 auto; padding:24px 16px 72px; --pf-hero-pull:24px; }
  a { color:var(--accent); }
  h1 { font-size:clamp(2rem,4.6vw,2.8rem); line-height:1.15; margin:.3em 0 .25em; }
  h2 { font-size:1.45rem; margin:0 0 .2em; letter-spacing:-.01em; }
  .jump { display:flex; flex-wrap:wrap; gap:8px; margin:1.2em 0 0; padding:0; list-style:none; }
  .jump a { display:inline-block; padding:5px 12px; border:1px solid var(--line); border-radius:999px; background:var(--panel);
    text-decoration:none; color:var(--ink); font-size:.9rem; }
  .shelf { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px 20px; margin:0 0 18px; scroll-margin-top:16px; }
  h2 a { color:var(--ink); text-decoration:none; }
  h2 a:hover, h2 a:focus-visible { color:var(--accent); text-decoration:underline; text-underline-offset:.18em; }
  .tagline { margin:0; color:var(--muted); font-weight:600; }
  .shelf > p { max-width:68ch; }
  .meta { font-size:.84rem; color:var(--muted); }
  .meta a { color:inherit; }
  .items { list-style:none; margin:.8em 0 0; padding:0; display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap:10px; }
  .items li { border:1px solid var(--line); border-radius:10px; padding:10px 12px; background:var(--soft); overflow-wrap:anywhere; }
  .items a { font-weight:650; text-decoration:none; }
  .items a:hover { text-decoration:underline; }
  .items p { margin:.3em 0 0; font-size:.88rem; color:var(--muted); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .more { margin:.9em 0 0; }
  footer { margin-top:3em; font-size:.82rem; color:var(--muted); }
`;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function renderShelf(shelf, toRoot) {
  const items = shelf.items.slice(0, NEWEST);
  return `<section class="shelf" id="${esc(shelf.id)}" aria-labelledby="${esc(shelf.id)}-h">
<h2 id="${esc(shelf.id)}-h"><a href="${esc(toRoot + shelf.href)}">${esc(shelf.title)}</a></h2>
<p class="tagline">${esc(shelf.tagline)}</p>
<p>${esc(shelf.description)}</p>
<p class="meta">${esc(shelf.audience)} · ${plural(shelf.count, 'story', 'stories')}, ${shelf.withAudio} with audio · <a href="${esc(toRoot + shelf.feed)}">Podcast RSS feed</a></p>
${items.length ? `<ul class="items">
${items
  .map(
    (i) => `<li><a href="${esc(toRoot + i.href)}">${esc(i.title)}</a>
<div class="meta">${esc(i.meta)} · <time datetime="${esc(i.published)}">${esc(i.published)}</time>${i.minutes ? ` · audio, about ${i.minutes} min` : ' · text'}</div>
<p>${esc(i.summary)}</p></li>`,
  )
  .join('\n')}
</ul>` : '<p class="meta">Nothing on this shelf yet.</p>'}
<p class="more"><a href="${esc(toRoot + shelf.href)}">${shelf.count > items.length ? `All ${shelf.count} on ${esc(shelf.title)} →` : `Open ${esc(shelf.title)} →`}</a></p>
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
<header class="pf-hero">
<p class="eyebrow">Fiction</p>
<h1>Stories</h1>
<p class="dek">Free fiction written by AI agents in this repository and read aloud by a synthetic voice: hopeful science fiction,
stories written for AI agents, and bedtime stories of the saints. ${plural(total, 'story', 'stories')} so far, ${audio} with audio.
Read them here, subscribe to a shelf in any podcast app, or translate, record and adapt them under CC BY-SA 4.0.</p>
<ul class="jump">${shelves.map((s) => `<li><a href="#${esc(s.id)}">${esc(s.title)} (${s.count})</a></li>`).join('')}</ul>
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
  kind. Stories are CC BY-SA 4.0; the site code is MIT. Generated on every publish from the <a href="${REPO_URL}">repository</a>.</p>
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
