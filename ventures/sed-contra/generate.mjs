#!/usr/bin/env node
// Builds the Sed Contra site from episodes/*.md and media/manifest.json.
//
//   node generate.mjs                    write index.html, <slug>.html, feed.xml, sitemap.xml
//   node generate.mjs --check            exit 1 if a page is stale or a script fails checkEpisode
//                                        (every Thomas quote verbatim in sources/, shorts under a minute)
//   node generate.mjs --segments <slug>  the episode as JSON for render.py
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEpisode, citation, parseEpisode, segments, wordCount } from './script.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const SITE = 'https://marisstella.app/sed-contra/';
const SHOW = 'Sed Contra';
const TAGLINE = 'Thomas Aquinas, told as stories';
const SHOW_DESCRIPTION = 'Free stories, podcast episodes and videos that dramatise one article of Thomas Aquinas\'s Summa Theologiae at a time. Invented people argue it out in ordinary places, and every line read as Thomas is his own text in the public-domain 1920 Dominican translation, checked word for word. Both sides get their strongest case.';

export function loadEpisodes(root = ROOT) {
  const dir = path.join(root, 'episodes');
  return readdirSync(dir).filter((f) => /^\d{3}-.+\.md$/.test(f)).sort().map((f) => {
    const ep = parseEpisode(readFileSync(path.join(dir, f), 'utf8'), f);
    if (f !== `${String(ep.number).padStart(3, '0')}-${ep.slug}.md`) throw new Error(`${f}: file name must be NNN-<slug>.md from its front matter`);
    return ep;
  });
}

export function loadMedia(root = ROOT) {
  const f = path.join(root, 'media', 'manifest.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mins = (s) => `${Math.round(s / 60)} min`;
const mb = (b) => `${(b / 1e6).toFixed(1)} MB`;

const CSS = `:root{--bg:#fbf8f2;--ink:#1d1b26;--muted:#5d5866;--line:#e4ddd0;--gold:#8a5a12;--card:#fff;--quote:#f4ecdc}
@media (prefers-color-scheme:dark){:root{--bg:#12141f;--ink:#ece8e0;--muted:#a9a4b3;--line:#2b2f44;--gold:#e0b25e;--card:#1a1d2b;--quote:#22253a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.6 Georgia,"Times New Roman",serif}
main,header,footer{max-width:760px;margin:0 auto;padding:0 16px}header{padding-top:28px}a{color:var(--gold)}
.kicker{font:600 13px/1.2 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--gold)}
h1{font-size:2.2em;line-height:1.15;margin:.2em 0}h2{margin-top:2em;font-size:1.35em}.lede{font-size:1.1em;color:var(--muted)}
video{width:100%;border-radius:8px;background:#000}audio{width:100%}.short video{max-width:320px;display:block}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:16px 0}
.line{margin:.7em 0}.who{font:600 12px/1 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px}
blockquote{margin:.8em 0;padding:10px 16px;background:var(--quote);border-left:4px solid var(--gold);font-style:italic}
blockquote cite{display:block;font:normal 13px/1.4 system-ui,sans-serif;color:var(--muted);margin-top:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.meta{font:14px/1.5 system-ui,sans-serif;color:var(--muted)}
footer{border-top:1px solid var(--line);margin-top:48px;padding:16px;font:14px/1.5 system-ui,sans-serif;color:var(--muted)}
button{font:inherit;padding:2px 8px}code{font-size:.9em}`;

const DISCLAIMER = `<p><strong>Written by an AI, around a real text.</strong> The stories, characters and narration are by Claude, an AI model made by Anthropic, and read by synthetic voices. Every line read as Thomas Aquinas is his own words in the 1920 English Dominican translation (public domain), checked word for word against the source by a script. The series is written from a Catholic point of view; it is not official Church teaching and no Church authority has reviewed it.</p>`;

function page({ title, description, canonical, body, event, jsonLd }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%23141a2b'/%3E%3Ctext%20x='16'%20y='23'%20font-size='20'%20font-family='Georgia,serif'%20font-weight='700'%20text-anchor='middle'%20fill='%23e8c478'%3ES%3C/text%3E%3C/svg%3E">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="application/rss+xml" title="${SHOW} podcast" href="feed.xml">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>${CSS}</style>
</head>
<body>
${body}
<footer>
  ${DISCLAIMER}
  <p><strong>No warranty.</strong> These stories, recordings and videos are provided free and as-is, without warranty of any kind, express or implied. They are not theological, pastoral or philosophical advice, and they do not replace a priest, a catechist, a teacher or reading Thomas himself; check anything you rely on against the sources linked on each page. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from their use.</p>
  <p>Stories, audio and video: <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, so parishes, teachers and creators may repost, cut and adapt them with credit. Code: MIT. Source: <a href="https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/sed-contra">GitHub</a>.</p>
  <p>Related: <a href="../saints-by-candlelight/">Saints by Candlelight</a> (bedtime saints podcast) · <a href="../hearth-and-horizon/">Hearth &amp; Horizon</a> (Catholic science fiction).</p>
  <p><strong>Privacy.</strong> No accounts, cookies or analytics vendor. We count anonymous events in this browser only (pages opened, audio and video played). <button id="usageToggle" type="button">Turn off counting</button></p>
</footer>
<script type="module">
import { countUsage, setUsageEnabled, usageAllowed } from "./usage.mjs";
const toggle = document.getElementById("usageToggle");
const render = () => { toggle.textContent = usageAllowed() ? "Turn off counting" : "Turn on counting"; };
toggle.addEventListener("click", () => { setUsageEnabled(!usageAllowed()); render(); });
render();
countUsage(${JSON.stringify(event)});
for (const m of document.querySelectorAll("audio,video")) {
  const kind = m.tagName === "AUDIO" ? "audio" : "video";
  m.addEventListener("play", () => countUsage(kind + "_played"), { once: true });
  m.addEventListener("ended", () => countUsage(kind + "_finished"), { once: true });
}
for (const a of document.querySelectorAll("[data-count]")) a.addEventListener("click", () => countUsage(a.dataset.count));
</script>
</body>
</html>
`;
}

function transcript(ep, chapter) {
  return chapter.segments.map((s) => {
    const who = ep.cast[s.speaker].name;
    if (s.source) return `<blockquote>${esc(s.text)}<cite>Thomas Aquinas, ${citation(s.source)}, tr. Fathers of the English Dominican Province (1920)</cite></blockquote>`;
    return `<p class="line"><span class="who">${esc(who)}</span>${esc(s.text)}</p>`;
  }).join('\n');
}

export function renderEpisode(ep, media) {
  const m = media[ep.slug] || {};
  const words = ep.chapters.reduce((n, c) => n + c.segments.reduce((k, s) => k + wordCount(s.text), 0), 0);
  const quotes = [...new Set([...ep.chapters, ...ep.shorts].flatMap((c) => c.segments.map((s) => s.source).filter(Boolean)))];
  const watch = m.video ? `<video controls preload="metadata" src="media/${m.video.file}"><track kind="captions" srclang="en" label="English" src="media/${ep.slug}.vtt"></video>
<p class="meta">Long-form video, ${mins(m.video.seconds)}, ${m.video.width}x${m.video.height}, chapters built in. <a href="media/${m.video.file}" download data-count="video_downloaded">Download MP4</a> (${mb(m.video.bytes)}) · <a href="media/${ep.slug}.srt" download>captions (SRT)</a> · <a href="media/${ep.slug}.youtube.txt">chapter timestamps</a></p>` : '<p class="meta">Video coming soon.</p>';
  const listen = m.audio ? `<audio controls preload="none" src="media/${m.audio.file}"></audio>
<p class="meta">Podcast episode, ${mins(m.audio.seconds)}. <a href="media/${m.audio.file}" download data-count="audio_downloaded">Download MP3</a> (${mb(m.audio.bytes)}) · <a href="feed.xml">podcast feed</a></p>` : '';
  const shorts = ep.shorts.map((sh) => {
    const v = m.shorts?.[sh.id];
    return `<div class="card short"><strong>${esc(sh.title)}</strong>
${v ? `<video controls preload="none" src="media/${v.file}"></video><p class="meta">${Math.round(v.seconds)} s vertical, ${v.width}x${v.height}. <a href="media/${v.file}" download data-count="short_downloaded">Download MP4</a> (${mb(v.bytes)})</p>` : ''}
<details><summary>Script</summary>${transcript(ep, sh)}</details></div>`;
  }).join('\n');
  const toc = ep.chapters.map((c) => `<li><a href="#${c.id}">${esc(c.title)}</a></li>`).join('');
  const body = `<header><p class="kicker"><a href="./">${SHOW}</a> · Episode ${ep.number}</p>
<h1>${esc(ep.title)}</h1>
<p class="lede">${esc(ep.subtitle)}. ${esc(ep.description)}</p></header>
<main>
${watch}
${listen}
<div class="card meta"><strong>The article:</strong> ${esc(ep.article)}, “${esc(ep.articleTitle)}” · <strong>Setting:</strong> ${esc(ep.setting)} · ${words.toLocaleString('en')} words<br><strong>What is invented, what is quoted:</strong> ${esc(ep.fiction)}<br><strong>Sources:</strong> ${quotes.map((q) => `<a href="sources/${q}.txt">${citation(q)}</a>`).join(', ')} (Project Gutenberg #17611)</div>
<h2>Shorts from this episode</h2>
<p class="meta">Vertical, under a minute, made for YouTube Shorts, Reels and TikTok. Free to repost with credit.</p>
<div class="grid">${shorts}</div>
<h2>Transcript</h2>
<ol class="meta">${toc}</ol>
${ep.chapters.map((c) => `<h2 id="${c.id}">${esc(c.title)}</h2>\n${transcript(ep, c)}`).join('\n')}
</main>`;
  return page({
    title: `${ep.title}: ${ep.articleTitle.replace(/\?$/, '')}? Aquinas's Five Ways as a story | ${SHOW}`,
    description: ep.description,
    canonical: `${SITE}${ep.slug}.html`,
    event: 'episode_opened',
    body,
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'PodcastEpisode', name: ep.title, description: ep.description,
      datePublished: ep.date, partOfSeries: { '@type': 'PodcastSeries', name: SHOW, url: SITE },
      license: 'https://creativecommons.org/licenses/by-sa/4.0/',
      ...(m.audio ? { associatedMedia: { '@type': 'MediaObject', contentUrl: `${SITE}media/${m.audio.file}` } } : {}),
    },
  });
}

export function renderIndex(eps, media) {
  const cards = eps.map((ep) => {
    const m = media[ep.slug] || {};
    return `<div class="card"><p class="kicker">Episode ${ep.number} · ${esc(ep.article)}</p><h2 style="margin:.2em 0"><a href="${ep.slug}.html">${esc(ep.title)}</a></h2><p>${esc(ep.description)}</p><p class="meta">${[m.video && `video ${mins(m.video.seconds)}`, m.audio && `podcast ${mins(m.audio.seconds)}`, m.shorts && `${Object.keys(m.shorts).length} shorts`].filter(Boolean).join(' · ')}</p></div>`;
  }).join('\n');
  const body = `<header><p class="kicker">${SHOW} · ${TAGLINE}</p>
<h1>The Summa, one argument at a time, in ordinary rooms</h1>
<p class="lede">${esc(SHOW_DESCRIPTION)}</p></header>
<main>
<h2>How each episode works</h2>
<p>Thomas wrote every article of the Summa the same way: the objections first, at full strength; then <em>sed contra</em>, “on the contrary”; then his answer; then a reply to each objection. Each episode follows that shape as a story. The people are invented; Thomas is not, and you hear his words read as he wrote them (in English), cut only where marked.</p>
<ul>
<li><strong>Long-form video</strong> with chapters and captions, for YouTube or a classroom screen.</li>
<li><strong>A podcast episode</strong> of the same story, with its own <a href="feed.xml">RSS feed</a>.</li>
<li><strong>Vertical shorts</strong> under a minute, cut around a single objection or idea.</li>
<li><strong>The transcript</strong>, with every quotation cited to the question and article.</li>
</ul>
<h2>Episodes</h2>
${cards}
<h2>For parishes, teachers and creators</h2>
<p>Everything here is CC BY-SA 4.0. Download the MP4s and MP3s, show them in an RCIA or confirmation class, cut your own shorts, or translate them; credit “Sed Contra” and share your version under the same licence. Every episode is rendered from a plain-text script by free, open-source software (the Kokoro voice model, Pillow and ffmpeg), so the code that made it is <a href="https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/sed-contra">public too</a>.</p>
<h2>What it is not</h2>
<p>It is not a substitute for reading Thomas, for a teacher, or for the Church's own teaching. Each episode ends with the strongest objections modern critics make and where to read more.</p>
</main>`;
  return page({
    title: `${SHOW}: Thomas Aquinas as stories, podcast and video (free)`,
    description: 'Free stories, podcast episodes and videos that dramatise Thomas Aquinas\'s Summa Theologiae, with his own words checked word for word. Start with the Five Ways.',
    canonical: SITE, event: 'index_opened', body,
    jsonLd: { '@context': 'https://schema.org', '@type': 'PodcastSeries', name: SHOW, description: SHOW_DESCRIPTION, url: SITE, webFeed: `${SITE}feed.xml`, license: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  });
}

export function renderFeed(eps, media) {
  const items = eps.filter((ep) => media[ep.slug]?.audio).map((ep) => {
    const a = media[ep.slug].audio;
    return `<item>
<title>${esc(ep.title)}</title>
<description>${esc(`${ep.description} ${ep.fiction} Transcript and sources: ${SITE}${ep.slug}.html`)}</description>
<link>${SITE}${ep.slug}.html</link>
<guid isPermaLink="false">sed-contra-${ep.slug}</guid>
<pubDate>${new Date(`${ep.date}T06:00:00Z`).toUTCString()}</pubDate>
<enclosure url="${SITE}media/${a.file}" length="${a.bytes}" type="audio/mpeg"/>
<itunes:duration>${Math.round(a.seconds)}</itunes:duration>
<itunes:episode>${ep.number}</itunes:episode>
<podcast:chapters url="${SITE}media/${ep.slug}.chapters.json" type="application/json+chapters"/>
<podcast:transcript url="${SITE}media/${ep.slug}.srt" type="application/srt"/>
</item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
<channel>
<title>${SHOW}: ${TAGLINE}</title>
<link>${SITE}</link>
<language>en</language>
<description>${esc(SHOW_DESCRIPTION)} Written by an AI and read by synthetic voices.</description>
<copyright>CC BY-SA 4.0</copyright>
<itunes:author>${SHOW}</itunes:author>
<itunes:explicit>false</itunes:explicit>
<itunes:category text="Religion &amp; Spirituality"><itunes:category text="Christianity"/></itunes:category>
<itunes:category text="Society &amp; Culture"><itunes:category text="Philosophy"/></itunes:category>
${items}
</channel>
</rss>
`;
}

/** SRT to WebVTT, for the browser's <track>. */
export function vtt(srt) {
  return 'WEBVTT\n\n' + srt.replace(/^\d+\n/gm, '').replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
}

export function buildAll(root = ROOT) {
  const eps = loadEpisodes(root);
  const media = loadMedia(root);
  const files = {
    'index.html': renderIndex(eps, media),
    'feed.xml': renderFeed(eps, media),
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[SITE, ...eps.map((e) => `${SITE}${e.slug}.html`)].map((u) => `<url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`,
  };
  for (const ep of eps) {
    files[`${ep.slug}.html`] = renderEpisode(ep, media);
    const srt = path.join(root, 'media', `${ep.slug}.srt`);
    if (existsSync(srt)) files[`media/${ep.slug}.vtt`] = vtt(readFileSync(srt, 'utf8'));
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--segments') {
    const ep = loadEpisodes().find((e) => e.slug === args[1]);
    if (!ep) { console.error(`no episode ${args[1]}`); process.exit(1); }
    process.stdout.write(JSON.stringify(segments(ep)));
    process.exit(0);
  }
  const check = args.includes('--check');
  let bad = 0;
  for (const ep of loadEpisodes()) {
    const problems = checkEpisode(ep, ROOT);
    console.log(`${ep.slug}: ${problems.length ? problems.join('; ') : 'every quote verbatim, ok'}`);
    bad += problems.length;
  }
  for (const [rel, contents] of Object.entries(buildAll())) {
    const target = path.join(ROOT, rel);
    if (existsSync(target) && readFileSync(target, 'utf8') === contents) continue;
    if (check) { console.log(`stale: ${rel}`); bad += 1; continue; }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
    console.log(`wrote ${rel}`);
  }
  if (bad) process.exit(1);
}
