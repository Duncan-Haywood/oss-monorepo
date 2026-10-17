/**
 * Launch kit: ready-to-paste drafts for the places automation is forbidden
 * (Show HN, subreddits, Product Hunt, AlternativeTo, awesome-lists). The
 * owner posts them by hand; nothing here sends anything. See
 * portfolio/distribution/README.md ("Automated posting to communities that
 * forbid it ... can be prepared as drafts for the owner").
 *
 *   node platform/distribution/launch-kit.mjs                 # kit for launches in the last 7 days
 *   node platform/distribution/launch-kit.mjs --slug <slug>   # one tool
 *   node platform/distribution/launch-kit.mjs --days 30 --max 5
 *
 * Every draft states what the tool is, that it is free MIT software from this
 * portfolio, the page's own limits, and links to the canonical page. Each one
 * tells the owner to read the venue's rules on the day, because they change.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMeta, recentLaunches, toolUrl } from './bluesky.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const DEFAULT_DAYS = 7;
export const DEFAULT_MAX = 3;

const shortTitle = (t) => t.split(/\s[—–|-]\s/)[0].trim();
const firstSentence = (s) => (s.split(/(?<=\.)\s/)[0] || s).trim();
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
/** Longest whole-word prefix within `n` characters, no ellipsis: titles and taglines read worse cut off with dots. */
const words = (s, n) => (s.length <= n ? s : s.slice(0, n + 1).replace(/\s+\S*$/, '').replace(/[,;:–—-]$/, '').trimEnd());

/** The drafts for one tool, as plain strings keyed by venue. */
export function composeKit({ title, description }, url, slug) {
  const name = shortTitle(title);
  const one = firstSentence(description);
  const repo = `https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/${slug}`;
  const disclosure = 'It is free, MIT-licensed, runs in your browser, and needs no account. It is a calculator/checker, not professional advice.';
  return {
    name,
    url,
    showHn: {
      title: words(`Show HN: ${name} – ${one.replace(/\.$/, '')}`, 80),
      url,
      text: `${description}\n\n${disclosure} Source: ${repo}\n\nI would like to hear where the numbers are wrong for your case.`,
      rules: 'https://news.ycombinator.com/showhn.html — must be something people can try now; no sign-up wall; do not ask for upvotes.',
    },
    productHunt: {
      name: clip(name, 40),
      tagline: words(one.replace(/\.$/, ''), 60),
      description: clip(`${description} ${disclosure}`, 260),
    },
    alternativeTo: {
      name,
      url,
      license: 'Open source (MIT), free',
      description: clip(description, 300),
    },
    awesomeListLine: `- [${name}](${url}) - ${clip(one, 140)}`,
    reddit: {
      note: 'Post only in a community whose current rules allow self-made free tools, as a plain description of what it does and what it cannot do. Say you built it. Never cross-post the same text to many subreddits.',
      body: `I built a free ${name.toLowerCase()} that runs in the browser, no sign-up. ${one} ${disclosure} ${url}`,
    },
  };
}

export function render(kits) {
  const out = ['# Launch kit', '', 'Drafts for the owner to post by hand. Read each venue\'s rules on the day you post; they change. Nothing here was sent.', ''];
  for (const k of kits) {
    out.push(`## ${k.name}`, '', `Canonical page: ${k.url}`, '');
    out.push('### Show HN', '', `Title: ${k.showHn.title}`, `URL: ${k.showHn.url}`, `Rules: ${k.showHn.rules}`, '', '```', k.showHn.text, '```', '');
    out.push('### Product Hunt', '', `Name: ${k.productHunt.name}`, `Tagline: ${k.productHunt.tagline}`, '', '```', k.productHunt.description, '```', '');
    out.push('### AlternativeTo', '', `Name: ${k.alternativeTo.name}`, `URL: ${k.alternativeTo.url}`, `License: ${k.alternativeTo.license}`, '', '```', k.alternativeTo.description, '```', '');
    out.push('### Awesome-list pull request line', '', '```', k.awesomeListLine, '```', '', 'Add it only to a list whose scope fits and whose contributing rules you have read.', '');
    out.push('### Reddit', '', k.reddit.note, '', '```', k.reddit.body, '```', '');
  }
  return out.join('\n');
}

export async function plan({ launched, today, readPage, slug, days = DEFAULT_DAYS, max = DEFAULT_MAX }) {
  const slugs = slug ? [slug] : recentLaunches(launched, today, days);
  const kits = [];
  for (const s of slugs) {
    const html = await readPage(s);
    const meta = html && readMeta(html);
    if (!meta) continue;
    kits.push(composeKit(meta, toolUrl(s), s));
    if (kits.length >= max) break;
  }
  return kits;
}

export async function run({ argv = process.argv.slice(2), now = new Date(), log = console.log } = {}) {
  const arg = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
  const launched = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'platform/pages/launched.json'), 'utf8')).launched;
  const readPage = (s) => fs.readFile(path.join(REPO_ROOT, 'ventures', s, 'index.html'), 'utf8').catch(() => null);
  const kits = await plan({
    launched, readPage, today: now.toISOString().slice(0, 10), slug: arg('--slug'),
    days: Number(arg('--days')) || DEFAULT_DAYS, max: Number(arg('--max')) || DEFAULT_MAX,
  });
  log(kits.length ? render(kits) : 'No launches in the window; pass --slug <slug> or --days <n>.');
  return kits.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
