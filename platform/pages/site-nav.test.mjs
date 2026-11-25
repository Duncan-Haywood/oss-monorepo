// The shared site header: defined once, rendered the same everywhere, and
// never left pointing at a section that did not ship.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SITE_NAME,
  TITLE_BUDGET,
  siteTitle,
  SITE_NAV,
  SITE_HEADER_CSS,
  HEADER_MARKER,
  VENTURE_CHROME_CSS,
  VENTURE_CHROME_JS,
  VENTURE_CHROME_EARLY_JS,
  renderSiteHeader,
  MID_CRUMB_CHARS,
  renderSiteStyle,
  researchChromeTemplate,
  withSiteHeader,
} from './site-nav.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const navHrefs = (html) => [...html.matchAll(/data-pfs-nav="[^"]+" href="([^"]+)"/g)].map((m) => m[1]);

test('the header carries every nav item, in order, relative to the page', () => {
  const html = renderSiteHeader({ toRoot: '../../', current: 'research' });
  assert.deepEqual(navHrefs(html), SITE_NAV.map((i) => `../../${i.href}`));
  assert.deepEqual(
    SITE_NAV.map((i) => i.label),
    ['Products', 'Industries', 'Tools', 'Research', 'Blog', 'Stories', 'Ask', 'Get it built', 'About'],
  );
  // One landmark, labelled, and the section the page is in is marked current.
  assert.equal(html.match(/<nav\b/g).length, 1);
  assert.match(html, /<nav[^>]*aria-label="Site"/);
  assert.match(html, /data-pfs-nav="research" href="\.\.\/\.\.\/research\/" aria-current="page"/);
  assert.equal(html.match(/aria-current="page"/g).length, 1);
  // The brand goes home.
  assert.match(html, /class="pfs-brand" href="\.\.\/\.\.\/" data-pf-to="hub"/);
});

test('the search entry is a form on site pages, a link inside a venture, and a phone-only link on the hub', () => {
  assert.match(renderSiteHeader({ toRoot: '../' }), /<form class="pfs-search" action="\.\.\/" method="get" role="search">/);
  const venture = renderSiteHeader({ toRoot: '../', search: 'link' });
  // A venture script that reads its first form or every input must still find its own.
  assert.doesNotMatch(venture, /<form|<input|<ul|<li/);
  assert.match(venture, /href="\.\.\/#search"/);
  assert.match(venture, /class="pfs-searchlink pfs-always"/);
  // The hub's own search box sits below the fold on a phone, so the header
  // offers the same pill there, and only there (no form, not always shown).
  const hub = renderSiteHeader({ toRoot: '', current: 'home' });
  assert.doesNotMatch(hub, /<form|pfs-always/);
  assert.match(hub, /<a class="pfs-searchlink" href="\.\/#search">Search<\/a>/);
  assert.doesNotMatch(renderSiteHeader({ current: 'home', search: false }), /pfs-searchlink/);
});

test('every page family draws the Search link as the same pill with the glass icon', () => {
  // Site pages showed bare text, tool pages a pill, the hub nothing (2026-11-11).
  assert.match(SITE_HEADER_CSS, /\[data-pfs-head\] \.pfs-searchlink\{[^}]*border-radius:999px/);
  assert.match(SITE_HEADER_CSS, /\[data-pfs-head\] \.pfs-searchlink::before\{[^}]*mask:var\(--pfs-glass\)/);
  // The glass is defined on the header, not on the form the venture header leaves out.
  assert.match(SITE_HEADER_CSS, /\[data-pfs-head\]\{--pfs-glass:url\(/);
  assert.doesNotMatch(SITE_HEADER_CSS, /pfs-searchlink\{display:inline-block\}/);
});

test('the header keeps Search on the brand row instead of a row of its own', () => {
  // From 721px up, Search wrapped under the brand on every page but the hub (2026-11-11).
  // The layout follows the header's own width, since a tool page can put it in a 1,000px column.
  assert.match(SITE_HEADER_CSS, /\[data-pfs-head\] \.pfs-bar\{container:pfs-head\/inline-size\}/);
  const twoRow = /@container pfs-head \(max-width:(\d+)px\)\{([^}]*\}[^}]*\})/.exec(SITE_HEADER_CSS);
  assert.ok(twoRow, 'a container query moves the links to their own row when one row is too narrow');
  assert.match(twoRow[2], /\.pfs-nav\{order:3;flex-basis:100%\}/);
  assert.match(twoRow[2], /\.pfs-brand\{flex:1 1 auto\}/);
  // The form shrinks to fit the row (its basis is small, so it does not force a wrap) and sits right.
  assert.match(SITE_HEADER_CSS, /\.pfs-search\{[^}]*margin:0 0 0 auto;[^}]*flex:1 1 100px;[^}]*max-width:236px/);
  assert.match(SITE_HEADER_CSS, /\[data-pfs-head\] \.pfs-searchlink\{[^}]*margin-left:auto/);
  // Rough width budget for one row: brand, links, gaps and the form at its basis must fit
  // under the breakpoint. At 15px semibold the links measured 7.9px a character (577px for 73).
  // A new nav item that breaks this needs a wider breakpoint or a shorter label.
  const chars = SITE_NAV.reduce((n, item) => n + item.label.length, 0);
  const linkWidth = Math.ceil(chars * 7.9);
  // Between the two-row breakpoint and the full row, a compact row: Search as its glass alone, closer gaps.
  const compact = /@container pfs-head \(min-width:(\d+)px\) and \(max-width:(\d+)px\)\{([^@]*)\}/.exec(SITE_HEADER_CSS);
  assert.ok(compact, 'a compact one-row band sits above the two-row breakpoint');
  assert.equal(Number(compact[1]), Number(twoRow[1]) + 1, 'the band starts where two rows stop');
  const full = 153 + linkWidth + 16 * (SITE_NAV.length - 1) + 22 * 2 + 100;
  assert.ok(full <= Number(compact[2]) + 1, `full one-row header needs about ${full}px, band ends at ${compact[2]}px`);
  const gap = (re) => Number(re.exec(compact[3])[1]);
  const pill = gap(/\.pfs-searchlink\{[^}]*width:(\d+)px/);
  const tight = 153 + linkWidth + gap(/\.pfs-nav\{column-gap:(\d+)px/) * (SITE_NAV.length - 1) + gap(/\.pfs-bar\{column-gap:(\d+)px/) * 2 + pill;
  assert.ok(tight <= Number(compact[1]), `compact row needs about ${tight}px, band starts at ${compact[1]}px`);
  // The word stays the link's accessible name; only its glyphs go.
  assert.match(compact[3], /\.pfs-searchlink\{[^}]*font-size:0/);
  assert.match(compact[3], /\.pfs-search\{display:none\}/);
  // A tool page's chrome resets its links' font and the pill's padding with stronger selectors, which hid the
  // compact rule there on the first try (the word showed beside the glass); it repeats both inside the same band.
  const band = `@container pfs-head (min-width:${compact[1]}px) and (max-width:${compact[2]}px){`;
  const venture = VENTURE_CHROME_CSS.slice(VENTURE_CHROME_CSS.indexOf(band));
  assert.ok(VENTURE_CHROME_CSS.includes(band), 'the venture chrome repeats the band');
  assert.match(venture, /nav\.pf-chrome\.pf-chrome-top\[data-pfs-head\] \.pfs-searchlink\{padding:\d+px 0;font-size:0\}/);
});

test('a breadcrumb names the page last, unlinked', () => {
  const html = renderSiteHeader({ toRoot: '../../', crumbs: [{ label: 'Tools', href: '../../c/' }, { label: 'A <b> page' }] });
  assert.match(html, /aria-label="Breadcrumb"><a href="\.\.\/\.\.\/" data-pf-to="hub">Home<\/a>/);
  assert.match(html, /<a href="\.\.\/\.\.\/c\/">Tools<\/a>/);
  assert.match(html, /<span aria-current="page">A &lt;b&gt; page<\/span>/);
});

test('a long middle crumb is marked to give way on a phone, a short one is not', () => {
  // A 4.5em floor on "Tools" would stretch it; a category gives way so the tool's name fits (2026-11-15).
  const long = 'x'.repeat(MID_CRUMB_CHARS + 1);
  const html = renderSiteHeader({
    crumbs: [{ label: 'Tools', href: 't/' }, { label: long, href: 'c/' }, { label: 'x'.repeat(MID_CRUMB_CHARS), href: 'd/' }, { label: 'Page' }],
  });
  assert.match(html, /<a href="t\/">Tools<\/a>/);
  assert.match(html, new RegExp(`<a href="c/" class="pfs-mid">${long}</a>`));
  assert.match(html, /<a href="d\/">x+<\/a>/, 'exactly the limit stays unmarked');
  assert.doesNotMatch(html, /class="pfs-mid"[^>]*>Page/, 'the page itself is never marked');
  const phone = SITE_HEADER_CSS.slice(SITE_HEADER_CSS.indexOf('@media (max-width:600px)'));
  assert.match(phone, /\.pfs-crumbs>\.pfs-mid\{flex:0 100000 auto;min-width:4\.5em/);
  assert.match(phone, /\.pfs-crumbs>\[aria-current\]\{flex:0 1 auto;min-width:0/);
});

test('a last crumb that repeats the h1 is hidden on a phone, separator and all', () => {
  const html = renderSiteHeader({ crumbs: [{ label: 'Topic', href: 't/' }, { label: 'A <b> title', echo: true }] });
  assert.match(html, /<a href="t\/">Topic<\/a><span class="pfs-sep pfs-echo" aria-hidden="true">›<\/span><span aria-current="page" class="pfs-echo">A &lt;b&gt; title<\/span><\/span>/);
  assert.doesNotMatch(renderSiteHeader({ crumbs: [{ label: 'Page' }] }), /pfs-echo/, 'unmarked by default');
  const phone = SITE_HEADER_CSS.slice(SITE_HEADER_CSS.indexOf('@media (max-width:600px)'));
  assert.match(phone, /\.pfs-crumbs>\.pfs-echo\{display:none\}/);
  assert.doesNotMatch(SITE_HEADER_CSS.slice(0, SITE_HEADER_CSS.indexOf('@media (max-width:600px)')), /pfs-echo/, 'desktop keeps the full trail');
});

test('a trail that only repeats the current tab is hidden on a phone, any other trail stays', () => {
  const dup = (o) => /class="pfs-crumbs pfs-dup"/.test(renderSiteHeader(o));
  // An audience page: "Tools" is the tab the row already underlines, and the h1 names the category.
  assert.ok(dup({ toRoot: '../../', current: 'tools', crumbs: [{ label: 'Tools', href: '../../c/' }, { label: 'For homeowners' }] }));
  assert.ok(dup({ toRoot: '../', current: 'about', crumbs: [{ label: 'About' }] }), 'Home › About');
  assert.match(researchChromeTemplate().topic_header, /class="pfs-crumbs pfs-dup"/, 'a research topic: Research › <topic>');
  // A link to anywhere else is orientation the tab row does not give: a tool's category, a project's topic.
  assert.ok(!dup({ toRoot: '../', current: 'tools', crumbs: [{ label: 'For homeowners', href: '../c/for-homeowners/' }, { label: 'Rent vs buy' }] }));
  assert.match(researchChromeTemplate().project_header, /class="pfs-crumbs"/);
  assert.ok(!dup({ toRoot: '../../', crumbs: [{ label: 'Tools', href: '../../c/' }, { label: 'Page' }] }), 'no current tab, so the link counts');
  assert.ok(!dup({ toRoot: '../', current: 'tools', crumbs: [{ label: 'Tools', href: '../t/' }, { label: 'Page' }] }), 'a different href is not the tab');
  const phone = SITE_HEADER_CSS.slice(SITE_HEADER_CSS.indexOf('@media (max-width:600px)'));
  assert.match(phone, /\.pfs-crumbs\.pfs-dup\{display:none\}/);
  assert.doesNotMatch(SITE_HEADER_CSS.slice(0, SITE_HEADER_CSS.indexOf('@media (max-width:600px)')), /pfs-dup/, 'desktop keeps the full trail');
});

test('a venture header opens with the exact tag rates.mjs and jobs.mjs look for', () => {
  const html = renderSiteHeader({ toRoot: '../', extraClass: 'pf-chrome pf-chrome-top' });
  assert.ok(html.startsWith('<nav class="pf-chrome pf-chrome-top" aria-label="Site"'));
  assert.equal(html.match(/<\/nav>/g).length, 1, 'one closing tag, so a lazy match ends at the header');
});

test('the shared header rules carry no colour, opacity or OS theme of their own', () => {
  // They also ship in pf-chrome.css, where the host venture decides the palette.
  assert.doesNotMatch(SITE_HEADER_CSS, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(SITE_HEADER_CSS, /opacity\s*:/);
  assert.doesNotMatch(SITE_HEADER_CSS, /prefers-color-scheme/);
  // pf-site.css adds the palette, for both themes.
  const site = renderSiteStyle();
  assert.match(site, /--pfs-ink:#[0-9a-f]{6}[\s\S]*prefers-color-scheme:dark[\s\S]*--pfs-ink:#[0-9a-f]{6}/);
  assert.ok(site.includes(SITE_HEADER_CSS));
});

test('withSiteHeader adds the stylesheet and header once', () => {
  const page = '<html><head><title>x</title></head><body class="b"><h1>x</h1></body></html>';
  const once = withSiteHeader(page, { toRoot: '../', current: 'deploy' });
  assert.equal(withSiteHeader(once, { toRoot: '../' }), once);
  assert.match(once, /<link rel="stylesheet" href="\.\.\/pf-site\.css">\n<\/head>/);
  assert.match(once, /<body class="b">\n<nav class="pfs-head"/);
  assert.equal(withSiteHeader('<p>no body</p>'), '<p>no body</p>');
});

test('the nav is defined once: no other renderer writes its own copy', () => {
  // Every renderer calls renderSiteHeader / withSiteHeader, or reads the
  // template build.mjs hands the research builder. A second hand-written nav
  // would drift the day an item is added.
  const sources = [
    'platform/pages/build.mjs',
    'platform/pages/engineering.mjs',
    'platform/devstats/render.mjs',
    'platform/devlog/render.mjs',
    'platform/deploy/build.mjs',
    'platform/pages/writing.mjs',
    'platform/deploy/index.html',
    'research/_homepage/build.py',
    'research/_homepage/template.html',
    'research/_homepage/project.html',
  ];
  for (const rel of sources) {
    const text = readFileSync(path.join(REPO, rel), 'utf8');
    assert.doesNotMatch(text, /data-pfs-nav=|class="pfs-head/, `${rel} writes the header markup itself`);
  }
  for (const rel of sources.slice(0, 6)) {
    const text = readFileSync(path.join(REPO, rel), 'utf8');
    assert.match(text, /renderSiteHeader|withSiteHeader/, `${rel} does not use the shared header`);
  }
});

test('the research builder gets the same markup, and splices it in', async () => {
  const template = researchChromeTemplate();
  assert.equal(template.header, renderSiteHeader({ toRoot: '{{ROOT}}', current: 'research' }));
  // build.py replaces {{ROOT}} and nothing else, so no other placeholder may appear.
  assert.deepEqual([...new Set(template.header.match(/\{\{\w+\}\}/g))], ['{{ROOT}}']);
  const builder = readFileSync(path.join(REPO, 'research', '_homepage', 'build.py'), 'utf8');
  assert.match(builder, /--site-chrome/);
  assert.match(builder, /chrome\[header_key\]\.replace\("\{\{ROOT\}\}", root\)/);
});

test('research topic and project pages get the breadcrumb variants of the same header', () => {
  const template = researchChromeTemplate();
  assert.deepEqual(
    [...new Set(template.topic_header.match(/\{\{\w+\}\}/g))].sort(),
    ['{{ROOT}}', '{{TOPIC}}'],
  );
  assert.deepEqual(
    [...new Set(template.project_header.match(/\{\{\w+\}\}/g))].sort(),
    ['{{ROOT}}', '{{TITLE}}', '{{TOPIC_ID}}', '{{TOPIC}}'],
  );
  // Home › Research › topic › project, the topic linking its own page.
  assert.match(template.project_header, /class="pfs-crumbs"/);
  assert.match(template.project_header, /href="\{\{ROOT\}\}research\/">Research<\/a>/);
  // Marked to give way on a phone though the placeholder is short: the topic names are not.
  assert.match(template.project_header, /href="\{\{ROOT\}\}research\/topics\/\{\{TOPIC_ID\}\}\/" class="pfs-mid">\{\{TOPIC\}\}<\/a>/);
  // The project page's h1 is the title, so a phone hides the repeat (2026-11-15); the topic is not marked.
  assert.match(template.project_header, /<span class="pfs-sep pfs-echo" aria-hidden="true">›<\/span><span aria-current="page" class="pfs-echo">\{\{TITLE\}\}<\/span>/);
  assert.doesNotMatch(template.topic_header, /pfs-echo/);
  assert.match(template.topic_header, /<span aria-current="page">\{\{TOPIC\}\}<\/span>/);
});

test('the venture header and footer carry the site palette in both themes, on selectors a venture rule cannot beat', () => {
  // Light by default, dark only when the script measured the host page as
  // dark, each with the brand mark's gradient: without it the mark rendered as
  // a black square on every tool page. Never the OS theme (build.test.mjs).
  assert.match(VENTURE_CHROME_CSS, /--pfs-head-bg:#ffffff[\s\S]*--pfs-mark:url\("data:image\/svg\+xml,[\s\S]*\[data-pfs-theme="dark"\][\s\S]*--pfs-head-bg:#171e27/);
  assert.doesNotMatch(VENTURE_CHROME_CSS, /prefers-color-scheme/);
  // Three classes plus an attribute out-rank `nav a`, `.nav a` and `header nav`.
  assert.match(VENTURE_CHROME_CSS, /nav\.pf-chrome\.pf-chrome-top\[data-pfs-head\] a\{/);
  assert.match(VENTURE_CHROME_CSS, /aside\.pf-chrome\.pf-chrome-foot a\{/);
  // Contrast is measured, so no de-emphasis by opacity.
  assert.doesNotMatch(VENTURE_CHROME_CSS, /opacity\s*:/);
});

test('the full-width pass measures with clientWidth and undoes itself if the page would scroll sideways', () => {
  assert.match(VENTURE_CHROME_JS, /clientWidth/);
  assert.doesNotMatch(VENTURE_CHROME_JS, /100vw/, '100vw counts the scrollbar and adds a sideways scroll');
  assert.match(VENTURE_CHROME_JS, /scrollWidth>root\.clientWidth\)\)reset\(el\)/);
  // It is parseable as the classic script it ships in, and a no-op where
  // there is no DOM to measure (the counter tests run pf-site.js on a stub).
  assert.doesNotThrow(() => new Function(VENTURE_CHROME_JS));
  assert.doesNotThrow(() => new Function('document', VENTURE_CHROME_JS)({}));
});

test('the inline first fit is the same fit, for the header alone', () => {
  // One copy of the measurement, shared, so the end-of-body re-run finds
  // nothing to change on a page whose box did not move.
  const fitBody = /function fit\(\)\{[\s\S]*?\n  \}/.exec(VENTURE_CHROME_JS)[0];
  assert.ok(VENTURE_CHROME_EARLY_JS.includes(fitBody));
  assert.match(VENTURE_CHROME_EARLY_JS, /querySelector\('nav\.pf-chrome\.pf-chrome-top'\)/);
  assert.doesNotMatch(VENTURE_CHROME_EARLY_JS, /pf-chrome-foot|addEventListener/, 'the footer and the listeners stay in pf-site.js');
  assert.doesNotThrow(() => new Function(VENTURE_CHROME_EARLY_JS));
  assert.doesNotThrow(() => new Function('document', VENTURE_CHROME_EARLY_JS)({}));
});

test('the chrome goes dark only on a page whose own background is dark', () => {
  // The theme check, run against stub elements: a cream page keeps the light
  // bar, a near-black one gets the dark palette.
  const run = (background) => {
    const attrs = {};
    const el = { tagName: 'NAV', style: {}, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; },
      getBoundingClientRect: () => ({ left: 0, width: 800, top: 0 }) };
    const body = { nodeType: 1, parentElement: null };
    const doc = { querySelectorAll: () => [el], documentElement: { clientWidth: 800, scrollWidth: 800 }, body };
    new Function('document', 'getComputedStyle', 'window', 'addEventListener', 'matchMedia', 'setTimeout', 'clearTimeout', VENTURE_CHROME_JS)(
      doc, () => ({ backgroundColor: background }), { scrollY: 0 }, () => {}, null, () => {}, () => {});
    return attrs['data-pfs-theme'];
  };
  assert.equal(run('rgb(250, 246, 238)'), undefined);
  assert.equal(run('rgb(18, 16, 14)'), 'dark');
  assert.equal(run('rgba(0, 0, 0, 0)'), undefined, 'a transparent page reads as the browser default white');
});

test('a widened venture header keeps its content offset as padding (phone: no sideways scroll, so no undo)', () => {
  assert.match(VENTURE_CHROME_JS, /pl=Math\.max\(0,r\.left\)/);
  assert.match(VENTURE_CHROME_JS, /paddingRight=''/, 'reset() clears the padding it set');
});

test('a venture header that already fills a phone gets a 16px gutter, not the brand at x = 0', () => {
  // polish-2026-11-15-header-gutter.md: 49 tools put their side padding on main, not body, so the
  // band filled the window, fit() returned early, and the brand and trail started at the left edge.
  const run = (left, width, vw, tagName = 'NAV') => {
    const style = {};
    const el = { tagName, style, setAttribute() {}, removeAttribute() {},
      getBoundingClientRect: () => { const l = left + (parseFloat(style.marginLeft) || 0), w = parseFloat(style.width) || width;
        return { left: l, width: w, right: l + w, top: 0 }; } };
    const doc = { querySelectorAll: () => [el], documentElement: { clientWidth: vw, scrollWidth: vw }, body: { nodeType: 1, parentElement: null } };
    new Function('document', 'getComputedStyle', 'window', 'addEventListener', 'matchMedia', 'setTimeout', 'clearTimeout', VENTURE_CHROME_JS)(
      doc, () => ({ backgroundColor: 'rgb(255, 255, 255)' }), { scrollY: 0 }, () => {}, null, () => {}, () => {});
    return style;
  };
  const flush = run(0, 390, 390);
  assert.equal(flush.paddingLeft, '16px');
  assert.equal(flush.paddingRight, '16px');
  assert.ok(!flush.width, 'a bar that already fills the window is not resized');
  assert.equal(run(0, 390, 390, 'ASIDE').paddingLeft || '', '', 'the footer keeps its own padding');
  const inset = run(24, 342, 390);
  assert.equal(inset.paddingLeft, '24px', "a host's own inset is kept");
  assert.equal(inset.width, '390px');
});

test('siteTitle adds the site name only when the whole title still fits a results page', () => {
  assert.equal(siteTitle('Short tool'), `Short tool | ${SITE_NAME}`);
  const long = 'Excel alternatives: 12 free tools with a side-by-side page';
  assert.equal(siteTitle(long), long, 'the suffix would push it past the budget');
  for (const n of [1, 20, 40, 60, 90]) assert.ok(siteTitle('x'.repeat(n)).length <= Math.max(TITLE_BUDGET, n));
});

test('on a phone the breadcrumb stays on one line and cuts the current title', async () => {
  const { SITE_HEADER_CSS } = await import('./site-nav.mjs');
  const m = /@media \(max-width:600px\)\{[^}]*\.pfs-crumbs\{[^}]*white-space:nowrap[\s\S]*?text-overflow:ellipsis/.exec(SITE_HEADER_CSS);
  assert.ok(m, 'phone rule keeps .pfs-crumbs nowrap and ellipsises [aria-current]');
});

test('the chrome CSS gives no length a bare number (the browser would drop the rule)', async () => {
  // Red team 2026-11-11: `margin:0 auto` -> `margin:1 auto` and `margin:0` -> `margin:1` passed every
  // test here; both are invalid CSS a browser silently ignores. css-lint.mjs has the full check.
  const { unitlessLengths } = await import('./css-lint.mjs');
  assert.deepEqual(unitlessLengths(SITE_HEADER_CSS), []);
  assert.deepEqual(unitlessLengths(VENTURE_CHROME_CSS), []);
});

test('every link in the dark footer band takes the band link colour, at AA on the band', () => {
  // Research project pages colour links with --accent-ink, which the band does
  // not redefine: their repo credit link sat at 2.24:1 on 1,111 pages until
  // the band coloured every link itself (2026-11-14).
  const css = renderSiteStyle();
  const rule = css.match(/footer:has\(\.pfs-foot\) a\{color:var\(--pfs-accent\)\}/);
  assert.ok(rule, 'footer:has(.pfs-foot) a{color:var(--pfs-accent)} is missing from the site style');
  const band = css.match(/footer:has\(\.pfs-foot\)\{[^}]*--pfs-accent:(#[0-9a-f]{6})[^}]*?(#[0-9a-f]{6});\s*box-shadow/i);
  assert.ok(band, 'band link colour and fill not found');
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(band[1]), lum(band[2])].sort((a, b) => b - a);
  assert.ok((hi + 0.05) / (lo + 0.05) >= 4.5, `band link ${band[1]} on ${band[2]} is under 4.5:1`);
});

test('the section links stay on one scrolling row between phone and desktop widths', () => {
  // At 721 to ~780px the links wrapped and "About" sat alone on a third row: every page at
  // 721 to 752px, 1,103 of 1,406 tool pages at 768px (polish-2026-11-22-tablet-nav-row.md).
  const band = SITE_HEADER_CSS.match(/@supports \(animation-timeline:scroll\(\)\)\{\s*@container pfs-head \(max-width:959px\)\{([\s\S]*?)\n  \}\n\}/);
  assert.ok(band, 'the two-row band has its own scrolling-row rule');
  assert.match(band[1], /\.pfs-nav\{[^}]*flex-wrap:nowrap;overflow-x:auto/);
  // The tail fade starts at 0, so a row that fits (an inactive scroll timeline) is not faded.
  assert.match(band[1], /--pfs-fade:0px/);
  assert.match(SITE_HEADER_CSS, /@keyframes pfs-fade-tail\{from\{--pfs-fade:28px\}to\{--pfs-fade:0px\}\}/);
  // The page's own tab starts in view rather than off the right edge.
  assert.match(band[1], /a\[aria-current="page"\]\{scroll-initial-target:nearest;scroll-snap-align:center\}/);
  // The head fade is 0 until scrolled, in every browser.
  assert.match(SITE_HEADER_CSS, /@property --pfs-fade-l\{syntax:'<length>';inherits:false;initial-value:0px\}/);
});
