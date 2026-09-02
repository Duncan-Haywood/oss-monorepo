/**
 * The portfolio's front door: the page served at `https://marisstella.dev/`.
 *
 * ## Why this exists at all
 *
 * `gitops/prod/portfolio-apex.yaml` claimed the apex and `www` on 2026-08-28
 * and answered both with a 301 to `https://tools.marisstella.dev/`. That was
 * the right call for consolidating link equity onto one canonical host — and
 * it has, since the day it merged, redirected every visitor to a hostname that
 * serves nothing, because `portfolio-site.yaml`'s pods fail closed on the
 * unsealed Secret `portfolio-site-repo`. `platform/ci/publish_surface.py
 * --check` prints that dead end as a note under both hostnames.
 *
 * So the portfolio's only two reachable names spend a TLS handshake and a
 * round trip to hand a stranger a redirect into a black hole. This page is
 * what they answer with instead.
 *
 * ## Why it is generated rather than hand-written HTML in the manifest
 *
 * Two of its claims are counts — "169 free tools", and one per category — and
 * a marketing page that states a number the repository has since outgrown is
 * worse than one that states none. The counts are derived here from
 * `platform/pages/launched.json`, which is the same file `check.mjs` already
 * fails the site build over when a published tool is missing from it, so it is
 * the one list in this repository that cannot silently drift from what is
 * actually published.
 *
 * The output is committed (`gitops/prod/front-door/index.html`) because Argo
 * CD, not a CI job, is what delivers it: kustomize reads that file into a
 * ConfigMap and the pod mounts it. `front-door.test.mjs` regenerates and
 * compares, so a stale commit fails the suite with the command that fixes it.
 *
 * ## Why it does not list the tools
 *
 * Because `tools.marisstella.dev` does, and `portfolio-apex.yaml`'s own
 * comment explains at length why two hostnames must not serve the same bytes:
 * `build.mjs` stamps one canonical host into all 524 pages, and a second copy
 * in front of a crawler undoes that. This page is a different document — what
 * the portfolio is, who the tools are for, and one link per category into the
 * hub — with its own canonical URL. It stays distinct on purpose.
 *
 * That is also what keeps it from becoming dead weight once the clone token is
 * sealed. A front door describing the collection is what a brand apex is for;
 * the tools live one hop away either way.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every path this page links to comes from `build.mjs`, never from a string
// typed here. These four exports are what that build stamps into the site's
// own navigation, so a renamed category prefix or a moved feed changes this
// page in the same commit instead of leaving the apex pointing at a 404 that
// nothing on the tools host would notice.
import {
  ABOUT_PATH,
  ALL_CATEGORIES,
  FEED_FILE,
  SOCIAL_CARD_FILE,
  categoryFor,
  categoryPagePath,
} from '../pages/build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

export const LAUNCHED_FILE = path.join(REPO_ROOT, 'platform', 'pages', 'launched.json');

/**
 * Where `--write` puts the rendered page.
 *
 * Inside `gitops/prod/` rather than beside this script because the file is an
 * input to a kustomize `configMapGenerator`, and kustomize resolves generator
 * file paths relative to the kustomization. Keeping it under the directory it
 * is consumed from means the manifest never reaches up out of `gitops/`.
 */
export const OUTPUT_FILE = path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', 'index.html');

/** The apex itself — this page's own canonical URL. */
export const FRONT_DOOR_URL = 'https://marisstella.dev/';

/** The canonical host every tool page is stamped with; see `build.mjs`. */
export const TOOLS_URL = 'https://tools.marisstella.dev/';

/**
 * What the collection calls itself.
 *
 * Taken from the built site rather than invented here: `build.mjs` stamps
 * exactly this string into the hub's `og:site_name` and into the `isPartOf`
 * of every page's JSON-LD. The apex and the tools host are one brand, and a
 * front door that introduced a second name for it — a project codename, or
 * the bare domain — would be the first place a visitor met the discrepancy.
 */
export const SITE_NAME = 'Free small-business calculators';

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** JSON-LD is embedded in a `<script>`; `</` inside it would close the tag early. */
const jsonLd = (value) => JSON.stringify(value, null, 2).replaceAll('</', '<\\/');

/**
 * How many published tools sit in each category, and the total.
 *
 * Reads the launch list rather than the `ventures/` directory: a directory can
 * exist without being published (`EXCLUDED_SLUGS` in `build.mjs`), and the
 * launch list is what the site build already treats as the published set.
 */
export function categoryCounts(slugs) {
  const counts = new Map(ALL_CATEGORIES.map((category) => [category.id, 0]));
  for (const slug of slugs) {
    const id = categoryFor(slug).id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Categories in the order the page shows them: biggest first.
 *
 * Not the order `ALL_CATEGORIES` declares, which is the order the rules are
 * *tested* in and therefore an implementation detail of slug matching. A
 * visitor scanning seven cards should meet the 116-tool section before the
 * 4-tool one. Ties keep declaration order so the output stays deterministic.
 *
 * A category with nothing published in it is dropped: an empty card is a link
 * to an empty page, and `build.mjs` does not emit a category page for a
 * category with no members either.
 */
export function orderedCategories(counts) {
  return ALL_CATEGORIES.map((category, index) => ({
    ...category,
    count: counts.get(category.id) ?? 0,
    index,
  }))
    .filter((category) => category.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index);
}

/**
 * The one-sentence promise under the headline.
 *
 * Every clause is a claim the site already makes on its About page and on
 * every social card ("Runs in your browser · nothing you type is uploaded"),
 * with the same hedge the category pages carry: a tool that calls out to an
 * external API says so on its own page. Written without a number so it cannot
 * become false when the exception list changes — `build.mjs` names the
 * exceptions where a visitor is about to use one, which is where that belongs.
 */
export const PROMISE =
  'Free, no signup, no account. Each tool runs in your browser — where one needs to look something up online, its own page says so before you use it.';

const HOW_IT_WORKS = [
  {
    title: 'Open it and use it',
    body:
      'No sign-up, no trial, no seat count. Every tool is the full tool: the same arithmetic, the same printable output, whether it is your first visit or your hundredth.',
  },
  {
    title: 'Your numbers stay yours',
    body:
      'The calculators run as JavaScript on your own device. There are no accounts, no tracking cookies and no analytics vendor — the hosting counts anonymous page views and nothing about who asked for them.',
  },
  {
    title: 'Free while we learn what is useful',
    body:
      'Nothing here takes payment, and no feature is held back behind one. What people actually come back to is what gets built out next, so using a tool is the whole of what we ask.',
  },
];

/**
 * The two paragraphs `PRODUCT_PLAYBOOK.md` §5b requires on a hosted surface.
 *
 * Carried in full rather than linked: this page is itself a hosted surface, it
 * is not built by `platform/pages/build.mjs`, and so the no-SLA injection that
 * covers every tool page does not reach it. The no-warranty paragraph names
 * what these tools are not advice about, in the same shape the ventures use.
 */
const NO_WARRANTY =
  'These tools are provided free and as-is, without warranty of any kind, express or implied. They are not legal, tax, financial, engineering or professional advice, and they do not replace a qualified professional. You are responsible for reviewing and verifying any output before relying on it, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from their use.';

const NO_SLA =
  'Best-effort hosting, no SLA. These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record. If a tool needs to survive, export your inputs and run it yourself.';

const STYLE = `
  :root {
    color-scheme: light dark;
    --ink: #16191d;
    --ink-soft: #454c55;
    --paper: #fbfaf8;
    --card: #ffffff;
    --rule: #ddd8d0;
    --link: #12506b;
    /* The call to action needs its own pair rather than reusing --link on a
       white foreground. In dark mode --link is a pale blue, and white text on
       it measured 1.93:1 — a headless contrast pass caught it before this page
       ever shipped. The button inverts instead: pale fill, dark ink. */
    --cta-bg: #12506b;
    --cta-fg: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #eceef1;
      --ink-soft: #b3bac3;
      --paper: #14171a;
      --card: #1c2025;
      --rule: #333940;
      --link: #7fc4e2;
      --cta-bg: #7fc4e2;
      --cta-fg: #10161a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main, header, footer { max-width: 62rem; margin: 0 auto; padding: 0 1.25rem; }
  header { padding-top: 3.5rem; padding-bottom: 1rem; }
  h1 { font-size: clamp(1.9rem, 5vw, 2.9rem); line-height: 1.15; margin: 0 0 0.75rem; letter-spacing: -0.015em; }
  .lede { font-size: clamp(1.05rem, 2.4vw, 1.2rem); color: var(--ink-soft); margin: 0 0 1.5rem; max-width: 44rem; }
  .cta {
    display: inline-block;
    background: var(--cta-bg);
    color: var(--cta-fg);
    text-decoration: none;
    font-weight: 600;
    padding: 0.7rem 1.3rem;
    border-radius: 0.4rem;
  }
  .cta:hover, .cta:focus { filter: brightness(1.1); }
  h2 { font-size: 1.35rem; margin: 2.75rem 0 1rem; }
  .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); padding: 0; list-style: none; margin: 0; }
  .card {
    background: var(--card);
    border: 1px solid var(--rule);
    border-left: 4px solid var(--accent, var(--rule));
    border-radius: 0.5rem;
    padding: 1rem 1.1rem;
  }
  .card h3 { margin: 0 0 0.15rem; font-size: 1.05rem; }
  .card h3 a { color: var(--link); text-decoration: none; }
  .card h3 a:hover, .card h3 a:focus { text-decoration: underline; }
  .count { display: block; font-size: 0.82rem; color: var(--ink-soft); margin-bottom: 0.5rem; }
  .card p { margin: 0; color: var(--ink-soft); font-size: 0.94rem; }
  .rows { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); padding: 0; list-style: none; margin: 0; }
  .rows h3 { margin: 0 0 0.3rem; font-size: 1rem; }
  .rows p { margin: 0; color: var(--ink-soft); font-size: 0.94rem; }
  footer { border-top: 1px solid var(--rule); margin-top: 3.5rem; padding-top: 1.5rem; padding-bottom: 3rem; color: var(--ink-soft); font-size: 0.88rem; }
  footer a { color: var(--link); }
  footer p { max-width: 52rem; }
  .fine strong { color: var(--ink); }
`;

/**
 * Render the page.
 *
 * Pure: everything it needs is passed in, so the test can render a fixed list
 * of slugs and assert on the numbers without touching the repository.
 */
export function renderFrontDoor({ slugs, toolsUrl = TOOLS_URL, canonical = FRONT_DOOR_URL } = {}) {
  const list = [...slugs].sort();
  const counts = categoryCounts(list);
  const categories = orderedCategories(counts);
  const total = list.length;
  const description = `${total} free calculators and checks for trade contractors, marketplace sellers, and small service businesses. Runs in your browser, no signup.`;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: canonical,
    description,
    inLanguage: 'en',
    isAccessibleForFree: true,
    hasPart: categories.map((category) => ({
      '@type': 'CollectionPage',
      name: category.title,
      url: `${toolsUrl}${categoryPagePath(category.id)}`,
      description: category.blurb,
    })),
  };

  const cards = categories
    .map(
      (category) => `        <li class="card" style="--accent: ${escapeHtml(category.accent)}">
          <h3><a href="${escapeHtml(`${toolsUrl}${categoryPagePath(category.id)}`)}">${escapeHtml(category.title)}</a></h3>
          <span class="count">${category.count} ${category.count === 1 ? 'tool' : 'tools'}</span>
          <p>${escapeHtml(category.blurb)}</p>
        </li>`,
    )
    .join('\n');

  const how = HOW_IT_WORKS.map(
    (item) => `        <li>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.body)}</p>
        </li>`,
  ).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(SITE_NAME)} — ${total} tools for people who quote, sell and bill</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(SITE_NAME)} — ${total} tools for people who quote, sell and bill">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(`${toolsUrl}${SOCIAL_CARD_FILE}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index, follow">
<style>${STYLE}</style>
<script type="application/ld+json">
${jsonLd(structuredData)}
</script>
</head>
<body>
<header>
  <h1>${total} free tools for people who quote, sell and bill</h1>
  <p class="lede">${escapeHtml(PROMISE)}</p>
  <p><a class="cta" href="${escapeHtml(toolsUrl)}">Browse all ${total} tools</a></p>
</header>
<main>
  <h2>What is here</h2>
  <ul class="grid">
${cards}
  </ul>

  <h2>How it works</h2>
  <ul class="rows">
${how}
  </ul>
</main>
<footer>
  <p><a href="${escapeHtml(toolsUrl)}">All ${total} tools</a> · <a href="${escapeHtml(`${toolsUrl}${ABOUT_PATH}`)}">About these tools</a> · <a href="${escapeHtml(`${toolsUrl}${FEED_FILE}`)}">New tools feed</a></p>
  <p class="fine"><strong>No warranty.</strong> ${escapeHtml(NO_WARRANTY)}</p>
  <p class="fine"><strong>Best-effort hosting, no SLA.</strong> ${escapeHtml(NO_SLA.replace('Best-effort hosting, no SLA. ', ''))}</p>
</footer>
</body>
</html>
`;
}

/** The published slugs, read from the launch list the site build already pins. */
export async function publishedSlugs(file = LAUNCHED_FILE) {
  const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  return Object.keys(parsed.launched ?? {});
}

export async function buildFrontDoor() {
  return renderFrontDoor({ slugs: await publishedSlugs() });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const html = await buildFrontDoor();
  if (process.argv.includes('--write')) {
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await fs.writeFile(OUTPUT_FILE, html);
    console.log(`wrote ${path.relative(REPO_ROOT, OUTPUT_FILE)} (${html.length} bytes)`);
  } else {
    process.stdout.write(html);
  }
}
