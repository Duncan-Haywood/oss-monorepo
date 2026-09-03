// Lets a stranger's page host one of these calculators.
//
// Why this exists
// ---------------
// Nothing under `platform/pages/` gives a third party a supported way to put a
// tool on their own page. A trade association's resource page, a supplier's
// blog post, a forum's sidebar — every one of those is a real inbound link and
// an audience that already exists, and it costs this portfolio nothing: the
// page is static and computes in the visitor's own browser, same as every
// other page here. Priority 1 of the marketing-distribution queue item.
//
// The shape is deliberately not a second, stripped-down page per tool. Ninety
// venture entry pages are each written as a standalone document with their own
// layout, so a build-time pass that tried to cut one down to "just the
// calculator" would be guessing at bespoke markup on every one of them — the
// same risk `injectShopRates` avoids by touching only the chrome it wrote
// itself. Instead the *existing* entry page is the embeddable view: it already
// carries the tool's own disclaimer, and `?pfEmbed=1` (or being framed at all)
// only toggles which of the chrome this build already injects is shown.
// Nothing about a venture's own markup is read, guessed at, or changed.
//
// Two things ship together:
//   - `injectEmbedWidget` adds a small "Embed this tool" box to the page's own
//     footer chrome, with a copyable `<iframe>` snippet built from that page's
//     real canonical URL and title.
//   - `pf-embed.js` (one file, at the site root, on the `pf-rates.js`
//     precedent) recognises when the page it is running on is that iframe, and
//     swaps the site-wide "browse the other N tools" nav for one line linking
//     back to the full tool — the calculator itself is untouched either way.
//
// Nothing here adds a request, a cookie, or a script that runs anywhere but on
// this origin. A host page that embeds an iframe gets exactly what an iframe
// gives it: a rectangle it does not execute code inside. `/about/` promises no
// third-party script and no analytics vendor on this site, and this feature
// adds neither.

import { stripForInjection } from './jobs.mjs';

/** Written into the page; the runtime file and its stylesheet live at the
 *  site root, one copy for the whole site, on the `pf-rates.js` precedent. */
export const EMBED_MODULE_FILE = 'pf-embed.js';
export const EMBED_STYLE_FILE = 'pf-embed.css';

/** Presence of this string is both the injection guard (idempotent, like
 *  every other pass here) and the runtime's own selector for the box. */
const EMBED_MARKER = 'pf-embed-offer';

/** The query param an embedder's `<iframe src>` carries. Checked in addition
 *  to `window.top !== window.self` so a page that is merely *linked* to from
 *  inside a frame (rare, but not impossible) does not lose its own nav by
 *  accident — the param is the deliberate signal, the frame check is the
 *  fallback for an embedder who copies the bare URL instead of the snippet. */
export const EMBED_QUERY_PARAM = 'pfEmbed';

/** A default tall enough for most of these forms without being copied blind:
 *  the box explains it is a starting point, not a promise about every tool's
 *  height, because there is no one true height across ~170 different forms. */
export const DEFAULT_EMBED_HEIGHT = 1400;

const attr = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The `<iframe>` snippet offered for copying, built from this page's own
 * canonical URL and title — never guessed, never a template with placeholders
 * left in it for someone to find and fix.
 */
export function embedSnippet(canonicalUrl, title) {
  const src = `${canonicalUrl}${canonicalUrl.includes('?') ? '&' : '?'}${EMBED_QUERY_PARAM}=1`;
  return `<iframe src="${src}" title="${title} — free calculator, opens the full tool in a new tab" style="width:100%;max-width:820px;border:0;min-height:${DEFAULT_EMBED_HEIGHT}px" loading="lazy"></iframe>`;
}

/**
 * The offer box's markup, appended inside the footer chrome `injectChrome`
 * already wrote. It rides inside `.pf-chrome-foot` on purpose: that element is
 * already hidden in print and, with `EMBED_CSS` below, already hidden on the
 * page when *that page itself* is the one being framed — an embedded
 * calculator does not need instructions for embedding a calculator.
 */
function offerMarkup(canonicalUrl, title) {
  const snippet = embedSnippet(canonicalUrl, title);
  return `    <details class="pf-chrome ${EMBED_MARKER}">
      <summary>Embed this tool on your page</summary>
      <p>Free to use on your own site — the calculator runs in the visitor's browser, computes nothing on our servers, and adds no tracking of any kind to your page. It keeps the same arithmetic and the same disclaimer as the page you are looking at now, and links back here for anyone who wants the full tool.</p>
      <textarea readonly rows="3" aria-label="Embed code" data-pf-embed-snippet>${attr(snippet)}</textarea>
      <p class="pf-embed-actions">
        <button type="button" data-pf-embed-copy>Copy embed code</button>
        <span data-pf-embed-status role="status"></span>
      </p>
      <p class="pf-embed-note">${DEFAULT_EMBED_HEIGHT}px is a starting height, not a fit for every tool — adjust it once the embed is on your page.</p>
    </details>
`;
}

/**
 * Add the embed offer and the framing-detection script to one already-chromed
 * entry page.
 *
 * Gated on `isEntry`: the deep SEO subpages inside a tool are articles, not
 * the calculator, and offering to embed one of them would be offering the
 * wrong page. Also unchanged when the page carries no footer chrome to attach
 * to (nothing `injectChrome` skipped, per its own contract) or when the pass
 * has already run.
 */
export function injectEmbedWidget(html, { slug, toRoot = './', canonical, title, isEntry } = {}) {
  if (typeof html !== 'string') return html;
  if (!isEntry || !canonical || !title) return html;
  if (html.includes(EMBED_MARKER)) return html;

  const footer = html.match(/<aside class="pf-chrome pf-chrome-foot"[\s\S]*?<\/aside>/i);
  if (!footer) return html;

  const withOffer = html.replace(footer[0], footer[0].replace('</aside>', `${offerMarkup(canonical, title)}  </aside>`));

  const styleLink = `<link rel="stylesheet" href="${attr(toRoot + EMBED_STYLE_FILE)}">`;
  const withStyle = withOffer.replace(/<\/head>/i, `${styleLink}\n</head>`);
  const prefix = withStyle === withOffer ? `${styleLink}\n` : '';

  // `type="module"`, deferred and run in document order, on the same reasoning
  // `pf-rates.js` and `pf-invalid.mjs` give: last in the document, it runs
  // after the venture's own script has finished building the form, and the
  // calculator's own behaviour is never in its way either way this branches.
  const tag = `${prefix}<script type="module" src="${attr(toRoot + EMBED_MODULE_FILE)}"` +
    ` data-pf-embed-url="${attr(canonical)}" data-pf-embed-title="${attr(title)}"` +
    ` data-pf-embed-slug="${attr(slug || '')}"></script>`;

  return withStyle.replace(/<\/body>/i, `${tag}\n</body>`);
}

/**
 * Scoped under `.pf-embed-offer` and `.pf-embed-bar`, palette-free like the
 * rest of the shared chrome CSS (see `renderChromeStyle`) — these pages take
 * their colours from the host, most of them have no dark palette of their
 * own, and a hard-coded one here would sit wrong on whichever a venture did
 * not choose.
 */
const EMBED_CSS = `
.pf-embed-offer{font:inherit;font-size:.85rem;line-height:1.45;color:inherit;margin-top:10px}
.pf-embed-offer summary{cursor:pointer;font-weight:600}
.pf-embed-offer textarea{width:100%;box-sizing:border-box;margin-top:8px;font:inherit;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.8rem;
  padding:8px;border:1px solid #80808059;border-radius:7px;background:#8080800f;color:inherit;resize:vertical}
.pf-embed-actions{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin:8px 0 0}
.pf-embed-offer button{font:inherit;font-size:.85rem;color:inherit;background:#8080801f;
  border:1px solid #80808059;border-radius:7px;padding:3px 9px;cursor:pointer}
.pf-embed-offer button:hover{background:#8080802e}
.pf-embed-note{margin:8px 0 0;opacity:.82}
.pf-embed-offer :focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media print{.pf-embed-offer{display:none !important}}

/* The bar shown instead of the site nav when this exact page is the one
 * loaded inside someone else's iframe. Fixed to the bottom so it never covers
 * the calculator's own inputs, which start at the top of the page on every
 * venture here. */
.pf-embed .pf-chrome-top,.pf-embed .pf-chrome-foot{display:none}
.pf-embed-bar{position:sticky;bottom:0;left:0;right:0;z-index:1;
  font:inherit;font-size:.8rem;line-height:1.4;color:inherit;
  background:#fffffff2;border-top:1px solid #80808040;
  padding:6px 12px;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
@media (prefers-color-scheme:dark){.pf-embed-bar{background:#000000d9}}
.pf-embed-bar a{color:inherit}
`;

/** The runtime file, written once at the site root. */
export function renderEmbedModule() {
  return `${stripForInjection(EMBED_SCRIPT())}\n`;
}

/** Its stylesheet, on the same terms. Nothing in it is ever per-page. */
export function renderEmbedStyle() {
  return EMBED_CSS.trimStart();
}

/**
 * The browser half. Two independent jobs, both gated on this exact page being
 * the one framed (never on any other page on the site being framed, which
 * `data-pf-embed-url` on this page's own tag makes possible without a lookup
 * table):
 *
 *   1. If framed (or `?pfEmbed=1`, for an embedder who linked the bare URL):
 *      hide the site-wide nav this build injects and show one line linking
 *      back to the canonical, non-framed page — `target="_top"` so the click
 *      navigates the visitor's real tab rather than trying to load the full
 *      site inside the small rectangle a host page gave the iframe.
 *   2. Wire the "Copy embed code" button in the offer box, when present. The
 *      two never fire on the same load: the offer box is inside the footer
 *      chrome this hides while framed.
 *
 * Counted the same anonymous, local-only, DNT/GPC/opt-out-respecting way as
 * every other event on this site (see `CHROME_SCRIPT`) — which of the ~170
 * tools was viewed embedded, never by whom or from where, and nothing crosses
 * from this origin's storage to the host page in either direction.
 */
const EMBED_SCRIPT = () => `
(function(){
  var tag = document.currentScript ||
    document.querySelector('script[data-pf-embed-url]');
  if (!tag) return;
  var url = tag.getAttribute('data-pf-embed-url') || '';
  var title = tag.getAttribute('data-pf-embed-title') || '';
  var slug = tag.getAttribute('data-pf-embed-slug') || '';

  var bump = function(event){
    try {
      if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
      var store = window.localStorage;
      if (store.getItem('portfolio-hub-optout') === '1') return;
      var k = 'portfolio-hub-usage';
      var counts = JSON.parse(store.getItem(k) || '{}');
      counts[event] = (counts[event] || 0) + 1;
      counts.last_day = new Date().toISOString().slice(0, 10);
      store.setItem(k, JSON.stringify(counts));
    } catch (e) {}
  };

  var framed = false;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  var params;
  try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
  var requested = !!(params && params.get('${EMBED_QUERY_PARAM}') === '1');

  if ((framed || requested) && url) {
    document.documentElement.classList.add('pf-embed');
    var bar = document.createElement('p');
    bar.className = 'pf-embed-bar';
    var label = document.createElement('span');
    label.textContent = (title ? title + ' — ' : '') + 'free calculator';
    var link = document.createElement('a');
    link.href = url;
    link.target = '_top';
    link.rel = 'noopener';
    link.textContent = 'Open the full tool & disclaimer →';
    bar.appendChild(label);
    bar.appendChild(document.createTextNode(' · '));
    bar.appendChild(link);
    if (document.body) document.body.appendChild(bar);
    if (slug) bump('embed_view:' + slug);
  }

  var button = document.querySelector('[data-pf-embed-copy]');
  if (button) {
    button.addEventListener('click', function(){
      var box = document.querySelector('[data-pf-embed-snippet]');
      var status = document.querySelector('[data-pf-embed-status]');
      if (!box) return;
      var text = box.value || box.textContent || '';
      var say = function(msg){ if (status) status.textContent = msg; };
      var done = function(){
        say('Copied.');
        if (slug) bump('embed_snippet_copied:' + slug);
      };
      var fallback = function(){
        try { box.focus(); box.select(); say('This browser would not copy for us — the code is selected above; copy it with your keyboard.'); }
        catch (e) { say('This browser would not copy for us. Select the code above and copy it by hand.'); }
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else { fallback(); }
      } catch (e) { fallback(); }
    });
  }
})();
`;
