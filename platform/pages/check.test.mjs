// Tests the artifact check, over synthetic sites built in a temp directory.
//
// Each test constructs the smallest site that exhibits one defect, so a
// failure here names the defect rather than a line number. The point of the
// suite is that the check is not vacuous: it has to go red on artifacts that
// really did ship, not just green on a good one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { checkSite, checkServedExtensions } from './check.mjs';

const BASE_PATH = '/repo/';
const url = (relative) => `https://example.test${BASE_PATH}${relative}`;

const urlset = (...relatives) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset>${relatives
    .map((r) => `<url><loc>${url(r)}</loc></url>`)
    .join('')}</urlset>`;

const sitemapIndex = (...relatives) =>
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex>${relatives
    .map((r) => `<sitemap><loc>${url(r)}</loc></sitemap>`)
    .join('')}</sitemapindex>`;

/**
 * A minimal artifact that passes every check, plus whatever `files` overlays.
 * A test names only the files its defect involves.
 */
async function siteWith(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pages-check-'));

  // The hub and every product page carry the disclaimer marker, because a
  // real artifact does: the check treats a page without one as unpublishable.
  const defaults = {
    // The hub links About from its footer rather than as a tool card, which is
    // how the real hub does it — `data-tool` is for products.
    'index.html':
      '<a href="tool/" data-tool="tool">Tool</a><nav><a href="ask/">Ask</a></nav><footer><a href="about/">About</a> '
      + '<a href="guides/">Guides</a> '
      + '<a href="compare/">Comparisons</a> No warranty.</footer>',
    'about/index.html': '<p>About</p><footer>No warranty.</footer>',
    // The assistant's page and the files every page lazy-loads it from: the
    // header links Ask on every page, so a build without them ships a dead link.
    'ask/index.html': '<p>Ask</p><footer>No warranty.</footer>',
    'pf-assistant.js': '',
    'pf-fill.js': '',
    'pf-search.js': '',
    'pf-ai-worker.js': '',
    'pf-byok.js': '',
    // The comparison index, on the same footing as About: a hub-level page the
    // build writes, linked from the hub's footer rather than as a tool card. It
    // must list at least one `vs-` page or the check calls it an empty index.
    'compare/index.html':
      '<a href="../tool/vs-widget.html">Tool</a><footer>No warranty.</footer>',
    // The guides index, on the same footing again: it must list at least one
    // page beside a tool or the check calls it an empty index.
    'guides/index.html':
      '<a href="../tool/">Tool</a><a href="../tool/how-much.html">How much?</a>'
      + '<footer>No warranty.</footer>',
    'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${url('sitemap.xml')}\n`,
    '404.html': '<p>gone</p>',
    '.nojekyll': '',
    'favicon.ico': '',
    'sitemap.xml': sitemapIndex('sitemap-hub.xml', 'tool/sitemap.xml'),
    // About is a hub-level page, so the hub sitemap is the only one that can
    // carry it — the real `renderHubSitemap` lists it here for the same reason.
    'sitemap-hub.xml': urlset('', 'about/', 'ask/', 'compare/', 'guides/'),
    'llms.txt': `# Tools\n\n> One tool.\n`,
    'llms-full.txt': `# Tools\n\n> One tool.\n\n## Section\n\n- [Tool](${url('tool/')}): does a thing.\n`,
    // The feed and the catalogue are a pair: the feed is the "what's new"
    // door, and the catalogue is where the check reads every tool's launch
    // date back out of the artifact.
    'feed.xml':
      '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">'
      + '<entry><id>tag:marisstella.dev,2026:tool/tool</id></entry></feed>',
    'catalog.json': JSON.stringify({ tools: [{ slug: 'tool', launched: '2026-08-01' }] }),
    'tool/index.html': '<p>Tool</p><footer>No warranty.</footer>',
    // The page `compare/index.html` above links. Without it the artifact ships
    // an index pointing at a 404, which is the defect that check exists to see.
    'tool/vs-widget.html': '<p>Tool vs. Widget</p><footer>No warranty.</footer>',
    // The page `guides/index.html` above links, on the same terms.
    'tool/how-much.html': '<p>How much?</p><footer>No warranty.</footer>',
    'tool/sitemap.xml': urlset('tool/', 'tool/vs-widget.html', 'tool/how-much.html'),
  };

  for (const [relative, contents] of Object.entries({ ...defaults, ...files })) {
    if (contents === null) continue;
    const target = path.join(dir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }

  return dir;
}

const problemsFor = async (files) => checkSite(await siteWith(files));
const mentioning = (problems, needle) => problems.filter((p) => p.includes(needle));

test('a well-formed artifact passes', async () => {
  assert.deepEqual(await problemsFor(), []);
});

test('a missing root file is caught', async () => {
  const problems = await problemsFor({ '.nojekyll': null, 'robots.txt': null });
  // Without .nojekyll, Pages silently drops any `_`-prefixed directory.
  assert.equal(mentioning(problems, 'missing required file: .nojekyll').length, 1);
});

test('a page in no sitemap is caught', async () => {
  const problems = await problemsFor({ 'tool/compare.html': '<p>compare</p>' });
  assert.equal(mentioning(problems, 'tool/compare.html: served but absent').length, 1);
});

test('a sitemap URL that did not ship is caught', async () => {
  // The real defect: a venture sitemap written against `/ventures/<slug>/`,
  // a path this site does not serve, so every URL in it 404s.
  const problems = await problemsFor({ 'tool/sitemap.xml': urlset('tool/', 'ventures/tool/') });
  assert.equal(mentioning(problems, 'did not ship -> /ventures/tool/').length, 1);
});

test('a relative <loc> is caught', async () => {
  // `<loc>` must be a full absolute URL; crawlers reject a relative one, so a
  // sitemap full of them covers nothing at all.
  const problems = await problemsFor({
    'tool/sitemap.xml': '<urlset><url><loc>index.html</loc></url></urlset>',
  });
  assert.equal(mentioning(problems, '<loc> is not a URL').length, 1);
});

test('a leftover placeholder origin is caught', async () => {
  const problems = await problemsFor({
    'tool/index.html': '<link rel="canonical" href="https://example.invalid/tool/">',
  });
  assert.equal(mentioning(problems, 'still contains https://example.invalid').length, 1);
});

test('a dead relative link is caught', async () => {
  const problems = await problemsFor({ 'tool/index.html': '<a href="missing.html">gone</a>' });
  assert.equal(mentioning(problems, 'dead link -> missing.html').length, 1);
});

test('any page may link the self-deploy page, which is built after this check', async () => {
  const hub = await problemsFor({ 'index.html': '<a href="deploy/">Deploy your own copy</a>' });
  assert.deepEqual(mentioning(hub, 'dead link -> deploy/'), []);
  const tool = await problemsFor({ 'tool/index.html': '<a href="../deploy/?app=tool">Run your own copy</a>' });
  assert.deepEqual(mentioning(tool, 'dead link -> ../deploy/'), []);
  const other = await problemsFor({ 'tool/index.html': '<a href="../deploy2/">x</a>' });
  assert.equal(mentioning(other, 'dead link -> ../deploy2/').length, 1);
});

test('an extensionless bundler import resolves to its .js file', async () => {
  const problems = await problemsFor({
    'tool/index.html': '<p>x</p>',
    'tool/mobile/index.js': "import App from './App';\nimport x from './nope';",
    'tool/mobile/App.js': 'export default 1;',
  });
  assert.deepEqual(mentioning(problems, 'dead link -> ./App'), []);
  assert.equal(mentioning(problems, 'dead link -> ./nope').length, 1);
});

test('a JS template-literal href in a standalone .mjs is not a dead link', async () => {
  // The epk-generator false positive: `generator.mjs` builds an href from
  // user-supplied data at runtime with a template literal --
  // `` `<a href="${escapeHtml(url)}">` `` -- and has no `<script>` wrapper
  // for SCRIPT_OR_STYLE_RE to strip, unlike the tender-radar case this
  // guards elsewhere. The literal `${escapeHtml(url)}` text is not a path.
  const problems = await problemsFor({
    'tool/index.html': '<script type="module" src="generator.mjs"></script>',
    'tool/generator.mjs': 'const html = `<a href="${escapeHtml(url)}">go</a>`;',
  });
  assert.deepEqual(mentioning(problems, 'dead link'), []);
});

test('a page no path from the hub reaches is caught', async () => {
  // The case the orphan check cannot see. Both pages below have an inbound
  // link, so `inboundLinks` is satisfied -- but they link only to each other,
  // and nothing on the site leads in. On this origin the sitemap is never read
  // (project-Pages subpath), so a page off the hub's link graph is discoverable
  // by nobody.
  const problems = await problemsFor({
    'tool/island-a.html': '<a href="island-b.html">B</a><footer>No warranty.</footer>',
    'tool/island-b.html': '<a href="island-a.html">A</a><footer>No warranty.</footer>',
    'tool/sitemap.xml': urlset('tool/', 'tool/vs-widget.html', 'tool/how-much.html',
      'tool/island-a.html', 'tool/island-b.html'),
  });
  assert.equal(mentioning(problems, 'island-a.html: no path of links').length, 1);
  assert.equal(mentioning(problems, 'island-b.html: no path of links').length, 1);
  // The orphan check stays quiet on exactly these two, which is the point:
  // without the walk they ship looking correct.
  assert.deepEqual(mentioning(problems, 'no page on the site links to it'), []);
});

test('a page reached only through another page is not reported unreachable', async () => {
  // Reachability is transitive: depth 2 is a route, not an orphan. Guards the
  // walk against collapsing to "linked from the hub directly".
  const problems = await problemsFor({
    'tool/how-much.html': '<a href="deeper.html">Deeper</a><footer>No warranty.</footer>',
    'tool/deeper.html': '<p>Deeper</p><footer>No warranty.</footer>',
    'tool/sitemap.xml': urlset('tool/', 'tool/vs-widget.html', 'tool/how-much.html', 'tool/deeper.html'),
  });
  assert.deepEqual(mentioning(problems, 'no path of links'), []);
});

test('an unreachable page that declared noindex is allowed', async () => {
  // The offline shell is the real instance: a fallback with no route to it is
  // correct, and indexing it would put a non-computing page in search results.
  const problems = await problemsFor({
    'offline.html': '<meta name="robots" content="noindex"><p>Offline</p><footer>No warranty.</footer>',
  });
  assert.deepEqual(mentioning(problems, 'no path of links'), []);
});

test('a module import does not count as a route to a page', async () => {
  // A crawler navigates markup; an `import` is a module fetch, not a document
  // anyone lands on. Counting it as a hop would report an undiscoverable page
  // as reachable -- the exact false negative this walk exists to avoid.
  const problems = await problemsFor({
    'tool/index.html':
      '<script type="module">import "./widget.mjs";</script><footer>No warranty.</footer>',
    'tool/widget.mjs': 'export const x = 1;',
    'tool/stranded.html': '<p>Stranded</p><footer>No warranty.</footer>',
    'tool/sitemap.xml': urlset('tool/', 'tool/vs-widget.html', 'tool/how-much.html', 'tool/stranded.html'),
  });
  assert.equal(mentioning(problems, 'stranded.html: no path of links').length, 1);
});

test('a link that climbs out of the site root is caught', async () => {
  const problems = await problemsFor({ 'tool/index.html': '<a href="../../etc/passwd">x</a>' });
  assert.equal(mentioning(problems, 'escapes the site root').length, 1);
});

test('an external link is not resolved on disk', async () => {
  const problems = await problemsFor({
    'tool/index.html':
      '<a href="https://github.com/sponsors/Duncan-Haywood">Sponsor</a><footer>No warranty.</footer>',
  });
  assert.deepEqual(problems, []);
});

test('a venture subpage nothing links to is caught', async () => {
  // The exact shape of #2664: a comparison/SEO page that ships, resolves
  // every link, and is listed in its own sitemap — with no `href` anywhere on
  // the site pointing at it. Every other check here is satisfied by that
  // shape, which is what let it ship unlinked in the first place.
  const problems = await problemsFor({
    'tool/compare.html': '<p>compare</p>',
    'tool/sitemap.xml': urlset('tool/', 'tool/compare.html'),
  });
  assert.equal(
    mentioning(problems, 'tool/compare.html: no page on the site links to it').length,
    1,
  );
});

test('a venture subpage linked from its own index page is not an orphan', async () => {
  const problems = await problemsFor({
    'tool/index.html': '<a href="./compare.html">Compare</a><footer>No warranty.</footer>',
    'tool/compare.html': '<p>compare</p>',
    'tool/sitemap.xml': urlset('tool/', 'tool/compare.html'),
  });
  assert.deepEqual(mentioning(problems, 'no page on the site links to it'), []);
});

test('a link from a different product also clears the orphan check', async () => {
  // The inbound link does not have to come from the page's own venture — a
  // comparison page linked from a sibling tool's "see also" list is just as
  // reachable as one linked from its own index.
  const problems = await problemsFor({
    'index.html':
      '<a href="tool/" data-tool="tool">Tool</a><a href="other/" data-tool="other">Other</a>'
      + '<footer><a href="about/">About</a> No warranty.</footer>',
    'other/index.html': '<a href="../tool/compare.html">See the comparison</a><footer>No warranty.</footer>',
    'other/sitemap.xml': urlset('other/'),
    'tool/compare.html': '<p>compare</p>',
    'tool/sitemap.xml': urlset('tool/', 'tool/compare.html'),
    'sitemap.xml': sitemapIndex('sitemap-hub.xml', 'tool/sitemap.xml', 'other/sitemap.xml'),
    'llms-full.txt': `# Tools\n\n> Two tools.\n\n## Section\n\n- [Tool](${url('tool/')}): does a thing.\n- [Other](${url('other/')}): does another thing.\n`,
    'catalog.json': JSON.stringify({
      tools: [
        { slug: 'tool', launched: '2026-08-01' },
        { slug: 'other', launched: '2026-08-01' },
      ],
    }),
  });
  assert.deepEqual(mentioning(problems, 'no page on the site links to it'), []);
});

test('a product directory with no landing page is caught', async () => {
  const problems = await problemsFor({ 'orphan/deep.html': '<p>no index</p>' });
  assert.equal(mentioning(problems, 'orphan/ has no index.html').length, 1);
});

test('a sitemap named by the index but never written is caught', async () => {
  const problems = await problemsFor({ 'tool/sitemap.xml': null });
  assert.equal(mentioning(problems, 'names a sitemap that did not ship').length, 1);
});

test('the index is followed into every sitemap it names', async () => {
  // A check that read only the root sitemap would pass here: the defect is one
  // level down, which is exactly where the real ones were.
  const problems = await problemsFor({ 'tool/sitemap.xml': urlset('tool/', 'tool/ghost.html') });
  assert.equal(mentioning(problems, 'did not ship -> /tool/ghost.html').length, 1);
});

// ---------------------------------------------------------------------------
// Reachability, disclaimers, leaked payload, discovery floor
//
// Added when two concurrent checkers were merged (#1744). These are the defects
// the sitemap-and-links half above cannot see: a page can ship, resolve every
// link, and appear in a sitemap while still being unreachable, undisclaimed, or
// accompanied by files no visitor should get.
// ---------------------------------------------------------------------------

test('a product llms.txt does not list is caught', async () => {
  // The AI-discovery counterpart of the hub-link check below: the tool ships,
  // every page resolves, and an assistant recommending one never sees it.
  const problems = await problemsFor({
    'llms-full.txt': '# Tools\n\n> None.\n',
  });
  assert.equal(mentioning(problems, 'tool/: shipped but llms-full.txt does not list it').length, 1);
});

test('an llms.txt entry with no product behind it is caught', async () => {
  const problems = await problemsFor({
    'llms-full.txt': `# Tools\n\n> One tool.\n\n- [Tool](${url('tool/')}): ok.\n- [Ghost](${url('ghost/')}): gone.\n`,
  });
  assert.equal(mentioning(problems, 'llms-full.txt: lists "ghost"').length, 1);
});

test('an llms.txt entry under a site-own directory is not read as a product claim', async () => {
  // `llms.txt` names the comparison index's per-product pages individually, so
  // an assistant asked "is there a free alternative to Jobber" can answer from
  // this file without fetching and scanning a 167-entry index. Those URLs are
  // `…/compare/<product>/`, and reading the last segment alone says a product
  // called `jobber` shipped — fourteen false problems on a healthy site.
  const problems = await problemsFor({
    'llms-full.txt': `# Tools\n\n> One tool.\n\n- [Tool](${url('tool/')}): ok.\n  - [Jobber](${url('compare/jobber/')}): 32 tools compare with it.\n`,
  });
  assert.equal(mentioning(problems, 'no such product shipped').length, 0);
});

test('a real missing product is still caught beside a site-own link', async () => {
  // The direction that matters more, and the one the fix above could have
  // broken silently: widening the parse to forgive `compare/<product>/` must
  // not forgive a bullet that genuinely names a product nothing shipped.
  const problems = await problemsFor({
    'llms-full.txt': `# Tools\n\n> One tool.\n\n- [Tool](${url('tool/')}): ok.\n  - [Jobber](${url('compare/jobber/')}): fine.\n- [Ghost](${url('ghost/')}): gone.\n`,
  });
  assert.equal(mentioning(problems, 'llms-full.txt: lists "ghost"').length, 1);
});

test('a product the hub does not link is caught', async () => {
  // The quiet one. It built, it deployed, every other check passes, and no
  // visitor can reach it.
  const problems = await problemsFor({
    'ghost/index.html': '<p>Ghost</p><footer>No warranty.</footer>',
    'ghost/sitemap.xml': urlset('ghost/'),
    'sitemap.xml': sitemapIndex('sitemap-hub.xml', 'tool/sitemap.xml', 'ghost/sitemap.xml'),
  });
  assert.equal(mentioning(problems, 'ghost/: shipped but the hub does not link it').length, 1);
});

test('a hub link with no product behind it is caught', async () => {
  const problems = await problemsFor({
    'index.html': '<a href="tool/" data-tool="tool">Tool</a><a data-tool="vanished">V</a><footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'hub links "vanished"').length, 1);
});

test('a product page shipping without a disclaimer is caught', async () => {
  const problems = await problemsFor({ 'tool/index.html': '<p>Your profit: $420.00</p>' });
  assert.equal(mentioning(problems, 'tool/index.html: carries no disclaimer').length, 1);
});

test('a hub shipping without a disclaimer is caught', async () => {
  const problems = await problemsFor({ 'index.html': '<a href="tool/" data-tool="tool">Tool</a>' });
  assert.equal(mentioning(problems, 'index.html: carries no disclaimer').length, 1);
});

test('leaked test payload and repo bookkeeping are caught', async () => {
  const problems = await problemsFor({
    'tool/calc.test.mjs': 'assert(true)',
    'tool/VENTURE.yaml': 'slug: tool',
    'tool/README.md': '# notes',
  });
  assert.equal(mentioning(problems, 'tool/calc.test.mjs').length, 1);
  assert.equal(mentioning(problems, 'tool/VENTURE.yaml').length, 1);
  assert.equal(mentioning(problems, 'tool/README.md').length, 1);
});

test('a published node_modules is caught', async () => {
  const problems = await problemsFor({ 'tool/node_modules/left-pad/index.js': 'x' });
  assert.ok(mentioning(problems, 'node_modules').length >= 1);
});

test('a discovery collapse is caught by the product floor', async () => {
  // The fixture has one product, which is fine by default; the CLI passes the
  // real floor, so this asserts the floor itself rather than the default.
  const problems = await checkSite(await siteWith(), { minProducts: 20 });
  assert.equal(mentioning(problems, 'only 1 product(s) published').length, 1);
});

test('the default floor does not reject a small artifact', async () => {
  assert.deepEqual(await problemsFor(), []);
});

test('a single-quoted module specifier is resolved', async () => {
  // `from './calc.mjs'` was invisible to the double-quote-only pattern, so a
  // calculator could lose its module and still pass.
  const problems = await problemsFor({
    'tool/index.html': "<script type=\"module\">import { calc } from './calc.mjs';</script><footer>No warranty.</footer>",
  });
  assert.equal(mentioning(problems, "dead link -> ./calc.mjs").length, 1);
});

test('a dynamic import specifier is resolved', async () => {
  const problems = await problemsFor({
    'tool/index.html': '<script type="module">const m = await import("./share.mjs");</script><footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'dead link -> ./share.mjs').length, 1);
});

test('an href template placeholder inside a raw .mjs file is not a dead link', async () => {
  // Regression: epk-generator's generator.mjs builds result markup with
  // `` `<a href="${escapeHtml(url)}">` `` at runtime. REFERENCE_RE strips
  // <script>/<style> bodies before scanning HTML for href/src, but a raw
  // .mjs file has no such wrapper -- its whole content is script -- so
  // without the same exclusion the unevaluated `${...}` placeholder read as
  // a literal href and failed a correct page's build.
  const problems = await problemsFor({
    'tool/generator.mjs': 'export const row = (u) => `<a href="${escapeHtml(u)}">x</a>`;',
  });
  assert.deepEqual(mentioning(problems, 'dead link'), []);
});

test('a genuinely missing import in a raw .mjs file is still caught', async () => {
  // The fix above must not blind the checker to a real dead module: a raw
  // .mjs/.js file's import specifiers are still worth resolving, only its
  // href/src-shaped string literals are not.
  const problems = await problemsFor({
    'tool/generator.mjs': "import { escapeHtml } from './missing-helper.mjs';",
  });
  assert.equal(mentioning(problems, 'dead link -> ./missing-helper.mjs').length, 1);
});

test('a data-tool literal inside a script is not read as a hub link', async () => {
  // Regression: the offline widget builds hub markup by concatenation, so the
  // hub's own script contains `data-tool="' + slug + '"`. Scraped raw that
  // reads as a link to a product named `' + slug + '`, and the reachability
  // check failed on a perfectly healthy site.
  const problems = await problemsFor({
    'index.html':
      '<a href="tool/" data-tool="tool">Tool</a><a href="ask/">Ask</a>' +
      '<script>const card = (slug) => `<a data-tool="` + slug + `">x</a>`;</script>' +
      '<footer><a href="about/">About</a> <a href="guides/">Guides</a> '
      + '<a href="compare/">Comparisons</a> No warranty.</footer>',
  });
  assert.deepEqual(problems, [], `unexpected: ${JSON.stringify(problems)}`);
});

test('an inline module that does not parse is caught', async () => {
  // The real defect, from `3pl-quote-normalizer`: a missing semicolon between
  // an `addEventListener` call and the next statement. ASI cannot recover,
  // because the `)` and the `document` are on the same line, so the whole
  // module fails to parse and the browser runs none of it — no submit handler,
  // no live recalculation, no usage events. Every other check passed: the
  // links resolved, the disclaimer was there, the sitemaps agreed.
  const problems = await problemsFor({
    'tool/index.html':
      '<script type="module">' +
      "form.addEventListener('change', () => {})document.querySelector('#x').focus();" +
      '</script><footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'does not parse').length, 1);
});

test('a classic inline script that does not parse is caught', async () => {
  const problems = await problemsFor({
    'tool/index.html': '<script>function broken( {</script><footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'does not parse').length, 1);
});

test('a well-formed inline module passes', async () => {
  // The gate must not go red on ESM syntax a classic-script parser rejects,
  // which is what would happen if `type="module"` were checked as a script.
  const problems = await problemsFor({
    'tool/share.mjs': 'export const x = 1;',
    'tool/index.html':
      '<script type="module">import { x } from "./share.mjs"; document.title = String(x);</script>' +
      '<footer>No warranty.</footer>',
    'tool/sitemap.xml': urlset('tool/'),
  });
  assert.deepEqual(mentioning(problems, 'does not parse'), []);
});

test('a template script is not parsed as JavaScript', async () => {
  // `type` values the browser does not execute are data, not code. Parsing
  // them would fail the gate on a page that works perfectly.
  const problems = await problemsFor({
    'tool/index.html':
      '<script type="text/x-template"><div>{{ not js }}</div></script><footer>No warranty.</footer>',
  });
  assert.deepEqual(mentioning(problems, 'does not parse'), []);
});

test('malformed JSON-LD is caught', async () => {
  // Not code, but the same silent failure: search engines and assistants skip
  // the block and the page looks fine to everyone else.
  const problems = await problemsFor({
    'tool/index.html':
      '<script type="application/ld+json">{"@type":"SoftwareApplication",}</script>' +
      '<footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'not valid JSON').length, 1);
});

// ---------------------------------------------------------------------------
// Elements hidden in markup that CSS puts back on the page
// ---------------------------------------------------------------------------
//
// `hidden` is a hint, not a style: any author `display` outranks the user
// agent's `[hidden]{display:none}`. It shipped twice on this site — an empty
// saved-bids list and an empty shop-rates list, live on 342 built pages — and
// nothing here could see it, because the defect exists only in the resolved
// cascade. These pin the shape.

const hiddenPage = (css, markup) =>
  `<style>${css}</style>${markup}<footer>No warranty.</footer>`;

test('a display rule on a hidden element is caught', async () => {
  const problems = await problemsFor({
    'tool/index.html': hiddenPage('.bar{display:flex}', '<p class="bar" hidden>x</p>'),
  });
  assert.equal(mentioning(problems, '.bar sets display:flex').length, 1);
});

test('the guard that fixes it clears the report', async () => {
  const problems = await problemsFor({
    'tool/index.html': hiddenPage(
      '.bar{display:flex}.bar[hidden]{display:none}',
      '<p class="bar" hidden>x</p>',
    ),
  });
  assert.deepEqual(mentioning(problems, '.bar sets display'), []);
});

test('an id is checked the same way as a class', async () => {
  const problems = await problemsFor({
    'tool/index.html': hiddenPage('#bar{display:grid}', '<p id="bar" hidden>x</p>'),
  });
  assert.equal(mentioning(problems, '#bar sets display:grid').length, 1);
});

test('a stylesheet the page links is read, not only its inline style', async () => {
  const problems = await problemsFor({
    'tool/index.html':
      '<link rel="stylesheet" href="../s.css"><p class="bar" hidden>x</p><footer>No warranty.</footer>',
    's.css': '.bar{display:flex}',
  });
  assert.equal(mentioning(problems, '.bar sets display:flex').length, 1);
});

test('aria-hidden is not the hidden attribute', async () => {
  // The first version of this check used `\bhidden`, which matches after the
  // hyphen. It reported 20 venture calculators whose itemised template row is
  // `aria-hidden="true"` — a label for assistive technology, nothing to do
  // with display. A gate with twenty false positives is a gate nobody keeps.
  const problems = await problemsFor({
    'tool/index.html': hiddenPage('.bar{display:grid}', '<p class="bar" aria-hidden="true">x</p>'),
  });
  assert.deepEqual(mentioning(problems, '.bar sets display'), []);
});

test('a class literally named "hidden" is not the hidden attribute either', async () => {
  const problems = await problemsFor({
    'tool/index.html': hiddenPage('.bar{display:grid}', '<p class="bar hidden-note">x</p>'),
  });
  assert.deepEqual(mentioning(problems, '.bar sets display'), []);
});

test('a rule about the children of a hidden element is not the defect', async () => {
  // `.bar li` styles what is inside a hidden list. Approximating this as a hit
  // is how a checker earns its way into someone's ignore list.
  const problems = await problemsFor({
    'tool/index.html': hiddenPage('.bar li{display:grid}', '<p class="bar" hidden>x</p>'),
  });
  assert.deepEqual(mentioning(problems, 'sets display'), []);
});

test('a display rule on an element that is never hidden is not reported', async () => {
  const problems = await problemsFor({
    'tool/index.html': hiddenPage('.bar{display:flex}', '<p class="bar">x</p>'),
  });
  assert.deepEqual(mentioning(problems, 'sets display'), []);
});

test('hidden="until-found" is a different feature and is left alone', async () => {
  // The browser reveals it on find-in-page; it is not display:none, so a
  // display rule on it is not this defect.
  const problems = await problemsFor({
    'tool/index.html': hiddenPage('.bar{display:grid}', '<p class="bar" hidden="until-found">x</p>'),
  });
  assert.deepEqual(mentioning(problems, '.bar sets display'), []);
});

test('one missing guard on a shared bar is reported once, not once per page', async () => {
  // These stylesheets are site-wide: without this, a single missing guard is
  // 342 identical lines and the one that matters is buried.
  const page = hiddenPage('.bar{display:flex}', '<p class="bar" hidden>x</p>');
  const problems = await problemsFor({
    'index.html': `<a href="tool/" data-tool="tool">Tool</a>${page}`,
    'tool/index.html': page,
  });
  assert.equal(mentioning(problems, '.bar sets display:flex').length, 1);
});

// ---------------------------------------------------------------------------
// Two buttons that copy two different links
// ---------------------------------------------------------------------------
//
// `link.mjs` skips a page that already has its own share control, because "a
// second button beside `copyShare`, writing a second hash format, is worse than
// the drift it fixes". Two pages slipped past that gate and shipped with both.
// On `mobile-detailing-bid-calculator` it decided real money: the injected
// control read every field off the form, including the proposal deposit and
// terms, while the inline one serialized `readInput()` and left all five behind.
// Whichever button the detailer clicked decided what the customer's copy said.

test('a page shipping both the injected bid link and its own copy button is refused', async () => {
  const problems = await problemsFor({
    'tool/index.html': '<button id="copyLink" type="button">Copy shareable link</button>'
      + '<button id="pf-link-copy" type="button">Copy link to this bid</button>'
      + '<footer>No warranty.</footer>',
  });
  const found = mentioning(problems, 'two buttons writing two hash formats');
  assert.equal(found.length, 1, problems.join('\n'));
  assert.match(found[0], /#copyLink/);
});

test('every spelling of a venture copy button is caught, not just copyShare', async () => {
  for (const id of ['share', 'copyShare', 'copyLink', 'shareLink']) {
    const problems = await problemsFor({
      'tool/index.html': `<button id="${id}" type="button">Copy</button>`
        + '<button id="pf-link-copy" type="button">Copy link to this bid</button>'
        + '<footer>No warranty.</footer>',
    });
    assert.equal(mentioning(problems, 'two hash formats').length, 1, `#${id} was not caught`);
  }
});

test('one control of either kind is fine, and a non-button id is not a control', async () => {
  const only = {
    'tool/index.html': '<button id="pf-link-copy" type="button">Copy link to this bid</button>'
      + '<footer>No warranty.</footer>',
  };
  assert.deepEqual(mentioning(await problemsFor(only), 'two hash formats'), []);

  const own = {
    'tool/index.html': '<button id="copyShare" type="button">Copy share link</button>'
      + '<footer>No warranty.</footer>',
  };
  assert.deepEqual(mentioning(await problemsFor(own), 'two hash formats'), []);

  // `cam-reconciliation-check` names a *section* `share`. A probe that matched
  // it spent thirty seconds clicking a 0×0 div; a check that matched it would
  // refuse to publish a page with no second control at all.
  const section = {
    'tool/index.html': '<section id="share"><h2>Share</h2></section>'
      + '<button id="pf-link-copy" type="button">Copy link to this bid</button>'
      + '<footer>No warranty.</footer>',
  };
  assert.deepEqual(mentioning(await problemsFor(section), 'two hash formats'), []);
});

// ---------------------------------------------------------------------------
// Category landing pages
//
// `c/` is the one root directory that is not a product, so the product checks
// have to skip it and a second set has to hold it to its own contract. Both
// halves are tested: skipping it must not make it unchecked.
// ---------------------------------------------------------------------------

const CATEGORY_SITE = {
  'index.html':
    '<a href="tool/" data-tool="tool">Tool</a><a href="ask/">Ask</a>'
    + '<h2><a href="c/trades/" data-category="trades">Trades</a></h2>'
    + '<footer><a href="about/">About</a> <a href="guides/">Guides</a> '
    + '<a href="compare/">Comparisons</a> No warranty.</footer>',
  'sitemap-hub.xml': urlset('', 'c/trades/', 'about/', 'ask/', 'compare/', 'guides/'),
  'c/trades/index.html':
    '<a href="../../tool/" data-tool="tool">Tool</a><footer>No warranty.</footer>',
};

test('a healthy artifact with category pages passes', async () => {
  const dir = await siteWith(CATEGORY_SITE);
  assert.deepEqual(await checkSite(dir), []);
});

test('a product listed only on a category page the hub links is reachable', async () => {
  // The hub is a front door: it links the category pages, and they list the
  // tools. Two clicks is reachable.
  const dir = await siteWith({
    ...CATEGORY_SITE,
    'other/index.html': '<p>Other</p><footer>No warranty.</footer>',
    'other/sitemap.xml': urlset('other/'),
    'sitemap.xml': sitemapIndex('sitemap-hub.xml', 'tool/sitemap.xml', 'other/sitemap.xml'),
    'c/trades/index.html':
      '<a href="../../tool/" data-tool="tool">Tool</a><a href="../../other/" data-tool="other">Other</a>'
      + '<footer>No warranty.</footer>',
  });
  assert.deepEqual(mentioning(await checkSite(dir), 'other/: shipped but the hub does not link it'), []);
});

test('a product listed only on a category page the hub does not link is still unreachable', async () => {
  const dir = await siteWith({
    ...CATEGORY_SITE,
    'other/index.html': '<p>Other</p><footer>No warranty.</footer>',
    'other/sitemap.xml': urlset('other/'),
    'sitemap.xml': sitemapIndex('sitemap-hub.xml', 'tool/sitemap.xml', 'other/sitemap.xml'),
    'c/hidden/index.html':
      '<a href="../../other/" data-tool="other">Other</a><footer>No warranty.</footer>',
  });
  const problems = await checkSite(dir);
  assert.equal(mentioning(problems, 'other/: shipped but the hub does not link it').length, 1, problems.join('\n'));
});

test('c/ is not held to the product contract', async () => {
  // Before the exclusion, `c/` was read as a product: no `c/index.html`, no hub
  // link named `c`, no `c` row in llms.txt — three problems for a directory
  // that is working correctly.
  const dir = await siteWith(CATEGORY_SITE);
  const problems = await checkSite(dir);
  assert.ok(!problems.some((p) => /^c\//.test(p) && !/^c\/trades/.test(p)), problems.join('\n'));
});

test('a category page the hub does not link is reported', async () => {
  const dir = await siteWith({
    ...CATEGORY_SITE,
    'index.html': '<a href="tool/" data-tool="tool">Tool</a><footer>No warranty.</footer>',
  });
  const problems = await checkSite(dir);
  assert.ok(
    problems.some((p) => p.includes('c/trades/: shipped but the hub does not link it')),
    problems.join('\n'),
  );
});

test('a hub link to a category that did not ship is reported', async () => {
  const dir = await siteWith({ ...CATEGORY_SITE, 'c/trades/index.html': null });
  const problems = await checkSite(dir);
  assert.ok(
    problems.some((p) => p.includes('links category "trades" but c/trades/ did not ship')),
    problems.join('\n'),
  );
});

test('a category page without a disclaimer must not ship', async () => {
  const dir = await siteWith({
    ...CATEGORY_SITE,
    'c/trades/index.html': '<a href="../../tool/" data-tool="tool">Tool</a>',
  });
  const problems = await checkSite(dir);
  assert.ok(
    problems.some((p) => p.includes('c/trades/index.html: carries no disclaimer')),
    problems.join('\n'),
  );
});

test('a category page listing a tool that did not ship is reported', async () => {
  const dir = await siteWith({
    ...CATEGORY_SITE,
    'c/trades/index.html':
      '<a href="../../gone/" data-tool="gone">Gone</a><footer>No warranty.</footer>',
  });
  const problems = await checkSite(dir);
  assert.ok(
    problems.some((p) => p.includes('c/trades/index.html: links "gone"')),
    problems.join('\n'),
  );
});

test('an empty category page is reported', async () => {
  const dir = await siteWith({
    ...CATEGORY_SITE,
    'c/trades/index.html': '<p>Nothing here yet.</p><footer>No warranty.</footer>',
  });
  const problems = await checkSite(dir);
  assert.ok(
    problems.some((p) => p.includes('c/trades/index.html: lists no tools')),
    problems.join('\n'),
  );
});

test('a category page in no sitemap is reported', async () => {
  const dir = await siteWith({ ...CATEGORY_SITE, 'sitemap-hub.xml': urlset('') });
  const problems = await checkSite(dir);
  assert.ok(
    problems.some((p) => p.includes('c/trades/index.html: served but absent from every sitemap')),
    problems.join('\n'),
  );
});

// ---- Snippet budget --------------------------------------------------------
//
// The defect this guards is drift, not a one-off: a description grows a clause
// every time a session adds a feature to the tool, nobody ever takes one out,
// and 138 of 168 published pages had crossed the budget before anything
// measured it. `build.mjs` cuts them; this is what notices if it stops.

/** A site whose canonical chain reaches the per-page discovery checks. */
const shareable = (relative, description) => ({
  'index.html':
    `<link rel="canonical" href="${url('')}">` +
    '<a href="tool/" data-tool="tool">Tool</a>' +
    '<footer><a href="about/">About</a> No warranty.</footer>',
  [relative]:
    `<link rel="canonical" href="${url('tool/')}">` +
    '<meta property="og:url" content="' + url('tool/') + '">' +
    `<meta property="og:image" content="${url('social-card.png')}">` +
    '<meta name="twitter:card" content="summary_large_image">' +
    `<meta name="description" content="${description}">` +
    '<p>Tool</p><footer>No warranty.</footer>',
});

const LONG = `Calculate order profit, ${'whether one option still beats another, '.repeat(6)}and what is left.`;

test('a description over the snippet budget is caught', async () => {
  const problems = await problemsFor(shareable('tool/index.html', LONG));
  const found = mentioning(problems, 'description is');
  assert.equal(found.length, 1, problems.join('\n'));
  assert.ok(found[0].includes('over the 160-character budget'), found[0]);
});

test('a description inside the budget passes', async () => {
  const problems = await problemsFor(
    shareable('tool/index.html', 'Price a job before you quote it, with your own truck and disposal cost in the arithmetic.'),
  );
  assert.deepEqual(mentioning(problems, 'character budget'), []);
});

test('an over-long og:description is caught even when the meta description is short', async () => {
  const files = shareable('tool/index.html', 'Short and fine.');
  files['tool/index.html'] = files['tool/index.html'].replace(
    '<p>Tool</p>',
    `<meta property="og:description" content="${LONG}"><p>Tool</p>`,
  );
  const problems = await problemsFor(files);
  assert.equal(mentioning(problems, 'og:description is').length, 1, problems.join('\n'));
});

test('entities are counted as the one character a reader sees', async () => {
  // `&amp;` is five characters of markup and one of prose. Counting markup
  // would fail a page whose description is comfortably inside the budget.
  const description = `Fees ${'&amp; '.repeat(20)}what is left after them.`;
  const problems = await problemsFor(shareable('tool/index.html', description));
  assert.deepEqual(mentioning(problems, 'character budget'), [], description);
});

// ---- How nginx will type each served file ---------------------------------
//
// The two bugs this generalizes both shipped: `.mjs` and `.webmanifest` are
// absent from nginx's mime.types, so the pod served them as
// application/octet-stream, and with nosniff set a browser refuses the module
// outright. Neither reproduced on GitHub Pages, which types both correctly.

const nginxWith = (...extensions) =>
  extensions
    .map((ext) => `      location ~ \\${ext}$ {\n        types { }\n        default_type text/x-thing;\n      }\n`)
    .join('');

test('an extension nothing knows how to type fails the check', () => {
  const problems = checkServedExtensions(['tool/model.glb'], nginxWith('.mjs'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /nothing says how nginx should type "\.glb"/);
  // The message has to carry the fix, because the person who trips it is
  // adding an asset to a venture and has no reason to know nginx's mime.types.
  assert.match(problems[0], /SERVED_EXTENSIONS/);
  assert.match(problems[0], /gitops\/prod\/portfolio-site\.yaml/);
});

test('a conf-typed extension whose location block was deleted fails the check', () => {
  // The regression that reopens the original bug: the allowlist still claims
  // `.mjs` is handled, but the manifest no longer handles it.
  const problems = checkServedExtensions(['tool/calc.mjs'], nginxWith('.webmanifest'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"\.mjs" is marked 'conf'/);
  assert.match(problems[0], /application\/octet-stream/);
});

test('a location block that lost its types/default_type pair does not count', () => {
  // `types { }` extends the inherited map; a block without it (or without the
  // default_type) is present in the file but types nothing, which is exactly
  // the shape a careless edit leaves behind.
  const hollow = '      location ~ \\.mjs$ {\n        add_header X-Frame-Options DENY always;\n      }\n';
  const problems = checkServedExtensions(['tool/calc.mjs'], hollow);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /marked 'conf'/);
});

test('stock extensions need no location block', () => {
  // nginx's own mime.types covers these, so requiring a block for them would
  // be noise that trains people to add empty ones.
  const files = ['a.html', 'b.css', 'c.js', 'd.json', 'e.xml', 'f.txt', 'g.png', 'h.svg', 'i.ico', 'j.pdf'];
  assert.deepEqual(checkServedExtensions(files, ''), []);
});

test('a dotfile with no extension is not flagged', () => {
  // path.extname('.nojekyll') is '', and the file is never linked; nginx's
  // default_type is right for it. Flagging it would be a false positive on
  // every build.
  assert.deepEqual(checkServedExtensions(['.nojekyll'], ''), []);
});

test('the allowlist still applies when the manifest is not on disk', () => {
  // `check.mjs --dist=` run against a downloaded artifact has no repo checkout
  // to cross-check against. The extension allowlist is still meaningful there;
  // only the manifest half is skipped.
  assert.deepEqual(checkServedExtensions(['tool/calc.mjs'], null), []);
  assert.match(checkServedExtensions(['tool/model.glb'], null)[0], /nothing says how/);
});

test('each extension is reported once, not once per file', () => {
  // 552 .mjs files must not produce 552 problems.
  const files = Array.from({ length: 50 }, (_, i) => `tool/a${i}.glb`);
  assert.equal(checkServedExtensions(files, '').length, 1);
});

test('a file the leak check already condemns is not also reported as untyped', () => {
  // Each defect gets reported once, by the check that owns it. `VENTURE.yaml`
  // should not ship at all; answering "how should nginx type .yaml" would bury
  // the actual fix, which is to delete it.
  assert.deepEqual(checkServedExtensions(['tool/VENTURE.yaml', 'tool/README.md'], ''), []);
  assert.deepEqual(checkServedExtensions(['tool/node_modules/left-pad/x.ts'], ''), []);
});

// ---------------------------------------------------------------------------
// The feed and its launch dates
// ---------------------------------------------------------------------------

test('a tool that shipped with no launch date is refused', async () => {
  // The failure this exists for: a tool lands, nobody re-runs
  // `launched.mjs --write`, and it never appears in the feed. Every other
  // surface for that tool is correct, so nothing else in the artifact is red.
  const problems = await problemsFor({
    'catalog.json': JSON.stringify({ tools: [{ slug: 'tool' }] }),
  });
  assert.equal(mentioning(problems, 'no launch date').length, 1);
  assert.match(problems.find((p) => p.includes('no launch date')), /launched\.mjs --write/);
});

test('a launch date that is not a date is refused rather than published', async () => {
  const problems = await problemsFor({
    'catalog.json': JSON.stringify({ tools: [{ slug: 'tool', launched: 'last tuesday' }] }),
  });
  assert.equal(mentioning(problems, 'is not YYYY-MM-DD').length, 1);
});

test('a missing feed is a problem, because nothing else in the artifact shows it', async () => {
  // Unlike a page, a missing feed 404s for nobody: subscribers just stop
  // seeing new tools and the site looks fine.
  assert.deepEqual(await problemsFor({ 'feed.xml': null }), ['missing required file: feed.xml']);
});

test('a feed naming a tool that did not ship is refused', async () => {
  const problems = await problemsFor({
    'feed.xml':
      '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">'
      + '<entry><id>tag:marisstella.dev,2026:tool/deleted-tool</id></entry></feed>',
  });
  assert.equal(mentioning(problems, 'deleted-tool').length, 1);
});

test('a raw ampersand in the feed is refused', async () => {
  // One unescaped `&` makes the document unparseable, so every subscriber
  // sees zero entries — a total outage of the surface with no other symptom.
  const problems = await problemsFor({
    'feed.xml':
      '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">'
      + '<entry><id>tag:marisstella.dev,2026:tool/tool</id>'
      + '<title>Fees & margins</title></entry></feed>',
  });
  assert.equal(mentioning(problems, 'unparseable').length, 1);
});

test('correctly escaped entities in the feed are not mistaken for a raw ampersand', async () => {
  const problems = await problemsFor({
    'feed.xml':
      '<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">'
      + '<entry><id>tag:marisstella.dev,2026:tool/tool</id>'
      + '<title>Fees &amp; &quot;margins&quot; &lt;b&gt; &#39;x&#39;</title></entry></feed>',
  });
  assert.deepEqual(mentioning(problems, 'unparseable'), []);
});

// ---------------------------------------------------------------------------
// The comparison index (`compare/`)
//
// Same shape as `about/`: a root directory the build writes about the site
// rather than a venture, so the product contract must skip it — and skipping
// it must not leave it unchecked. Its own failures are different from About's,
// because its whole value is being a route to pages that have no other one.
// ---------------------------------------------------------------------------

test('compare/ is not held to the product contract', async () => {
  const problems = await problemsFor();
  assert.deepEqual(mentioning(problems, 'compare/ has no index.html'), []);
  assert.deepEqual(mentioning(problems, 'compare/: shipped but the hub does not link'), []);
  assert.deepEqual(mentioning(problems, 'compare/: shipped with no launch date'), []);
});

test('a missing comparison index is a problem', async () => {
  const problems = await problemsFor({
    'compare/index.html': null,
    'index.html':
      '<a href="tool/" data-tool="tool">Tool</a><footer><a href="about/">About</a> No warranty.</footer>',
    'sitemap-hub.xml': urlset('', 'about/'),
  });
  assert.equal(
    mentioning(problems, 'comparison pages have no cross-venture index').length,
    1,
  );
});

test('a comparison index the hub does not link is a problem', async () => {
  const problems = await problemsFor({
    'index.html':
      '<a href="tool/" data-tool="tool">Tool</a><footer><a href="about/">About</a> No warranty.</footer>',
  });
  assert.equal(
    mentioning(problems, 'compare/: shipped but the hub does not link it').length,
    1,
  );
});

test('an empty comparison index is a problem, because it looks healthy', async () => {
  // The quiet failure: `discoverComparisons` stops matching, and the page still
  // renders with a headline, a disclaimer and no dead links. Nothing else in
  // this file would show it.
  const problems = await problemsFor({
    'compare/index.html': '<p>Nothing to compare.</p><footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'lists no comparison pages').length, 1);
});

test('a comparison index linking a product that did not ship is a problem', async () => {
  const problems = await problemsFor({
    'compare/index.html':
      '<a href="../gone/vs-widget.html">Gone</a><footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'links "gone" but no such product shipped').length, 1);
});

test('a comparison index with no disclaimer must not ship', async () => {
  const problems = await problemsFor({
    'compare/index.html': '<a href="../tool/vs-widget.html">Tool</a>',
  });
  assert.equal(mentioning(problems, 'compare/index.html: carries no disclaimer').length, 1);
});

// ---------------------------------------------------------------------------
// The guides index (`guides/`)
//
// Same shape and the same argument as `compare/`, one content type over: the
// "how much should I charge for X" pages are the largest body of content on
// the site and, before this index existed, 64 of them had a single inbound
// link in the whole artifact — their own tool's entry page.
// ---------------------------------------------------------------------------

test('guides/ is not held to the product contract', async () => {
  const problems = await problemsFor();
  assert.deepEqual(mentioning(problems, 'guides/ has no index.html'), []);
  assert.deepEqual(mentioning(problems, 'guides/: shipped but the hub does not link'), []);
  assert.deepEqual(mentioning(problems, 'guides/: shipped with no launch date'), []);
});

test('a missing guides index is a problem', async () => {
  const problems = await problemsFor({
    'guides/index.html': null,
    'index.html':
      '<a href="tool/" data-tool="tool">Tool</a><footer><a href="about/">About</a> '
      + '<a href="compare/">Comparisons</a> No warranty.</footer>',
    'sitemap-hub.xml': urlset('', 'about/', 'compare/'),
  });
  assert.equal(mentioning(problems, 'guide pages have no cross-venture index').length, 1);
});

test('a guides index the hub does not link is a problem', async () => {
  const problems = await problemsFor({
    'index.html':
      '<a href="tool/" data-tool="tool">Tool</a><footer><a href="about/">About</a> '
      + '<a href="compare/">Comparisons</a> No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'guides/: shipped but the hub does not link it').length, 1);
});

test('an empty guides index is a problem, because it looks healthy', async () => {
  // The same quiet failure as the comparison index, and likelier here:
  // `discoverGuides` reads the built tree, so a change to `isGuidePage` or the
  // output layout renders a page with a headline, a disclaimer and nothing in
  // it. Every other check in this file stays green.
  const problems = await problemsFor({
    'guides/index.html': '<p>No guides yet.</p><footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'lists no guide pages').length, 1);
});

test('a guides index linking a product that did not ship is a problem', async () => {
  const problems = await problemsFor({
    'guides/index.html':
      '<a href="../gone/how-much.html">Gone</a><footer>No warranty.</footer>',
  });
  assert.equal(mentioning(problems, 'links "gone" but no such product shipped').length, 1);
});

test('a guides index with no disclaimer must not ship', async () => {
  const problems = await problemsFor({
    'guides/index.html': '<a href="../tool/how-much.html">How much?</a>',
  });
  assert.equal(mentioning(problems, 'guides/index.html: carries no disclaimer').length, 1);
});

// The command line is what CI runs; a mutation of its entry guard or its exit
// code must not leave the suite green.
test('the CLI exits 1 and names the problems on an empty artifact', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'check-cli-'));
  const res = spawnSync(process.execPath, [new URL('./check.mjs', import.meta.url).pathname, dir], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /problem\(s\) in/);
});

test('the CLI still runs with no arguments (it checks ./dist beside the script)', async () => {
  const { spawnSync } = await import('node:child_process');
  const res = spawnSync(process.execPath, [new URL('./check.mjs', import.meta.url).pathname], {
    encoding: 'utf8',
  });
  // Either dist exists and is checked (0 or 1) or it is absent (1); what must
  // never happen is a silent exit that printed nothing at all.
  assert.ok(res.stdout.length + res.stderr.length > 0);
});
