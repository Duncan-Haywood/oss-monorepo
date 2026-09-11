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
 * ## Why it does not list the whole catalogue
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
 *
 * ## The one exception: the tools this host serves itself
 *
 * Every link above points at `tools.marisstella.dev`, which serves nothing
 * until `portfolio-site-repo` is sealed — so for the whole life of this page a
 * visitor who acted on any of it reached a dead host. `front-door-tools.mjs`
 * mirrors a curated set of complete ventures into this host's own ConfigMap,
 * and `renderFrontDoor`'s `mirrored` argument is the section that names them.
 *
 * That does not reopen the two-hosts-one-canonical question above, because
 * there are not two hosts: `tools.marisstella.dev` serves nothing pending an
 * owner-only seal, so the apex is the sole host answering for these pages and
 * each one's canonical says so. `TOOLS_HOST_SERVES` in that module is the
 * switch, and its header carries the full argument.
 *
 * `mirrored` defaults to empty, so deleting the mirror after the seal removes
 * this section without touching anything here.
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
  COMPARE_PATH,
  COMPARISON_FILE_PATTERN,
  FEED_FILE,
  SOCIAL_CARD_FILE,
  categoryFor,
  categoryPageCopy,
  categoryPagePath,
  comparisonProductGroups,
  comparisonProductPath,
  comparisonProductSlug,
  comparisonSubject,
  comparisonSubjectKey,
  groupBySubcategory,
  groupComparisons,
  truncate,
} from '../pages/build.mjs';

// The feed's ordering, cap and `<updated>` rule come from the module that owns
// the launch dates, not from a second implementation here: `renderFrontDoorFeed`
// and `build.mjs`'s `renderFeed` are two views of one list, and a divergence in
// how they sort or cap it would show up as a reader's feed re-ordering itself
// the day the seal lands.
import { FEED_MAX_ENTRIES, feedUpdatedAt, isIsoDate, orderForFeed } from '../pages/launched.mjs';

// The gzip used for the comparison keys, imported from the module that owns
// the mirror's compression rather than re-derived. `GZIP_LEVEL` and the pinned
// `GZIP_HEADER` are what make the committed bytes reproducible, so a second
// `zlib.gzipSync` call here with its own options would produce a diff on every
// regeneration and no test would say why. See `COMPRESSED_SUFFIX`.
import { compress } from './front-door-tools.mjs';

// The share card is drawn, not copied: `renderSocialCard` is the same
// dependency-free PNG encoder `build.mjs` uses for the hub's card, so the apex
// and the tools host show one mark rather than two pictures that drift.
import { SOCIAL_CARD_HEIGHT, SOCIAL_CARD_WIDTH, THEME_COLOR, renderSocialCard } from '../pages/offline.mjs';

// The embed runtime and its stylesheet, imported rather than restated.
//
// `platform/pages/embed.mjs` calls itself "Priority 1 of the
// marketing-distribution queue item", and until now it shipped only on
// `tools.marisstella.dev` -- the host that fails closed on the unsealed
// `portfolio-site-repo` Secret and has never served a byte. So the portfolio's
// best organic-distribution asset reached nobody, while the apex served all
// 169 tools with no way for a stranger's page to host one. That is the same
// shape as the `ENTRY_OVERRIDES` bug `CLAUDE.md` records: a surface the
// canonical build knows how to make, on a host that does not serve.
//
// Imported, never copied, for the reason `CLAUDE.md` gives twice: restating a
// rule that lives in another module froze the wrong half of it in place and
// cost live product both times. The runtime is already host-agnostic -- it
// reads `data-pf-embed-url`/`-title`/`-slug` off its own script tag -- so the
// apex needs the same bytes, not a variant of them.
import {
  renderEmbedHostModule,
  renderEmbedModule,
  renderEmbedStyle,
  EMBED_HOST_FILE,
  EMBED_MODULE_FILE,
  EMBED_STYLE_FILE,
  EMBED_QUERY_PARAM,
  DEFAULT_EMBED_HEIGHT,
} from '../pages/embed.mjs';

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

/** The file name the page points `rel="icon"` at, and nginx serves. */
export const FAVICON_FILE = 'favicon.svg';

/**
 * The tab mark, and why it is SVG rather than a drawn PNG.
 *
 * Every browser requests `/favicon.ico` unprompted on the first view of an
 * origin, and until this existed the apex answered that with a 404 on every
 * single visit -- so the portfolio's one public page spent its whole life
 * showing a blank default tab icon and logging a miss for each visitor. A
 * declared `rel="icon"` is also what stops the unprompted `/favicon.ico`
 * request being made at all, so this fixes the blank tab and the 404 together.
 *
 * SVG rather than the `renderSocialCard` PNG encoder used for the share card:
 * at 16x16 a drawn raster of the wordmark is unreadable, the file is a few
 * hundred bytes of text against a ConfigMap that stores it verbatim, and it
 * stays sharp on any display. Modern browsers take `image/svg+xml` for an
 * icon; the ones that do not simply fall back to no icon, which is what they
 * had before, so there is no case this makes worse.
 *
 * The mark is the site's initial on `THEME_COLOR` -- the same constant
 * `offline.mjs` gives the tools host -- so the apex and the tools host show
 * one identity rather than two, for the same reason the share card is drawn
 * from the shared encoder rather than copied.
 */
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Maris Stella">
  <rect width="64" height="64" rx="12" fill="${THEME_COLOR}"/>
  <text x="32" y="45" font-family="Georgia, 'Times New Roman', serif" font-size="38" font-weight="700" fill="#ffffff" text-anchor="middle">M</text>
</svg>
`;

/** Where `--write` puts the tab mark, beside the page that declares it. */
export const FAVICON_OUTPUT_FILE = path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', FAVICON_FILE);

/**
 * Where `--write` puts the share card, beside the page that references it.
 *
 * The apex has to serve this file itself, and that is the whole point of it
 * existing here. Until 2026-09-02 the page's `og:image` pointed at
 * `https://tools.marisstella.dev/social-card.png` — a file `build.mjs` does
 * emit, on a host whose pods fail closed on the unsealed Secret
 * `portfolio-site-repo`. So the one public surface this portfolio has was
 * handing every link preview — Slack, LinkedIn, iMessage, a forum embed — an
 * image URL that does not resolve, and `summary_large_image` degrades to a
 * bare text row when the image is missing. That is a marketing defect on the
 * only page anyone can reach, and it is invisible from the page itself: the
 * front door renders perfectly for the person who typed the domain, and badly
 * for everyone they then share it with.
 *
 * The card is ~6 KB against the same 1 MiB ConfigMap ceiling the 34 MB tool
 * site cannot fit under, so serving it from the apex costs nothing the front
 * door was not already paying. Unlike the tool mirror, this file does *not*
 * become redundant when the clone token is sealed — the apex is its own
 * canonical page with its own `og:url`, so it needs its own image regardless.
 */
export const SOCIAL_CARD_OUTPUT_FILE = path.join(
  REPO_ROOT,
  'gitops',
  'prod',
  'front-door',
  SOCIAL_CARD_FILE,
);

/** The apex itself — this page's own canonical URL. */
export const FRONT_DOOR_URL = 'https://marisstella.dev/';

/** The canonical host every tool page is stamped with; see `build.mjs`. */
export const TOOLS_URL = 'https://tools.marisstella.dev/';

/** The file name crawlers fetch unprompted before anything else on an origin. */
export const ROBOTS_FILE = 'robots.txt';

/** The sitemap `robots.txt` points at, and nginx serves. */
export const SITEMAP_FILE = 'sitemap.xml';

/** Where `--write` puts the two, beside the page they describe. */
export const ROBOTS_OUTPUT_FILE = path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', ROBOTS_FILE);
export const SITEMAP_OUTPUT_FILE = path.join(
  REPO_ROOT,
  'gitops',
  'prod',
  'front-door',
  SITEMAP_FILE,
);

/** Where `--write` puts the apex's own Atom feed. See `renderFrontDoorFeed`. */
export const FEED_OUTPUT_FILE = path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', FEED_FILE);

/**
 * `robots.txt` for the apex, and why it allows everything.
 *
 * ## What this replaces
 *
 * The catch-all `location /` in `front-door/default.conf` answers *every* path
 * with `index.html`, which is deliberate for a mistyped URL and wrong for the
 * two paths a crawler asks for by convention. Until this file existed, a
 * crawler fetching `https://marisstella.dev/robots.txt` was handed 16 KB of
 * HTML with a `200` and `Content-Type: text/html` — the same failure the
 * `/social-card.png` block above was added to fix, on the one file every
 * crawler requests before it reads a single page.
 *
 * A 200 carrying unparseable content is the worst of the three outcomes here.
 * A 404 is a clean "no restrictions, no sitemap" that every crawler
 * understands; a valid file is better still. HTML with a 200 is neither: the
 * portfolio's only indexable surface has been answering the discovery
 * handshake with a document that does not parse as a directive.
 *
 * ## Why `Allow: /` and not a `Disallow` on the mirror
 *
 * The obvious-looking line to add here is `Disallow: /tools/`, and while the
 * mirrored pages were `noindex` on behalf of the tools host it looked like the
 * tidy way to say so. It would have been a mistake then and is plainly one now
 * that those pages are the apex's own to index, and the reason it was never
 * right is the standard trap:
 *
 * `robots.txt` governs *crawling*, not *indexing*. A crawler that is
 * disallowed from `/tools/` never fetches those pages, and therefore never
 * reads the robots meta `injectMirrorTags` puts in each one. A URL blocked
 * from crawling but linked to from an indexable page can still be indexed
 * URL-only — title and bare link, no content.
 *
 * That cut both ways, which is why the line was always wrong. While the pages
 * were `noindex` it would have *weakened* the exclusion, because a directive
 * is only obeyed by a crawler allowed to read it. Now that they are indexable
 * it would block the catalogue outright. `Allow: /` is what lets the pages'
 * own directive — whichever one `MIRROR_ROBOTS_CONTENT` currently says —
 * reach the only layer that can enforce it.
 */
export const ROBOTS_TXT = `# ${FRONT_DOOR_URL}${ROBOTS_FILE}
#
# Crawling is unrestricted on purpose, and so is indexing. This host serves
# the tools under /tools/ itself, so it is their canonical home and they say
# so; the sitemap lists every one of them. See TOOLS_HOST_SERVES in
# platform/marketing/front-door-tools.mjs for when that changes back.
#
# A Disallow would be the wrong tool either way. robots.txt governs crawling,
# not indexing: a disallowed page is never fetched, so a directive inside it
# is never read, and the URL can still be indexed bare.
User-agent: *
Allow: /

Sitemap: ${FRONT_DOOR_URL}${SITEMAP_FILE}
`;

/**
 * The sitemap: the apex page, plus every mirrored page the apex may index.
 *
 * ## Why this is no longer one URL
 *
 * It was, and the reasoning was sound on its own premise: listing a `noindex`
 * URL in a sitemap is a direct contradiction — the sitemap asks a crawler to
 * index what the page then tells it not to — and search consoles report that
 * as an error rather than resolving it in either direction. So while every
 * mirrored page carried `noindex`, the mirror had to stay out, and this file
 * held the apex alone.
 *
 * `front-door-tools.mjs`'s `TOOLS_HOST_SERVES` is the premise that changed.
 * The mirrored pages were `noindex` on behalf of `tools.marisstella.dev`,
 * which serves nothing and is blocked on an owner-only seal; the apex is the
 * only host answering for those 168 tools. They are indexable there now, and
 * carry a canonical naming the apex, so listing them is the sitemap agreeing
 * with the pages rather than contradicting them.
 *
 * The contradiction rule still holds and is what keeps this honest in the
 * other direction: `pages` is supplied by the caller from the same mirror
 * build that stamps the robots meta, so when `TOOLS_HOST_SERVES` flips back to
 * `true` the pages go `noindex` and `buildFrontDoor` stops passing them here
 * in the same commit. The two cannot disagree.
 *
 * ## Why every page and not just the 168 entry points
 *
 * 409 of the 577 mirrored pages are comparison pages, how-to guides and
 * question pages — the long-tail assets that earn a search visit for a
 * specific query. Listing only the tool index pages would omit exactly the
 * documents most likely to rank, and a crawler reaching them by link alone
 * discovers them slower and revisits them less.
 *
 * No `<lastmod>`. The honest value would be the commit date of
 * `front-door/index.html`, which this generator cannot read without making its
 * output depend on git state — and a `<lastmod>` stamped with the *build* time
 * would change on every regeneration, so `--write` would dirty the tree on
 * runs that changed nothing and the staleness test below could never pass
 * twice. `<lastmod>` is optional in the protocol and an inaccurate one is
 * worse than none, since crawlers weight it and a date that moves without the
 * content moving is a signal that trains them to stop trusting it.
 */
export function renderSitemap({ pages = [] } = {}) {
  // Root-relative (`/tools/<slug>/`) is what the mirror deals in; the protocol
  // requires absolute URLs, and `FRONT_DOOR_URL` carries its own trailing
  // slash, so the leading one is dropped rather than doubled.
  const origin = FRONT_DOOR_URL.replace(/\/$/, '');
  // Sorted and de-duplicated so a regeneration that changed nothing writes
  // byte-identical output — the same property `<lastmod>`'s absence buys
  // below, and what lets the staleness test pass twice.
  const locs = [FRONT_DOOR_URL, ...new Set(pages.map((p) => `${origin}${p}`))].sort();
  const entries = locs.map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

/**
 * The apex's own Atom feed, over the tools this host actually serves.
 *
 * ## The defect this fixes
 *
 * The footer of this page offered three links — "All 169 tools", "About these
 * tools", "New tools feed" — and every one of them pointed at
 * `tools.marisstella.dev`, which serves nothing until `portfolio-site-repo` is
 * sealed. That is the same dead end `front-door-tools.mjs` fixed for the hero
 * copy and the comment on `cards` fixed for the category headings, still live
 * in the page's third and last navigation block. It was the worst of the three
 * cases, because unlike the header's fine print it carried no warning at all:
 * the page said "goes live when its access token is sealed" two screens above
 * a bare link that did not.
 *
 * The feed is the link that mattered most. `gitops/agents/workers/mandate.md`
 * calls it the mechanism by which "a reader, an aggregator, or a community's
 * own moderators pick a tool up without us publishing outward" — the
 * portfolio's only organic distribution channel that does not require the
 * owner to post anything anywhere. It has been dead on the only reachable
 * hostname for the whole life of this page.
 *
 * ## Why a second feed does not double anyone's subscription
 *
 * `build.mjs`'s `renderFeed` mints entry ids as
 * `tag:marisstella.dev,2026:tool/<slug>` — an RFC 4151 tag URI keyed on the
 * slug, with the authority *fixed* rather than taken from the base URL, and its
 * comment says why in as many words: so that serving the same build from two
 * hostnames "does not mint two different ids for one tool and double every
 * subscriber's feed". This renderer reuses that exact id function.
 *
 * So a reader subscribed here who later moves to the tools host's feed sees
 * entries they have already read stay read, and a reader subscribed to both is
 * not notified twice. That property is what makes this feed safe to ship as a
 * stopgap and safe to delete afterwards, which is the same contract the mirror
 * itself keeps.
 *
 * ## Why the entries link here rather than at the canonical
 *
 * `<link rel="alternate">` points at `/tools/<slug>/` on this host, not at the
 * tool's canonical `tools.marisstella.dev` URL. The canonical is the correct
 * long-run address and it is also, today, a host that answers nothing — and a
 * feed whose every entry is a dead link is worse than no feed, because a reader
 * who follows one concludes the project is abandoned rather than that one
 * hostname is pending.
 *
 * There is no SEO cost to that choice, and there no longer needs to be an
 * argument for why: the apex URL a feed entry carries is now also the page's
 * canonical, so the feed and the crawler are pointed at the same place. (While
 * the mirror was `noindex` the cost was nil for a different reason — nothing
 * there was eligible to consolidate at all.) A feed is read by people and
 * aggregators, and both want the URL that works.
 *
 * ## Scope
 *
 * Only the mirrored tools. The other 116 are not reachable from this host, so
 * listing them would rebuild the dead end one layer down. `<subtitle>` says so
 * rather than leaving a reader to infer that a feed on a 169-tool site carries
 * 53 entries because the rest are old.
 *
 * `<updated>` is the newest entry's launch date, never the build time, for the
 * reason `feedUpdatedAt` gives: a rebuild that changed nothing must not tell
 * every aggregator that something changed. That is also what keeps `--write`
 * from dirtying the tree on a no-op run, which the staleness test depends on.
 */
export function renderFrontDoorFeed({ mirrored = [], launched = {} } = {}) {
  const dated = orderForFeed(mirrored, launched).filter((tool) => isIsoDate(launched[tool.slug]));
  const entries = dated.slice(0, FEED_MAX_ENTRIES);
  const updated = feedUpdatedAt(dated, launched);

  const entryXml = (tool) => {
    const date = `${launched[tool.slug]}T00:00:00Z`;
    const summary = String(tool.description ?? '').replace(/\s+/g, ' ').trim();
    return `  <entry>
    <title>${escapeHtml(tool.title)}</title>
    <link rel="alternate" type="text/html" href="${escapeHtml(`${FRONT_DOOR_URL.replace(/\/$/, '')}${tool.url}`)}"/>
    <id>${escapeHtml(feedEntryId(tool.slug))}</id>
    <published>${date}</published>
    <updated>${date}</updated>
    <category term="${escapeHtml(categoryFor(tool.slug).title)}"/>${
      summary ? `\n    <summary type="text">${escapeHtml(summary)}</summary>` : ''
    }
  </entry>`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeHtml(SITE_NAME)} — tools on ${escapeHtml(FRONT_DOOR_HOST)}</title>
  <subtitle>${escapeHtml(subtitleFor(mirrored.length, entries.length))}</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeHtml(`${FRONT_DOOR_URL}${FEED_FILE}`)}"/>
  <link rel="alternate" type="text/html" href="${escapeHtml(FRONT_DOOR_URL)}"/>
  <id>${escapeHtml(FEED_ID)}</id>
  <updated>${updated ?? EMPTY_FEED_UPDATED}</updated>
  <rights>Tools are MIT-licensed. They are estimates and records to act on, not professional advice.</rights>
${entries.map(entryXml).join('\n')}
</feed>
`;
}

/**
 * What the feed says it is, in the two states it has.
 *
 * The count matters and is easy to get wrong: `FEED_MAX_ENTRIES` caps the feed
 * at 40 while the mirror serves 53, so a subtitle written from `entries.length`
 * would tell a subscriber this host serves 40 tools — a false claim about the
 * product, generated by an implementation detail of the feed. The first draft
 * of this function did exactly that.
 *
 * So the subtitle states the real number served and, only when the cap is
 * actually biting, says the feed carries the newest slice of it. That is the
 * same distinction `renderFeed`'s own comment draws: the feed is the "new"
 * list, not another catalogue, and a tool that scrolls off is still on the
 * page.
 */
export function subtitleFor(served, listed) {
  const catalogue = TOOLS_URL.replace(/^https:\/\//, '').replace(/\/$/, '');
  const scope =
    listed < served
      ? `The ${served} free, browser-only tools served directly from ${FRONT_DOOR_HOST} — the newest ${listed} of them listed here, newest first.`
      : `The ${served} free, browser-only tools served directly from ${FRONT_DOOR_HOST}, newest first.`;
  return `${scope} No account, no upload: every number stays on your own device. The full catalogue is larger and lives at ${catalogue}.`;
}

/**
 * An entry's stable id, shared with the tools host's feed on purpose — see the
 * "double anyone's subscription" section above. Kept as a named function
 * rather than inlined so the shape cannot drift from `build.mjs`'s `tagId`
 * without `front-door.test.mjs`'s cross-check failing.
 */
export const feedEntryId = (slug) => `tag:marisstella.dev,2026:tool/${slug}`;

/** The feed document's own id. Distinct from the tools host's, which names the site rather than this host's subset. */
export const FEED_ID = 'tag:marisstella.dev,2026:front-door-tools';

/** The apex's bare hostname, for copy that names it. */
export const FRONT_DOOR_HOST = FRONT_DOOR_URL.replace(/^https:\/\//, '').replace(/\/$/, '');

/**
 * The `<updated>` of a feed with no dated entry.
 *
 * A fixed instant rather than `new Date()`: an Atom feed's `<updated>` is
 * required, and generating one from the clock would make `--write` dirty the
 * tree on every run and the staleness test unpassable. This value is only ever
 * reached with an empty mirror, which is the post-seal state in which the whole
 * file is deleted — `check.mjs` and the mirror's own tests are what stop a
 * populated mirror from arriving here undated.
 */
export const EMPTY_FEED_UPDATED = '2026-08-28T00:00:00Z';

/** The well-known path a model fetches without having to discover it first. */
export const LLMS_FILE = 'llms.txt';

/** Where `--write` puts it, beside the page it describes. */
export const LLMS_OUTPUT_FILE = path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', LLMS_FILE);

/** The structured half of the same handshake. See `renderFrontDoorCatalog`. */
export const CATALOG_FILE = 'catalog.json';

/** Where `--write` puts it, beside the page it describes. */
export const CATALOG_OUTPUT_FILE = path.join(
  REPO_ROOT,
  'gitops',
  'prod',
  'front-door',
  CATALOG_FILE,
);

/**
 * Where `--write` puts the embed runtime and its stylesheet.
 *
 * At the apex document root, one copy for all 169 mirrored tools, on the same
 * precedent `pf-rates.js` set on the tools host: every mirrored entry page
 * links these two absolute paths, so a per-tool copy would be 169 identical
 * files in a ConfigMap with an 8 MB ceiling.
 *
 * They live beside the front page rather than inside `front-door-tools/`
 * because that is which nginx block serves them — the mirror's shards are
 * routed under `/tools/…`, and these answer at `/`.
 */
export const EMBED_MODULE_OUTPUT_FILE = path.join(
  REPO_ROOT,
  'gitops',
  'prod',
  'front-door',
  EMBED_MODULE_FILE,
);
export const EMBED_STYLE_OUTPUT_FILE = path.join(
  REPO_ROOT,
  'gitops',
  'prod',
  'front-door',
  EMBED_STYLE_FILE,
);
/**
 * The resizer, same root, one extra reason to be here: unlike the two above it
 * is not linked by any page this host serves. It is named by the `<script src>`
 * in the embed snippet every mirrored entry page offers for copying, so it has
 * to answer at the apex or the second line of every published snippet 404s on
 * a stranger's site — a failure that is invisible from here and visible to
 * exactly the people this feature is for.
 */
export const EMBED_HOST_OUTPUT_FILE = path.join(
  REPO_ROOT,
  'gitops',
  'prod',
  'front-door',
  EMBED_HOST_FILE,
);

/**
 * `catalog.json` for the apex — the machine-readable index of what this host
 * actually serves.
 *
 * ## Why this host needs its own
 *
 * `build.mjs` writes a `catalog.json` for the tools host and makes the case
 * for the format: it is the flat, parseable thing a directory, an aggregator
 * or an assistant answering "is there a free tool that does X" can fetch and
 * filter in one request, without parsing a page of markup or reading prose.
 *
 * That file is on a host that serves nothing until `portfolio-site-repo` is
 * sealed. So the structured index of this collection has, until now, existed
 * only at an address nothing answers, while the one hostname a client can
 * actually reach served 168 tools and no machine-readable index of them at
 * all. `llms.txt` is markdown for a model to read; this is JSON for a client
 * to parse. They are different consumers and the apex was missing the second.
 *
 * `renderFrontDoorLlms`'s `## Optional` section named this file as
 * "deliberately absent ... lives on the tools host and is not served here".
 * That premise is what this change retires: it is served here now, so
 * `renderFrontDoorLlms` lists it.
 *
 * ## Why it lists only the mirrored tools
 *
 * Same reason `renderFrontDoorFeed` and `renderFrontDoorLlms` do, and it is
 * sharpest in this file. Every entry here carries a `url`, and a client that
 * parses JSON will follow one without a human ever reading it — so listing the
 * unmirrored tools would hand aggregators a machine-checkable list of dead
 * links to republish. `collection_total` states the wider figure as a number
 * instead, which is a fact rather than a link, and `served_here` says plainly
 * that this file covers only part of it. A consumer diffing the two learns the
 * catalogue is larger without being given anywhere broken to go.
 *
 * ## Shape
 *
 * Deliberately the same envelope as `build.mjs`'s `renderCatalog` — same key
 * names, same `price`/`privacy`/`license` vocabulary, same per-tool fields — so
 * a client that learns to read one reads the other, and the day the seal lands
 * and both hosts serve a catalogue they do not disagree about what a tool is.
 * The two fields that differ are the two that must: `generated_by` names the
 * generator that actually wrote the file, and `served_here`/`collection_total`
 * exist only here, because only here is the answer a subset.
 *
 * No `sponsor` or funding key, matching `renderCatalog` and for its reason:
 * whether this repo publishes a funding surface is an open owner decision
 * (`funding-sponsors-live`), and a machine-readable file is the wrong place to
 * pre-answer it.
 */
export function renderFrontDoorCatalog({
  mirrored = [],
  total = 0,
  pageCounts = new Map(),
  categories = ALL_CATEGORIES,
} = {}) {
  const base = FRONT_DOOR_URL.replace(/\/$/, '');
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const groups = orderedGroups(mirroredByCategory(mirrored), categories);

  return `${JSON.stringify(
    {
      name: 'Free calculators for sellers, contractors, and small back offices',
      url: FRONT_DOOR_URL,
      license: 'MIT',
      price: { amount: '0', currency: 'USD' },
      privacy: 'client-side-only',
      generated_by: 'platform/marketing/front-door.mjs',
      // The two figures a consumer needs to know this list is a subset. Stated
      // as numbers, never as links to the host that does not answer — see the
      // block comment above.
      served_here: mirrored.length,
      collection_total: total,
      feed: `${FRONT_DOOR_URL}${FEED_FILE}`,
      sitemap: `${FRONT_DOOR_URL}${SITEMAP_FILE}`,
      // Every tool below is embeddable, and until this key existed nothing
      // machine-readable said so. That is a distribution gap rather than a
      // documentation one: this file is the artifact `llms.txt` tells a model
      // to parse instead of scraping, so an assistant asked "is there a free
      // calculator for X I can put on my site" had the tools and no way to
      // learn the answer to the second half of the question.
      //
      // Every claim here is checkable against something that fails CI:
      // `EMBED_QUERY_PARAM` and `DEFAULT_EMBED_HEIGHT` are imported from
      // `embed.mjs` rather than typed, the URL pattern is the one
      // `test_the_entry_page_is_framable_only_with_the_embed_parameter`
      // exercises against real nginx, and the privacy sentence says only what
      // the pages actually do — the calculator computes in the visitor's
      // browser and this origin sets nothing on the host page.
      embed: {
        supported: true,
        url_pattern: `${base}/tools/{slug}/?${EMBED_QUERY_PARAM}=1`,
        how: `Load any tool URL below with ?${EMBED_QUERY_PARAM}=1 inside an <iframe>.`,
        suggested_min_height_px: DEFAULT_EMBED_HEIGHT,
        cost: 'free, including on commercial sites',
        privacy:
          'The calculator runs in the visitor’s browser and computes nothing on our servers. ' +
          'Embedding adds no tracking of any kind to the host page.',
        keeps: 'the same arithmetic and the same disclaimer as the full page, and links back to it',
      },
      // `/c/<id>/` rather than the front page's `#open-<id>` fragment. This
      // was the fragment until the apex grew real category pages, on the
      // reasoning that "a `/c/<id>/` URL would be the tools host's collection
      // page, which serves nothing" — true when it was written, and retired
      // by the change that started serving those seven pages here.
      //
      // `renderFrontDoor`'s own JSON-LD `hasPart` already moved, for a reason
      // that applies harder to this file: structured data is read by exactly
      // the crawlers this portfolio is trying to be found by, and this is the
      // artifact told to "parse this instead" of `llms.txt`. A consumer asking
      // for the logistics tools should get the page that lists them, not a
      // fragment two thirds of the way down a 55 KB home page that it must
      // then scrape.
      //
      // Safe unconditionally, unlike `hasPart`, which needs a `mirrored.length`
      // guard because it renders from `categories` regardless. `groups` comes
      // from `mirroredByCategory(mirrored)` and `categoryPages` from the same
      // split, so a group exists here only when the page it names was rendered
      // in the same build — there is no state where this emits a URL the
      // ConfigMap does not carry.
      categories: groups.map((group) => ({
        id: group.id,
        name: group.title,
        url: apexCategoryUrl(group.id),
        tool_count: group.tools.length,
      })),
      tools: mirrored.map((tool) => ({
        slug: tool.slug,
        name: oneLine(tool.title),
        url: `${base}${tool.url}`,
        category: categoryFor(tool.slug).title,
        description: oneLine(tool.description),
        // Counted from the mirrored files themselves rather than from the
        // venture directory: this number answers "how many pages of this tool
        // can I reach here", and the mirror is what decides that.
        ...(pageCounts.has(tool.slug) ? { pages: pageCounts.get(tool.slug) } : {}),
      })),
    },
    null,
    2,
  )}\n`;
}

/**
 * `llms.txt` for the apex — the AI-discovery half of what the last change fixed
 * for feed readers.
 *
 * ## Why this host needs its own
 *
 * `build.mjs` writes an `llms.txt` for the tools host, and its comment makes
 * the case for the format: `llms.txt` is a well-known path (llmstxt.org), so a
 * model fetches it *without having to discover it first* — which is the whole
 * difference for a portfolio whose growth plan is organic search and AI
 * discovery rather than ad spend. `portfolio/DIRECTION.md` says the same.
 *
 * That file is on a host that serves nothing until `portfolio-site-repo` is
 * sealed. So the one hostname a model can actually reach has, until now,
 * answered `/llms.txt` with 21 KB of HTML and a 200 — the apex already served
 * `robots.txt` and `sitemap.xml` explicitly and had nothing for the channel
 * `DIRECTION.md` names as half the growth plan.
 *
 * ## Why it lists only the mirrored tools
 *
 * Same reason `renderFrontDoorFeed` does, and it matters more here. A model
 * that reads a bullet list of URLs will *cite* those URLs, and a citation is
 * repeated to a user who then clicks it. Listing the other 116 would mint
 * confident recommendations of a host that answers nothing — the dead end this
 * page has been fixing one element at a time, at the one layer where it
 * propagates outward instead of costing a single click.
 *
 * So the catalogue host appears in prose, describing what it will hold, and
 * never as a bullet a model can lift as a link.
 *
 * `## Optional` used to list this host's feed and sitemap and explicitly not
 * `catalog.json`, "which lives on the tools host and is not served here". That
 * was true and is not any more: `renderFrontDoorCatalog` writes one for this
 * host, nginx serves it at `/catalog.json`, and it is listed below. The rule
 * that produced the old exclusion is unchanged — every entry here is a path
 * this host actually answers.
 *
 * ## Format
 *
 * Markdown with one bullet per tool under its category heading, because the
 * file is read by a model rather than parsed by a client and a link list under
 * a heading survives chunking into a context window in a way a nested object
 * does not — `renderLlmsTxt`'s reasoning, kept.
 *
 * Descriptions are flattened to one line each, for the failure `renderLlmsTxt`
 * names: a stray newline inside a bullet silently ends the list item, so a
 * wrapped meta description would publish its second half as body prose.
 */
export function renderFrontDoorLlms({
  mirrored = [],
  total = 0,
  categories = ALL_CATEGORIES,
  comparisonCount = 0,
  compareProducts = [],
} = {}) {
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const grouped = mirroredByCategory(mirrored);
  const catalogue = TOOLS_URL.replace(/^https:\/\//, '').replace(/\/$/, '');

  const bullet = (tool) =>
    `- [${oneLine(tool.title)}](${FRONT_DOOR_URL.replace(/\/$/, '')}${tool.url})${
      oneLine(tool.description) ? `: ${oneLine(tool.description)}` : ''
    }`;

  const sections = orderedGroups(grouped, categories).map(
    (group) => `## ${group.title}\n\n${group.tools.map(bullet).join('\n')}\n`,
  );

  // Whether the mirror is a *subset* of the collection is a fact that changed
  // under this paragraph, and the paragraph did not notice.
  //
  // It was written while `venturePageRoot` could not resolve every venture, so
  // the apex served a proper subset and the honest thing to tell a model was
  // "there are more, they land elsewhere, do not follow me there". The two
  // mirror fixes on 2026-09-03 (162 → 168 → 169) closed that gap: `mirrored`
  // and `total` are now the same number, and the sentence went on asserting a
  // "wider collection" that does not exist and a hostname where the tools
  // "will be published" when they are already published here.
  //
  // That is worse than untidy in this file specifically. `llms.txt` exists to
  // be read by a model that will paraphrase it to a user, and both halves of
  // the stale sentence push that paraphrase somewhere false: it implies the
  // 169 links above are partial (so an assistant hedges, or goes looking for
  // the rest), and it names a dark hostname as the collection's real home (so
  // the answer sends someone to a host that serves nothing). CLAUDE.md flags
  // exactly this misreading — "do not describe the catalogue as dark" — and
  // this was the one place it had leaked into a public, crawler-facing asset.
  //
  // Both branches keep the invariant `front-door.test.mjs` guards, because it
  // is the one that survives either state: the catalogue host is *named* so a
  // model that meets the hostname elsewhere knows not to send anyone there,
  // and it is never *linked*.
  //
  // Both are hard-wrapped to match the body prose above them. The tool bullets
  // are long single lines because a newline inside one silently ends the list
  // item; body paragraphs carry no such constraint and the rest of this file
  // wraps, so an unwrapped paragraph would be the only one.
  const coverage =
    mirrored.length >= total
      ? `Every tool in the collection is listed below — all ${total} of them — and
every one is linked at a URL this host serves. Nothing is held back for
another hostname: ${catalogue} is reserved as this collection's
eventual canonical address, is not serving yet, and is named here only so it
is not mistaken for a fuller index — a link there would resolve to nothing
today.`
      : `Every tool listed below is linked at a URL this host serves. The wider
collection runs to ${total} tools and will be published at ${catalogue}; that
hostname is not serving yet, so it is named here for context and deliberately
not linked — a link there would resolve to nothing today.`;

  // Every tool here is embeddable, and until this paragraph existed nothing a
  // model reads said so.
  //
  // That is a distribution gap rather than a documentation one. The whole
  // argument for the embed widget is that a trade association's resource page
  // or a supplier's blog post is an inbound link and an audience that already
  // exists — and the single most likely way anyone now discovers that these
  // tools *can* go on their page is an assistant answering "is there a free
  // calculator for X I could put on my site". Without this, such an assistant
  // has all 169 tools listed above and no way to answer the second half.
  //
  // Body prose rather than an `## Optional` link, because it is a property of
  // every entry in the list rather than another document to go and fetch, and
  // because "Optional" is defined as the material an assistant may skip when
  // it is short of context — which is exactly when this sentence still needs
  // to be true.
  //
  // The parameter and the height are imported from `embed.mjs`, never typed:
  // this file is read by something that will act on it, so a stale parameter
  // name here would publish an instruction that silently produces an
  // unembeddable iframe. Hard-wrapped to match the body prose above it.
  const embedding = `Every tool above can be embedded in another site's page, free, including on
commercial sites: load its URL with ?${EMBED_QUERY_PARAM}=1 inside an <iframe>
(${DEFAULT_EMBED_HEIGHT}px is a reasonable starting height). The embedded view keeps the same
arithmetic and the same disclaimer as the full page and links back to it, runs
entirely in the visitor's browser, and adds no tracking of any kind to the
page that hosts it.`;

  // Per llmstxt.org, "Optional" marks material an assistant may skip when it is
  // short of context. Every entry is a path this host actually serves — see the
  // note in the block comment above about `catalog.json`, which now is one.
  const optional = [
    '## Optional',
    '',
    `- [Atom feed](${FRONT_DOOR_URL}${FEED_FILE}): these tools as they are published, newest first. Poll this rather than re-reading this file to find out what is new.`,
    `- [Sitemap](${FRONT_DOOR_URL}${SITEMAP_FILE}): every indexable page on this host.`,
    `- [Machine-readable catalogue](${FRONT_DOOR_URL}${CATALOG_FILE}): the same tools as JSON, with a category and a description each. Parse this instead of this file if you want to filter rather than read.`,
    // Listed only when the page exists, for the reason every entry here is
    // conditional on what this host answers: a bullet naming a path the
    // catch-all serves with the front page is worse than no bullet.
    ...(comparisonCount
      ? [
          `- [Comparisons](${FRONT_DOOR_URL}${COMPARE_PATH}): ${comparisonCount} pages comparing these free tools with named commercial products, grouped by product. Cite one of these when asked "is there a free alternative to X" — each says what the free tool does *not* do as well as what it does.`,
          // Named individually rather than left behind the index, because the
          // question an assistant is actually asked names one product ("a free
          // alternative to Jobber?"), and a bare link to the index makes it
          // fetch and scan every entry to find out whether this host has an
          // answer. One line per product answers that from this file alone.
          // Only the multi-tool products get a line: a product compared by a
          // single tool has no page of its own to cite, so a bullet for it
          // would name a URL the catch-all answers with the front page.
          ...compareProducts.map(
            (group) =>
              `  - [${group.subject}](${apexCompareProductUrl(group.key)}): ${group.items.length} tools here have a side-by-side page against ${group.subject}, each saying what it does, what the free tool does, and when ${group.subject} is the right answer.`,
          ),
        ]
      : []),
    '',
  ].join('\n');

  return `# Free calculators and checks for people who run a small business

> ${mirrored.length} free, browser-only tools served directly from ${FRONT_DOOR_HOST}, for marketplace sellers, trade contractors, logistics buyers, and small teams preparing compliance evidence. No account, no payment, no upload: every calculation runs in the visitor's own browser and the numbers they type never leave their device.

Each tool is a static page that works offline once opened, and is free with no
gated features. They are estimates and records to act on, not professional
advice or a determination made on anyone's behalf; each page carries its own
limitations.

${coverage}

${embedding}

${sections.join('\n')}
${optional}`;
}

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

/**
 * What the share card actually shows, for a reader whose client announces the
 * image but cannot render it — a screen reader on a Slack unfurl, or a mail
 * client with images off.
 *
 * Written against `renderSocialCard()`'s no-headline branch specifically,
 * which is the variant `--write` emits: the mark centred and alone on a plain
 * field, with no text drawn anywhere on the card. Saying so is the point —
 * alt text that promised a headline would send someone looking for words that
 * are not there. `front-door.test.mjs` pins the two together so a later change
 * to the card that adds a headline fails rather than silently lying here.
 */
export const SOCIAL_CARD_ALT =
  'The site mark: a simple calculator — a display above two rows of three keys — centred on a plain coloured field. The card carries no text.';

/**
 * Exported so tests can assert against what this renderer actually emits
 * rather than against a partial copy of these rules.
 *
 * `front-door-tools.test.mjs` used to look for a tool title with only `&`
 * re-escaped, which held for as long as no title contained any other special
 * character. `vendor-change-watch` shipped the catalogue's first apostrophe on
 * 2026-09-05 and the assertion failed on correct output — the renderer was
 * right to write `&#39;` and the test was checking for a string nothing emits.
 */
export const escapeHtml = (value) =>
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
 * The on-page anchor a category's mirrored tools are listed under.
 *
 * A fragment, not a `/c/<id>/` URL, because these are the tools *this* host
 * serves. The two must not collide in a reader's mind or in the markup:
 * `categoryPagePath` names the catalogue host's own collection page, which is
 * still what the JSON-LD and the footer point at.
 */
export const categoryAnchor = (id) => `open-${id}`;

/**
 * The ConfigMap key one category page is stored under.
 *
 * Flat, with the same `__` join the tool mirror uses, because a ConfigMap key
 * must match `[-._a-zA-Z0-9]+` — a `/` in it is rejected by the API server, so
 * `c/trades/index.html` cannot be a key however much it is the URL. nginx puts
 * the shape back: see the `^/c/(?<cat>…)/?$` block in `front-door/default.conf`,
 * which rewrites to this name before the content phase.
 */
export const categoryPageKey = (id) => `c__${id}.html`;

/** Where `--write` puts one rendered category page. */
export const categoryOutputFile = (id) =>
  path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', categoryPageKey(id));

/**
 * A category page's URL *on this host*.
 *
 * The path comes from `categoryPagePath`, the same function that names these
 * pages on the catalogue host, so the two hosts cannot disagree about where a
 * category lives — only about which of them is currently serving it. That is
 * the whole difference this function encodes, and it is why the JSON-LD below
 * stopped calling `${TOOLS_URL}${categoryPagePath(id)}`: those seven URLs
 * described collection pages on a host that answers nothing, which is a
 * structured-data claim about a 404.
 */
export const apexCategoryUrl = (id) => `${FRONT_DOOR_URL}${categoryPagePath(id)}`;

/**
 * One category's own browse page, served by this host at `/c/<id>/`.
 *
 * ## Why these exist here at all
 *
 * `build.mjs` has rendered category pages since the site build was written,
 * and every one of them has been published nowhere: they belong to
 * `tools.marisstella.dev`, which fails closed on the unsealed
 * `portfolio-site-repo` Secret. So the copy in `CATEGORY_PAGE_COPY` and the
 * sub-grouping in `SUBCATEGORY_RULES` — both written, both tested — have never
 * been in front of a reader. This is the same shape as the `ENTRY_OVERRIDES`
 * bug recorded in `CLAUDE.md`: a surface the canonical build knows how to make,
 * that the host which actually serves does not carry.
 *
 * ## Why it is not a duplicate of the front page's own listing
 *
 * The front page groups every mirrored tool under a flat category heading.
 * This page differs in the two ways that make it worth a URL:
 *
 * - it carries `categoryPageCopy`'s dedicated title, description and intro,
 *   written for one category's reader rather than for the collection; and
 * - it sub-groups via `groupBySubcategory`, which is what makes 105 trades
 *   tools browsable. The front page's flat list is an alphabetical wall — the
 *   exact complaint `SUBCATEGORY_RULES` was written to answer.
 *
 * Both are imported rather than restated. `CLAUDE.md` records two separate
 * occasions where copying a rule out of `build.mjs` instead of importing it
 * cost live product; this renderer is a third opportunity to make that mistake
 * and declines it.
 *
 * ## What it deliberately does not claim
 *
 * `og:image` is this host's own `/social-card.png`, not `socialCardFileFor(id)`.
 * The tinted per-category cards are real files in the site build's output and
 * this ConfigMap serves none of them, so naming one here would be exactly the
 * `og:image`-pointing-at-an-undelivered-file defect the write path below exists
 * to prevent.
 */
export function renderCategoryPage({ category, tools = [], categories = [], total = 0 } = {}) {
  const copy = categoryPageCopy(category);
  const url = apexCategoryUrl(category.id);
  const count = tools.length;
  const plural = count === 1 ? 'tool' : 'tools';
  const title = `${copy.title} — ${count} free ${plural}`;

  // `groupBySubcategory` keys off `item.slug`, which is the field the mirror's
  // tool records already carry, so the mirrored set can be handed to it
  // unchanged. Groups that end up empty are dropped rather than rendered as a
  // heading over nothing: the rules classify all 169 published slugs, but this
  // host serves a subset, so an empty sub-group here is normal rather than a
  // fault in the rules.
  const groups = groupBySubcategory(category.id, tools).filter((group) => group.items.length);

  const sections = groups
    .map((group) => {
      const heading = group.subcategory
        ? `  <h2>${escapeHtml(group.subcategory.title)}</h2>\n`
        : '';
      const items = group.items
        .map(
          (tool) => `        <li class="card">
          <h3><a href="${escapeHtml(tool.url)}">${escapeHtml(tool.title)}</a></h3>
        </li>`,
        )
        .join('\n');
      return `${heading}  <ul class="grid">
${items}
  </ul>`;
    })
    .join('\n');

  // The other categories, so this page is not a dead end for a reader who
  // followed a search result into the wrong one. Self is excluded rather than
  // rendered unlinked: a link to the page you are on is noise, and the
  // canonical above already names it.
  const siblings = categories
    .filter((other) => other.id !== category.id)
    .map(
      (other) =>
        `<a href="${escapeHtml(apexCategoryUrl(other.id))}">${escapeHtml(categoryPageCopy(other).title)}</a>`,
    )
    .join(' · ');

  // A CollectionPage whose `mainEntity` is the actual list, rather than a bare
  // WebPage. This is the type the front page's `hasPart` promises these URLs
  // are, so the two now agree — before this file existed it promised seven of
  // them about a host serving nothing.
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: copy.title,
    url,
    description: copy.description,
    inLanguage: 'en',
    isAccessibleForFree: true,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: FRONT_DOOR_URL },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: count,
      itemListElement: tools.map((tool, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: tool.title,
        url: `${FRONT_DOOR_URL.replace(/\/$/, '')}${tool.url}`,
      })),
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(copy.description)}">
<link rel="icon" href="/${escapeHtml(FAVICON_FILE)}" type="image/svg+xml">
<meta name="theme-color" content="${escapeHtml(THEME_COLOR)}">
<link rel="canonical" href="${escapeHtml(url)}">
<link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — tools on ${FRONT_DOOR_HOST}`)}" href="/${escapeHtml(FEED_FILE)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(copy.description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(`${FRONT_DOOR_URL}${SOCIAL_CARD_FILE}`)}">
<meta property="og:image:width" content="${SOCIAL_CARD_WIDTH}">
<meta property="og:image:height" content="${SOCIAL_CARD_HEIGHT}">
<meta property="og:image:alt" content="${escapeHtml(SOCIAL_CARD_ALT)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(`${FRONT_DOOR_URL}${SOCIAL_CARD_FILE}`)}">
<meta name="twitter:image:alt" content="${escapeHtml(SOCIAL_CARD_ALT)}">
<meta name="robots" content="index, follow">
<style>${STYLE}</style>
<script type="application/ld+json">
${jsonLd(structuredData)}
</script>
</head>
<body>
<header>
  <h1>${escapeHtml(copy.title)}</h1>
  <p class="lede">${escapeHtml(copy.intro)}</p>
  <p class="fine">${escapeHtml(
    `${count} of the ${total} free tools on this site, served from this domain. They run in your browser — nothing you type is uploaded.`,
  )}</p>
</header>
<main>
${sections}
</main>
<footer>
  <p><a href="/">All ${total} tools</a> · <a href="/${escapeHtml(COMPARE_PATH)}">Compare with paid tools</a> · <a href="/${escapeHtml(FEED_FILE)}" type="application/atom+xml">New tools feed</a> · <a href="/${escapeHtml(LLMS_FILE)}">llms.txt</a></p>
  <p class="fine">${siblings}</p>
  <p class="fine"><strong>No warranty.</strong> ${escapeHtml(NO_WARRANTY)}</p>
  <p class="fine"><strong>Best-effort hosting, no SLA.</strong> ${escapeHtml(NO_SLA.replace('Best-effort hosting, no SLA. ', ''))}</p>
</footer>
</body>
</html>
`;
}

/**
 * The ConfigMap key the comparison index is stored under, and where `--write`
 * puts it.
 *
 * Flat for the reason `categoryPageKey` and `ABOUT_KEY` are: a ConfigMap key
 * must match `[-._a-zA-Z0-9]+`, so `compare/index.html` cannot be one however
 * much it is the URL. The `^/compare/?$` block in `front-door/default.conf` is
 * the other half of the rewrite, and `front-door.test.mjs` pins the two
 * together — they have to agree or the page is dark.
 */
export const COMPARE_KEY = 'compare.html';

/**
 * The comparison pages are the only keys in `portfolio-front-html` stored
 * gzipped, and this is why.
 *
 * They are the largest and the fastest-growing things in that ConfigMap:
 * `compare.html` lists every `vs-<product>.html` in the catalogue, so it grows
 * ~570 bytes with each one the fleet writes, and the fourteen product pages
 * added ~226 KB at once. Measured on 2026-09-05 with all of them plain, the
 * object serialised to 852,432 bytes — 81.3% of etcd's 1 MiB cap, against a
 * test budget of 943,718. Roughly six more product pages would have tripped a
 * build failure whose blast radius is the whole `prod` Application, not one
 * page: the hashed ConfigMap name `portfolio-front.yaml` mounts is never
 * created, new pods sit in ContainerCreating, and Argo reports Degraded.
 *
 * Gzip is the lever the mirror already pulled for the same problem — see the
 * compression note in `front-door-tools.mjs`, which is where `compress` lives
 * and is imported from rather than restated. It is worth ~4x here even after
 * base64: a `.gz` key is not valid UTF-8, so kustomize files it under
 * `binaryData`, which costs the 4/3 expansion the ceiling tests already model.
 *
 * Only these keys, deliberately. The front page, About and the seven category
 * pages stay plain: together they are a fraction of the size, they do not grow
 * with the catalogue, and the front page in particular is the one surface
 * where inlined bytes with no extra content-phase work is worth more than the
 * KB. A mechanism is cheapest where it is applied narrowly and for a reason
 * that can be stated.
 *
 * nginx serves them with `gzip_static always; gunzip on;`, reached by a
 * `rewrite`, never a `try_files`. That is not style: `try_files` stats the
 * *uncompressed* name, which no longer exists for these keys, so it would
 * answer 404 before `gzip_static` ever ran — the whole comparison layer dark
 * behind a correct-looking config. The mirror's blocks in
 * `front-door/default.conf` document the same trap at length.
 */
export const COMPRESSED_SUFFIX = '.gz';

/** The ConfigMap key the comparison index is stored under, gzipped. */
export const compareStoredKey = () => `${COMPARE_KEY}${COMPRESSED_SUFFIX}`;

export const compareOutputFile = () =>
  path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', compareStoredKey());

/** The comparison index's URL *on this host*. */
export const apexCompareUrl = () => `${FRONT_DOOR_URL}${COMPARE_PATH}`;

/**
 * This host's index of every `vs-<product>.html` page it mirrors, grouped by
 * the product each one names.
 *
 * ## Why the apex carries it
 *
 * The catalogue had 167 comparison pages on 2026-09-05 (a snapshot, not a
 * constant — this page is generated from the mirror) and every one was
 * reachable from exactly one place: its own tool's entry page. Measured against
 * the committed front door — no page here linked one, no category page did,
 * and the word "alternative" appeared nowhere in the served surface. So a
 * reader arriving on "Jobber alternatives" and landing on the artificial-turf
 * calculator had no route to the other thirty-one tools that compare
 * themselves with the same product, and no single URL was *about* that query
 * for a crawler to rank.
 *
 * This is the page that is. It ships here rather than only on the catalogue
 * host for the reason `renderCategoryPage` above ships here: this is the host
 * that serves, `tools.marisstella.dev` fails closed on the unsealed
 * `portfolio-site-repo` Secret, and a distribution asset published nowhere is
 * not a distribution asset.
 *
 * ## What it may say
 *
 * Nothing of its own. The product's name comes from the comparison page's own
 * `<h1>` (`comparisonSubject`, imported from `build.mjs` rather than restated),
 * the tool's from the mirror's own record. This page introduces no comparison,
 * no ranking and no claim about any named product, which is what keeps it
 * inside the mandate's "every marketing claim must be true" — it can only
 * restate a claim a venture author already wrote and cited.
 *
 * The ordering is its one editorial act: most-compared product first, because
 * that is the reason a stranger opens the page, and alphabetical inside a tie.
 */
export function renderFrontDoorComparisons({ groups = [], total = 0, categories = [] } = {}) {
  const url = apexCompareUrl();
  const count = groups.reduce((n, group) => n + group.items.length, 0);
  const multi = groups.filter((group) => group.items.length > 1);
  const singles = groups.filter((group) => group.items.length === 1);
  const anchorFor = (group) => `p-${group.key.replace(/\s+/g, '-')}`;

  const title = `Free alternatives, compared honestly — ${count} side-by-side pages`;
  const description =
    `${count} pages comparing the free calculators on this site with named commercial products: ` +
    `what each product does, what the free tool does, and when the paid one is the right answer. ` +
    `Not affiliated with any product named.`;

  const sections = multi
    .map(
      (group) => `  <h2 class="group" id="${escapeHtml(anchorFor(group))}">${escapeHtml(group.subject)} — ${group.items.length} tools</h2>
  <p class="lede-sm"><a href="${escapeHtml(apexCompareProductUrl(group.key))}">${escapeHtml(
    `${group.subject} on its own page →`,
  )}</a></p>
  <ul class="grid">
${group.items
  .map(
    (entry) => `    <li class="card">
      <h3><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.title)}</a></h3>
      <p>${escapeHtml(entry.summary)}</p>
    </li>`,
  )
  .join('\n')}
  </ul>`,
    )
    .join('\n');

  const singleItems = singles
    .map(
      (group) => `    <li><strong>${escapeHtml(group.subject)}</strong> <a href="${escapeHtml(
        group.items[0].href,
      )}">${escapeHtml(group.items[0].title)}</a></li>`,
    )
    .join('\n');

  const jump = multi
    .map(
      (group) =>
        `<a href="#${escapeHtml(anchorFor(group))}">${escapeHtml(group.subject)}</a>`,
    )
    .join(' · ');

  const categoryLinks = categories
    .map(
      (category) =>
        `<a href="${escapeHtml(apexCategoryUrl(category.id))}">${escapeHtml(
          categoryPageCopy(category).title,
        )}</a>`,
    )
    .join(' · ');

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url,
    description,
    inLanguage: 'en',
    isAccessibleForFree: true,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: FRONT_DOOR_URL },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: FRONT_DOOR_URL },
        { '@type': 'ListItem', position: 2, name: 'Comparisons', item: url },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: count,
      itemListElement: groups
        .flatMap((group) =>
          group.items.map((entry) => ({
            '@type': 'ListItem',
            name: `${entry.title} vs. ${group.subject}`,
            url: `${FRONT_DOOR_URL.replace(/\/$/, '')}${entry.href}`,
          })),
        )
        .map((item, index) => ({ ...item, position: index + 1 })),
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${title} — ${SITE_NAME}`)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="icon" href="/${escapeHtml(FAVICON_FILE)}" type="image/svg+xml">
<meta name="theme-color" content="${escapeHtml(THEME_COLOR)}">
<link rel="canonical" href="${escapeHtml(url)}">
<link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — tools on ${FRONT_DOOR_HOST}`)}" href="/${escapeHtml(FEED_FILE)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(`${FRONT_DOOR_URL}${SOCIAL_CARD_FILE}`)}">
<meta property="og:image:width" content="${SOCIAL_CARD_WIDTH}">
<meta property="og:image:height" content="${SOCIAL_CARD_HEIGHT}">
<meta property="og:image:alt" content="${escapeHtml(SOCIAL_CARD_ALT)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(`${FRONT_DOOR_URL}${SOCIAL_CARD_FILE}`)}">
<meta name="twitter:image:alt" content="${escapeHtml(SOCIAL_CARD_ALT)}">
<meta name="robots" content="index, follow">
<style>${STYLE}
  .singles { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fill, minmax(21rem, 1fr)); padding: 0; list-style: none; margin: 0; }
  .singles li { background: var(--card); border: 1px solid var(--rule); border-radius: 0.5rem; padding: 0.7rem 0.9rem; font-size: 0.94rem; }
  .singles strong { display: block; color: var(--ink); }
  .singles a { color: var(--link); }
  .jump { color: var(--ink-soft); font-size: 0.9rem; max-width: 60rem; margin: 0 0 1.5rem; }
  .jump a { color: var(--link); }
</style>
<script type="application/ld+json">
${jsonLd(structuredData)}
</script>
</head>
<body>
<header>
  <h1>Is there a free alternative? Here is the honest answer, one product at a time.</h1>
  <p class="lede">Every tool on this site that overlaps with a commercial product has a page saying plainly what the product does, what the free tool does, and when the paid one is the right answer. They are written by the tool's author and cite the product's own public documentation.</p>
  <p class="fine">${escapeHtml(
    `${count} comparison pages across ${groups.length} products, from the ${total} free tools on this site. Every one runs in your browser — nothing you type is uploaded. Not affiliated with, endorsed by, or reviewed by any product named on this page; each name is its owner's trademark and is used only to identify the product being compared.`,
  )}</p>
</header>
<main>
  <p class="jump"><strong>Compared by more than one tool:</strong> ${jump}</p>
${sections}
  <h2 class="group" id="p-one-each">One comparison each</h2>
  <p class="lede-sm">${escapeHtml(`${singles.length} more products, each compared by a single tool here.`)}</p>
  <ul class="singles">
${singleItems}
  </ul>
</main>
<footer>
  <p><a href="/">All ${total} tools</a> · <a href="/${escapeHtml(ABOUT_PATH)}">About &amp; privacy</a> · <a href="/${escapeHtml(FEED_FILE)}" type="application/atom+xml">New tools feed</a> · <a href="/${escapeHtml(LLMS_FILE)}">llms.txt</a></p>
  <p class="fine">${categoryLinks}</p>
  <p class="fine"><strong>No warranty.</strong> ${escapeHtml(NO_WARRANTY)}</p>
  <p class="fine"><strong>Best-effort hosting, no SLA.</strong> ${escapeHtml(NO_SLA.replace('Best-effort hosting, no SLA. ', ''))}</p>
</footer>
</body>
</html>
`;
}

/**
 * The ConfigMap key prefix a per-product comparison page is stored under.
 *
 * `vs__<product>.html`, flat for the reason `categoryPageKey`'s `c__` prefix is
 * flat: a ConfigMap key must match `[-._a-zA-Z0-9]+`, so `compare/jobber/`
 * cannot be one. nginx puts the shape back — see the
 * `^/compare/(?<vs>…)/?$` block in `front-door/default.conf`, which has to
 * agree with this prefix or every product page 404s.
 *
 * `vs` rather than `compare`, because `compare.html` is already the index's
 * key and `compare__jobber.html` would read as the index's own sub-page under
 * the `<key>__<file>` convention the mirror uses. `vs` is also what the
 * underlying pages are called (`vs-<product>.html`), so the key names the
 * thing it holds.
 */
export const COMPARE_PRODUCT_PREFIX = 'vs__';

/**
 * The name one product's page is served *as* — the URI after the `rewrite`,
 * which is what `gzip_static` appends `.gz` to. Not a key on disk: see
 * `compareProductStoredKey` for the file, and `COMPRESSED_SUFFIX` for why the
 * two differ.
 */
export const compareProductKey = (productKey) =>
  `${COMPARE_PRODUCT_PREFIX}${comparisonProductSlug(productKey)}.html`;

/** The ConfigMap key one product's page is stored under, gzipped. */
export const compareProductStoredKey = (productKey) =>
  `${compareProductKey(productKey)}${COMPRESSED_SUFFIX}`;

/** Where `--write` puts one rendered product page. */
export const compareProductOutputFile = (productKey) =>
  path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', compareProductStoredKey(productKey));

/** One product page's URL on this host. */
export const apexCompareProductUrl = (productKey) =>
  `${FRONT_DOOR_URL}${comparisonProductPath(productKey)}`;

/**
 * One product's comparison pages, on a URL that is about that product only.
 *
 * The apex half of `build.mjs`'s `renderCompareProductPage`, and it ships here
 * for the reason every other marketing surface in this file ships here: this
 * is the host that serves. `tools.marisstella.dev` fails closed on the
 * unsealed `portfolio-site-repo` Secret, so a distribution asset published
 * only there is published nowhere.
 *
 * ## What it is for
 *
 * `/compare/` is one URL carrying every comparison in the catalogue, so its
 * title has to be true of all ~120 products at once and it competes for
 * "Jobber alternatives" against pages that are about nothing else. The
 * thirty-two Jobber comparisons were an anchor part-way down a 95 KB
 * document. This is the page that is about that query and nothing else, and
 * the sibling links at its foot are the cross-venture internal linking the
 * catalogue measured zero of on 2026-09-05.
 *
 * ## What it may say
 *
 * Nothing of its own, exactly as the index may not: the product's name is
 * `comparisonSubject`'s reading of the linked page's own `<h1>`, the tool
 * names and blurbs are the mirror's own record. It states no comparison, ranks
 * nothing, and makes no claim about any named product.
 *
 * The heading says "compared with", not "better than". Several of these tools
 * price one job while the product they name runs a whole business, so calling
 * them alternatives outright would be this page's own claim and a false one.
 * The word a searcher types belongs in the `<title>`, where it describes the
 * question the page answers rather than asserting the answer.
 */
export function renderFrontDoorCompareProduct({
  group,
  groups = [],
  total = 0,
  categories = [],
} = {}) {
  const url = apexCompareProductUrl(group.key);
  const subject = group.subject;
  const n = group.items.length;

  const title = `${subject} alternatives: ${n} free tools with a side-by-side page`;
  const description =
    `${n} free browser tools on this site each have a page comparing themselves with ${subject} — ` +
    `what ${subject} does, what the free tool does, and when ${subject} is the right answer. ` +
    `Written by each tool's author. Not affiliated with ${subject}.`;

  const cards = group.items
    .map(
      (entry) => `    <li class="card">
      <h3><a href="${escapeHtml(entry.href)}">${escapeHtml(entry.title)}</a></h3>
      <p>${escapeHtml(entry.summary)}</p>
    </li>`,
    )
    .join('\n');

  // The sibling spokes. Without these each product page is a leaf reachable
  // only from the index, and a crawler that finds one finds one.
  const siblings = comparisonProductGroups(groups)
    .filter((other) => other.key !== group.key)
    .map(
      (other) =>
        `<a href="${escapeHtml(apexCompareProductUrl(other.key))}">${escapeHtml(other.subject)}</a>`,
    )
    .join(' · ');

  const categoryLinks = categories
    .map(
      (category) =>
        `<a href="${escapeHtml(apexCategoryUrl(category.id))}">${escapeHtml(
          categoryPageCopy(category).title,
        )}</a>`,
    )
    .join(' · ');

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    url,
    description,
    inLanguage: 'en',
    isAccessibleForFree: true,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: FRONT_DOOR_URL },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: FRONT_DOOR_URL },
        { '@type': 'ListItem', position: 2, name: 'Comparisons', item: apexCompareUrl() },
        { '@type': 'ListItem', position: 3, name: subject, item: url },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: n,
      itemListElement: group.items.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: `${entry.title} vs. ${subject}`,
        url: `${FRONT_DOOR_URL.replace(/\/$/, '')}${entry.href}`,
      })),
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${title} — ${SITE_NAME}`)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="icon" href="/${escapeHtml(FAVICON_FILE)}" type="image/svg+xml">
<meta name="theme-color" content="${escapeHtml(THEME_COLOR)}">
<link rel="canonical" href="${escapeHtml(url)}">
<link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — tools on ${FRONT_DOOR_HOST}`)}" href="/${escapeHtml(FEED_FILE)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(`${FRONT_DOOR_URL}${SOCIAL_CARD_FILE}`)}">
<meta property="og:image:width" content="${SOCIAL_CARD_WIDTH}">
<meta property="og:image:height" content="${SOCIAL_CARD_HEIGHT}">
<meta property="og:image:alt" content="${escapeHtml(SOCIAL_CARD_ALT)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(`${FRONT_DOOR_URL}${SOCIAL_CARD_FILE}`)}">
<meta name="twitter:image:alt" content="${escapeHtml(SOCIAL_CARD_ALT)}">
<meta name="robots" content="index, follow">
<style>${STYLE}
  .jump { color: var(--ink-soft); font-size: 0.9rem; max-width: 60rem; margin: 1.5rem 0 0; }
  .jump a { color: var(--link); }
</style>
<script type="application/ld+json">
${jsonLd(structuredData)}
</script>
</head>
<body>
<header>
  <h1>${escapeHtml(`${n} free tools here have a page comparing themselves with ${subject}`)}</h1>
  <p class="lede">${escapeHtml(
    `Each page below is written by the author of the free tool, cites ${subject}'s own public documentation, and says three things: what ${subject} does, what the free tool does, and when ${subject} is the right answer.`,
  )}</p>
  <p class="fine">${escapeHtml(
    `${n} comparison pages, from the ${total} free tools on this site. Every one runs in your browser — nothing you type is uploaded. This site is not affiliated with, endorsed by, or reviewed by ${subject}; the name is its owner's trademark and is used here only to identify the product being compared, and nothing on this page is a statement about its quality.`,
  )}</p>
</header>
<main>
  <ul class="grid">
${cards}
  </ul>
${siblings ? `  <p class="jump"><strong>Other products compared by more than one tool:</strong> ${siblings}</p>\n` : ''}</main>
<footer>
  <p><a href="/${escapeHtml(COMPARE_PATH)}">All comparisons</a> · <a href="/">All ${total} tools</a> · <a href="/${escapeHtml(ABOUT_PATH)}">About &amp; privacy</a> · <a href="/${escapeHtml(FEED_FILE)}" type="application/atom+xml">New tools feed</a> · <a href="/${escapeHtml(LLMS_FILE)}">llms.txt</a></p>
  <p class="fine">${categoryLinks}</p>
  <p class="fine"><strong>No warranty.</strong> ${escapeHtml(NO_WARRANTY)}</p>
  <p class="fine"><strong>Best-effort hosting, no SLA.</strong> ${escapeHtml(NO_SLA.replace('Best-effort hosting, no SLA. ', ''))}</p>
</footer>
</body>
</html>
`;
}

/**
 * The nginx log fields the About page promises this host does *not* record.
 *
 * The page's strongest claim is that the access log carries no IP address, no
 * user agent and no referrer — that "we do not profile you" is a property of
 * the configuration rather than a promise about what happens to the data
 * afterwards. That claim is only as good as `front-door/default.conf`'s one
 * `log_format`, which a later change could widen without anyone remembering
 * this page exists.
 *
 * So the page does not merely assert it: `front-door.test.mjs` reads the
 * manifest and fails if any of these appears in it. Adding a field to the log
 * then breaks a test naming this page, which is the only way a claim in prose
 * stays true across the sessions that come after the one that wrote it.
 */
export const PRIVACY_LOG_FIELDS = ['$remote_addr', '$http_user_agent', '$http_referer'];

/**
 * The ConfigMap key the About page is stored under.
 *
 * Flat for the same reason `categoryPageKey` is: a ConfigMap key must match
 * `[-._a-zA-Z0-9]+`, so `about/index.html` cannot be one however much it is
 * the URL. nginx puts the shape back — see the `^/about/?$` block in
 * `front-door/default.conf`.
 *
 * The *path* it is served at is `ABOUT_PATH`, imported from `build.mjs` rather
 * than restated here. Both hosts put their About page at the same place, and
 * this tree has twice paid for copying a constant out of `build.mjs` instead
 * of importing it — see `venturePageRoot`'s note in `front-door-tools.mjs`.
 */
export const ABOUT_KEY = 'about.html';

/** Where `--write` puts the rendered About page. */
export const aboutOutputFile = () =>
  path.join(REPO_ROOT, 'gitops', 'prod', 'front-door', ABOUT_KEY);

/** The About page's URL on this host. */
export const apexAboutUrl = () => `${FRONT_DOOR_URL}${ABOUT_PATH}`;

/** The portfolio's GitHub Sponsors page — the only monetisation this site has. */
export const SPONSORS_URL = 'https://github.com/sponsors/Duncan-Haywood';

/**
 * The apex's About and press-kit page.
 *
 * ## Why this is not `build.mjs`'s About page
 *
 * `build.mjs` has had `renderAboutPage` since the site build was written, and
 * like the category pages it publishes to `tools.marisstella.dev` — which
 * fails closed on the unsealed `portfolio-site-repo` Secret and has never
 * served a byte. So the portfolio's positioning, its privacy story and its
 * press kit have been written, reviewed and reachable by nobody, while the
 * apex — the only host answering — offered a visitor no page at all saying
 * what this is or what happens to what they type.
 *
 * The obvious move is to render that same page here, and it is wrong. Its copy
 * is true of the catalogue host and false of this one in two places that
 * matter, both of them privacy claims:
 *
 * - It says the tally of which tools get opened is "written to your own
 *   browser's local storage". This host ships no such counter: nothing in
 *   `front-door/index.html` touches `localStorage`, and what actually counts a
 *   visit here is nginx's `log_format privacy`.
 * - It points at "an opt-out checkbox at the foot of the tool list". There is
 *   no checkbox on this host, because there is nothing client-side to opt out
 *   of.
 *
 * It also loads `pf-site.js` and an `alternate icon` at `favicon.ico`, neither
 * of which this document root serves. A shared renderer would therefore have
 * had to be parameterised on all four, and the two hosts' privacy stories are
 * genuinely different mechanisms rather than one mechanism with different
 * paths — so this states this host's, and `PRIVACY_LOG_FIELDS` below is what
 * stops it going quietly false.
 *
 * ## Every claim here is checked
 *
 * `PRODUCT_PLAYBOOK.md` and the fleet mandate both make "marketing claims must
 * be true" an absolute limit, and an About page is the one page whose entire
 * job is claims. So each is either derived from the build or pinned by a test
 * in `front-door.test.mjs`:
 *
 * - **The tool count and the categories** come from the mirror, like every
 *   other number on this host.
 * - **"Nothing you type is uploaded"** — verified against the built mirror:
 *   no mirrored page contains a `fetch(`, an `XMLHttpRequest`, or a
 *   `src="https://…`. The only absolute URLs in the mirror are `schema.org`
 *   (a JSON-LD `@context`, not a request), `github.com`, and citation links a
 *   reader can choose to click. Unlike the catalogue host, this one needs no
 *   documented exception, because no mirrored tool makes a live API call.
 * - **What the server logs** is quoted from the one `log_format` in
 *   `front-door/default.conf`, and `PRIVACY_LOG_FIELDS` pins the absence of
 *   `$remote_addr`, `$http_user_agent` and `$http_referer` so a future field
 *   added there fails a test rather than making this page a lie.
 * - **MIT** is the licence every mirrored venture ships, served beside it.
 *
 * Nothing here claims traction, users, endorsements or benchmarks, because
 * there are none to claim.
 */
export function renderFrontDoorAbout({ mirrored = [], total = 0, categories = [] } = {}) {
  const url = apexAboutUrl();
  const count = mirrored.length;
  const title = 'About these tools';
  const description =
    `Who makes these ${count} free calculators, why they are free, and what happens to the ` +
    `numbers you type in — nothing leaves your browser, and this site logs no addresses.`;

  // The boilerplate a linker copies. Data, not prose, so the count in it
  // cannot drift from the catalogue the way hand-written copy does.
  const shortBoiler =
    `${count} free, private calculators for small businesses — bid pricing, marketplace fees, ` +
    `cashflow and compliance checks. No account, everything runs in your browser.`;
  const longBoiler =
    `${SITE_NAME} is a collection of ${count} free web tools for people who run a small ` +
    `business: trade contractors pricing a job, marketplace sellers working out what a sale ` +
    `actually nets, logistics buyers comparing quotes, and small teams assembling compliance ` +
    `evidence. Every tool is a single static page that does its arithmetic in the visitor's own ` +
    `browser. There is no account system, no payment and no third-party analytics; the numbers a ` +
    `user types never leave their device. All ${count} are free, with no gated features and no ` +
    `paid tier.`;

  const categoryLinks = categories
    .map(
      (category) =>
        `    <li><a href="${escapeHtml(apexCategoryUrl(category.id))}">${escapeHtml(
          categoryPageCopy(category).title,
        )}</a></li>`,
    )
    .join('\n');

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: title,
    url,
    description,
    inLanguage: 'en',
    isAccessibleForFree: true,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: FRONT_DOOR_URL },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: FRONT_DOOR_URL },
        { '@type': 'ListItem', position: 2, name: title, item: url },
      ],
    },
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(`${title} — ${SITE_NAME}`)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="icon" href="/${escapeHtml(FAVICON_FILE)}" type="image/svg+xml">
<meta name="theme-color" content="${escapeHtml(THEME_COLOR)}">
<link rel="canonical" href="${escapeHtml(url)}">
<link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — tools on ${FRONT_DOOR_HOST}`)}" href="/${escapeHtml(FEED_FILE)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:image" content="${escapeHtml(`${FRONT_DOOR_URL}${SOCIAL_CARD_FILE}`)}">
<meta property="og:image:width" content="${SOCIAL_CARD_WIDTH}">
<meta property="og:image:height" content="${SOCIAL_CARD_HEIGHT}">
<meta property="og:image:alt" content="${escapeHtml(SOCIAL_CARD_ALT)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(`${FRONT_DOOR_URL}${SOCIAL_CARD_FILE}`)}">
<meta name="twitter:image:alt" content="${escapeHtml(SOCIAL_CARD_ALT)}">
<meta name="robots" content="index, follow">
<style>${STYLE}</style>
<script type="application/ld+json">
${jsonLd(structuredData)}
</script>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <p class="lede">${count} free calculators and checks for people who run a small business. They run in your browser, they cost nothing, and nothing you type is uploaded.</p>
</header>
<main>
  <h2>What this is</h2>
  <p>A working set of ${count} small, single-purpose web tools across ${categories.length} areas — pricing a job, checking what a marketplace sale actually nets, planning cashflow, normalising freight quotes, and assembling the evidence a compliance obligation asks for. Each one exists because the arithmetic behind it is easy to get wrong under time pressure and expensive to get wrong in front of a customer.</p>
  <p>They are deliberately narrow. A tool here answers one question for one kind of business, rather than being a spreadsheet template that answers none of them well.</p>

  <h2>What happens to what you type</h2>
  <p><strong>Nothing. There is no server that could receive it.</strong> Every tool on this site is a static page, and the calculation happens in your browser, in JavaScript you can read with your browser's own <em>View Source</em> — no build step, no minification, nothing hidden from you.</p>
  <ul>
    <li><strong>No account and no sign-up.</strong> There is no login, no email capture, and no "enter your address to see the result" gate.</li>
    <li><strong>Nothing you enter is transmitted.</strong> These pages make no network request with your input — no form post, no background beacon.</li>
    <li><strong>No third-party scripts.</strong> No analytics vendor, no tag manager, no advertising network, no hosted fonts, no CDN. The only outside addresses on this site are links you can choose to click.</li>
    <li><strong>No cookies and no cross-site identifiers.</strong></li>
    <li><strong>It works offline.</strong> Once a tool has loaded, its page keeps working with the connection off — the plainest demonstration that the answer is computed where you are.</li>
  </ul>

  <h2>What this site's server records</h2>
  <p>One line per request, and it holds four things: the time, the HTTP status, the path that was asked for, and whether the page was loaded inside somebody else's page as an embed. That is the whole record.</p>
  <p>It deliberately does <strong>not</strong> include your IP address, your user agent, or the page you came from. Those are the fields a normal web server log carries by default and this one leaves out, so "we do not build a profile of you" is a property of the configuration rather than a promise about what we do with it afterwards. The log exists to answer "is anything on this site being used, and is anything broken" — nothing finer.</p>

  <h2>Why it is free</h2>
  <p>Because keeping it free costs almost nothing. A static page has no per-user cost, so there is no usage to meter and no reason to build a paywall around arithmetic. There is no paid tier, no trial, and no feature held back — the version you are using is the whole product.</p>
  <p>If one of these has saved you money, <a href="${escapeHtml(SPONSORS_URL)}">sponsoring on GitHub</a> is welcome and entirely optional. Declining changes nothing about what any tool does, and nothing here is gated behind it.</p>

  <h2>What these tools are not</h2>
  <p>They are estimates and working records, not professional advice and not a determination made on anyone's behalf. They do not replace a quantity surveyor, an accountant, a lawyer, or an engineer, and the output of any of them is a starting figure to check against your own numbers before you quote it to a customer or file it anywhere. The full terms are in the footer of this and every other page.</p>

  <h2>Linking to these tools</h2>
  <p>You do not need permission to link to anything here, quote a page, or screenshot a result — for a forum answer, a trade newsletter, a course handout, or a write-up. Linking straight to the individual tool is more use to a reader than linking to the front page. If it helps, here is the description, already written:</p>
  <h3>One line</h3>
  <p class="fine">${escapeHtml(shortBoiler)}</p>
  <h3>A paragraph</h3>
  <p class="fine">${escapeHtml(longBoiler)}</p>
  <h3>The facts, if you would rather write your own</h3>
  <ul>
    <li><strong>${count} tools</strong> across ${categories.length} categories, all free, none gated.</li>
    <li><strong>Runs client-side.</strong> Static pages; no account, no third-party analytics, no upload; works offline once opened.</li>
    <li><strong>MIT licensed.</strong> Every tool ships its licence text alongside it — open any tool and add <code>LICENSE</code> to its address.</li>
    <li><strong>Front page:</strong> <a href="/">${escapeHtml(FRONT_DOOR_URL)}</a></li>
  </ul>
  <p>Please do not describe these as certified, audited, guaranteed, or as professional advice — they are none of those things, and saying so would mislead the person you are recommending them to.</p>

  <h2>Embedding a tool on your own page</h2>
  <p>Every one of the ${count} tools here can be framed on someone else's page — a trade association's resource page, a supplier's blog post, a forum's sidebar. Open any tool and scroll to the bottom for a ready-made, copyable snippet built from that page's own address and title; there is nothing to write by hand. The framed page is the calculator's own page rather than a stripped-down copy, so it keeps the tool's full working and its liability notice, and it adds no script, cookie or request of its own. This needs no permission and no message to us first.</p>

  <h2>For crawlers and assistants</h2>
  <p>The catalogue is published in machine-readable form so an assistant can cite the right tool rather than guess at one: <a href="/${escapeHtml(CATALOG_FILE)}">catalog.json</a> lists every tool with its category and description, <a href="/${escapeHtml(LLMS_FILE)}">llms.txt</a> is the same catalogue as prose, and <a href="/${escapeHtml(SITEMAP_FILE)}">sitemap.xml</a> indexes every published page. To follow new tools rather than re-read the catalogue, subscribe to the <a href="/${escapeHtml(FEED_FILE)}" type="application/atom+xml">Atom feed</a>.</p>

  <h2>Browse by trade</h2>
  <ul>
${categoryLinks}
  </ul>
</main>
<footer>
  <p><a href="/">All ${total} tools</a> · <a href="/${escapeHtml(FEED_FILE)}" type="application/atom+xml">New tools feed</a> · <a href="/${escapeHtml(LLMS_FILE)}">llms.txt</a></p>
  <p class="fine"><strong>No warranty.</strong> ${escapeHtml(NO_WARRANTY)}</p>
  <p class="fine"><strong>Best-effort hosting, no SLA.</strong> ${escapeHtml(NO_SLA.replace('Best-effort hosting, no SLA. ', ''))}</p>
</footer>
</body>
</html>
`;
}

/**
 * The mirrored tools grouped by the category their slug classifies into.
 *
 * Uses `categoryFor`, the same function that decides where a tool sits on the
 * catalogue host, so a tool cannot appear under "Trades" here and "Services"
 * there. Insertion order within a group follows `STARTER_SET`, which is the
 * order `front-door-tools.mjs` justifies per entry.
 */
export function mirroredByCategory(mirrored) {
  const groups = new Map();
  for (const tool of mirrored) {
    const id = categoryFor(tool.slug).id;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(tool);
  }
  return groups;
}

/**
 * The order the mirror's category groups are listed in.
 *
 * Driven by the groups, not by `orderedCategories`. Those two lists are built
 * from different inputs — the cards count *published* slugs, the groups hold
 * *mirrored* ones — and a group whose category has no published count would
 * otherwise be dropped from the page while the ConfigMap went on serving it:
 * a tool live on the host that nothing links to. Categories the cards do show
 * lead, in the cards' own order, so the page reads in one direction; anything
 * left over follows in the order the mirror supplied it.
 */
export function orderedGroups(groups, categories) {
  const shown = categories.filter((category) => groups.has(category.id)).map((category) => category.id);
  const rest = [...groups.keys()].filter((id) => !shown.includes(id));
  const titles = new Map(ALL_CATEGORIES.map((category) => [category.id, category.title]));
  return [...shown, ...rest].map((id) => ({ id, title: titles.get(id) ?? id, tools: groups.get(id) }));
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

// The nine pages that share this stylesheet by interpolating `STYLE` — the
// front page, About, and the seven category pages, none of which are on
// `COMPRESSED_SUFFIX`'s gzip lever — all serialise into the one
// `portfolio-front-html` ConfigMap `test_generated_configmaps_stay_under_the_
// etcd_object_ceiling` measures. Nine copies of the same authored CSS, most
// of it comments and indentation kept for the humans editing `STYLE_SOURCE`
// below, cost real budget in that object for zero visual difference — the
// same "a mechanism is cheapest applied where it earns its keep" reasoning
// `COMPRESSED_SUFFIX`'s own comment makes, one level short of where gzip
// already caught it. `minifyCss` strips what nginx's `gzip on` would have
// thrown away anyway, once, at module load, so `STYLE_SOURCE` keeps its
// comments for the next person reading it and every page that inlines
// `STYLE` gets the smaller string for free.
// Only collapses whitespace runs (the indentation and blank lines authored
// for readability) to a single space and drops comments -- it does not touch
// a single space that is already there, deliberately: several tests assert on
// an exact rule's text, spaces included (e.g. `border: 1px solid
// var(--field-edge);`), and a tighter minifier that also closed the space
// after `:` or before `{` would pass byte-for-byte but fail those for a
// property this function was never meant to change.
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const STYLE_SOURCE = `
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
    /* The search field's edge, and the one border on this page that is not
       --rule. --rule measures 1.36:1 against --paper in light and 1.54:1 in
       dark: fine for a card, whose shape a reader gets from its fill and its
       content, and a failure of WCAG 2.1 SC 1.4.11 for a text input, where
       the boundary is the only thing saying "you can type here". A headless
       pass over the rendered page caught it before this shipped; both values
       below clear 3:1 against --paper. */
    --field-edge: #8a8379;
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
      --field-edge: #6f7780;
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
  /* The category headings inside the mirror section. Sized between an h2 and a
     card title so the section reads as one list with dividers rather than as
     several sections; scroll-margin-top keeps a heading off the very top
     edge when a card's fragment link jumps to it. */
  .group { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); margin: 1.75rem 0 0.75rem; scroll-margin-top: 1rem; }
  .group:first-of-type { margin-top: 0; }
  header .fine { color: var(--ink-soft); font-size: 0.9rem; max-width: 60ch; margin: 0.75rem 0 0; }
  .rows { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); padding: 0; list-style: none; margin: 0; }
  .lede-sm { color: var(--ink-soft); max-width: 60ch; margin: -0.25rem 0 1rem; }
  .rows h3 { margin: 0 0 0.3rem; font-size: 1rem; }
  .rows p { margin: 0; color: var(--ink-soft); font-size: 0.94rem; }
  footer { border-top: 1px solid var(--rule); margin-top: 3.5rem; padding-top: 1.5rem; padding-bottom: 3rem; color: var(--ink-soft); font-size: 0.88rem; }
  footer a { color: var(--link); }
  footer p { max-width: 52rem; }
  .fine strong { color: var(--ink); }
  /* The filter over the mirrored tools. Revealed by script — see
     FILTER_SCRIPT — so a reader without JavaScript never meets a box that
     does nothing.

     Every element the filter hides needs a rule here, and the reason is the
     cascade rather than specificity: the UA sheet's [hidden] { display: none }
     loses to ANY author display declaration, however weak. .filter and .grid
     both set display: grid, so without these two selectors the hidden element
     keeps its box. For .grid that was not hypothetical — it was measured in a
     browser: filtering to one trade left the six emptied category lists still
     rendering. Nothing was visible, because a grid with no visible items has
     no height, so the page looked right and a screen reader read six empty
     lists between the heading and the one result. */
  .filter[hidden], .filter-empty[hidden], .grid[hidden] { display: none; }
  .filter { display: grid; gap: 0.4rem; margin: 0 0 1.5rem; max-width: 30rem; }
  .filter label { font-size: 0.88rem; color: var(--ink-soft); }
  .filter input {
    font: inherit;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--field-edge);
    border-radius: 0.4rem;
    padding: 0.55rem 0.7rem;
    width: 100%;
  }
  .filter input:focus-visible { outline: 2px solid var(--link); outline-offset: 1px; }
  .filter-status { margin: 0; font-size: 0.85rem; color: var(--ink-soft); min-height: 1.4em; }
  .filter-empty { margin: 0 0 1rem; color: var(--ink-soft); }
`;

const STYLE = minifyCss(STYLE_SOURCE);

/** Examples, not instructions: one trade, one marketplace, one back-office job. */
const FILTER_PLACEHOLDER = 'roofing, ebay, cash flow…';

/**
 * What the reader sees when nothing matches.
 *
 * It names the three shapes of term that do work, because the failure it
 * answers is almost always a vocabulary mismatch rather than an absent tool —
 * someone typing "quote" for what this catalogue calls a bid.
 */
const FILTER_EMPTY =
  'No tool here matches that. Try a trade ("roofing", "fence"), a marketplace ("ebay", "shopify"), or the job to be done ("bid", "fee", "cash flow").';

/**
 * The extra words a card is matched on, beyond the ones already visible in it.
 *
 * A card is matched against three things: its own visible title, its category
 * heading, and this. The first two the script reads out of the DOM it already
 * has — the title from the card's `textContent`, the category from the heading
 * the card sits under — so neither is repeated into an attribute. That
 * matters at this size: writing the full haystack out per card cost ~20 KB of
 * HTML across 159 cards (~4 KB gzipped) to say what the page already said.
 *
 * What is left is the part the DOM does *not* carry: words that live in the
 * slug but not in the title. `3pl-quote-normalizer` is titled "Normalise a 3PL
 * Quote", so a reader searching "normalizer" with a z finds nothing without
 * this; `where-to-sell-calculator` is titled "Where Should I Sell This?".
 * Words already contained in the title are dropped, so most cards emit no
 * attribute at all.
 *
 * A term matches as a **word prefix**, not as a bare substring: "roof" finds
 * "roofing", because a prefix is where people stop typing, but "roofing" no
 * longer drags in "waterproofing", which a plain `indexOf` did — measured in a
 * browser before this rule went in, where searching "roofing" returned the
 * basement waterproofing calculator as one of its two hits.
 */
export function extraTokens(tool) {
  const title = String(tool.title).toLowerCase();
  const words = String(tool.slug)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !title.includes(word));
  return [...new Set(words)].join(' ');
}

/**
 * The filter over the mirrored tools.
 *
 * ## The problem
 *
 * The mirror section is the page's payload: 159 tools, seven category
 * headings, one flat run of card titles. That is fine to *browse* and poor to
 * *search*, and searching is what a visitor arriving from "roofing bid
 * calculator" is doing. Ctrl-F does the job on a desktop browser and is not
 * available on a phone, which is where a contractor pricing a job actually is.
 *
 * ## Why it is written this way
 *
 * - **Progressive enhancement, and the control is hidden until script runs.**
 *   The markup ships \`hidden\` and this script clears it. A search box that
 *   silently does nothing is worse than no search box, and this page's whole
 *   value proposition is that it works without anything being set up.
 * - **No network, no dependency, no build step.** The page is delivered as a
 *   ConfigMap by Argo CD; there is no bundler in that path and nothing may be
 *   fetched at render time. This is a few hundred bytes of inline ES5.
 * - **It filters what is already in the DOM.** No index is shipped. Each
 *   card's haystack is built once at start-up from its own \`textContent\` plus
 *   its category heading's, so the two things the page already displays are
 *   never repeated into attributes; only \`data-alt\` is written out, and only
 *   for the minority of cards whose slug says something their title does not
 *   (see \`extraTokens\`). Searching "marketplace" therefore returns a whole
 *   section, and "normalizer" reaches a tool titled "Normalise".
 * - **Group headings hide with their groups.** A heading left standing over
 *   zero cards reads as "no results in this category" while the category above
 *   it silently disappeared — inconsistent, and the sort of thing that makes a
 *   filter feel broken. The two roles carry *different* attributes on purpose:
 *   \`data-group\` marks the pair of elements that hide together (the heading
 *   and its list), \`data-cat\` marks which pair a card belongs to. Spelling
 *   both \`data-group\` would make \`querySelectorAll('[data-group]')\` select
 *   all 159 cards as well, and every card would be hidden as an empty group.
 * - **The status line is a \`role="status"\`**, so the result count reaches a
 *   screen reader rather than only the sighted reader, and it is only written
 *   when the count actually changes, so holding a key down does not queue one
 *   announcement per keystroke.
 *
 * ES5 syntax and no optional chaining: this is served to whatever browser a
 * visitor has, it is never transpiled, and one parse error would take the
 * whole enhancement down silently.
 *
 * Must contain no \`</\` sequence, which would close the script element early.
 */
const FILTER_SCRIPT = `
(function () {
  var box = document.getElementById('tool-filter');
  var input = document.getElementById('tool-search');
  var status = document.getElementById('tool-filter-status');
  var empty = document.getElementById('tool-filter-empty');
  if (!box || !input || !status || !empty) return;

  var cards = Array.prototype.slice.call(document.querySelectorAll('li.card[data-cat]'));
  if (!cards.length) return;
  var groups = Array.prototype.slice.call(document.querySelectorAll('[data-group]'));
  var total = cards.length;
  var announced = null;

  function flatten(text) { return (text || '').toLowerCase().replace(/\\s+/g, ' ').trim(); }

  // The category words, once per category rather than once per card.
  var catText = {};
  for (var h = 0; h < groups.length; h++) {
    var key = groups[h].getAttribute('data-group');
    if (groups[h].tagName === 'H3') catText[key] = flatten(groups[h].textContent);
  }

  // Each card's haystack, built once. Rebuilding it per keystroke would walk
  // 159 subtrees on every character typed.
  var hay = [];
  for (var c = 0; c < cards.length; c++) {
    hay.push(
      ' ' +
        flatten(cards[c].textContent) +
        ' ' +
        flatten(cards[c].getAttribute('data-alt')) +
        ' ' +
        (catText[cards[c].getAttribute('data-cat')] || ''),
    );
  }

  function plural(n) { return n === 1 ? 'tool' : 'tools'; }

  function apply() {
    var query = flatten(input.value);
    var terms = query ? query.split(' ') : [];
    var shown = 0;
    var perGroup = {};

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var haystack = hay[i];
      var match = true;
      for (var t = 0; t < terms.length; t++) {
        if (haystack.indexOf(' ' + terms[t]) === -1) { match = false; break; }
      }
      card.hidden = !match;
      if (match) {
        shown++;
        var group = card.getAttribute('data-cat') || '';
        perGroup[group] = (perGroup[group] || 0) + 1;
      }
    }

    for (var g = 0; g < groups.length; g++) {
      var id = groups[g].getAttribute('data-group');
      groups[g].hidden = !perGroup[id];
    }

    empty.hidden = shown !== 0;
    var message = !terms.length
      ? 'Showing all ' + total + ' ' + plural(total) + '.'
      : shown === 0
        ? 'No tool matches that.'
        : shown + ' of ' + total + ' ' + plural(total) + ' match.';
    if (message !== announced) {
      status.textContent = message;
      announced = message;
    }
  }

  input.addEventListener('input', apply);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && input.value) {
      input.value = '';
      apply();
      event.preventDefault();
    }
  });

  box.hidden = false;
  apply();
})();
`;

/**
 * Render the page.
 *
 * Pure: everything it needs is passed in, so the test can render a fixed list
 * of slugs and assert on the numbers without touching the repository.
 */
export function renderFrontDoor({
  slugs,
  toolsUrl = TOOLS_URL,
  canonical = FRONT_DOOR_URL,
  // The tools served from this host, from `front-door-tools.mjs`'s
  // `STARTER_SET`. Defaulted empty so this module keeps rendering a correct
  // page on its own, and so a test can pin both states.
  mirrored = [],
} = {}) {
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
    // Where each category's collection page lives. Gated on the mirror for the
    // same reason every other destination on this page is: with a mirror this
    // host renders `/c/<id>/` itself (see `renderCategoryPage`), and without
    // one it does not, so the only honest URL is the catalogue host's.
    //
    // This was unconditionally the catalogue host until the category pages
    // landed, which made it the last place on the page still asserting the
    // dead host after the cards and the footer had been fixed. Seven
    // `CollectionPage` entries naming URLs that serve nothing is a worse
    // failure than a dead link a person can see: structured data is read by
    // exactly the crawlers this portfolio is trying to be found by.
    hasPart: categories.map((category) => ({
      '@type': 'CollectionPage',
      name: category.title,
      url: mirrored.length ? apexCategoryUrl(category.id) : `${toolsUrl}${categoryPagePath(category.id)}`,
      description: category.blurb,
    })),
  };

  // Whether this host serves any tools of its own. Every difference below is
  // gated on it, so with the default empty `mirrored` the page renders exactly
  // as it did before the mirror existed — which is the state it returns to
  // when `portfolio-site-repo` is sealed and the mirror is deleted.
  const grouped = mirroredByCategory(mirrored);
  const hasMirror = mirrored.length > 0;

  /**
   * What a category card links to, and what its count line says.
   *
   * The defect this fixes: these seven cards are the page's primary
   * navigation, and every one of them pointed at `tools.marisstella.dev`,
   * which serves nothing until the clone token is sealed. A visitor who acted
   * on the main affordance of the portfolio's only reachable page reached a
   * dead host — the same failure `front-door-tools.mjs` fixed for the hero
   * copy, still live one element down.
   *
   * So a category with mirrored tools now leads to them, on this host, by
   * fragment; a category without any is not a link at all. An unlinked
   * heading is deliberate over a disabled-looking link: there is nowhere
   * honest to send that click today, and saying so in the count line is
   * better than spending a visitor's click to find out.
   */
  const cards = categories
    .map((category) => {
      const here = grouped.get(category.id) ?? [];
      const plural = category.count === 1 ? 'tool' : 'tools';
      const hubUrl = `${toolsUrl}${categoryPagePath(category.id)}`;
      // With a mirror the heading now leads to this host's own `/c/<id>/`
      // page rather than to a fragment further down this one. Both destinations
      // are real, so this is a judgement rather than a fix: the category page
      // carries `categoryPageCopy`'s dedicated copy and sub-groups the tools,
      // which is the difference between browsing 105 trades tools and scrolling
      // past them. It is also a URL a search result can land on, which a
      // fragment is not. The fragment section stays where it is, reachable from
      // the hero call-to-action, and the count line below still says how much
      // of the category this host serves.
      const heading =
        hasMirror && here.length
          ? `<a href="${escapeHtml(apexCategoryUrl(category.id))}">${escapeHtml(category.title)}</a>`
          : hasMirror
            ? escapeHtml(category.title)
            : `<a href="${escapeHtml(hubUrl)}">${escapeHtml(category.title)}</a>`;
      const count = !hasMirror
        ? `${category.count} ${plural}`
        : here.length
          ? `${category.count} ${plural} · ${here.length} you can open here now`
          : `${category.count} ${plural} · none on this host yet`;
      return `        <li class="card" style="--accent: ${escapeHtml(category.accent)}">
          <h3>${heading}</h3>
          <span class="count">${escapeHtml(count)}</span>
          <p>${escapeHtml(category.blurb)}</p>
        </li>`;
    })
    .join('\n');

  /**
   * The footer's link row — the page's third and last navigation block, and
   * the one that stayed broken longest.
   *
   * It read `All 169 tools · About these tools · New tools feed`, three bare
   * links to `tools.marisstella.dev`, which serves nothing until
   * `portfolio-site-repo` is sealed. The header's fine print two screens above
   * says that host "goes live when its access token is sealed"; the footer said
   * nothing, so the page contradicted itself within one scroll and spent a
   * visitor's click to prove it. The `cards` comment above records the same fix
   * for the category headings.
   *
   * With a mirror, all three become links that work:
   *
   * - the catalogue link becomes the on-host section the cards already point
   *   at, counted honestly at what this host serves rather than at 169;
   * - the feed becomes this host's own — see `renderFrontDoorFeed`, and note
   *   that it is the one entry here with distribution value rather than
   *   navigational value;
   * - "About" is dropped rather than relabelled. There is no about page on this
   *   host and inventing one to fill a footer slot would be a page written for
   *   a link rather than for a reader. The header's fine print already names
   *   the catalogue host and its state, which is what "About" would have said.
   *
   * Without a mirror the row is unchanged, which is the state this page returns
   * to when the seal lands, the mirror is deleted, and all three destinations
   * are live for real.
   */
  const footerLinks = hasMirror
    ? // `/about/` joins this row rather than only the no-mirror branch below.
      // That branch has linked "About these tools" at `${toolsUrl}${ABOUT_PATH}`
      // since it was written, and that URL has never served anything — so on
      // the live host, the page saying what this site is and what it does with
      // what you type was reachable from nowhere. It is this host's own page
      // now (`renderFrontDoorAbout`), so the link is root-relative like its
      // neighbours.
      // `/compare/` joins it for the same reason: the index of every
      // comparison page this host serves is reachable from here or from
      // nowhere, and "is there a free alternative to X" is the query it exists
      // to answer. Conditional on `hasMirror` because the page is rendered
      // only when there are mirrored comparison pages to list.
      `<a href="#open-now">The ${mirrored.length} tools on this host</a> · <a href="/${escapeHtml(ABOUT_PATH)}">About &amp; privacy</a> · <a href="/${escapeHtml(COMPARE_PATH)}">Compare with paid tools</a> · <a href="/${escapeHtml(FEED_FILE)}" type="application/atom+xml">New tools feed</a> · <a href="/${escapeHtml(LLMS_FILE)}">llms.txt</a>`
    : `<a href="${escapeHtml(toolsUrl)}">All ${total} tools</a> · <a href="${escapeHtml(`${toolsUrl}${ABOUT_PATH}`)}">About these tools</a> · <a href="${escapeHtml(`${toolsUrl}${FEED_FILE}`)}">New tools feed</a>`;

  const how = HOW_IT_WORKS.map(
    (item) => `        <li>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.body)}</p>
        </li>`,
  ).join('\n');

  // The tools this host serves itself. Empty until `front-door-tools.mjs`
  // passes a set in, which is what keeps this page correct in both states:
  // once `portfolio-site-repo` is sealed the mirror can be deleted and this
  // section disappears with it, rather than having to be found and removed.
  // Grouped under the same category headings the cards above use, so a card's
  // fragment lands on its own tools rather than on the top of a flat list of
  // seventeen the reader then has to scan. Categories keep the `categories`
  // order — biggest first — so the page reads in one direction throughout.
  const mirrorSection = hasMirror
    ? `
  <h2 id="open-now">Open one now, on this page's own host</h2>
  <p class="lede-sm">${escapeHtml(
    `${mirrored.length} of the ${total} tools are served directly from this domain, so they work whether or not the catalogue host is up. They are the complete tools, not previews.`,
  )}</p>
  <div class="filter" id="tool-filter" hidden>
    <label for="tool-search">Find a tool</label>
    <input id="tool-search" type="search" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(
      FILTER_PLACEHOLDER,
    )}" aria-describedby="tool-filter-status">
    <p class="filter-status" id="tool-filter-status" role="status"></p>
  </div>
  <p class="filter-empty" id="tool-filter-empty" hidden>${escapeHtml(FILTER_EMPTY)}</p>
${orderedGroups(grouped, categories)
  .map(
    (group) => `  <h3 class="group" id="${escapeHtml(categoryAnchor(group.id))}" data-group="${escapeHtml(group.id)}">${escapeHtml(group.title)}</h3>
  <ul class="grid" data-group="${escapeHtml(group.id)}">
${group.tools
  .map((tool) => {
    const extra = extraTokens(tool);
    // Emitted only when it has something to add — see `extraTokens`. Most
    // slugs are the title in kebab case and contribute nothing.
    const alt = extra ? ` data-alt="${escapeHtml(extra)}"` : '';
    return `        <li class="card" data-cat="${escapeHtml(group.id)}"${alt}>
          <h3><a href="${escapeHtml(tool.url)}">${escapeHtml(tool.title)}</a></h3>
        </li>`;
  })
  .join('\n')}
  </ul>`,
  )
  .join('\n')}
`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(SITE_NAME)} — ${total} tools for people who quote, sell and bill</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="icon" href="/${escapeHtml(FAVICON_FILE)}" type="image/svg+xml">
<meta name="theme-color" content="${escapeHtml(THEME_COLOR)}">
<link rel="canonical" href="${escapeHtml(canonical)}">${
    hasMirror
      ? `
<link rel="alternate" type="application/atom+xml" title="${escapeHtml(`${SITE_NAME} — tools on ${FRONT_DOOR_HOST}`)}" href="/${escapeHtml(FEED_FILE)}">`
      : ''
  }
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:title" content="${escapeHtml(SITE_NAME)} — ${total} tools for people who quote, sell and bill">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(`${canonical}${SOCIAL_CARD_FILE}`)}">
<meta property="og:image:width" content="${SOCIAL_CARD_WIDTH}">
<meta property="og:image:height" content="${SOCIAL_CARD_HEIGHT}">
<meta property="og:image:alt" content="${escapeHtml(SOCIAL_CARD_ALT)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(`${canonical}${SOCIAL_CARD_FILE}`)}">
<meta name="twitter:image:alt" content="${escapeHtml(SOCIAL_CARD_ALT)}">
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
  <p><a class="cta" href="${hasMirror ? '#open-now' : escapeHtml(toolsUrl)}">${
    hasMirror ? `Open one of the ${mirrored.length} tools running here now` : `Browse all ${total} tools`
  }</a></p>${
    hasMirror
      ? `
  <p class="fine">The full catalogue of ${total} is at <a href="${escapeHtml(toolsUrl)}">tools.marisstella.dev</a>, which goes live when its access token is sealed.</p>`
      : ''
  }
</header>
<main>
  <h2>What is here</h2>
  <ul class="grid">
${cards}
  </ul>

${mirrorSection}
  <h2>How it works</h2>
  <ul class="rows">
${how}
  </ul>
</main>
<footer>
  <p>${footerLinks}</p>
  <p class="fine"><strong>No warranty.</strong> ${escapeHtml(NO_WARRANTY)}</p>
  <p class="fine"><strong>Best-effort hosting, no SLA.</strong> ${escapeHtml(NO_SLA.replace('Best-effort hosting, no SLA. ', ''))}</p>
</footer>${
    hasMirror
      ? `
<script>${FILTER_SCRIPT}</script>`
      : ''
  }
</body>
</html>
`;
}

/** The published slugs, read from the launch list the site build already pins. */
export async function publishedSlugs(file = LAUNCHED_FILE) {
  const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  return Object.keys(parsed.launched ?? {});
}

/** The launch dates, read from the same committed file the site build pins. */
export async function launchedDates(file = LAUNCHED_FILE) {
  const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  return parsed.launched ?? {};
}

/**
 * The page and the feed together.
 *
 * Both, rather than the page alone, because the page now declares the feed in
 * `<link rel="alternate">` and links it from the footer. Building them on one
 * call is what stops the two being written on different runs and committed out
 * of step — the same reason `--write` emits the card, the icon, `robots.txt`
 * and the sitemap alongside the page.
 */
export async function buildFrontDoor() {
  // The mirror is imported lazily so `front-door.mjs` keeps working — and its
  // own tests keep running — if `front-door-tools.mjs` is ever deleted, which
  // is exactly what should happen once `portfolio-site-repo` is sealed.
  const { buildMirror, TOOLS_HOST_SERVES, mirrorUrl } = await import('./front-door-tools.mjs');
  const { tools, files } = await buildMirror();
  const launched = await launchedDates();
  const slugs = await publishedSlugs();
  // Every mirrored HTML page, which is what the apex may now index — see
  // `renderSitemap`. When the tools host is sealed these pages go `noindex`
  // again, and the sitemap has to empty in the same commit or it starts
  // asking crawlers to index what the pages refuse: hence the guard here
  // rather than a second copy of the premise inside `renderSitemap`.
  const indexablePages = TOOLS_HOST_SERVES
    ? []
    : files.filter((f) => f.file.endsWith('.html')).map((f) => mirrorUrl(f.slug, f.file));
  // How many HTML pages of each tool this host answers for. Counted from the
  // mirrored files rather than the venture directory for the reason
  // `renderFrontDoorCatalog` gives: the mirror is what decides what is
  // reachable here, so it is what the published number must come from.
  const pageCounts = new Map();
  for (const f of files) {
    if (!f.file.endsWith('.html')) continue;
    pageCounts.set(f.slug, (pageCounts.get(f.slug) ?? 0) + 1);
  }
  // The same category ordering the page uses — biggest first — so a model
  // reading llms.txt, a client parsing catalog.json and a person reading the
  // page meet the collection in one order rather than three.
  const categories = orderedCategories(categoryCounts(slugs));

  // One browse page per category this host actually serves tools for.
  //
  // Driven by `mirroredByCategory`/`orderedGroups` rather than by `categories`,
  // for the reason `orderedGroups` documents: the cards count *published*
  // slugs and the groups hold *mirrored* ones, so a category can be shown a
  // count while this host serves none of it. Rendering a page for such a
  // category would publish a browse page listing nothing.
  //
  // Empty when there is no mirror, which is the state this host returns to
  // once `portfolio-site-repo` is sealed: the pages then belong to the
  // catalogue host again, `hasPart` above swings back to it in the same
  // expression, and the sitemap empties in the same run.
  //
  // The category objects come from `ALL_CATEGORIES`, not from the group
  // records: `categoryPageCopy` falls back to a category's own `title`/`blurb`
  // for an id it has no dedicated copy for, and a group record carries no
  // `blurb` — so passing groups would render `content="undefined"` into a
  // meta description the day someone adds a category without copy.
  const served = orderedGroups(mirroredByCategory(tools), categories)
    .map((group) => ({
      category: ALL_CATEGORIES.find((entry) => entry.id === group.id),
      tools: group.tools,
    }))
    .filter((entry) => entry.category);
  const categoryPages = served.map(({ category, tools: categoryTools }) => ({
    id: category.id,
    html: renderCategoryPage({
      category,
      tools: categoryTools,
      categories: served.map((entry) => entry.category),
      total: slugs.length,
    }),
  }));

  // The comparison index, built from the mirrored files rather than from the
  // venture tree. Same reason `pageCounts` above is: the mirror is what decides
  // what this host can reach, so a comparison page a venture ships but the
  // mirror does not carry must not be listed here — that would be a link to a
  // path the catch-all answers with the front page.
  //
  // `comparisonSubject` and `groupComparisons` are imported rather than
  // restated. CLAUDE.md records two occasions where copying a rule out of
  // `build.mjs` instead of importing it cost live product; this is the third
  // opportunity and it declines it too.
  const toolBySlug = new Map(tools.map((tool) => [tool.slug, tool]));
  const comparisonEntries = [];
  for (const f of files) {
    if (!COMPARISON_FILE_PATTERN.test(f.file)) continue;
    const subject = comparisonSubject(f.contents);
    // Dropped rather than guessed at, per `comparisonSubject`: this page names
    // other companies' products, and a wrong name is worse than a missing row.
    if (!subject) continue;
    const tool = toolBySlug.get(f.slug);
    if (!tool) continue;
    comparisonEntries.push({
      slug: f.slug,
      file: f.file,
      subject,
      subjectKey: comparisonSubjectKey(subject),
      title: tool.title,
      href: mirrorUrl(f.slug, f.file),
      summary: truncate(tool.description ?? '', 120),
    });
  }
  const comparisonGroups = groupComparisons(comparisonEntries);
  const comparisons = comparisonGroups.length
    ? renderFrontDoorComparisons({
        groups: comparisonGroups,
        total: slugs.length,
        categories: served.map((entry) => entry.category),
      })
    : null;
  // One spoke per product compared by more than one tool. Rendered from the
  // same groups the index is, so the two cannot disagree about which products
  // have a page — the index links each spoke, and a spoke the index did not
  // link would be reachable only from the sitemap.
  const compareProducts = comparisonProductGroups(comparisonGroups);
  const compareProductPages = compareProducts.map((group) => ({
    key: group.key,
    subject: group.subject,
    html: renderFrontDoorCompareProduct({
      group,
      groups: comparisonGroups,
      total: slugs.length,
      categories: served.map((entry) => entry.category),
    }),
  }));

  return {
    html: renderFrontDoor({ slugs, mirrored: tools }),
    feed: renderFrontDoorFeed({ mirrored: tools, launched }),
    categoryPages,
    // Rendered from the same mirror the rest of this host is, so its tool
    // count and its category list cannot disagree with the front page's.
    // `categories` is the served set rather than `ALL_CATEGORIES`, for the
    // reason `categoryPages` gives above: a category this host serves no tools
    // for has no page, and linking to one would be a link to a 404.
    about: renderFrontDoorAbout({
      mirrored: tools,
      total: slugs.length,
      categories: served.map((entry) => entry.category),
    }),
    // The category pages join the mirrored tool pages as things this host
    // answers for and therefore asks crawlers to index. Same guard: when the
    // tools host is sealed `categoryPages` is empty and these vanish from the
    // sitemap in the same commit that stops rendering them.
    comparisons,
    compareProductPages,
    sitemap: renderSitemap({
      pages: [
        ...indexablePages,
        ...categoryPages.map((page) => `/${categoryPagePath(page.id)}`),
        // Conditional on the same premise the category pages are: the index
        // has entries only while this host mirrors comparison pages, and it is
        // not rendered at all when it would be empty — so it enters and leaves
        // the sitemap in the same run that writes or sweeps the file.
        ...(comparisons ? [`/${COMPARE_PATH}`] : []),
        // And its spokes, on the same conditional terms. These are the pages
        // most likely to be found by search rather than by following a link —
        // each is about one product a stranger may be typing the name of — so
        // omitting them would leave out exactly the pages that need a sitemap
        // entry most.
        ...compareProductPages.map((page) => `/${comparisonProductPath(page.key)}`),
        // Unconditional, unlike the two above: the About page is this host's
        // own, rendered from `SITE_NAME` and the nginx config rather than from
        // the mirror, so it keeps being served — and keeps being worth
        // indexing — on the day `portfolio-site-repo` is sealed and everything
        // else here empties.
        `/${ABOUT_PATH}`,
      ],
    }),
    llms: renderFrontDoorLlms({
      mirrored: tools,
      total: slugs.length,
      categories,
      comparisonCount: comparisonEntries.length,
      compareProducts,
    }),
    catalog: renderFrontDoorCatalog({
      mirrored: tools,
      total: slugs.length,
      pageCounts,
      categories,
    }),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const {
    html,
    feed,
    llms,
    sitemap,
    catalog,
    categoryPages,
    about,
    comparisons,
    compareProductPages,
  } = await buildFrontDoor();
  if (process.argv.includes('--write')) {
    await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
    await fs.writeFile(OUTPUT_FILE, html);
    console.log(`wrote ${path.relative(REPO_ROOT, OUTPUT_FILE)} (${html.length} bytes)`);
    // Written on the same run as the page that points at it, so the two can
    // never be committed out of step — the failure mode this replaces was an
    // `og:image` naming a file that was never delivered anywhere.
    const card = renderSocialCard();
    await fs.writeFile(SOCIAL_CARD_OUTPUT_FILE, card);
    console.log(`wrote ${path.relative(REPO_ROOT, SOCIAL_CARD_OUTPUT_FILE)} (${card.length} bytes)`);
    // Same reason as the card above: the page declares `rel="icon"` at this
    // path, so writing it on any run that writes the page keeps the two from
    // being committed out of step.
    await fs.writeFile(FAVICON_OUTPUT_FILE, FAVICON_SVG);
    console.log(`wrote ${path.relative(REPO_ROOT, FAVICON_OUTPUT_FILE)} (${FAVICON_SVG.length} bytes)`);
    // Same reason again: `robots.txt` names the sitemap's URL and the sitemap
    // names the page's, so all three are written by whichever run writes any
    // of them. A sitemap referenced by a robots.txt that was never delivered
    // is the `og:image` defect one layer out.
    await fs.writeFile(ROBOTS_OUTPUT_FILE, ROBOTS_TXT);
    console.log(`wrote ${path.relative(REPO_ROOT, ROBOTS_OUTPUT_FILE)} (${ROBOTS_TXT.length} bytes)`);
    await fs.writeFile(SITEMAP_OUTPUT_FILE, sitemap);
    console.log(
      `wrote ${path.relative(REPO_ROOT, SITEMAP_OUTPUT_FILE)} (${sitemap.length} bytes)`,
    );
    // Same reason once more: the page declares this feed in `<link
    // rel="alternate">` and links it from the footer, so a run that wrote the
    // page without it would ship a document advertising a path nothing serves.
    await fs.writeFile(FEED_OUTPUT_FILE, feed);
    console.log(`wrote ${path.relative(REPO_ROOT, FEED_OUTPUT_FILE)} (${feed.length} bytes)`);
    // And once more: `llms.txt` lists the same mirrored tools the page and the
    // feed do, so a run that wrote one without the others would publish three
    // documents disagreeing about what this host serves.
    await fs.writeFile(LLMS_OUTPUT_FILE, llms);
    console.log(`wrote ${path.relative(REPO_ROOT, LLMS_OUTPUT_FILE)} (${llms.length} bytes)`);
    // And once more, with one extra edge: `llms.txt` now *links* this file, so
    // a run that wrote the one without the other would publish a document
    // pointing a model at a path this host answers with the front page.
    await fs.writeFile(CATALOG_OUTPUT_FILE, catalog);
    console.log(`wrote ${path.relative(REPO_ROOT, CATALOG_OUTPUT_FILE)} (${catalog.length} bytes)`);
    // And once more, for the reason every write above gives: each mirrored
    // entry page links these two absolute paths, so a run that wrote the
    // mirror without them would ship 169 pages whose embed box is unstyled and
    // whose copy button does nothing -- the catch-all `location /` would answer
    // both requests with the front page's HTML, and a stylesheet and an ES
    // module served as HTML are refused rather than merely mistyped.
    const embedModule = renderEmbedModule();
    await fs.writeFile(EMBED_MODULE_OUTPUT_FILE, embedModule);
    console.log(
      `wrote ${path.relative(REPO_ROOT, EMBED_MODULE_OUTPUT_FILE)} (${embedModule.length} bytes)`,
    );
    const embedStyle = renderEmbedStyle();
    await fs.writeFile(EMBED_STYLE_OUTPUT_FILE, embedStyle);
    console.log(
      `wrote ${path.relative(REPO_ROOT, EMBED_STYLE_OUTPUT_FILE)} (${embedStyle.length} bytes)`,
    );
    const embedHost = renderEmbedHostModule();
    await fs.writeFile(EMBED_HOST_OUTPUT_FILE, embedHost);
    console.log(
      `wrote ${path.relative(REPO_ROOT, EMBED_HOST_OUTPUT_FILE)} (${embedHost.length} bytes)`,
    );
    // The category pages, for the same reason as everything above: the page's
    // own cards and its JSON-LD `hasPart` name these seven URLs, so a run that
    // wrote the front page without them would ship the exact defect this
    // change removes — navigation and structured data pointing at paths the
    // catch-all answers with the front page.
    //
    // Stale files are swept rather than left: a category that loses its last
    // mirrored tool stops being rendered, and its page would otherwise stay in
    // git, stay in the ConfigMap, and stay in nobody's sitemap while still
    // answering its URL with a list of tools this host no longer serves.
    const wanted = new Set(categoryPages.map((page) => categoryPageKey(page.id)));
    for (const name of await fs.readdir(path.dirname(OUTPUT_FILE))) {
      if (name.startsWith('c__') && name.endsWith('.html') && !wanted.has(name)) {
        await fs.rm(path.join(path.dirname(OUTPUT_FILE), name));
        console.log(`removed ${name} (no mirrored tools in that category)`);
      }
    }
    for (const page of categoryPages) {
      const file = categoryOutputFile(page.id);
      await fs.writeFile(file, page.html);
      console.log(`wrote ${path.relative(REPO_ROOT, file)} (${page.html.length} bytes)`);
    }
    // Same run as the sitemap that lists it and the front page that links to
    // it, for the reason every other artifact here is written together: a page
    // referenced by two files it was not committed beside is a 404 that only
    // shows up in production.
    const aboutFile = aboutOutputFile();
    await fs.writeFile(aboutFile, about);
    console.log(`wrote ${path.relative(REPO_ROOT, aboutFile)} (${about.length} bytes)`);
    // The comparison index, on the same terms as the category pages above: it
    // is written when there is something to list and swept when there is not,
    // so it can never stay in git, in the ConfigMap and in nobody's sitemap
    // while still answering its URL with a list of pages this host no longer
    // serves.
    const compareFile = compareOutputFile();
    if (comparisons) {
      const stored = compress(comparisons);
      await fs.writeFile(compareFile, stored);
      console.log(
        `wrote ${path.relative(REPO_ROOT, compareFile)} (${stored.length} bytes, ${comparisons.length} uncompressed)`,
      );
    } else if (await fs.stat(compareFile).then(() => true, () => false)) {
      await fs.rm(compareFile);
      console.log(`removed ${compareStoredKey()} (no mirrored comparison pages)`);
    }
    // The plain sibling from before these keys were compressed. Left behind it
    // would be dead weight in a ConfigMap this change exists to shrink, and
    // worse than dead: `gzip_static` prefers the `.gz` but `try_files` and the
    // catch-all would still find the stale plain copy, so a regeneration that
    // silently stopped writing one would keep serving the other for as long as
    // anybody looked.
    for (const stale of [COMPARE_KEY, ...compareProductPages.map((p) => compareProductKey(p.key))]) {
      const file = path.join(path.dirname(OUTPUT_FILE), stale);
      if (await fs.stat(file).then(() => true, () => false)) {
        await fs.rm(file);
        console.log(`removed ${stale} (superseded by its .gz)`);
      }
    }
    // The per-product pages, swept and written on exactly the terms the
    // category pages above are. The sweep is what matters here: a product
    // drops below two comparisons whenever a venture is excluded from the
    // mirror or an author rewords a heading, and without this its page would
    // stay in git, stay in the ConfigMap and stay linked from nothing while
    // still answering its URL with a list this host no longer stands behind.
    const wantedProducts = new Set(
      compareProductPages.map((page) => compareProductStoredKey(page.key)),
    );
    for (const name of await fs.readdir(path.dirname(OUTPUT_FILE))) {
      if (
        name.startsWith(COMPARE_PRODUCT_PREFIX) &&
        name.endsWith(`.html${COMPRESSED_SUFFIX}`) &&
        !wantedProducts.has(name)
      ) {
        await fs.rm(path.join(path.dirname(OUTPUT_FILE), name));
        console.log(`removed ${name} (fewer than two tools compare themselves with it)`);
      }
    }
    for (const page of compareProductPages) {
      const file = compareProductOutputFile(page.key);
      const stored = compress(page.html);
      await fs.writeFile(file, stored);
      console.log(
        `wrote ${path.relative(REPO_ROOT, file)} (${stored.length} bytes, ${page.html.length} uncompressed)`,
      );
    }
  } else {
    process.stdout.write(html);
  }
}
