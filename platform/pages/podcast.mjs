/**
 * The podcast: an audio episode for a post, read by a synthetic voice, served
 * inside the writing section at `writing/podcast/` with an RSS feed podcast
 * apps can subscribe to.
 *
 * Sources sit beside the posts:
 *
 *   docs/podcast/<YYYY-MM-DD>-<slug>.md     the script, plain spoken prose
 *   docs/podcast/audio/<YYYY-MM-DD>-<slug>.mp3
 *   docs/podcast/audio/manifest.json        { "<file stem>": { bytes, seconds, sha256, voice } }
 *
 * Episodes are grouped by the topic of the post they read (`writing.mjs`
 * TOPICS), on the page and in one extra feed per topic.
 *
 * A script without front matter is a hand-written one this pipeline leaves alone.
 * A script's front matter names the post it reads (`post: <slug>`); the post
 * page gets a player and the episode links back to the post for sources.
 * `podcast_tts.py` turns scripts into audio once, offline, with Kokoro and writes the
 * manifest, so the site build never needs a speech engine: it publishes the
 * episodes whose audio is committed and skips scripts still waiting for theirs.
 */
import { promises as fs, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from '../devlog/markdown.mjs';
import { SITE_NAME } from './site-nav.mjs';
import { parseFrontMatter, WRITING_PATH } from './writing.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

export const PODCAST_DIR = 'docs/podcast';
// A literal, not built from WRITING_PATH: writing.mjs imports this module, so its
// constants are not initialised yet when this line runs.
export const PODCAST_PATH = 'writing/podcast/';
export const SHOW_TITLE = `${SITE_NAME} podcast`;
export const SHOW_DESCRIPTION =
  'Short audio episodes on what an open repository of free tools and research, built mostly by unattended AI coding agents, is doing and finding. Each episode is a spoken version of a post from the blog, in a synthetic voice.';
const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)\.md$/;
// Markup a listener cannot hear: a script with any of it was written for the eye.
const UNSPEAKABLE = /[#*`|<>[\]]|https?:/;

/** Every episode with committed audio, newest first. Throws on a malformed script so a bad file fails the build. */
export function loadEpisodes(root = DEFAULT_ROOT, postSlugs = null) {
  const dir = path.join(root, PODCAST_DIR);
  if (!existsSync(dir)) return [];
  const manifestPath = path.join(dir, 'audio', 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const episodes = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.md')) continue;
    const fm = FILE_RE.exec(name);
    if (!fm) throw new Error(`${PODCAST_DIR}/${name}: name must be <YYYY-MM-DD>-<slug>.md`);
    const { meta, body } = parseFrontMatter(readFileSync(path.join(dir, name), 'utf8'));
    // No front matter: a hand-written script (such as a two-host conversation) kept
    // beside the voiced ones, not part of this pipeline. Anything with front matter is held to it.
    if (!Object.keys(meta).length) continue;
    for (const key of ['title', 'description', 'post']) {
      if (!meta[key]) throw new Error(`${PODCAST_DIR}/${name}: front matter needs "${key}"`);
    }
    if (meta.description.length > 160) {
      throw new Error(`${PODCAST_DIR}/${name}: description is ${meta.description.length} characters; keep it to 160`);
    }
    if (String(meta.date || fm[1]) !== fm[1]) throw new Error(`${PODCAST_DIR}/${name}: date does not match the file name`);
    const bad = UNSPEAKABLE.exec(body);
    if (bad) throw new Error(`${PODCAST_DIR}/${name}: script contains "${bad[0]}", which a voice would read out; write plain spoken prose`);
    if (postSlugs && !postSlugs.has(meta.post)) throw new Error(`${PODCAST_DIR}/${name}: post "${meta.post}" is not in docs/posts/`);
    const stem = name.slice(0, -3);
    const audio = manifest[stem];
    if (!audio || !existsSync(path.join(dir, 'audio', `${stem}.mp3`))) continue; // script waiting for its audio
    episodes.push({
      slug: fm[2],
      stem,
      date: fm[1],
      title: meta.title,
      description: meta.description,
      post: meta.post,
      script: body.trim(),
      source: `${PODCAST_DIR}/${name}`,
      audioFile: `${stem}.mp3`,
      bytes: audio.bytes,
      seconds: audio.seconds,
      voice: audio.voice || '',
    });
  }
  return episodes.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : b.date.localeCompare(a.date)));
}

export const clock = (s) => {
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

/** The player a post page shows above its text. `toPodcast` is the relative path to `writing/podcast/`. */
export function renderPlayer(ep, toPodcast) {
  return `<figure class="episode" aria-label="Listen to this post">
<figcaption><strong>Listen</strong> · ${clock(ep.seconds)} · read by a synthetic voice · <a href="${toPodcast}">Podcast</a></figcaption>
<audio controls preload="none" src="${toPodcast}audio/${esc(ep.audioFile)}"></audio>
</figure>`;
}

const paragraphs = (text) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('\n');

/** The podcast page's heading block, in the hero band every site page opens with. */
export function renderPodcastHero() {
  return `<p class="eyebrow">Podcast</p>
<h1>Podcast</h1>
<p class="dek">${esc(SHOW_DESCRIPTION)} Episodes are grouped by topic. Subscribe in any podcast app with the <a href="feed.xml">RSS feed</a>
for every episode, or with one topic's own feed below.</p>
<p class="meta">The voice is synthetic (<a href="https://huggingface.co/hexgrad/Kokoro-82M">Kokoro</a>, an open-weight
text-to-speech model), and the scripts are written by AI agents from the repository's records. Each episode's
post has the links and sources.</p>`;
}

function renderEpisode(ep) {
  return `<li id="${esc(ep.slug)}">
  <h3><a href="../${esc(ep.post)}/">${esc(ep.title)}</a></h3>
  <p>${esc(ep.description)}</p>
  <p class="meta"><time datetime="${ep.date}">${ep.date}</time> · ${clock(ep.seconds)}</p>
  <audio controls preload="none" src="audio/${esc(ep.audioFile)}"></audio>
  <details><summary>Transcript</summary>
${paragraphs(ep.script)}
  </details>
</li>`;
}

/**
 * The episode list, one section per topic (the topic of the post each episode
 * reads), each with its own RSS feed so a listener can subscribe to one topic.
 * Wrapped in the writing section's shell by the caller.
 */
export function renderPodcastBody(episodes, topics = []) {
  if (!episodes.length) return `<p>No episodes yet.</p>
<p class="more"><a href="../">All posts</a> · <a href="../../">All tools and research</a></p>`;
  const groups = topics
    .map((t) => ({ ...t, episodes: episodes.filter((ep) => ep.topic === t.id) }))
    .filter((g) => g.episodes.length);
  const loose = episodes.filter((ep) => !topics.some((t) => t.id === ep.topic));
  if (loose.length) groups.push({ id: 'other', label: 'Other episodes', blurb: '', episodes: loose, noFeed: true });
  const jump = groups.length > 1
    ? `<nav class="chips" aria-label="Podcast topics">${groups.map((g) => `<a class="tag" href="#topic-${esc(g.id)}">${esc(g.label)} (${g.episodes.length})</a>`).join(' ')}</nav>\n`
    : '';
  return `${jump}${groups
    .map(
      (g) => `<section id="topic-${esc(g.id)}" aria-labelledby="topic-${esc(g.id)}-h">
<h2 id="topic-${esc(g.id)}-h">${esc(g.label)}</h2>
<p class="meta">${g.blurb ? `${esc(g.blurb)} ` : ''}${g.episodes.length} episode${g.episodes.length === 1 ? '' : 's'}${g.noFeed ? '' : ` · <a href="${esc(g.id)}/feed.xml">RSS for this topic only</a>`}</p>
<ul class="posts">
${g.episodes.map(renderEpisode).join('\n')}
</ul>
</section>`,
    )
    .join('\n')}
<p class="more"><a href="../">All posts</a> · <a href="../../">All tools and research</a></p>`;
}

/** RSS 2.0 with the iTunes tags podcast directories read. Enclosures need absolute URLs, so a build without a base URL leaves them relative. */
export function renderPodcastFeed(episodes, { baseUrl = '', image = '', topic = null } = {}) {
  const root = `${baseUrl}${PODCAST_PATH}`;
  const self = topic ? `${root}${topic.id}/feed.xml` : `${root}feed.xml`;
  const title = topic ? `${SHOW_TITLE}: ${topic.label}` : SHOW_TITLE;
  const description = topic ? `${topic.blurb} ${SHOW_DESCRIPTION}` : SHOW_DESCRIPTION;
  const items = episodes
    .map(
      (ep) => `    <item>
      <title>${esc(ep.title)}</title>
      <description>${esc(ep.description)}</description>
      <link>${esc(`${baseUrl}${WRITING_PATH}${ep.post}/`)}</link>
      <guid isPermaLink="false">${esc(`${root}${ep.stem}`)}</guid>
      <pubDate>${new Date(`${ep.date}T00:00:00Z`).toUTCString()}</pubDate>
      <enclosure url="${esc(`${root}audio/${ep.audioFile}`)}" length="${ep.bytes}" type="audio/mpeg"/>
      <itunes:duration>${Math.round(ep.seconds)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(title)}</title>
    <link>${esc(topic ? `${root}#topic-${topic.id}` : root)}</link>
    <atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>
    <description>${esc(description)}</description>
    <language>en</language>
    <itunes:author>${esc(SITE_NAME)}</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Technology"/>
${image ? `    <itunes:image href="${esc(image)}"/>\n` : ''}${items}
  </channel>
</rss>
`;
}

/**
 * Copy the audio and write the feeds into `<outDir>/writing/podcast/`: one for
 * every episode, and one per topic at `<topic>/feed.xml`. The index page is
 * written by `buildWriting`.
 */
export async function writePodcastAssets(outDir, episodes, { root = DEFAULT_ROOT, baseUrl = '', image = '', topics = [] } = {}) {
  const dir = path.join(outDir, PODCAST_PATH, 'audio');
  await fs.mkdir(dir, { recursive: true });
  for (const ep of episodes) await fs.copyFile(path.join(root, PODCAST_DIR, 'audio', ep.audioFile), path.join(dir, ep.audioFile));
  await fs.writeFile(path.join(outDir, PODCAST_PATH, 'feed.xml'), renderPodcastFeed(episodes, { baseUrl, image }));
  for (const topic of topics) {
    const mine = episodes.filter((ep) => ep.topic === topic.id);
    if (!mine.length) continue;
    await fs.mkdir(path.join(outDir, PODCAST_PATH, topic.id), { recursive: true });
    await fs.writeFile(path.join(outDir, PODCAST_PATH, topic.id, 'feed.xml'), renderPodcastFeed(mine, { baseUrl, image, topic }));
  }
}
