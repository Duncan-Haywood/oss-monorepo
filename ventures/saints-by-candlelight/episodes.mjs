// Saints by Candlelight: turns the episode scripts in `episodes/` into the
// static site, the podcast feed and the sitemap. Pure functions only;
// `generate.mjs` does the file writing so tests can render without touching disk.

// The build swaps this placeholder for the real Pages origin
// (platform/pages/build.mjs, PLACEHOLDER_ORIGIN). Feeds need absolute URLs, and
// the front-door mirror serves only HTML and scripts, so the feed, cover and
// audio are linked absolutely.
export const SITE = 'https://example.invalid/saints-by-candlelight/';
export const HUB = 'https://example.invalid/';
export const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
export const LICENSE_NAME = 'CC BY-SA 4.0';
export const SOURCE_URL = 'https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/saints-by-candlelight';
export const SPONSOR_URL = 'https://github.com/sponsors/Duncan-Haywood';

export const SHOW = {
  title: 'Saints by Candlelight',
  tagline: 'Bedtime stories of saints, angels and patriarchs',
  description:
    'Lighthearted, faithful bedtime stories of the saints, angels and patriarchs of the Catholic and Orthodox traditions: the Archangel Raphael on the road with Tobias, the lion of Saint Gerasimus, Saint Nicholas and the three bags of gold, and many more. Each episode runs thirty minutes to an hour, slows down as it goes, and says plainly what is Scripture, what is history, what is legend and what we made up. Written by an AI, read by a synthetic voice, free to share under CC BY-SA 4.0.',
  author: 'Saints by Candlelight (written by Claude, an AI)',
  category: 'Religion & Spirituality',
  subcategory: 'Christianity',
};

export const WORDS = { min: 4500, max: 9500 };

export function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Parse `---` front matter (single-line `key: value`, plus the `sources` list) and the script body. */
export function parseEpisode(source, file = '') {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${file}: missing front matter`);
  const meta = { sources: [] };
  let list = null;
  for (const line of match[1].split('\n')) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && list) {
      meta[list].push(item[1].trim());
      continue;
    }
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (!kv) throw new Error(`${file}: bad front-matter line "${line}"`);
    if (kv[2] === '') {
      list = kv[1];
      meta[list] = [];
    } else {
      list = null;
      meta[kv[1]] = kv[2].trim();
    }
  }
  for (const key of ['number', 'slug', 'title', 'published', 'summary', 'tradition', 'feast', 'history', 'legend', 'fiction']) {
    if (!meta[key]) throw new Error(`${file}: front matter needs "${key}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.published)) throw new Error(`${file}: published must be YYYY-MM-DD`);
  return { ...meta, number: Number(meta.number), body: match[2].trim() };
}

/** Script blocks: paragraphs, `[pause]` and `* * *`. */
export function blocks(body) {
  return body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
}

export function wordCount(body) {
  return blocks(body)
    .filter((b) => b !== '[pause]' && b !== '* * *')
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Problems that would make the script read badly aloud or break the show's rules. Empty means fine. */
export function checkScript(episode) {
  const problems = [];
  const words = wordCount(episode.body);
  if (words < WORDS.min || words > WORDS.max) problems.push(`${words} words; want ${WORDS.min} to ${WORDS.max}`);
  const rules = [
    [/\d/, 'digits (write numbers as words)'],
    [/\bSt\.\s/, '"St." (write "Saint")'],
    [/[()]/, 'parentheses (use spoken asides)'],
    [/https?:|www\./, 'a URL'],
    [/\[(?!pause\])[^\]]*\]/, 'square brackets other than [pause]'],
    [/[\u{1F300}-\u{1FAFF}]/u, 'emoji'],
  ];
  for (const [pattern, label] of rules) if (pattern.test(episode.body)) problems.push(`contains ${label}`);
  if (!episode.body.includes('Hello, and welcome to Saints by Candlelight')) problems.push('missing the fixed welcome');
  if (!/written by an AI and read by a synthetic voice/.test(episode.body)) problems.push('missing the AI disclosure');
  if (!/Goodnight, and God bless\.\s*$/.test(episode.body)) problems.push('missing the fixed sign-off at the end');
  return problems;
}

function paragraphHtml(text) {
  return escapeHtml(text).replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
}

export function transcriptHtml(body) {
  return blocks(body)
    .filter((b) => b !== '[pause]')
    .map((b) => (b === '* * *' ? '<hr>' : `<p>${paragraphHtml(b)}</p>`))
    .join('\n');
}

export function formatDuration(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const minutes = (seconds) => `${Math.round(seconds / 60)} min`;
const audioUrl = (ep) => `${SITE}audio/${ep.slug}.mp3`;
const pageUrl = (ep) => `${SITE}${ep.slug}.html`;
const COVER = `${SITE}cover.png`;
const FEED = `${SITE}feed.xml`;
const rfc822 = (date) => new Date(`${date}T20:00:00Z`).toUTCString();
const newestFirst = (episodes) => [...episodes].sort((a, b) => b.number - a.number);

const CSS = `
:root{--bg:#fbf7ef;--ink:#1f1a14;--muted:#5b5146;--card:#fff;--line:#e4dccd;--accent:#8a5a12;--night:#14213d}
@media (prefers-color-scheme:dark){:root{--bg:#121722;--ink:#efe8da;--muted:#b9ad9a;--card:#1b2230;--line:#2c3546;--accent:#e2b35c;--night:#0b1020}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.65 Georgia,"Iowan Old Style",serif}
.hero{background:var(--night);color:#f5ead2;padding:40px 16px 32px}.hero a{color:#f3c97a}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}h1{font-size:2.1rem;line-height:1.2;margin:.2em 0}h2{font-size:1.4rem;margin-top:1.8em}
.lede{font-size:1.1rem;color:#e9dcc0}.muted{color:var(--muted)}a{color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:14px 0}
.card h3{margin:.1em 0 .3em;font-size:1.2rem}audio{width:100%;margin:10px 0}
.facts dt{font-weight:bold;margin-top:.6em}.facts dd{margin:0}
code{background:var(--card);border:1px solid var(--line);padding:2px 6px;border-radius:4px;font-size:.85em;word-break:break-all}
hr{border:0;text-align:center;margin:1.6em 0}hr::after{content:"\\2726";color:var(--accent)}
footer{border-top:1px solid var(--line);margin-top:48px;padding:24px 0;font-size:.85rem;color:var(--muted)}
button{font:inherit;font-size:.85rem;cursor:pointer}
`;

function footer() {
  return `<footer><div class="wrap">
  <p><strong>Written by an AI, read by a synthetic voice.</strong> Every script is written by Claude, an AI model made by Anthropic, and read by the open-source Kokoro text-to-speech voice. The stories follow Scripture, the lives of the saints and their legends, and say in every episode which is which; any invented detail is labelled. They aim to agree with Catholic and Orthodox teaching but are not official teaching of either Church and have not been reviewed by any Church authority.</p>
  <p><strong>No warranty.</strong> These stories are provided free and as-is, without warranty of any kind, express or implied. They are not theological, pastoral or historical advice, and they do not replace a priest, a catechist or a good book on the saints. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from their use.</p>
  <p><strong>Privacy.</strong> No accounts, cookies or analytics vendor. We count anonymous events in this browser only (pages opened and episodes played, nothing about you). <button id="usageToggle" type="button">Turn off counting</button></p>
  <p>Want shorter stories, or to learn a language by listening? Try <a href="../listen-and-learn-audio/">Listen &amp; Learn Audio</a>: graded audio stories and podcast-style episodes, free in your browser.</p>
  <p>For ten-minute saints stories for small children, see Little Lamps in <a href="../hearth-and-horizon/">Hearth &amp; Horizon</a>.</p>
  <p>Stories, audio and cover: <a href="${LICENSE_URL}" rel="license">${LICENSE_NAME}</a>. Code: MIT. <a href="${SOURCE_URL}">Source</a> · <a href="${HUB}">More free tools</a> · <a href="${SPONSOR_URL}">Sponsor on GitHub</a></p>
</div></footer>`;
}

function usageScript(event) {
  return `<script type="module">
import { countUsage, setUsageEnabled, usageAllowed } from "./usage.mjs";
const toggle = document.getElementById("usageToggle");
const render = () => { toggle.textContent = usageAllowed() ? "Turn off counting" : "Turn on counting"; };
toggle.addEventListener("click", () => { setUsageEnabled(!usageAllowed()); render(); });
render();
countUsage("${event}");
for (const audio of document.querySelectorAll("audio")) {
  audio.addEventListener("play", () => countUsage("episode_played"), { once: true });
  audio.addEventListener("ended", () => countUsage("episode_finished"), { once: true });
}
</script>`;
}

function page({ title, description, canonical, jsonLd, body, event, type = 'website' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%231b1f7e'/%3E%3Ctext%20x='16'%20y='23'%20font-size='20'%20font-family='system-ui,sans-serif'%20font-weight='700'%20text-anchor='middle'%20fill='%23fff'%3ES%3C/text%3E%3C/svg%3E">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="application/rss+xml" title="${SHOW.title} podcast" href="${FEED}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${CSS}</style>
</head>
<body>
${body}
${footer()}
${usageScript(event)}
</body>
</html>
`;
}

const seriesLd = () => ({
  '@type': 'PodcastSeries',
  name: SHOW.title,
  url: SITE,
  webFeed: FEED,
  image: COVER,
  description: SHOW.description,
  inLanguage: 'en',
  license: LICENSE_URL,
});

function player(ep, audio) {
  const a = audio[ep.slug];
  return a
    ? `<audio controls preload="none" src="${audioUrl(ep)}"></audio><p class="muted">${minutes(a.seconds)} · <a href="${audioUrl(ep)}" download>Download MP3</a></p>`
    : '<p class="muted">Audio is being recorded. The full script is below.</p>';
}

export function renderEpisodePage(ep, audio = {}) {
  const a = audio[ep.slug];
  const description = `${ep.summary} A free bedtime story podcast episode${a ? ` (${minutes(a.seconds)})` : ''}, with the full script.`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    name: ep.title,
    episodeNumber: ep.number,
    datePublished: ep.published,
    description: ep.summary,
    url: pageUrl(ep),
    partOfSeries: seriesLd(),
    license: LICENSE_URL,
    ...(a ? { duration: `PT${Math.round(a.seconds)}S`, associatedMedia: { '@type': 'MediaObject', contentUrl: audioUrl(ep), encodingFormat: 'audio/mpeg' } } : {}),
  };
  const body = `<header class="hero"><div class="wrap">
<p><a href="./">${SHOW.title}</a> · Episode ${ep.number}</p>
<h1>${escapeHtml(ep.title)}</h1>
<p class="lede">${escapeHtml(ep.summary)}</p>
</div></header>
<main class="wrap">
${player(ep, audio)}
<section class="card"><h2 style="margin-top:0">What's true in this story</h2>
<dl class="facts">
<dt>Who</dt><dd>${escapeHtml(ep.figures || '')}</dd>
<dt>Tradition</dt><dd>${escapeHtml(ep.tradition)}</dd>
<dt>Scripture and history</dt><dd>${escapeHtml(ep.history)}</dd>
<dt>Legend</dt><dd>${escapeHtml(ep.legend)}</dd>
<dt>What we invented</dt><dd>${escapeHtml(ep.fiction)}</dd>
<dt>Feast day</dt><dd>${escapeHtml(ep.feast)}</dd>
</dl>
<h3>Sources</h3>
<ul>${ep.sources.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
</section>
<h2>Full script</h2>
${transcriptHtml(ep.body)}
<p><a href="./">All episodes</a> · <a href="${FEED}">Podcast feed (RSS)</a></p>
</main>`;
  return page({
    title: `${ep.title} | ${SHOW.title}, a bedtime saints podcast`,
    description,
    canonical: pageUrl(ep),
    jsonLd,
    body,
    event: 'episode_page_opened',
    type: 'article',
  });
}

const FAQ = [
  ['Is this a Catholic or an Orthodox podcast?', 'Both. It tells stories that Catholic and Orthodox Christians share: Scripture, the saints of the first thousand years, and the angels. When a saint belongs to only one tradition, the episode says so, and the stories stay off the questions the two Churches disagree about.'],
  ['Are the stories true?', 'Each episode says plainly what comes from Scripture, what is history, what is legend handed down about the saint, and what we invented, such as small conversations or a dog with opinions. Nothing invented changes what happens in Scripture or adds a miracle to a real saint as if it were history.'],
  ['Is it suitable for children?', 'Yes. It is gentle and lighthearted, with no gore and no frightening scenes, and it is written for grown-ups and older children to enjoy together at bedtime. Younger children may prefer the shorter stories in other saints books.'],
  ['Who writes and reads it?', 'The scripts are written by Claude, an AI model made by Anthropic, following a series guide that sets out the doctrine and honesty rules. They are read by Kokoro, an open-source synthetic voice. Every episode says so at the start.'],
  ['How do I listen in a podcast app?', `Copy the feed address ${FEED} into any podcast app that lets you add a show by RSS link, such as Apple Podcasts, Pocket Casts, Overcast or AntennaPod. You can also play every episode on this page.`],
];

export function renderIndex(episodes, audio = {}) {
  const list = newestFirst(episodes)
    .map((ep) => `<article class="card"><h3><a href="${ep.slug}.html">${ep.number}. ${escapeHtml(ep.title)}</a></h3>
<p>${escapeHtml(ep.summary)}</p>
${player(ep, audio)}</article>`)
    .join('\n');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { ...seriesLd(), episode: newestFirst(episodes).map((ep) => ({ '@type': 'PodcastEpisode', name: ep.title, url: pageUrl(ep), episodeNumber: ep.number, datePublished: ep.published })) },
      { '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  };
  const body = `<header class="hero"><div class="wrap">
<p><a href="${HUB}">Free tools and stories</a></p>
<h1>${SHOW.title}: bedtime stories of saints, angels and patriarchs</h1>
<p class="lede">A free podcast of lighthearted, faithful stories from the Catholic and Orthodox traditions, told the way you'd tell an old legend by the fire. Thirty minutes to an hour each, slowing down as they go, so you can drift off before the end and miss nothing important.</p>
</div></header>
<main class="wrap">
<section class="card"><h2 style="margin-top:0">Subscribe</h2>
<p>Add the show to any podcast app that accepts an RSS link:</p>
<p><code id="feedUrl">${FEED}</code> <button type="button" id="copyFeed">Copy</button></p>
<p class="muted">New episodes are added over time. Every one says plainly what is Scripture, what is history, what is legend and what we made up.</p>
</section>
<h2>Episodes</h2>
${list}
<h2>About the show</h2>
<p>${escapeHtml(SHOW.description)}</p>
<h2>Questions</h2>
${FAQ.map(([q, a]) => `<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p>`).join('\n')}
</main>
<script>
document.getElementById("copyFeed").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText(document.getElementById("feedUrl").textContent); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select and copy the link"; }
});
</script>`;
  return page({
    title: `${SHOW.title}: a free bedtime podcast of saints, angels and Bible stories`,
    description: 'Free bedtime story podcast of Catholic and Orthodox saints, angels and patriarchs: lighthearted, faithful, 30 to 60 minute episodes with full scripts and an honest note on what is history and what is legend.',
    canonical: SITE,
    jsonLd,
    body,
    event: 'show_page_opened',
  });
}

export function renderFeed(episodes, audio = {}, podcast = {}) {
  const items = newestFirst(episodes)
    .filter((ep) => audio[ep.slug])
    .map((ep) => {
      const a = audio[ep.slug];
      const notes = `${ep.summary} What's true: ${ep.history} Legend: ${ep.legend} Invented for this episode: ${ep.fiction} Feast day: ${ep.feast} Full script and sources: ${pageUrl(ep)}. Written by Claude, an AI model made by Anthropic, and read by a synthetic voice. ${LICENSE_NAME}.`;
      return `    <item>
      <title>${escapeHtml(ep.title)}</title>
      <link>${pageUrl(ep)}</link>
      <guid isPermaLink="false">saints-by-candlelight-${ep.slug}</guid>
      <pubDate>${rfc822(ep.published)}</pubDate>
      <description>${escapeHtml(notes)}</description>
      <itunes:summary>${escapeHtml(ep.summary)}</itunes:summary>
      <itunes:episode>${ep.number}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
      <enclosure url="${audioUrl(ep)}" length="${a.bytes}" type="audio/mpeg"/>
      <itunes:duration>${formatDuration(a.seconds)}</itunes:duration>
      <podcast:transcript url="${pageUrl(ep)}" type="text/html"/>
    </item>`;
    })
    .join('\n');
  const owner = podcast.ownerEmail
    ? `\n    <itunes:owner><itunes:name>${escapeHtml(podcast.ownerName || SHOW.title)}</itunes:name><itunes:email>${escapeHtml(podcast.ownerEmail)}</itunes:email></itunes:owner>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SHOW.title}</title>
    <link>${SITE}</link>
    <atom:link href="${FEED}" rel="self" type="application/rss+xml"/>
    <description>${escapeHtml(SHOW.description)}</description>
    <language>en</language>
    <copyright>${LICENSE_NAME} (${LICENSE_URL}). Written by Claude, an AI model made by Anthropic.</copyright>
    <podcast:license url="${LICENSE_URL}">cc-by-sa-4.0</podcast:license>
    <podcast:medium>podcast</podcast:medium>
    <podcast:guid>${podcast.guid}</podcast:guid>
    <itunes:author>${escapeHtml(SHOW.author)}</itunes:author>
    <itunes:image href="${COVER}"/>
    <image><url>${COVER}</url><title>${SHOW.title}</title><link>${SITE}</link></image>
    <itunes:category text="${escapeHtml(SHOW.category)}"><itunes:category text="${escapeHtml(SHOW.subcategory)}"/></itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>${owner}
${items}
  </channel>
</rss>
`;
}

export function renderSitemap(episodes) {
  const urls = [SITE, ...newestFirst(episodes).map(pageUrl)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
}
