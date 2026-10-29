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

/** Longest `<title>` a search result shows before cutting it off. */
export const TITLE_BUDGET = 70;

/**
 * A page's `<title>`: "title | site name" when both fit a results page, else the
 * title alone, so the words that tell a searcher what the page is are never the
 * ones cut. Comparison pages ("X alternatives: 2 free tools ...") and audience
 * hubs ran to 120 characters with the suffix.
 */
export function siteTitle(title) {
  const full = `${title} | ${SITE_NAME}`;
  return full.length <= TITLE_BUDGET ? full : title;
}
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
  // The creative track's fiction (owner, 2026-10-24: its "own page on the
  // website"); see stories.mjs.
  Object.freeze({ id: 'stories', label: 'Stories', href: 'stories/' }),
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
      ? `<form class="pfs-search" action="${esc(root)}" method="get" role="search"><label class="pfs-vh" for="pfs-q">Search all tools and research</label><input id="pfs-q" name="q" type="search" placeholder="Search tools &amp; research" autocomplete="off"><button type="submit"><span class="pfs-vh">Search</span></button></form>${link}`
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
    ['stories/', 'Stories'],
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
.pfs-nav{display:flex;flex-wrap:wrap;gap:4px 16px;flex:1 1 auto;min-width:0}
[data-pfs-head] .pfs-nav a{display:inline-block;padding:4px 0;font-weight:600;color:var(--pfs-muted,inherit);
  border-bottom:2px solid transparent}
[data-pfs-head] .pfs-nav a[aria-current="page"]{color:var(--pfs-ink,inherit);border-bottom-color:var(--pfs-accent,currentColor)}
.pfs-search{position:relative;display:flex;margin:0;padding:0;border:0;flex:0 1 236px;min-width:0}
.pfs-search input{flex:1 1 auto;min-width:0;width:100%;font:inherit;font-size:14px;padding:7px 12px 7px 34px;margin:0;border-radius:999px;
  border:1px solid var(--pfs-line,rgba(128,128,128,.5));background:var(--pfs-panel,transparent);color:inherit;
  transition:border-color .15s ease,box-shadow .15s ease}
.pfs-search input:focus{outline:none;border-color:var(--pfs-accent,currentColor);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--pfs-accent,currentColor) 22%,transparent)}
.pfs-search button{position:absolute;left:3px;top:50%;transform:translateY(-50%);width:28px;height:28px;padding:0;margin:0;
  border:0;border-radius:999px;background:none;color:var(--pfs-muted,inherit);cursor:pointer}
.pfs-search button::before{content:"";position:absolute;inset:6px;background:currentColor;
  -webkit-mask:var(--pfs-glass) center/contain no-repeat;mask:var(--pfs-glass) center/contain no-repeat}
.pfs-search{--pfs-glass:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round'%3E%3Ccircle cx='10.5' cy='10.5' r='6.5'/%3E%3Cpath d='M15.5 15.5 21 21'/%3E%3C/svg%3E")}
[data-pfs-head] .pfs-searchlink{display:none;font-weight:600}
[data-pfs-head] .pfs-searchlink.pfs-always{display:inline-block}
.pfs-vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.pfs-crumbs{display:block;max-width:1120px;margin:0 auto;padding:0 16px 9px;font-size:13px;color:var(--pfs-muted,inherit);
  overflow-wrap:anywhere}
[data-pfs-head] .pfs-crumbs a{text-decoration:underline;text-underline-offset:2px}
.pfs-sep{margin:0 7px}
@media (max-width:600px){
  /* One line on a phone: the current page's title (often a sentence) is cut with an ellipsis instead of wrapping to three lines. */
  .pfs-crumbs{display:flex;flex-wrap:nowrap;align-items:baseline;overflow:hidden;white-space:nowrap}
  .pfs-crumbs>a,.pfs-crumbs>.pfs-sep{flex:0 0 auto}
  .pfs-crumbs>[aria-current]{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis}
}
@media (max-width:1080px){
  .pfs-search{display:none}
  [data-pfs-head] .pfs-searchlink{display:inline-block}
}
@property --pfs-fade{syntax:'<length>';inherits:false;initial-value:28px}
@keyframes pfs-fade-out{to{--pfs-fade:0px}}
@media (max-width:720px){
  .pfs-bar{gap:6px 14px;padding:9px 16px}
  [data-pfs-head] .pfs-brand{flex:1 1 auto}
  .pfs-search{display:none}
  [data-pfs-head] .pfs-searchlink{display:inline-block}
  .pfs-nav{order:3;flex-basis:100%;gap:2px 18px;flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain;
    scrollbar-width:none;margin-right:-16px;padding-right:28px;
    --pfs-fade:28px;
    -webkit-mask-image:linear-gradient(90deg,black calc(100% - var(--pfs-fade)),transparent);
            mask-image:linear-gradient(90deg,black calc(100% - var(--pfs-fade)),transparent)}
  @supports (animation-timeline:scroll()){
    .pfs-nav{animation:pfs-fade-out linear both;animation-timeline:scroll(self inline);animation-range:calc(100% - 40px) 100%}
  }
  .pfs-nav::-webkit-scrollbar{display:none}
  [data-pfs-head] .pfs-nav a{flex:none;white-space:nowrap}
}
@media print{[data-pfs-head]{display:none !important}}
`;

/**
 * The venture pages' header and footer, in the site's own palette.
 *
 * The chrome on the ~1,300 venture pages used to take its colours from the
 * venture (`SITE_HEADER_CSS` carries none), so the one bar that says "this is
 * Open Tools and Research" was a different bar on every tool: a grey strip in
 * the venture's own width and font, and the brand mark a black square because
 * `--pfs-mark` was never set. A visitor arriving from search at a calculator
 * could not tell it belonged to the site they then clicked through to.
 *
 * Here the venture header and footer carry the site palette (the same tokens
 * as `pf-site.css`, light and dark), on selectors strong enough to beat a
 * venture's own `nav`, `aside`, `a` and `h2` rules, and repeat the layout
 * resets a venture rule like `nav{position:sticky;display:grid}` would undo.
 * Only these two elements: everything between them stays the venture's.
 *
 * Which palette is the host page's call, as it always was, not the OS's: a
 * `prefers-color-scheme` switch here once bolted a near-black slab onto
 * light-only cream pages for every visitor with a dark OS. The light palette
 * is the default, and `VENTURE_CHROME_JS` sets `data-pfs-theme="dark"` only
 * when it measures the venture's own background as dark (a venture with a
 * dark mode, or a dark-only one), so the bar always matches what it sits on.
 *
 * Contrast, light: muted #4a5666 on #ffffff is 7.6:1, accent #12594a on
 * #f6f8fb is 7.4:1. Dark: muted #a2b0c0 on #171e27 is 7.9:1, accent #7fd8c0
 * on #121821 is 10.6:1.
 *
 * Full width is `VENTURE_CHROME_JS`'s job, because only a measurement can say
 * where a venture's centred, padded or gridded body put the bar.
 */
export const VENTURE_CHROME_CSS = `
nav.pf-chrome.pf-chrome-top[data-pfs-head],aside.pf-chrome.pf-chrome-foot{
  --pfs-ink:#1d2530;--pfs-muted:#4a5666;--pfs-line:#d3dce6;--pfs-accent:#12594a;--pfs-panel:#ffffff;
  --pfs-head-bg:#ffffff;--pfs-foot-bg:#f6f8fb;--pfs-mark:linear-gradient(135deg,#12594a,#3b5bdb);
  font-family:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;
  text-shadow:none;letter-spacing:normal;text-transform:none;text-align:left}
nav.pf-chrome.pf-chrome-top[data-pfs-head][data-pfs-theme="dark"],aside.pf-chrome.pf-chrome-foot[data-pfs-theme="dark"]{
  --pfs-ink:#e8eef5;--pfs-muted:#a2b0c0;--pfs-line:#2a343f;--pfs-accent:#7fd8c0;--pfs-panel:#171e27;
  --pfs-head-bg:#171e27;--pfs-foot-bg:#121821;--pfs-mark:linear-gradient(135deg,#7fd8c0,#8ea2ff)}
nav.pf-chrome.pf-chrome-top[data-pfs-head]{display:block;position:relative;z-index:30;float:none;inset:auto;
  box-sizing:border-box;height:auto;min-height:0;max-width:none;margin:0;padding:0;
  color:var(--pfs-ink);background:var(--pfs-head-bg);border:0;border-bottom:1px solid var(--pfs-line);
  box-shadow:0 1px 0 rgba(15,23,42,.03);border-radius:0;font-size:15px;line-height:1.4;font-weight:400}
nav.pf-chrome.pf-chrome-top[data-pfs-head] a{color:inherit;font:inherit;font-weight:inherit;text-decoration:none;background:none;box-shadow:none;border:0}
nav.pf-chrome.pf-chrome-top[data-pfs-head] .pfs-brand{font-weight:750;color:var(--pfs-ink)}
nav.pf-chrome.pf-chrome-top[data-pfs-head] .pfs-nav a{color:var(--pfs-muted);font-weight:600;border-bottom:2px solid transparent}
nav.pf-chrome.pf-chrome-top[data-pfs-head] .pfs-nav a[aria-current="page"]{color:var(--pfs-ink);border-bottom-color:var(--pfs-accent)}
nav.pf-chrome.pf-chrome-top[data-pfs-head] .pfs-crumbs{color:var(--pfs-muted)}
nav.pf-chrome.pf-chrome-top[data-pfs-head] .pfs-crumbs a{text-decoration:underline;text-underline-offset:2px}
nav.pf-chrome.pf-chrome-top[data-pfs-head] .pfs-searchlink.pfs-always{padding:5px 12px;border:1px solid var(--pfs-line);
  border-radius:999px;font-weight:600;color:var(--pfs-ink)}
nav.pf-chrome.pf-chrome-top[data-pfs-head] .pfs-mark{background:var(--pfs-mark);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
aside.pf-chrome.pf-chrome-foot{display:block;position:static;float:none;max-width:none;box-sizing:border-box;
  color:var(--pfs-ink);background:var(--pfs-foot-bg);border:0;border-top:1px solid var(--pfs-line);border-radius:0;
  box-shadow:none;margin-left:0;margin-right:0;font-size:15px;line-height:1.55}
aside.pf-chrome.pf-chrome-foot h2{font-family:inherit;font-size:1.05rem;font-weight:750;letter-spacing:-.01em;color:var(--pfs-ink);
  display:flex;align-items:center;gap:9px}
aside.pf-chrome.pf-chrome-foot h2::before{content:"";width:18px;height:18px;border-radius:5px;flex:none;background:var(--pfs-mark)}
aside.pf-chrome.pf-chrome-foot p,aside.pf-chrome.pf-chrome-foot li{color:var(--pfs-ink)}
aside.pf-chrome.pf-chrome-foot a{color:var(--pfs-accent);font-weight:550;text-decoration:underline;text-underline-offset:2px}
aside.pf-chrome.pf-chrome-foot>details.pf-embed-offer{max-width:1080px;margin:0 auto;padding:0 16px}
`;

/**
 * Pick the venture chrome's palette from the host's measured background (see
 * above), then stretch the venture header and footer to the window's width.
 *
 * They are inserted as the body's first and last children, so they sit in
 * whatever box the venture gave its body: `max-width:780px;margin:auto`,
 * padding, a centred flex column. CSS alone cannot escape that box reliably
 * (`100vw` counts the scrollbar and adds a sideways scroll on desktop), so
 * this measures where the bar landed and offsets it by exactly that much,
 * using `clientWidth`, which excludes the scrollbar. It then checks the page
 * did not gain a sideways scroll and undoes itself if it did (a venture with
 * `overflow:hidden` on a wrapper, say); the bar is then exactly as it was.
 * It also closes a small gap above the header left by a body's top margin.
 */
export const VENTURE_CHROME_JS = `
(function(){
  if(typeof document==='undefined'||!document.querySelectorAll||!document.documentElement)return;
  var els=[].slice.call(document.querySelectorAll('nav.pf-chrome-top[data-pfs-head],aside.pf-chrome-foot'));
  if(!els.length)return;
  var root=document.documentElement;
  function bg(node){
    for(;node&&node.nodeType===1;node=node.parentElement){
      var m=/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/.exec(getComputedStyle(node).backgroundColor||'');
      if(m&&(m[4]===undefined||+m[4]>0.5))return [+m[1],+m[2],+m[3]];
    }
    return [255,255,255];
  }
  function theme(){
    var c=bg(document.body),l=function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    var dark=0.2126*l(c[0])+0.7152*l(c[1])+0.0722*l(c[2])<0.18;
    els.forEach(function(el){if(dark)el.setAttribute('data-pfs-theme','dark');else el.removeAttribute('data-pfs-theme');});
  }
  try{theme();var mq=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)');if(mq&&mq.addEventListener)mq.addEventListener('change',function(){setTimeout(theme,50);});}catch(e){}
  function reset(el){el.style.marginLeft='';el.style.marginRight='';el.style.width='';el.style.maxWidth='';el.style.marginTop='';el.style.paddingLeft='';el.style.paddingRight='';}
  function fit(){
    var before=root.scrollWidth>root.clientWidth;
    els.forEach(function(el){
      reset(el);
      var vw=root.clientWidth,r=el.getBoundingClientRect();
      if(Math.abs(r.left)<1&&Math.abs(r.width-vw)<1)return;
      el.style.maxWidth='none';el.style.width=vw+'px';el.style.marginLeft=(-r.left)+'px';el.style.marginRight='0';
      // Keep the content where the host put it: a bar that fills the width has no centring margin, so the offset becomes padding.
      el.style.paddingLeft=Math.max(0,r.left)+'px';el.style.paddingRight=Math.max(0,vw-r.right)+'px';
      var r2=el.getBoundingClientRect();
      if(Math.abs(r2.left)>=1)el.style.marginLeft=(parseFloat(el.style.marginLeft)-r2.left)+'px';
      if(el.tagName==='NAV'){
        var top=el.getBoundingClientRect().top+(window.scrollY||0);
        if(top>0&&top<40)el.style.marginTop=(-top)+'px';
      }
      var r3=el.getBoundingClientRect();
      if(Math.abs(r3.left)>=1||(!before&&root.scrollWidth>root.clientWidth))reset(el);
    });
  }
  var t;
  function soon(){clearTimeout(t);t=setTimeout(fit,60);}
  fit();
  addEventListener('load',fit);
  addEventListener('resize',soon);
})();
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
.count-exceptions{margin:8px 0 0;font-size:.85rem;color:var(--soft);max-width:80ch}
.count-exceptions summary{cursor:pointer;width:fit-content;font-weight:650;color:var(--accent);list-style:none;
  display:inline-flex;align-items:center;gap:7px}
.count-exceptions summary::-webkit-details-marker{display:none}
.count-exceptions summary::before{content:"";width:6px;height:6px;border:solid currentColor;border-width:0 2px 2px 0;
  transform:rotate(-45deg);transition:transform .15s ease}
.count-exceptions[open] summary::before{transform:rotate(45deg)}
.count-exceptions p{margin:8px 0 0;padding:10px 14px;border:1px solid var(--line);border-radius:10px;
  background:var(--panel);line-height:1.6}
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
