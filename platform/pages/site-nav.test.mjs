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
  renderSiteHeader,
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
    ['Tools', 'Research', 'Blog', 'Podcast', 'Stories', 'Updates', 'Ask', 'Deploy your own', 'About'],
  );
  // One landmark, labelled, and the section the page is in is marked current.
  assert.equal(html.match(/<nav\b/g).length, 1);
  assert.match(html, /<nav[^>]*aria-label="Site"/);
  assert.match(html, /data-pfs-nav="research" href="\.\.\/\.\.\/research\/" aria-current="page"/);
  assert.equal(html.match(/aria-current="page"/g).length, 1);
  // The brand goes home.
  assert.match(html, /class="pfs-brand" href="\.\.\/\.\.\/" data-pf-to="hub"/);
});

test('the search entry is a form on site pages, a link inside a venture, and absent on the hub', () => {
  assert.match(renderSiteHeader({ toRoot: '../' }), /<form class="pfs-search" action="\.\.\/" method="get" role="search">/);
  const venture = renderSiteHeader({ toRoot: '../', search: 'link' });
  // A venture script that reads its first form or every input must still find its own.
  assert.doesNotMatch(venture, /<form|<input|<ul|<li/);
  assert.match(venture, /href="\.\.\/#search"/);
  const hub = renderSiteHeader({ toRoot: '', current: 'home' });
  assert.doesNotMatch(hub, /pfs-search|pfs-searchlink/);
});

test('a breadcrumb names the page last, unlinked', () => {
  const html = renderSiteHeader({ toRoot: '../../', crumbs: [{ label: 'Tools', href: '../../c/' }, { label: 'A <b> page' }] });
  assert.match(html, /aria-label="Breadcrumb"><a href="\.\.\/\.\.\/" data-pf-to="hub">Home<\/a>/);
  assert.match(html, /<a href="\.\.\/\.\.\/c\/">Tools<\/a>/);
  assert.match(html, /<span aria-current="page">A &lt;b&gt; page<\/span>/);
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
  assert.match(template.project_header, /href="\{\{ROOT\}\}research\/topics\/\{\{TOPIC_ID\}\}\/">\{\{TOPIC\}\}<\/a>/);
  assert.match(template.project_header, /<span aria-current="page">\{\{TITLE\}\}<\/span>/);
  assert.match(template.topic_header, /<span aria-current="page">\{\{TOPIC\}\}<\/span>/);
});

test('the venture header and footer carry the site palette in both themes, on selectors a venture rule cannot beat', () => {
  // Light by default, dark only when the script measured the host page as
  // dark, each with the brand mark's gradient: without it the mark rendered as
  // a black square on every tool page. Never the OS theme (build.test.mjs).
  assert.match(VENTURE_CHROME_CSS, /--pfs-head-bg:#ffffff[\s\S]*--pfs-mark:linear-gradient[\s\S]*\[data-pfs-theme="dark"\][\s\S]*--pfs-head-bg:#171e27/);
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
  assert.match(VENTURE_CHROME_JS, /paddingLeft=Math\.max\(0,r\.left\)/);
  assert.match(VENTURE_CHROME_JS, /paddingRight=''/, 'reset() clears the padding it set');
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
