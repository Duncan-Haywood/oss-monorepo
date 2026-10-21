// The one site header, defined once.
//
// The published site grew from one hub into a hub, a dozen category pages,
// About, /compare/, /guides/, /research/ (a separate Python builder with its own
// brand), /engineering/, /dev/, /dev/analyses/, /deploy/ and ~1,300 venture
// pages. Each renderer drew its own way home, or none: /deploy/ had no link
// back at all, /dev/ said "← Home", research said "Tools", venture pages said
// "← All N free tools". A visitor could not tell these were one site, and from
// most of them could not reach the others.
//
// Every renderer now takes its header from `renderSiteHeader` here, and the
// Python research builder takes the same markup from the file
// `writeResearchChrome` writes (see research/_homepage/build.py). The nav items
// are `SITE_NAV` and nowhere else; build.test.mjs checks that every page type
// carries exactly these links.
//
// Two stylesheets carry the header's rules, both built from `SITE_HEADER_CSS`:
//   * `pf-site.css` — site-owned pages. Adds the site palette (light and dark).
//   * `pf-chrome.css` — venture pages. No palette at all: the header inherits
//     its colours from the venture, which is the rule the venture chrome has
//     always followed (see CHROME_CSS in build.mjs).

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const SITE_NAME = 'Open Tools and Research';
export const REPO_URL = 'https://github.com/Duncan-Haywood/oss-monorepo';
export const SITE_STYLE_FILE = 'pf-site.css';

/**
 * The two ways to support the work, the same pair `.github/FUNDING.yml`
 * declares. Defined here, beside the shared footer that carries them, so the
 * day an account changes there is one place to edit.
 */
export const SPONSORS_URL = 'https://github.com/sponsors/Duncan-Haywood';
export const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/duncanhaywood';

/**
 * The one-sentence support line every page's footer carries.
 *
 * `PRODUCT_PLAYBOOK.md` §6: a donation prompt lives in the footer, "nowhere a
 * user has to pass through", and never in front of a feature. It says the ask
 * changes nothing because that is true: declining costs no functionality.
 */
export function sponsorsNote() {
  return `Free, and staying free. If one of these saved you time or money, you can <a href="${SPONSORS_URL}">sponsor on GitHub</a> or <a href="${BUY_ME_A_COFFEE_URL}">buy me a coffee</a>. Either is optional and changes nothing about what these tools do.`;
}

/** The primary navigation, in order. `href` is relative to the site root. */
export const SITE_NAV = Object.freeze([
  Object.freeze({ id: 'tools', label: 'Tools', href: 'c/' }),
  Object.freeze({ id: 'research', label: 'Research', href: 'research/' }),
  // Blog and Podcast sit at the top level (owner, 2026-10-21). The podcast
  // lives inside the blog's folder; its page always exists, even with no episodes.
  Object.freeze({ id: 'writing', label: 'Blog', href: 'writing/' }),
  Object.freeze({ id: 'podcast', label: 'Podcast', href: 'writing/podcast/' }),
  Object.freeze({ id: 'updates', label: 'Updates', href: 'updates/' }),
  Object.freeze({ id: 'ask', label: 'Ask', href: 'ask/' }),
  Object.freeze({ id: 'deploy', label: 'Deploy your own', href: 'deploy/' }),
  Object.freeze({ id: 'about', label: 'About', href: 'about/' }),
]);

/** Where the full-catalogue search lives: the hub's search box. */
export const SEARCH_ANCHOR = 'search';

/**
 * Root-level directories publish-branch.sh writes after build.mjs and
 * check.mjs have run (platform/deploy/, platform/devstats/ and
 * platform/devlog/). Each of those builders adds this header itself.
 */
export const LATE_NAV_DIRS = Object.freeze(['deploy', 'dev']);

export const HEADER_MARKER = 'data-pfs-head';

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The header markup.
 *
 * List-free, and form-free where it lands inside someone else's page: a
 * venture script that reads `document.querySelector('form')`, `ul li` or every
 * `input` on its page must still find its own markup first, so on venture
 * pages the search entry is a link (`search: 'link'`) and the items are plain
 * anchors.
 *
 * One `<nav>` element and no nested one: rates.mjs and jobs.mjs anchor their
 * bars after the first `</nav>` following the venture chrome's opening tag.
 *
 * @param {object} o
 * @param {string} o.toRoot   relative path from the page to the site root ('', '../', …)
 * @param {string} [o.current] SITE_NAV id of the section this page belongs to, or 'home'
 * @param {true|'link'|false} [o.search] the compact search form, a link to the
 *   hub's search, or nothing (default: the form, except on the hub itself)
 * @param {Array<{href?: string, label: string}>} [o.crumbs] breadcrumb trail after "Home"
 * @param {string} [o.extraClass] extra classes (the venture chrome adds its marker)
 */
export function renderSiteHeader({ toRoot = '', current = '', search, crumbs = [], extraClass = '' } = {}) {
  const root = toRoot || './';
  const mode = search ?? (current === 'home' ? false : true);
  const items = SITE_NAV.map(
    (item) =>
      `<a data-pfs-nav="${item.id}" href="${esc(`${toRoot}${item.href}`)}"${
        item.id === current ? ' aria-current="page"' : ''
      }>${esc(item.label)}</a>`,
  ).join('');
  const link = `<a class="pfs-searchlink${mode === 'link' ? ' pfs-always' : ''}" href="${esc(`${root}#${SEARCH_ANCHOR}`)}">Search</a>`;
  // A GET form on wide screens (the hub reads ?q=), a plain link on a phone,
  // where an input in the header would cost a whole row.
  const searchHtml =
    mode === true
      ? `<form class="pfs-search" action="${esc(root)}" method="get" role="search"><label class="pfs-vh" for="pfs-q">Search all tools and research</label><input id="pfs-q" name="q" type="search" placeholder="Search tools &amp; research" autocomplete="off"><button type="submit">Search</button></form>${link}`
      : mode === 'link'
        ? link
        : '';
  const crumbHtml = crumbs.length
    ? `<span class="pfs-crumbs" role="group" aria-label="Breadcrumb"><a href="${esc(root)}" data-pf-to="hub">Home</a>${crumbs
        .map((c, i) =>
          c.href && i < crumbs.length - 1
            ? `<span class="pfs-sep" aria-hidden="true">›</span><a href="${esc(c.href)}">${esc(c.label)}</a>`
            : `<span class="pfs-sep" aria-hidden="true">›</span><span aria-current="page">${esc(c.label)}</span>`,
        )
        .join('')}</span>`
    : '';
  // The stylesheet selects on the data attribute, not a class: rates.mjs and
  // jobs.mjs find the venture chrome by its exact opening tag,
  // `<nav class="pf-chrome pf-chrome-top"`, so a venture page's header carries
  // that class attribute and nothing added to it.
  return `<nav class="${extraClass || 'pfs-head'}" aria-label="Site" ${HEADER_MARKER}><span class="pfs-bar"><a class="pfs-brand" href="${esc(root)}" data-pf-to="hub"><span class="pfs-mark" aria-hidden="true"></span>${esc(SITE_NAME)}</a><span class="pfs-nav">${items}</span>${searchHtml}</span>${crumbHtml}</nav>`;
}

/**
 * The shared footer link row for site-owned pages. Each page keeps its own
 * disclaimer above it; this is the "where else can I go" half, plus the
 * support line, so every page that carries the row carries that too.
 */
export function renderSiteFooterNav({ toRoot = '' } = {}) {
  const links = [
    ['c/', 'All tools by category'],
    ['research/', 'Research'],
    ['writing/', 'Blog'],
    ['writing/podcast/', 'Podcast'],
    ['updates/', 'Updates &amp; roadmap'],
    ['changelog/', 'Changelog'],
    ['guides/', 'Guides'],
    ['compare/', 'Comparisons'],
    ['deploy/', 'Deploy your own copy'],
    ['about/', 'About &amp; press kit'],
    ['lab/', 'Lab'],
    ['feedback/', 'Report a problem or suggest a feature'],
    ['engineering/', 'Engineering status'],
    ['dev/', 'Development dashboard'],
    ['dev/daily/', 'Daily brief &amp; The Merge Report'],
    ['catalog.json', 'Machine-readable catalog'],
    ['llms.txt', 'llms.txt'],
    ['sitemap.xml', 'Sitemap'],
    ['feed.xml', 'New tools feed'],
    ['changelog/feed.xml', 'Changelog feed'],
  ];
  return `<p class="pfs-support">${sponsorsNote()}</p><p class="pfs-foot">${links
    .map(([href, label]) => `<a href="${esc(`${toRoot}${href}`)}">${label}</a>`)
    .join('<span aria-hidden="true"> · </span>')}<span aria-hidden="true"> · </span><a href="${REPO_URL}">Source on GitHub</a></p>`;
}

/**
 * Layout rules for the header, shared by both stylesheets. Deliberately free of
 * literal colours, opacity and `prefers-color-scheme`: on a venture page every
 * colour falls back to the host's own (`inherit`, or a neutral grey at low
 * alpha), and `pf-site.css` supplies the site palette through `--pfs-*`. Every
 * rule is scoped under `[data-pfs-head]` or a `.pfs-*` class and resets what a venture's own `nav` and `a`
 * rules might otherwise bleed into it.
 */
export const SITE_HEADER_CSS = `
[data-pfs-head]{display:block;position:static;float:none;width:auto;max-width:none;height:auto;margin:0;padding:0;
  border:0;border-bottom:1px solid var(--pfs-line,rgba(128,128,128,.34));box-shadow:none;border-radius:0;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;font-weight:400;line-height:1.4;
  letter-spacing:normal;text-transform:none;text-align:left;
  color:var(--pfs-ink,inherit);background:var(--pfs-head-bg,rgba(128,128,128,.07))}
[data-pfs-head] *{box-sizing:border-box}
[data-pfs-head] a{color:inherit;text-decoration:none;background:none;border-radius:0;padding:0;margin:0}
[data-pfs-head] a:hover,[data-pfs-head] a:focus-visible{text-decoration:underline;text-underline-offset:3px}
[data-pfs-head] :focus-visible{outline:2px solid currentColor;outline-offset:2px}
.pfs-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 22px;max-width:1120px;margin:0 auto;padding:10px 16px}
[data-pfs-head] .pfs-brand{display:inline-flex;align-items:center;gap:9px;font-weight:750;letter-spacing:-.01em;white-space:nowrap}
.pfs-mark{display:inline-block;width:20px;height:20px;border-radius:6px;flex:none;background:var(--pfs-mark,currentColor)}
.pfs-nav{display:flex;flex-wrap:wrap;gap:4px 18px;flex:1 1 auto;min-width:0}
[data-pfs-head] .pfs-nav a{display:inline-block;padding:4px 0;font-weight:600;color:var(--pfs-muted,inherit);
  border-bottom:2px solid transparent}
[data-pfs-head] .pfs-nav a[aria-current="page"]{color:var(--pfs-ink,inherit);border-bottom-color:var(--pfs-accent,currentColor)}
.pfs-search{display:flex;gap:6px;margin:0;padding:0;border:0;flex:0 1 280px;min-width:0}
.pfs-search input{flex:1 1 auto;min-width:0;width:100%;font:inherit;font-size:14px;padding:7px 10px;margin:0;border-radius:8px;
  border:1px solid var(--pfs-line,rgba(128,128,128,.5));background:var(--pfs-panel,transparent);color:inherit}
.pfs-search button{font:inherit;font-size:14px;font-weight:650;padding:7px 12px;margin:0;border-radius:8px;cursor:pointer;
  border:1px solid var(--pfs-line,rgba(128,128,128,.5));background:var(--pfs-panel,transparent);color:inherit}
[data-pfs-head] .pfs-searchlink{display:none;font-weight:600}
[data-pfs-head] .pfs-searchlink.pfs-always{display:inline-block}
.pfs-vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.pfs-crumbs{display:block;max-width:1120px;margin:0 auto;padding:0 16px 9px;font-size:13px;color:var(--pfs-muted,inherit);
  overflow-wrap:anywhere}
[data-pfs-head] .pfs-crumbs a{text-decoration:underline;text-underline-offset:2px}
.pfs-sep{margin:0 7px}
@media (max-width:720px){
  .pfs-bar{gap:6px 14px;padding:9px 16px}
  [data-pfs-head] .pfs-brand{flex:1 1 auto}
  .pfs-search{display:none}
  [data-pfs-head] .pfs-searchlink{display:inline-block}
  .pfs-nav{order:3;flex-basis:100%;gap:2px 16px}
}
@media print{[data-pfs-head]{display:none !important}}
`;

/** The site palette for site-owned pages, light and dark. */
const SITE_TOKENS_CSS = `
:root{--pfs-ink:#1d2530;--pfs-muted:#4a5666;--pfs-line:#d3dce6;--pfs-accent:#12594a;--pfs-panel:#ffffff;
  --pfs-head-bg:#ffffff;--pfs-mark:linear-gradient(135deg,#12594a,#3b5bdb)}
@media (prefers-color-scheme:dark){:root{--pfs-ink:#e8eef5;--pfs-muted:#a2b0c0;--pfs-line:#2a343f;--pfs-accent:#7fd8c0;
  --pfs-panel:#171e27;--pfs-head-bg:#171e27;--pfs-mark:linear-gradient(135deg,#7fd8c0,#8ea2ff)}}
`;

/**
 * The footer: a dark full-width band closing every site-owned page, the
 * homepage hero's field mirrored at the bottom, with the link row laid out as
 * a grid rather than one run-on dotted line.
 *
 * It selects the footer that holds `renderSiteFooterNav`'s row, so every
 * renderer gets it without a class of its own. Like `.pf-hero` it is dark in
 * both colour schemes and redefines the page tokens its contents read. The
 * fill runs edge to edge and down past the page's bottom padding through a
 * spread shadow clipped to the band's sides and below: unlike a 100vw
 * pseudo-element, a shadow adds no scrollable overflow. Lightest
 * text-on-field pair: `--soft` #a9b5c6 on #080d1a is 9.4:1.
 */
const SITE_FOOTER_CSS = `
footer:has(.pfs-foot){position:relative;max-width:none;color-scheme:dark;margin-top:64px;padding:40px 0 34px;border-top:0;
  color:#c3cddb;--ink:#eef2f8;--muted:#c3cddb;--soft:#a9b5c6;--accent:#7fe3c6;--line:rgba(148,170,210,.24);
  --panel:rgba(20,28,48,.72);--pfs-accent:#7fe3c6;
  background:radial-gradient(420px 160px at 30% 0%,rgba(31,182,143,.16),transparent 70%),
    radial-gradient(460px 170px at 72% 0%,rgba(75,93,255,.18),transparent 70%),#080d1a;
  box-shadow:0 0 0 100vmax #080d1a;clip-path:inset(0 -100vmax -100vmax)}
footer:has(.pfs-foot)>:not(.pfs-foot){max-width:84ch}
footer:has(.pfs-foot) h2,footer:has(.pfs-foot) strong{color:#eef2f8}
.pfs-foot{margin:18px 0 0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.9}
.pfs-foot a,.pfs-support a{color:var(--pfs-accent)}
.pfs-support{margin:18px 0 0;font-size:14px;line-height:1.6}
footer .pfs-foot{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:4px 24px;
  margin-top:26px;padding-top:22px;border-top:1px solid rgba(148,170,210,.24);line-height:1.6}
footer .pfs-foot>span{display:none}
footer .pfs-foot+*{margin-top:16px}
footer .pfs-foot a{text-decoration:none}
footer .pfs-foot a:hover,footer .pfs-foot a:focus-visible{text-decoration:underline;text-underline-offset:3px}
`;

/**
 * The page-hero band: the top of every site-owned sub-page (category pages,
 * /c/, About, Compare, Guides, Feedback, Ask, Writing, Updates, Changelog)
 * takes the homepage hero's dark field, glows and grid, so a visitor who
 * clicks from the front door into a section does not land on what reads as a
 * different site. A page opts in with `<header class="pf-hero">`.
 *
 * Dark in both colour schemes, like the homepage hero (showcase.mjs), so it
 * redefines the page tokens it contains: every renderer's `.eyebrow`, `.lede`,
 * `.dek`, `.count`, `.starting` and link already read `--ink`, `--muted`,
 * `--accent` and friends, and get light-on-dark values here without each page
 * restyling them. Lightest text-on-field pair: `--soft` #a9b5c6 on the
 * brightest glow (~#1c2a52) is 6.6:1, above AA's 4.5:1.
 *
 * The band paints full-bleed from inside a centred `.wrap` with a 100vw
 * pseudo-element; `html{overflow-x:clip}` keeps that from adding a sideways
 * scroll where a scrollbar makes 100vw wider than the page. `clip`, not
 * `hidden`, so no scroll container is created and sticky elements still stick.
 * `--pf-hero-pull` is the wrap's top padding, so the field meets the nav.
 */
const SITE_HERO_CSS = `
html{overflow-x:clip}
.pf-hero{position:relative;isolation:isolate;max-width:none;margin:0 0 30px;
  padding:clamp(22px,4.4vw,46px) 0 clamp(24px,4vw,40px);color:#eef2f8;
  --ink:#eef2f8;--muted:#c3cddb;--soft:#a9b5c6;--accent:#7fe3c6;--accent-ink:#07121a;
  --line:rgba(148,170,210,.3);--panel:rgba(20,28,48,.72);--bg:rgba(10,16,32,.6);--code:rgba(148,170,210,.16)}
.pf-hero::before,.pf-hero::after{content:"";position:absolute;z-index:-1;pointer-events:none;
  top:calc(-1 * var(--pf-hero-pull,26px));bottom:0;left:50%;width:100vw;margin-left:-50vw}
.pf-hero::before{background:
    radial-gradient(640px 300px at 8% 0%,rgba(31,182,143,.30),transparent 70%),
    radial-gradient(760px 340px at 92% 0%,rgba(75,93,255,.34),transparent 70%),
    radial-gradient(700px 300px at 55% 135%,rgba(177,75,255,.24),transparent 70%),
    #080d1a;
  border-bottom:1px solid #1d2742}
.pf-hero::after{background-image:linear-gradient(rgba(140,170,255,.07) 1px,transparent 1px),
    linear-gradient(90deg,rgba(140,170,255,.07) 1px,transparent 1px);background-size:44px 44px;
  -webkit-mask-image:radial-gradient(ellipse 70% 90% at 50% 0%,#000 30%,transparent 80%);
          mask-image:radial-gradient(ellipse 70% 90% at 50% 0%,#000 30%,transparent 80%)}
.pf-hero h1{color:#fff;letter-spacing:-.035em;text-wrap:balance}
.pf-hero .eyebrow{display:inline-flex;align-items:center;gap:8px;color:var(--accent);font-size:.78rem;font-weight:700;
  letter-spacing:.09em;text-transform:uppercase;margin:0 0 10px}
.pf-hero .eyebrow::before{content:"";width:7px;height:7px;border-radius:50%;background:color-mix(in srgb,var(--pf-cat,var(--accent)) 45%,#7fe3c6);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--pf-cat,var(--accent)) 30%,transparent)}
.pf-hero .lede,.pf-hero .dek{color:var(--muted);text-wrap:pretty;max-width:68ch}
.pf-hero a{color:var(--accent)}
.pf-hero .starting{background:var(--panel);border-left-color:var(--accent);color:var(--ink)}
.pf-hero .count{color:var(--soft)}
@media (max-width:600px){.pf-hero{padding-top:18px}}
`;

/** Contents of `pf-site.css`, the stylesheet every site-owned page links. */
export function renderSiteStyle() {
  return `${SITE_TOKENS_CSS.trimStart()}${SITE_HEADER_CSS}${SITE_FOOTER_CSS}${SITE_HERO_CSS}`;
}

/** The `<link>` a site-owned page puts in its head. */
export function siteStyleLink(toRoot = '') {
  return `<link rel="stylesheet" href="${esc(`${toRoot}${SITE_STYLE_FILE}`)}">`;
}

/**
 * Add the stylesheet and header to a finished HTML document. Idempotent, and a
 * page with no `<body>` is returned unchanged. Used by the builders that write
 * whole documents from their own templates (deploy/, dev/, dev/analyses/,
 * engineering/, writing/).
 */
export function withSiteHeader(html, opts = {}) {
  if (html.includes(HEADER_MARKER)) return html;
  const body = /<body\b[^>]*>/i.exec(html);
  if (!body) return html;
  const at = body.index + body[0].length;
  const out = `${html.slice(0, at)}\n${renderSiteHeader(opts)}${html.slice(at)}`;
  const link = siteStyleLink(opts.toRoot ?? '');
  return /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${link}\n</head>`) : `${link}\n${out}`;
}

/**
 * The header and footer as templates, for the Python research builder: the
 * same markup, with `{{ROOT}}` where the relative path to the site root goes.
 */
export function researchChromeTemplate() {
  const root = '{{ROOT}}';
  // The breadcrumb variants: Home › Research › <topic> on a topic page, and
  // Home › Research › <topic> › <project> on a project page. build.py fills
  // {{TOPIC_ID}}, {{TOPIC}} and {{TITLE}} with escaped text.
  const research = { href: `${root}research/`, label: 'Research' };
  const topic = { href: `${root}research/topics/{{TOPIC_ID}}/`, label: '{{TOPIC}}' };
  return {
    style_file: SITE_STYLE_FILE,
    header: renderSiteHeader({ toRoot: root, current: 'research' }),
    topic_header: renderSiteHeader({ toRoot: root, current: 'research', crumbs: [research, { label: '{{TOPIC}}' }] }),
    project_header: renderSiteHeader({ toRoot: root, current: 'research', crumbs: [research, topic, { label: '{{TITLE}}' }] }),
    footer: renderSiteFooterNav({ toRoot: root }),
  };
}

export async function writeResearchChrome(file) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(researchChromeTemplate()));
  return file;
}
