/**
 * GitHub release digest: one release per week listing the tools launched in
 * the last WINDOW_DAYS, each with its link and one-line description. Release
 * pages feed the repository's Atom feed and "Watch > Releases"
 * notifications for people who opted in. Off by default. See
 * portfolio/distribution/README.md.
 *
 *   node platform/distribution/releases.mjs                       # dry run: prints the notes
 *   DISTRIBUTE_RELEASES=true GITHUB_TOKEN=... GITHUB_REPOSITORY=o/r node platform/distribution/releases.mjs
 *
 * Stateless de-duplication: the tag is launches-<ISO week start>, and a
 * release that already has that tag is left alone, so re-runs never repeat.
 * Nothing is tagged unless at least one tool launched in the window.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMeta, recentLaunches, toolUrl } from './bluesky.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const WINDOW_DAYS = 7;
export const MAX_TOOLS = 25;

/** Monday (UTC) of the week containing `today` (YYYY-MM-DD), as YYYY-MM-DD. */
export function weekStart(today) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Tag, title and markdown notes for the tools in `items` ([{slug, meta}]). */
export function composeRelease(items, today) {
  const week = weekStart(today);
  const lines = items.map(({ slug, meta }) => {
    const name = meta.title.split(/\s[—–|-]\s/)[0];
    const desc = meta.description.split(/(?<=\.)\s/)[0];
    return `- [${name}](${toolUrl(slug)}): ${desc}`;
  });
  const body = [
    `New free tools from this portfolio, week of ${week}.`,
    '',
    ...lines,
    '',
    'Every tool is free and open source (MIT) and runs in your browser. The tools are not legal, tax or professional advice.',
    'This release was created automatically from `platform/pages/launched.json`.',
  ].join('\n');
  return { tag: `launches-${week}`, name: `New tools, week of ${week}`, body };
}

export async function plan({ launched, today, readPage, max = MAX_TOOLS }) {
  const items = [];
  for (const slug of recentLaunches(launched, today, WINDOW_DAYS)) {
    const html = await readPage(slug);
    const meta = html && readMeta(html);
    if (meta) items.push({ slug, meta });
    if (items.length >= max) break;
  }
  return items.length ? composeRelease(items, today) : null;
}

async function gh(fetchImpl, token, method, url, body) {
  return fetchImpl(`https://api.github.com${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function run({ env = process.env, fetchImpl = fetch, log = console.log, now = new Date() } = {}) {
  const launched = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'platform/pages/launched.json'), 'utf8')).launched;
  const readPage = (slug) => fs.readFile(path.join(REPO_ROOT, 'ventures', slug, 'index.html'), 'utf8').catch(() => null);
  const today = now.toISOString().slice(0, 10);
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;
  const live = env.DISTRIBUTE_RELEASES === 'true' && !!token && /^[\w.-]+\/[\w.-]+$/.test(repo || '');
  const rel = await plan({ launched, today, readPage });
  if (!rel) { log('nothing launched in the window; no release'); return { posted: 0, planned: 0 }; }
  if (!live) {
    log(`DRY RUN (set DISTRIBUTE_RELEASES=true, GITHUB_TOKEN and GITHUB_REPOSITORY to publish). Release ${rel.tag}:\n${rel.name}\n\n${rel.body}`);
    return { posted: 0, planned: 1 };
  }
  const seen = await gh(fetchImpl, token, 'GET', `/repos/${repo}/releases/tags/${rel.tag}`);
  if (seen.ok) { log(`${rel.tag} already released`); return { posted: 0, planned: 1 }; }
  if (seen.status !== 404) throw new Error(`releases: HTTP ${seen.status}`);
  const res = await gh(fetchImpl, token, 'POST', `/repos/${repo}/releases`, {
    tag_name: rel.tag, name: rel.name, body: rel.body, target_commitish: env.GITHUB_SHA || undefined,
  });
  if (!res.ok) throw new Error(`releases: HTTP ${res.status}`);
  log(`released ${rel.tag}`);
  return { posted: 1, planned: 1 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
