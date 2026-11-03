// Catholic Shorts: parse shorts/*.md, check them against PRODUCTION.md's rules,
// and render the static site (index, one page per short, sitemap) plus a
// vertical 1080x1920 SVG card per short. No dependencies, no network.

export const SITE = 'https://example.invalid/catholic-shorts/';
export const HUB = 'https://example.invalid/';
export const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';
export const LICENSE_NAME = 'CC BY-SA 4.0';
export const SOURCE_URL = 'https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/catholic-shorts';
export const SPONSOR_URL = 'https://github.com/sponsors/Duncan-Haywood';

export const SHOW = {
  title: 'Catholic Shorts',
  tagline: 'One minute of apologetics, a saint or a story',
  description:
    'Free one-minute Catholic videos and scripts: apologetics answers with every Scripture and Catechism reference cited and the strongest objection stated fairly, saints of the day told truthfully, and short faithful stories labelled as fiction. Written by an AI, CC BY-SA, free to repost.',
};

export const KINDS = {
  apologetics: 'Apologetics',
  'faith-and-science': 'Faith and science',
  saint: 'Saint of the day',
  story: 'Story',
};

// About 150 spoken words is a minute at the narrator's pace; the platforms'
// short-video limits start at 60 to 90 seconds, so stay inside 110 to 180.
export const MIN_WORDS = 110;
export const MAX_WORDS = 180;
const CCC_MAX = 2865; // the Catechism's last paragraph
const REQUIRED = ['number', 'slug', 'title', 'kind', 'published', 'hook', 'summary'];
const SECTIONS = ['Script', 'On screen', 'Fair to the other side', 'Caption'];

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function unquote(v) {
  const t = v.trim();
  return /^(['"]).*\1$/.test(t) ? t.slice(1, -1) : t;
}

export function parseShort(text, file = 'short') {
  if (!text.startsWith('---\n')) throw new Error(`${file}: no front matter`);
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) throw new Error(`${file}: unterminated front matter`);
  const meta = { sources: [] };
  let list = null;
  for (const line of text.slice(4, end).split('\n')) {
    if (!line.trim()) continue;
    const item = line.match(/^- (.+)$/);
    if (item && list) { meta[list].push(item[1].trim()); continue; }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) throw new Error(`${file}: cannot read front matter line "${line}"`);
    if (kv[2] === '') { list = kv[1]; meta[list] = []; } else { list = null; meta[kv[1]] = unquote(kv[2]); }
  }
  for (const key of REQUIRED) if (!meta[key]) throw new Error(`${file}: front matter needs ${key}`);
  meta.number = Number(meta.number);
  const sections = {};
  let current = null;
  for (const line of text.slice(end + 5).split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) { current = h[1].trim(); sections[current] = []; continue; }
    if (current) sections[current].push(line);
  }
  for (const name of SECTIONS) if (!sections[name]) throw new Error(`${file}: missing "## ${name}"`);
  const paragraphs = (lines) => lines.join('\n').split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return {
    ...meta,
    script: paragraphs(sections.Script),
    beats: sections['On screen'].map((l) => l.match(/^- (.+)$/)?.[1].trim()).filter(Boolean),
    fair: paragraphs(sections['Fair to the other side']).join(' '),
    caption: paragraphs(sections.Caption).join(' '),
  };
}

export const wordCount = (paras) => paras.join(' ').split(/\s+/).filter(Boolean).length;

/** Problems a short has against PRODUCTION.md, as strings; empty means ok. */
export function checkShort(s) {
  const problems = [];
  const words = wordCount(s.script);
  if (words < MIN_WORDS || words > MAX_WORDS) problems.push(`script is ${words} words, want ${MIN_WORDS} to ${MAX_WORDS}`);
  if (!KINDS[s.kind]) problems.push(`unknown kind "${s.kind}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug)) problems.push('slug must be kebab-case');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.published)) problems.push('published must be YYYY-MM-DD');
  if (!s.sources.length) problems.push('needs at least one source');
  if (s.beats.length < 2) problems.push('needs at least two on-screen beats');
  if (s.fair.length < 80) problems.push('"Fair to the other side" is too thin to be fair');
  if (s.caption.length > 220) problems.push('caption over 220 characters');
  if (s.kind === 'story' && !/fiction|invented/i.test(`${s.fair} ${s.sources.join(' ')}`)) problems.push('a story must say it is fiction');
  for (const src of s.sources) {
    const m = src.match(/^Catechism of the Catholic Church (.+)$/);
    if (!m) continue;
    for (const n of m[1].split(/[,\s]+/).filter(Boolean).map(Number)) {
      if (!Number.isInteger(n) || n < 1 || n > CCC_MAX) problems.push(`no Catechism paragraph "${n}"`);
    }
  }
  return problems;
}

const pageUrl = (s) => `${SITE}${s.slug}.html`;
const newestFirst = (list) => [...list].sort((a, b) => b.published.localeCompare(a.published) || b.number - a.number);

const CSS = `
:root{--bg:#f8f5ee;--ink:#1d1a16;--muted:#5d554a;--card:#fff;--line:#e2dacb;--accent:#7a1f2b;--gold:#9a6b10}
@media (prefers-color-scheme:dark){:root{--bg:#14161c;--ink:#eee8dc;--muted:#b6ab99;--card:#1d212b;--line:#2d3340;--accent:#e88a96;--gold:#e2b35c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.6 Georgia,"Iowan Old Style",serif}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}a{color:var(--accent)}
.hero{padding:40px 0 20px;border-bottom:1px solid var(--line)}.hero h1{font-size:2rem;line-height:1.2;margin:.2em 0}
.lede{color:var(--muted);font-size:1.1rem}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:18px 0}
.kind{font:600 .8rem/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--gold)}
.script p{margin:.7em 0}.beats li{margin:.2em 0}video{width:100%;max-width:360px;display:block;margin:12px auto;border-radius:12px;background:#000}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.grid .card{margin:0}.grid h3{margin:.3em 0;font-size:1.1rem}
footer{margin-top:40px;padding:24px 0;border-top:1px solid var(--line);color:var(--muted);font-size:.9rem}
button{font:inherit;font-size:.85rem;padding:2px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);cursor:pointer}
`;

function footer() {
  return `<footer><div class="wrap">
  <p><strong>Written by an AI.</strong> Every script is written by Claude, an AI model made by Anthropic, and the videos are read by the open-source Kokoro synthetic voice. Scripture and Catechism references are checked against the texts before publishing, and every apologetics short states the strongest objection fairly. The shorts aim to agree with Catholic teaching but are not official teaching of the Church and have not been reviewed by any Church authority. Stories marked as stories are fiction.</p>
  <p><strong>No warranty.</strong> Provided free and as-is, without warranty of any kind, express or implied. Not theological or pastoral advice, and no substitute for a priest, a catechist or the Catechism itself. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from their use.</p>
  <p><strong>Privacy.</strong> No accounts, cookies or analytics vendor. We count anonymous events in this browser only (pages opened and videos played, nothing about you). <button id="usageToggle" type="button">Turn off counting</button></p>
  <p>Longer listening: <a href="../saints-by-candlelight/">Saints by Candlelight</a> (bedtime saints podcast) and <a href="../hearth-and-horizon/">Hearth &amp; Horizon</a> (stories from a Catholic worldview).</p>
  <p>Scripts, cards and videos: <a href="${LICENSE_URL}" rel="license">${LICENSE_NAME}</a>, free to repost with credit. Code: MIT. <a href="${SOURCE_URL}">Source</a> · <a href="${HUB}">More free tools</a> · <a href="${SPONSOR_URL}">Sponsor on GitHub</a></p>
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
for (const v of document.querySelectorAll("video")) {
  v.addEventListener("play", () => countUsage("video_played"), { once: true });
  v.addEventListener("ended", () => countUsage("video_finished"), { once: true });
}
for (const a of document.querySelectorAll("[data-count]")) a.addEventListener("click", () => countUsage(a.dataset.count));
</script>`;
}

function page({ title, description, canonical, jsonLd, body, event, type = 'website', image }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%237a1f2b'/%3E%3Cpath%20d='M14%206h4v7h7v4h-7v9h-4v-9H7v-4h7z'%20fill='%23fff'/%3E%3C/svg%3E">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
${image ? `<meta property="og:image" content="${image}">\n` : ''}<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
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

function videoBlock(s, media) {
  const m = media[s.slug];
  if (!m) return '';
  return `<video controls preload="none" playsinline poster="cards/${s.slug}.svg" src="video/${s.slug}.mp4"></video>
<p style="text-align:center"><a href="video/${s.slug}.mp4" download data-count="video_downloaded">Download the video</a> (${Math.round(m.seconds)} s, vertical 720x1280, ${LICENSE_NAME}) · <a href="cards/${s.slug}.svg" download data-count="card_downloaded">Download the card</a></p>`;
}

export function renderShortPage(s, media = {}) {
  const m = media[s.slug];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': m ? 'VideoObject' : 'CreativeWork',
    name: s.title,
    description: s.summary,
    datePublished: s.published,
    url: pageUrl(s),
    license: LICENSE_URL,
    inLanguage: 'en',
    isPartOf: { '@type': 'CreativeWorkSeries', name: SHOW.title, url: SITE },
    citation: s.sources,
    ...(m ? { thumbnailUrl: `${SITE}cards/${s.slug}.svg`, uploadDate: s.published, duration: `PT${Math.round(m.seconds)}S`, contentUrl: `${SITE}video/${s.slug}.mp4`, transcript: s.script.join('\n\n') } : {}),
  };
  const body = `<header class="hero"><div class="wrap">
<p><a href="./">${SHOW.title}</a> · <span class="kind">${escapeHtml(KINDS[s.kind])}</span></p>
<h1>${escapeHtml(s.title)}</h1>
<p class="lede">${escapeHtml(s.summary)}</p>
</div></header>
<main class="wrap">
${videoBlock(s, media)}
<section class="card script"><h2 style="margin-top:0">The one-minute script</h2>
${s.script.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
</section>
<section class="card"><h2 style="margin-top:0">${s.kind === 'story' || s.kind === 'saint' ? 'What is true here' : 'Fair to the other side'}</h2>
<p>${escapeHtml(s.fair)}</p>
<h3>Sources</h3>
<ul>${s.sources.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
</section>
<section class="card"><h2 style="margin-top:0">Repost it</h2>
<p>Free to post on your own channels under ${LICENSE_NAME}: keep the credit line and the AI disclosure. Suggested caption:</p>
<p><em>${escapeHtml(s.caption)}</em></p>
<p>On-screen text: ${s.beats.map(escapeHtml).join(' · ')}</p>
</section>
<p><a href="./">All shorts</a></p>
</main>`;
  return page({
    title: `${s.title} | ${SHOW.title}`,
    description: `${s.summary} A one-minute ${KINDS[s.kind].toLowerCase()} short with sources.`,
    canonical: pageUrl(s),
    jsonLd,
    body,
    event: 'short_page_opened',
    type: 'article',
    image: `${SITE}cards/${s.slug}.svg`,
  });
}

const FAQ = [
  ['Who makes these?', 'Claude, an AI model made by Anthropic, writes every script under a written production guide, and the open-source Kokoro voice reads them. Every page and video says so. The project is free and open source.'],
  ['Are they faithful to Church teaching?', 'They aim to be. Every Catechism and Scripture reference is checked against the text before a short is published, and apologetics shorts cite where the teaching is written down. They are not official Church teaching and no bishop has reviewed them; for anything that matters, ask a priest or read the Catechism paragraph cited.'],
  ['Why include the other side?', 'Because people deserve the strongest form of an objection, not a straw man. Each apologetics short has a "Fair to the other side" note saying what other Christians actually believe and why, and how a Catholic answers it.'],
  ['Can I repost the videos?', `Yes. Scripts, cards and videos are ${LICENSE_NAME}: post them on your own channels, parish screens or classes, keep the credit and the AI disclosure, and share changes under the same licence.`],
];

export function renderIndex(shorts, media = {}) {
  const list = newestFirst(shorts)
    .map((s) => `<article class="card"><span class="kind">${escapeHtml(KINDS[s.kind])}</span>
<h3><a href="${s.slug}.html">${escapeHtml(s.title)}</a></h3>
<p>${escapeHtml(s.hook)}${media[s.slug] ? ` <small>(video, ${Math.round(media[s.slug].seconds)} s)</small>` : ''}</p></article>`)
    .join('\n');
  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'CreativeWorkSeries', name: SHOW.title, description: SHOW.description, url: SITE, license: LICENSE_URL, inLanguage: 'en' },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  const body = `<header class="hero"><div class="wrap">
<h1>${SHOW.title}</h1>
<p class="lede">${escapeHtml(SHOW.tagline)}. Free one-minute videos and scripts you can watch, share and repost: Catholic answers with every source cited and the other side stated fairly, saints told truthfully, and short stories labelled as fiction.</p>
</div></header>
<main class="wrap">
<h2>All shorts</h2>
<div class="grid">
${list}
</div>
<h2>Questions</h2>
${FAQ.map(([q, a]) => `<h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p>`).join('\n')}
</main>`;
  return page({ title: `${SHOW.title}: one-minute Catholic apologetics, saints and stories, free`, description: SHOW.description, canonical: SITE, jsonLd, body, event: 'index_opened' });
}

export function renderSitemap(shorts) {
  const urls = [SITE, ...shorts.map(pageUrl)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
}

/** Greedy word wrap by character count, good enough for a fixed card layout. */
export function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** A vertical 1080x1920 card: kind, title, hook and the credit line. */
export function renderCard(s, { text = s.hook, footerLine = 'marisstella.app/catholic-shorts · written by AI · CC BY-SA' } = {}) {
  const title = wrap(s.title, 16);
  const hook = wrap(text, 22);
  let y = 760;
  const tspans = (lines, size, gap) => lines.map((l) => { const t = `<text x="540" y="${y}" font-size="${size}" text-anchor="middle">${escapeHtml(l)}</text>`; y += gap; return t; }).join('');
  const titleSvg = `<g fill="#fff" font-family="Georgia,serif" font-weight="700">${tspans(title, 96, 116)}</g>`;
  y += 70;
  const hookSvg = `<g fill="#f3d9a4" font-family="Georgia,serif" font-style="italic">${tspans(hook, 72, 96)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b0d16"/><stop offset="1" stop-color="#14161c"/></linearGradient></defs>
<rect width="1080" height="1920" fill="url(#g)"/>
<path d="M520 330h40v80h80v40h-80v120h-40V450h-80v-40h80z" fill="#e2b35c"/>
<text x="540" y="640" fill="#e2b35c" font-family="system-ui,sans-serif" font-size="40" font-weight="600" letter-spacing="6" text-anchor="middle">${escapeHtml(KINDS[s.kind].toUpperCase())}</text>
${titleSvg}
${hookSvg}
<text x="540" y="1800" fill="#b6ab99" font-family="system-ui,sans-serif" font-size="34" text-anchor="middle">${escapeHtml(footerLine)}</text>
</svg>
`;
}
