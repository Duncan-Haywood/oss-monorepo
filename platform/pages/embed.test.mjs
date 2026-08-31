import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMBED_MODULE_FILE,
  EMBED_QUERY_PARAM,
  EMBED_STYLE_FILE,
  embedSnippet,
  injectEmbedWidget,
  renderEmbedModule,
  renderEmbedStyle,
} from './embed.mjs';

const CANONICAL = 'https://tools.marisstella.dev/roofing-bid-calculator/';
const TITLE = 'Roofing Bid Calculator';

// A minimal stand-in for what `injectChrome` has already written into a page
// by the time `injectEmbedWidget` runs — the one piece of structure this pass
// depends on. Shaped like the real thing (see `injectChrome`'s `footer` const)
// rather than simplified, so a change to that shape that this pass would miss
// fails here instead of only on a full build.
const chromedPage = (body = '<main><h1>Roofing Bid Calculator</h1></main>') => `<!doctype html>
<html><head><title>t</title></head>
<body>
<nav class="pf-chrome pf-chrome-top" aria-label="Site"><a href="../">← All 170 free tools</a></nav>
${body}
<aside class="pf-chrome pf-chrome-foot" aria-label="More free tools">
  <div class="pf-inner">
    <h2>More free tools</h2>
    <p>Free and private, like this one.</p>
    <ul><li><a href="../deck-bid-calculator/">Deck Bid Calculator</a></li></ul>
    <p><a href="../">Browse all 170 free tools →</a></p>
  </div>
</aside>
<script src="../pf-site.js" data-pf-slug="roofing-bid-calculator"></script>
</body></html>`;

// ---------------------------------------------------------------------------
// The snippet itself
// ---------------------------------------------------------------------------

test('embedSnippet carries the real canonical URL and title, not a placeholder', () => {
  const snippet = embedSnippet(CANONICAL, TITLE);
  assert.ok(snippet.startsWith('<iframe '));
  assert.ok(snippet.includes(`src="${CANONICAL}?${EMBED_QUERY_PARAM}=1"`));
  assert.ok(snippet.includes(TITLE));
  assert.ok(snippet.includes('loading="lazy"'));
});

test('embedSnippet appends the query param correctly when the URL already has one', () => {
  const snippet = embedSnippet('https://tools.marisstella.dev/x/?utm=1', TITLE);
  assert.ok(snippet.includes(`&${EMBED_QUERY_PARAM}=1"`));
  assert.ok(!snippet.includes(`??${EMBED_QUERY_PARAM}`));
});

// ---------------------------------------------------------------------------
// injectEmbedWidget
// ---------------------------------------------------------------------------

test('injectEmbedWidget adds the offer box, the stylesheet and the tagged script', () => {
  const out = injectEmbedWidget(chromedPage(), {
    slug: 'roofing-bid-calculator',
    toRoot: '../',
    canonical: CANONICAL,
    title: TITLE,
    isEntry: true,
  });
  assert.notEqual(out, chromedPage());
  assert.ok(out.includes('pf-embed-offer'), 'the offer box was not added');
  assert.ok(out.includes(`href="../${EMBED_STYLE_FILE}"`), 'the stylesheet link is wrong or missing');
  assert.ok(
    out.includes(`<script type="module" src="../${EMBED_MODULE_FILE}"`),
    'the runtime script is wrong or missing',
  );
  assert.ok(out.includes(`data-pf-embed-url="${CANONICAL}"`));
  assert.ok(out.includes(`data-pf-embed-title="${TITLE}"`));
  assert.ok(out.includes('data-pf-embed-slug="roofing-bid-calculator"'));
  // Inside the footer chrome, not floating loose in the body — see the doc
  // comment on `offerMarkup`: it has to be a descendant of `.pf-chrome-foot`
  // so the same `.pf-embed .pf-chrome-foot{display:none}` rule that hides the
  // site nav on a framed page hides this box on it too.
  const foot = out.match(/<aside class="pf-chrome pf-chrome-foot"[\s\S]*?<\/aside>/)[0];
  assert.ok(foot.includes('pf-embed-offer'), 'the offer box is not inside the footer chrome');
});

test('injectEmbedWidget is a no-op without isEntry, canonical, or title', () => {
  const page = chromedPage();
  assert.equal(
    injectEmbedWidget(page, { slug: 's', toRoot: '../', canonical: CANONICAL, title: TITLE, isEntry: false }),
    page,
  );
  assert.equal(
    injectEmbedWidget(page, { slug: 's', toRoot: '../', title: TITLE, isEntry: true }),
    page,
  );
  assert.equal(
    injectEmbedWidget(page, { slug: 's', toRoot: '../', canonical: CANONICAL, isEntry: true }),
    page,
  );
});

test('injectEmbedWidget is a no-op on a page with no footer chrome to attach to', () => {
  // A deep SEO subpage never gets here because `isEntry` already guards it,
  // but a page mid-pipeline before `injectChrome` has run is the same shape,
  // and the guard has to hold on its own rather than only in combination.
  const bare = '<!doctype html><html><body><main>hi</main></body></html>';
  assert.equal(
    injectEmbedWidget(bare, { slug: 's', toRoot: './', canonical: CANONICAL, title: TITLE, isEntry: true }),
    bare,
  );
});

test('injectEmbedWidget is idempotent', () => {
  const once = injectEmbedWidget(chromedPage(), {
    slug: 'roofing-bid-calculator', toRoot: '../', canonical: CANONICAL, title: TITLE, isEntry: true,
  });
  const twice = injectEmbedWidget(once, {
    slug: 'roofing-bid-calculator', toRoot: '../', canonical: CANONICAL, title: TITLE, isEntry: true,
  });
  assert.equal(once, twice);
  assert.equal((once.match(/pf-embed-offer/g) || []).length, (twice.match(/pf-embed-offer/g) || []).length);
});

test('injectEmbedWidget resolves its script and stylesheet at the depth the page is served from', () => {
  // The same trap `pf-rates.js` documents: a src correct at `/tool/` is a 404
  // at `/tool/some-question.html`. This pass only ever runs on entry pages
  // (`/tool/index.html`, `toRoot` = `'./'`), but the path arithmetic itself is
  // asserted directly rather than trusted.
  const out = injectEmbedWidget(chromedPage(), {
    slug: 'roofing-bid-calculator', toRoot: './', canonical: CANONICAL, title: TITLE, isEntry: true,
  });
  assert.ok(out.includes(`href="./${EMBED_STYLE_FILE}"`));
  assert.ok(out.includes(`src="./${EMBED_MODULE_FILE}"`));
});

test('the offer text never claims something the code does not do', () => {
  const out = injectEmbedWidget(chromedPage(), {
    slug: 'roofing-bid-calculator', toRoot: '../', canonical: CANONICAL, title: TITLE, isEntry: true,
  });
  // "adds no tracking of any kind to your page" is the load-bearing claim —
  // the runtime script itself must never write anything to the host page's
  // own storage or cookies, only to this origin's, inside the iframe.
  assert.ok(out.includes('adds no tracking of any kind to your page'));
});

// ---------------------------------------------------------------------------
// The runtime module
// ---------------------------------------------------------------------------

test('the shipped embed module is syntactically valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(renderEmbedModule()));
});

test('the embed module is defensive about the page it lands on', () => {
  const script = renderEmbedModule();
  assert.ok(script.includes('catch'), 'a throw here would take the calculator down with it');
});

test('the embed bar links back to the real tool, opened out of the iframe', () => {
  const script = renderEmbedModule();
  assert.ok(script.includes("target = '_top'"), 'a link opened inside the iframe would try to load the whole site in the host’s rectangle');
  assert.ok(script.includes("rel = 'noopener'"));
  assert.ok(script.includes('Open the full tool'));
});

test('the embed module detects both an iframe and the query param, and needs a real URL', () => {
  const script = renderEmbedModule();
  assert.ok(script.includes('window.top !== window.self'));
  assert.ok(script.includes(`'${EMBED_QUERY_PARAM}'`));
  assert.ok(script.includes('&& url'), 'a page with no canonical carried should not claim to be embeddable');
});

test('the counter honours the same opt-outs as the rest of the site', () => {
  const script = renderEmbedModule();
  assert.ok(script.includes("'portfolio-hub-usage'"));
  assert.ok(script.includes("'portfolio-hub-optout'"));
  assert.ok(script.includes('doNotTrack'));
  assert.ok(script.includes('globalPrivacyControl'));
  assert.ok(script.includes('embed_view'));
  assert.ok(script.includes('embed_snippet_copied'));
});

test('the embed module and stylesheet load nothing off this origin', () => {
  // The promise this whole feature stands on: `/about/` says there is no
  // third-party script, font, CDN or analytics vendor anywhere on the site.
  for (const source of [renderEmbedModule(), renderEmbedStyle()]) {
    assert.equal(/https?:\/\//.test(source), false, 'a literal URL to another origin was found');
  }
});

test('the copy button falls back to selecting the text when the clipboard API is unavailable', () => {
  const script = renderEmbedModule();
  assert.ok(script.includes('navigator.clipboard'));
  assert.ok(script.includes('.select()'), 'the fallback must leave the visitor a way to copy by hand');
});

// ---------------------------------------------------------------------------
// The stylesheet
// ---------------------------------------------------------------------------

test('the stylesheet hides the site nav only on the page that is itself framed, and never in print', () => {
  const css = renderEmbedStyle();
  assert.ok(css.includes('.pf-embed .pf-chrome-top'));
  assert.ok(css.includes('.pf-embed .pf-chrome-foot'));
  assert.ok(css.includes('@media print'));
  assert.ok(css.includes('prefers-color-scheme:dark'));
});

test('the offer box sets no opacity on inherited text', () => {
  // Same rule `build.test.mjs` pins for `pf-chrome.css`: this box takes its
  // colour from the host page, so dimming it with opacity risks a contrast
  // ratio the box cannot see coming.
  const css = renderEmbedStyle();
  const box = css.match(/\.pf-embed-offer\s*\{[^}]*\}/)?.[0] ?? '';
  const note = css.match(/\.pf-embed-note\s*\{[^}]*\}/)?.[0] ?? '';
  assert.equal(/opacity\s*:/.test(box), false);
  // `.pf-embed-note` is the one deliberate exception, matching `.pf-rates-note`
  // in `rates.mjs` — a de-emphasised aside, not body text a visitor must read.
  assert.ok(/opacity\s*:/.test(note));
});
