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

import { checkSite } from './check.mjs';

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
      '<a href="tool/" data-tool="tool">Tool</a><footer><a href="about/">About</a> No warranty.</footer>',
    'about/index.html': '<p>About</p><footer>No warranty.</footer>',
    'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${url('sitemap.xml')}\n`,
    '404.html': '<p>gone</p>',
    '.nojekyll': '',
    'favicon.ico': '',
    'sitemap.xml': sitemapIndex('sitemap-hub.xml', 'tool/sitemap.xml'),
    // About is a hub-level page, so the hub sitemap is the only one that can
    // carry it — the real `renderHubSitemap` lists it here for the same reason.
    'sitemap-hub.xml': urlset('', 'about/'),
    'llms.txt': `# Tools\n\n> One tool.\n\n## Section\n\n- [Tool](${url('tool/')}): does a thing.\n`,
    'tool/index.html': '<p>Tool</p><footer>No warranty.</footer>',
    'tool/sitemap.xml': urlset('tool/'),
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
    'llms.txt': '# Tools\n\n> None.\n',
  });
  assert.equal(mentioning(problems, 'tool/: shipped but llms.txt does not list it').length, 1);
});

test('an llms.txt entry with no product behind it is caught', async () => {
  const problems = await problemsFor({
    'llms.txt': `# Tools\n\n> One tool.\n\n- [Tool](${url('tool/')}): ok.\n- [Ghost](${url('ghost/')}): gone.\n`,
  });
  assert.equal(mentioning(problems, 'llms.txt: lists "ghost"').length, 1);
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

test('a data-tool literal inside a script is not read as a hub link', async () => {
  // Regression: the offline widget builds hub markup by concatenation, so the
  // hub's own script contains `data-tool="' + slug + '"`. Scraped raw that
  // reads as a link to a product named `' + slug + '`, and the reachability
  // check failed on a perfectly healthy site.
  const problems = await problemsFor({
    'index.html':
      '<a href="tool/" data-tool="tool">Tool</a>' +
      '<script>const card = (slug) => `<a data-tool="` + slug + `">x</a>`;</script>' +
      '<footer><a href="about/">About</a> No warranty.</footer>',
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
    '<a href="tool/" data-tool="tool">Tool</a>'
    + '<h2><a href="c/trades/" data-category="trades">Trades</a></h2>'
    + '<footer><a href="about/">About</a> No warranty.</footer>',
  'sitemap-hub.xml': urlset('', 'c/trades/', 'about/'),
  'c/trades/index.html':
    '<a href="../../tool/" data-tool="tool">Tool</a><footer>No warranty.</footer>',
};

test('a healthy artifact with category pages passes', async () => {
  const dir = await siteWith(CATEGORY_SITE);
  assert.deepEqual(await checkSite(dir), []);
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
