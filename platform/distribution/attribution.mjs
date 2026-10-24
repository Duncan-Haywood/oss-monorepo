// Per-channel attribution: which distribution channel a page load came from.
//
// WHY THIS EXISTS
//
// `portfolio/distribution/README.md` defines a ladder for every channel,
// ending in `measured`: "usage from that channel is counted", read by `ref`
// tag. Until this file, no channel tagged its links and the counter could not
// tell one arrival from another, so no channel could ever reach that rung,
// however live it went. This closes the loop in three places:
//
//   1. Every channel's link back to a tool page carries `?ref=<tag>`, a tag
//      from the closed list below (`tagUrl`). Canonical URLs never do: a
//      dev.to `canonical_url` or a Hashnode `originalArticleURL` stays clean
//      so search engines credit the page itself.
//   2. The page's shared chrome (`platform/pages/build.mjs`, `CHROME_SCRIPT`)
//      reads the tag, sends it with the page-view ping only if it is on this
//      list, and removes it from the address bar so a re-shared link is not
//      credited to the channel twice.
//   3. The counter (`platform/counter/counter.mjs`) adds one to `ref:<tag>`
//      for that day. That is one more integer per (day, channel): which
//      channel's link was followed, never who followed it.
//
//   node platform/distribution/attribution.mjs      # per-channel page loads and rung
//   node platform/distribution/attribution.mjs --json
//
// The tags name channels, not people, campaigns or posts, so they cannot be
// used to single anyone out.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFS, REF_KEY } from '../counter/counter.mjs';
import { isPageKey } from '../counter/core.mjs';

export { REFS, REF_KEY };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const VISITS = path.join(REPO_ROOT, 'portfolio', 'usage', 'site-visits.json');
export const CHANNELS = path.join(REPO_ROOT, 'portfolio', 'distribution', 'channels.yaml');

/** `channels.yaml` id → the short tag its links carry. The tags must be exactly the counter's `REFS`, which is what the page and the counter accept. */
export const CHANNEL_REFS = Object.freeze({
  'bluesky-bot': 'bluesky',
  'mastodon-bot': 'mastodon',
  'devto-crosspost': 'devto',
  'hashnode-crosspost': 'hashnode',
  'github-release-digest': 'release',
  'npm-cli-packages': 'npm',
  'mcp-server': 'mcp',
  'pypi-python-clis': 'pypi',
  'pypi-pyproject-packages': 'pypi',
  'homebrew-tap': 'homebrew',
  'ghcr-container-images': 'ghcr',
  'browser-extension': 'webext',
  'vscode-extension': 'vscode',
  'github-actions': 'gh-action',
  'wordpress-plugin': 'wordpress',
  'android-play-store': 'android',
  'ios-app-store': 'ios',
  'desktop-apps': 'desktop',
  // The distribution hub (platform/distribution/hub.mjs), one row per platform it writes for.
  'hub-threads': 'threads',
  'hub-facebook': 'facebook',
  'hub-instagram': 'instagram',
  'hub-email': 'email',
  'hub-x-drafts': 'x',
  'hub-linkedin-drafts': 'linkedin',
  'hub-substack-drafts': 'substack',
  'hub-medium-drafts': 'medium',
  'hub-tiktok-drafts': 'tiktok',
  'hub-youtube-drafts': 'youtube',
  'hub-reddit-drafts': 'reddit',
  'hub-hn-drafts': 'hn',
});


/** `url` with `?ref=<tag>` added. Throws on a tag outside `REFS`, so a typo fails a test rather than a reading. */
export function tagUrl(url, ref) {
  if (!REFS.includes(ref)) throw new Error(`unknown ref tag "${ref}"; add its channel to CHANNEL_REFS`);
  const u = new URL(url);
  u.searchParams.set('ref', ref);
  return u.href;
}

/** Split the counter's day map into page loads and per-channel arrivals. */
export function channelTotals(days = {}) {
  const refs = Object.fromEntries(REFS.map((r) => [r, 0]));
  const firstDay = {};
  let pageLoads = 0;
  for (const day of Object.keys(days).sort()) {
    for (const [key, n] of Object.entries(days[day] || {})) {
      if (!Number.isInteger(n) || n < 0) continue;
      if (key.startsWith(REF_KEY)) {
        const r = key.slice(REF_KEY.length);
        if (!(r in refs)) continue; // a tag since retired: not this list's to report
        refs[r] += n;
        if (n > 0) firstDay[r] ||= day;
      } else if (isPageKey(key)) {
        pageLoads += n; // src:, geo:, dev:, bot: and botpage: keys are breakdowns, not page loads
      }
    }
  }
  return { pageLoads, refs, firstDay };
}

/** `id` and `rung` of each channel in `channels.yaml`. A two-key read, so no YAML dependency. */
export function readChannels(text) {
  const out = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const id = line.match(/^\s*- id:\s*([\w-]+)/);
    if (id) out.push((cur = { id: id[1], rung: null }));
    const rung = cur && line.match(/^\s+rung:\s*([\w-]+)/);
    if (rung) cur.rung = rung[1];
  }
  return out;
}

/**
 * One row per channel: its tag, its recorded rung, and what the counts say.
 * `measured` is only ever suggested from a non-zero committed count, never
 * inferred; a zero is "no reading yet" while the counter is off.
 */
export function report({ channels, days, counterOn }) {
  const { pageLoads, refs, firstDay } = channelTotals(days);
  const rows = channels.map(({ id, rung }) => {
    const ref = CHANNEL_REFS[id] ?? null;
    const loads = ref ? refs[ref] : null;
    let reading;
    if (!ref) reading = 'untagged: its listings link to the plain page, so arrivals from it are not told apart';
    else if (!counterOn) reading = 'no reading: the counter is off (platform/counter/site.json)';
    else if (loads > 0) reading = `${loads} page load(s) since ${firstDay[ref]}`;
    else reading = '0 page loads on file';
    const suggest = ref && loads > 0 && rung !== 'measured' ? 'measured' : null;
    return { id, rung, ref, loads, reading, suggest };
  });
  return { pageLoads, rows };
}

function main(argv) {
  const channels = readChannels(fs.readFileSync(CHANNELS, 'utf8'));
  let days = {};
  try {
    days = JSON.parse(fs.readFileSync(VISITS, 'utf8')).days || {};
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  let counterOn = false;
  try {
    counterOn = Boolean(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'platform', 'counter', 'site.json'), 'utf8')).url);
  } catch { /* absent means off */ }
  const r = report({ channels, days, counterOn });
  if (argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  console.log(`Per-channel arrivals (unit: page loads by browsers that did not opt out; not people). All page loads on file: ${r.pageLoads}.`);
  for (const row of r.rows) {
    const tag = row.ref ? `?ref=${row.ref}` : '-';
    console.log(`  ${row.id.padEnd(26)} ${String(row.rung).padEnd(9)} ${tag.padEnd(15)} ${row.reading}${row.suggest ? `  -> ready for rung "measured"` : ''}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
