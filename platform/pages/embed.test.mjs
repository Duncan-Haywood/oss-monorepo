import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EMBED_HOST_FILE,
  EMBED_MESSAGE_SOURCE,
  EMBED_MODULE_FILE,
  EMBED_QUERY_PARAM,
  EMBED_STYLE_FILE,
  MAX_EMBED_HEIGHT,
  MIN_EMBED_HEIGHT,
  embedSnippet,
  injectEmbedWidget,
  renderEmbedHostModule,
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

test('embedSnippet offers the resizer from the same origin as the frame', () => {
  // Hard-coding either hostname here would break the other: the mirrored entry
  // pages carry an apex canonical, `build.mjs` carries the tools host's. The
  // snippet has to name whichever origin is actually serving the frame it
  // sits next to, or the resizer is a 404 on every page that pastes it.
  for (const canonical of [
    'https://marisstella.dev/tools/roofing-bid-calculator/',
    'https://tools.marisstella.dev/roofing-bid-calculator/',
  ]) {
    const snippet = embedSnippet(canonical, TITLE);
    const { origin } = new URL(canonical);
    assert.ok(
      snippet.includes(`<script src="${origin}/${EMBED_HOST_FILE}" async></script>`),
      `${canonical} produced a resizer tag pointing somewhere else`,
    );
  }
});

test('the iframe alone is still a complete embed without the resizer line', () => {
  // A CMS or forum that strips `<script>` from pasted HTML — many do — must
  // degrade to the embed this feature shipped with, not to a broken one. So
  // the fallback height stays on the iframe itself rather than moving into
  // the script.
  const [iframe, script] = embedSnippet(CANONICAL, TITLE).split('\n');
  assert.ok(iframe.startsWith('<iframe '));
  assert.ok(iframe.includes('min-height:'), 'the iframe must carry its own fallback height');
  assert.ok(script.startsWith('<script '), 'the resizer must be a separate, droppable line');
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

test('every control this widget injects is inside .pf-chrome, so the sweep does not count it as the tool', () => {
  // `sweep.mjs` decides whether a page is a landing page or a broken tool by
  // counting the controls the *venture* wrote, and it separates those from the
  // ones this build injects with `ownOnly()` — a `:not(.pf-chrome ...)` on
  // each of `input, select, textarea, button`. So this widget's controls being
  // descendants of `.pf-chrome` is not a styling detail: it is the contract
  // that keeps them out of that count.
  //
  // It broke once, in the other direction. The count was the bare selector
  // until 2026-09-01, so the `<textarea>` and "Copy embed code" `<button>`
  // added here in #2561 counted on every entry page. On the 168 pages with
  // controls of their own that changed nothing; on `ai-engineering-academy`,
  // a hub linking to six calculators and owning no controls, it took
  // `interactive` from 0 to 2 and turned a page doing its job into
  // `NO-CONTROLS`, failing the whole sweep. The count is fixed; this pins the
  // half of the contract that lives here, because moving these controls out
  // of `.pf-chrome` would break it again from this side and the sweep needs a
  // browser to notice.
  const out = injectEmbedWidget(chromedPage(), {
    slug: 'roofing-bid-calculator',
    toRoot: '../',
    canonical: CANONICAL,
    title: TITLE,
    isEntry: true,
  });

  // Everything this pass added, which is everything not in the page before it.
  const added = out.replace(chromedPage(), '');
  const controls = added.match(/<(?:input|select|textarea|button)\b/gi) ?? [];
  assert.ok(controls.length > 0, 'the widget injects no controls at all — has its markup changed?');

  // Each one has to sit inside a `.pf-chrome` element. The widget's own root
  // carries the class (see `offerMarkup`), and it is injected into
  // `.pf-chrome-foot`, so the check is that no control escaped that root.
  const root = out.match(/<details class="pf-chrome[\s\S]*?<\/details>/)?.[0];
  assert.ok(root, 'the widget root is not a .pf-chrome element any more');
  const inRoot = root.match(/<(?:input|select|textarea|button)\b/gi) ?? [];
  assert.equal(
    inRoot.length,
    controls.length,
    `${controls.length - inRoot.length} injected control(s) sit outside .pf-chrome, `
    + 'where sweep.mjs would count them as the venture\'s own',
  );
});

// ---------------------------------------------------------------------------
// The resizer, which runs on somebody else's page
// ---------------------------------------------------------------------------

/**
 * Run the shipped resizer against a fake host page and return a `post`
 * function that delivers one `message` event to it.
 *
 * This executes the real generated source rather than asserting on substrings
 * of it, because every interesting property of this file is a decision it
 * makes at runtime about a message it should refuse. A string match cannot
 * tell a working origin check from a commented-out one.
 */
function hostPage(frames, { href = 'https://someone-elses-blog.example/post' } = {}) {
  let listener = null;
  const window = {
    addEventListener: (type, fn) => { if (type === 'message') listener = fn; },
  };
  const document = { getElementsByTagName: (tag) => (tag === 'iframe' ? frames : []) };
  new Function('window', 'document', 'location', 'URL', renderEmbedHostModule())(
    window, document, { href }, URL,
  );
  assert.ok(listener, 'the resizer registered no message listener at all');
  return (event) => listener(event);
}

/** A stand-in for one `<iframe>` on that page. */
const frameAt = (src) => ({
  src,
  contentWindow: { name: src },
  style: { height: '', minHeight: `${1400}px` },
  getAttribute(name) { return name === 'src' ? this.src : null; },
});

const heightMessage = (frame, height, origin) => ({
  origin: origin ?? new URL(frame.src).origin,
  source: frame.contentWindow,
  data: { source: EMBED_MESSAGE_SOURCE, slug: 'roofing-bid-calculator', height },
});

test('the resizer sizes the frame that reported, and drops its fallback floor', () => {
  const frame = frameAt('https://marisstella.dev/tools/roofing-bid-calculator/?pfEmbed=1');
  const post = hostPage([frame]);
  post(heightMessage(frame, 2310));
  assert.equal(frame.style.height, '2310px');
  assert.equal(
    frame.style.minHeight,
    '0',
    'the snippet’s fallback height would otherwise be a floor the frame cannot shrink below',
  );
});

test('the resizer ignores a report whose origin is not the frame’s own', () => {
  // The attack this exists to stop: `message` is a shared event, so any frame
  // on the host page — an ad, another widget, anything — can post to it. A
  // report is only honoured when the browser says it came from the very frame
  // it would resize.
  const frame = frameAt('https://marisstella.dev/tools/roofing-bid-calculator/?pfEmbed=1');
  const post = hostPage([frame]);
  post(heightMessage(frame, 2310, 'https://evil.example'));
  assert.equal(frame.style.height, '', 'a cross-origin report resized the frame');
});

test('the resizer ignores a report from a window that is not on the page', () => {
  const frame = frameAt('https://marisstella.dev/tools/roofing-bid-calculator/?pfEmbed=1');
  const post = hostPage([frame]);
  post({
    origin: 'https://marisstella.dev',
    source: { name: 'some other window' },
    data: { source: EMBED_MESSAGE_SOURCE, height: 2310 },
  });
  assert.equal(frame.style.height, '');
});

test('the resizer touches only the frame that reported, never its neighbours', () => {
  const mine = frameAt('https://marisstella.dev/tools/roofing-bid-calculator/?pfEmbed=1');
  const other = frameAt('https://marisstella.dev/tools/fence-bid-calculator/?pfEmbed=1');
  const post = hostPage([other, mine]);
  post(heightMessage(mine, 1990));
  assert.equal(mine.style.height, '1990px');
  assert.equal(other.style.height, '', 'a sibling embed was resized by another frame’s report');
});

test('the resizer ignores messages that are not height reports', () => {
  const frame = frameAt('https://marisstella.dev/tools/roofing-bid-calculator/?pfEmbed=1');
  const post = hostPage([frame]);
  const origin = 'https://marisstella.dev';
  const source = frame.contentWindow;
  for (const data of [
    null,
    undefined,
    'pf-embed',
    { height: 900 },                                   // no discriminator
    { source: 'someone-else', height: 900 },
    { source: EMBED_MESSAGE_SOURCE },                  // no height
    { source: EMBED_MESSAGE_SOURCE, height: '900' },   // a string, not a number
    { source: EMBED_MESSAGE_SOURCE, height: NaN },
    { source: EMBED_MESSAGE_SOURCE, height: Infinity },
    { source: EMBED_MESSAGE_SOURCE, height: MIN_EMBED_HEIGHT - 1 },
    { source: EMBED_MESSAGE_SOURCE, height: MAX_EMBED_HEIGHT + 1 },
  ]) {
    post({ origin, source, data });
    assert.equal(
      frame.style.height,
      '',
      `a message with data ${JSON.stringify(data)} resized the frame`,
    );
  }
});

test('the resizer reads nothing from the host page and sends nothing anywhere', () => {
  // The offer box tells an embedder this adds "no tracking of any kind to your
  // page". This file is the only one in the portfolio that could break that
  // promise, because it is the only one that runs where they can't see it.
  const source = renderEmbedHostModule();
  for (const forbidden of [
    'document.cookie', 'localStorage', 'sessionStorage', 'indexedDB',
    'fetch(', 'XMLHttpRequest', 'navigator.sendBeacon', 'new Image',
    'document.referrer', 'navigator.userAgent', 'postMessage',
  ]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `the resizer references ${forbidden}; it may only read a height and set one`,
    );
  }
  assert.equal(/https?:\/\//.test(source), false, 'the resizer names another origin');
});

test('the shipped resizer is syntactically valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(renderEmbedHostModule()));
});

test('the embedded page reports its height so the host has something to act on', () => {
  // The other half of the same feature: without this the resizer above never
  // fires and every embed stays at the fallback height.
  const script = renderEmbedModule();
  assert.ok(script.includes('postMessage'), 'the framed page reports no height');
  assert.ok(script.includes(`source: '${EMBED_MESSAGE_SOURCE}'`));
  assert.ok(script.includes('scrollHeight'));
  assert.ok(
    script.includes('ResizeObserver'),
    'a height measured once at load goes stale the moment someone uses the calculator',
  );
});

test('a canonical the resizer URL cannot be derived from yields the iframe alone', () => {
  // Never a broken second line. `injectEmbedWidget` already refuses a page
  // with no canonical at all, so this is the narrower case of one that is
  // present but not an absolute URL.
  const snippet = embedSnippet('/roofing-bid-calculator/', TITLE);
  assert.ok(snippet.startsWith('<iframe '));
  assert.equal(snippet.includes('<script'), false);
  assert.equal(snippet.includes('\n'), false, 'a one-line snippet is expected here');
});
