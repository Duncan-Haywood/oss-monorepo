// Stops the published pages from scrolling sideways on a phone.
//
// Why this exists
// ---------------
// Measured in Chromium at a 360px viewport against the built site on
// 2026-08-29: **39 of 445 published pages scrolled horizontally**, three of
// them badly — `retainage-cashflow-calculator` was 647px wide inside a 360px
// window, `reverb-fee-calculator`'s return-or-refund article 568px,
// `music-lesson-break-even` 431px. On a page that wide the browser zooms out to
// fit, so *every* number on it renders at roughly half size, and the parts that
// do not fit sit off the right edge with no indication they are there.
//
// That is the audience this portfolio is written for. `sweep.mjs` already
// drives every tool at 390x844 "because that is where this audience is: a van,
// a job site" — a contractor pricing a job from a phone in someone's crawl
// space. The tools computed correctly on all 39 pages. They were simply
// unreadable, and nothing in this repository could tell the difference:
// `check.mjs` reads files, `sweep.mjs` asks whether the arithmetic answers, and
// `contrast.mjs` runs axe, which has no rule for a page wider than its own
// viewport. It is WCAG 1.4.10 (Reflow), and it is the one accessibility failure
// that degrades the product for everyone rather than for a minority.
//
// Two causes, and between them they account for all 39:
//
//   1. **A wide `<table>` in normal flow.** A table cannot shrink below the
//      min-content width of its columns, so a five-column comparison of dollar
//      figures pushes the whole document out to ~600px and drags every
//      paragraph on the page with it. 33 of the 39.
//   2. **A form control inside a grid or flex track.** A grid item's
//      `min-width` is `auto`, which means "no narrower than my content", and an
//      `<input>`'s content width is its 20-character default. Two such tracks
//      side by side need ~500px and the track never gives. 6 of the 39,
//      `contractor-bid-readiness` worst at +38px.
//
// A third arrived later, on 2026-09-06, and is the reason this list is dated
// rather than closed:
//
//   3. **A `<pre>` whose longest line does not fit.** `white-space: pre` is the
//      element's default and forbids wrapping outright, so one long install
//      command holds the document open at its own width.
//      `vendor-change-watch` was 649px inside a 360px window — by then the only
//      page of 720 still scrolling, which is why one page mattered enough to
//      find. Note it already set `word-break: break-word` on that very block:
//      breaking applies only where wrapping is permitted at all, so the source
//      reads as though this were handled and the measurement says otherwise.
//
// And a fourth on 2026-09-10, which is why the list stays dated:
//
//   4. **A heading holding one unbreakable token.**
//      `security-headers-check/vs-securityheaders.html` was 365px inside a
//      360px window — by then the only page of 929 still scrolling. The whole
//      5px was its `<h1>`, "This checker vs. Security Headers
//      (securityheaders.com)": a bare domain carries no space and no hyphen, so
//      there is nowhere to break the line, and the heading's content ran 29px
//      past its own box with `overflow: visible` handing the difference to the
//      document. Comparison pages name the competitor in the title and the
//      competitor is a hostname, so this recurs by construction rather than by
//      accident.
//
// What this file does about each
// ------------------------------
// **The table** is wrapped, at build time, in a `overflow-x:auto` box, so the
// *table* scrolls instead of the page. This is not a new mechanism: several
// ventures already hand-wrote a `.table-wrap` around theirs, and `build.mjs`
// already ships `SCROLL_A11Y_SCRIPT`, which finds any horizontally scrolling
// box by its computed `overflow-x` and gives it a keyboard tab stop when — and
// only when — it is actually scrolling. So the wrapper inherits the keyboard
// access and the "no `role`, it would strip the table semantics" decision that
// script already documents. All this adds is the box.
//
// **The track** is freed by one zero-specificity declaration, `:where(*)
// {min-width:0}`, under a narrow-viewport media query. `:where()` contributes
// no specificity, so this loses to any rule a venture wrote — it can only
// replace the *initial* `auto`, which is exactly the value that is wrong here.
// A venture that deliberately set `min-width: 280px` on its cards keeps it.
//
// **The `<pre>`** is given `overflow-x:auto` the same way the table is, so the
// block scrolls and the page does not. Scrolled rather than wrapped on purpose:
// an install command has to stay copyable as one line. It needs no class and no
// build pass — `<pre>` already means "preformatted" — so it applies to a
// venture that has not been written yet.
//
// **The heading** is given `overflow-wrap: break-word`, which breaks a long
// word only where it would otherwise overflow and leaves everything that
// already fits laid out exactly as before. Not `anywhere`, which would also
// shrink the heading's min-content width and so change how its flex or grid
// parent sizes it — a layout change on every page to fix five pixels on one.
//
// None of the four is conditional on measuring the page. A wrapper around a
// table that fits never scrolls, never takes a tab stop and is visually
// identical; a grid that already reflows is not changed by being allowed to; a
// `<pre>` that fits gets no scrollbar; a heading whose words fit never breaks
// one. That matters more
// than the saved bytes: the next calculator to land here gets both on the day
// it ships, which is the failure mode this repository keeps re-learning — a
// gate that only covers what was broken on the day it was written stops being a
// gate.
//
// Checked by `sideways.mjs`, which is the reason any of the numbers above are
// measurements rather than claims.

/**
 * The wrapper's class, and the marker that makes the pass idempotent.
 *
 * Deliberately not one of the names the ventures already use (`.table-wrap`,
 * `.scroll`, `.tablewrap`): those are venture CSS, and a build pass that
 * borrowed one would inherit whatever else that venture's rule sets.
 */
export const TABLE_SCROLL_CLASS = 'pf-table-scroll';

/**
 * Regions whose contents are not markup, and must not be rewritten.
 *
 * Several calculators build their results table as a string inside a `<script>`
 * — `'<table>' + rows + '</table>'`. Wrapping that string's `<table>` would put
 * the wrapper inside the venture's own JavaScript, which happens to be
 * *harmless* (it is still just a string, and the wrapper would appear at
 * runtime) right up until the string is assembled in pieces and the opening tag
 * has no closing tag on the same line. Not worth the risk for a case the
 * runtime already covers: a table a script writes into a container lands inside
 * whatever that container is, and if it overflows, `SCROLL_A11Y_SCRIPT` still
 * finds the nearest scrolling ancestor. So: skip them.
 */
const OPAQUE = [
  { open: /<!--/i, close: '-->' },
  { open: /<script\b/i, close: '</script>' },
  { open: /<style\b/i, close: '</style>' },
  { open: /<textarea\b/i, close: '</textarea>' },
];

/**
 * Wrap every top-level `<table>` in the document's markup in a scrolling box.
 *
 * Top-level meaning "not already inside another `<table>`" — a nested table
 * scrolls with its parent, and a wrapper around it would produce a scrollbar
 * inside a scrollbar.
 *
 * Scans rather than matches with a regular expression because `</table>` has to
 * be paired with *its* `<table>`, and because the opaque regions above have to
 * be skipped wholesale. Returns the input unchanged when there is nothing to
 * wrap, so the caller can use identity to decide whether the page was touched.
 */
export function wrapTables(html) {
  if (typeof html !== 'string' || !/<table\b/i.test(html)) return html;

  const lower = html.toLowerCase();
  const out = [];
  let cursor = 0; // everything before here is already in `out`
  let index = 0;
  let depth = 0;
  let start = -1;

  while (index < html.length) {
    const next = html.indexOf('<', index);
    if (next === -1) break;
    const rest = html.slice(next, next + 12);

    const opaque = OPAQUE.find((region) => region.open.test(rest));
    if (opaque) {
      const end = lower.indexOf(opaque.close, next);
      index = end === -1 ? html.length : end + opaque.close.length;
      continue;
    }

    if (/^<table\b/i.test(rest)) {
      if (depth === 0) start = next;
      depth += 1;
      index = next + 6;
      continue;
    }

    if (/^<\/table\s*>/i.test(rest)) {
      const close = html.indexOf('>', next) + 1;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push(html.slice(cursor, start));
        out.push(`<div class="${TABLE_SCROLL_CLASS}">`);
        out.push(html.slice(start, close));
        out.push('</div>');
        cursor = close;
        start = -1;
      }
      // An unbalanced `</table>` is a malformed page, not a reason to throw:
      // clamp and keep going so the rest of the document is still wrapped.
      if (depth < 0) depth = 0;
      index = close;
      continue;
    }

    index = next + 1;
  }

  if (out.length === 0) return html;
  out.push(html.slice(cursor));
  return out.join('');
}

/**
 * The same wrap, for a table the build never saw.
 *
 * `wrapTables` deliberately skips `<script>`, and several calculators assemble
 * their comparison table as a string there — `cut-list-optimizer`'s 4x8-vs-5x5
 * page is the one this was written for: it renders no table until the visitor
 * presses Compare, and at 320px the table it then writes pushed the page 20px
 * wide. A build pass cannot reach it, so the runtime does.
 *
 * Spliced into `SCROLL_A11Y_SCRIPT`'s `collect()` rather than shipped as a
 * script of its own, because the two halves are one behaviour: this creates the
 * scrolling box, that one gives it a keyboard tab stop once it is really
 * scrolling. Two files would have meant two orderings to get right.
 *
 * ES5 and statement-shaped, because that is the body it is pasted into.
 */
export const WRAP_TABLES_JS = `
    var bare=document.getElementsByTagName('table');
    for(var b=bare.length-1;b>=0;b--){
      var t=bare[b];
      var p=t.parentElement;
      if(!p)continue;
      if(p.className===${JSON.stringify(TABLE_SCROLL_CLASS)})continue;
      // A nested table scrolls with the one around it; boxing it would put a
      // scrollbar inside a scrollbar.
      if(p.closest&&p.closest('table'))continue;
      var box=document.createElement('div');
      box.className=${JSON.stringify(TABLE_SCROLL_CLASS)};
      p.insertBefore(box,t);
      box.appendChild(t);
    }`;

/**
 * The stylesheet half, appended to the site's one chrome stylesheet.
 *
 * Not its own file: `pf-chrome.css` is already linked by every page this pass
 * touches and already listed in the offline bundle, so folding these four rules
 * into it costs no extra request on a phone with one bar — which is the same
 * visitor this whole file is for.
 */
export const REFLOW_CSS = `
/* Reflow (WCAG 1.4.10). See platform/pages/reflow.mjs. */
.${TABLE_SCROLL_CLASS}{overflow-x:auto;max-width:100%}
/* The shadow appears only once the box is really scrolling: SCROLL_A11Y_SCRIPT
   sets this attribute from a measured scrollWidth, and removes it when the
   table fits again. Without some edge, a phone visitor has no way to know the
   sixth column exists. Inset and behind the cells, so it cannot sit under any
   text and change its contrast. */
.${TABLE_SCROLL_CLASS}[data-pf-scrollable]{box-shadow:inset -12px 0 8px -8px rgba(0,0,0,.28)}
/* Paper has no viewport to scroll. The customer's proposal prints from these
   pages and every column of it has to be on the sheet. */
@media print{.${TABLE_SCROLL_CLASS}{overflow-x:visible;box-shadow:none}}
/* Cause (3): a <pre> whose longest line does not fit. white-space:pre is the
   element's default and it forbids wrapping outright, so one long command holds
   the whole document open at that width — and no word-break a venture wrote can
   rescue it, because breaking only applies where wrapping is permitted at all.
   That combination is why this looks fixed in the source and is not:
   vendor-change-watch sets word-break:break-word on the very block that was
   measured at 649px inside a 360px window on 2026-09-06 (sideways.mjs, the only
   page of 720 still scrolling).

   Scrolled rather than wrapped, which is the choice .pf-table-scroll makes
   above and for the same reason: an install command has to stay copyable as one
   line and a diff has to keep its columns, so re-flowing the text would trade a
   layout bug for a correctness one. WCAG 1.4.10 allows exactly this — content
   needing a two-dimensional layout may scroll, so long as the *page* does not.

   No class to apply and no build pass to run: a <pre> is already the element
   that means "preformatted", so the next venture to paste a command block is
   covered on the day it ships rather than the day someone measures it. The
   keyboard tab stop comes free, because SCROLL_A11Y_SCRIPT finds a scrolling
   box by its computed overflow-x rather than by class. */
:where(pre){overflow-x:auto;max-width:100%}
/* Paper cannot scroll, so here the trade runs the other way: wrap the command
   rather than crop it at the edge of the sheet. pre-wrap still preserves
   every space and newline, so an indented block prints as written. */
@media print{:where(pre){overflow-x:visible;white-space:pre-wrap}}
/* Cause (2): a grid or flex track that will not shrink under its content. A
   grid item's automatic minimum size is its min-content width, so one <input>
   at its 20-character default, or one table the rule above just made
   scrollable, holds the whole column open and the page with it.

   Freed only for the boxes that hold one of those two things, and only on a
   narrow viewport. The blunt version of this rule — min-width:0 on everything —
   was measured first and was worse than the bug: it collapsed the term column
   of every <dl> laid out as a grid, so 372 result labels across 70 pages
   painted over their own values. A definition list holds neither a control nor
   a table, so it no longer matches.

   Zero specificity throughout, so any rule a venture wrote wins; a browser with
   no :has() ignores the second rule and keeps today's layout rather than
   getting a broken one. */
@media (max-width:640px){
  :where(input,select,textarea){min-width:0;max-width:100%}
  :where(*:has(input,select,textarea,.${TABLE_SCROLL_CLASS})){min-width:0}
  /* And the page's own layout columns, which is where a two-column
     desktop layout meets a one-column phone. Freeing a box is not the same
     as freeing what is inside it: a <dl> here may shrink, and its term
     column still holds at the width of the longest term, because the <dt>
     keeps its own automatic minimum. That is the whole difference between
     this rule and the blunt one described above. */
  :where(body>*,main,section,article,aside,header,footer,form,fieldset){min-width:0}
}

/* Cause (4): a heading holding one unbreakable token. Measured 2026-09-10 on
   security-headers-check/vs-securityheaders.html, the only page of 929 still
   scrolling: 365px inside a 360px window. The whole 5px was the <h1> "This
   checker vs. Security Headers (securityheaders.com)" — a bare domain has no
   space and no hyphen, so there is nowhere for the line to break, and the
   heading's content ran 29px past its own box with overflow:visible handing
   the difference to the document.

   Headings are where this happens because they are the one place a product
   name, a domain or a header field is written out at 2rem with no wrapper: a
   comparison page's title names the competitor, and the competitor is a
   hostname. Body copy has the same hazard and far more room to absorb it.

   overflow-wrap:break-word rather than 'anywhere': break-word breaks a long
   word only when it would otherwise overflow, and leaves the line-breaking of
   text that fits alone, so a heading that was already fine is laid out
   identically. 'anywhere' additionally shrinks the min-content width, which
   changes how flex and grid size the heading's parent — a layout change on
   every page to fix five pixels on one.

   Not restricted to a narrow viewport, and not conditional on measuring the
   page: a token too long for the line is too long at any width, and the next
   comparison page to name a hostname gets this on the day it ships. Zero
   specificity, so a venture that set its own value keeps it. */
:where(h1,h2,h3,h4,h5,h6){overflow-wrap:break-word}
`;

/**
 * Add the reflow wrapper to one already-published page.
 *
 * Unchanged when the page has no `<body>`, when it has no table, or when the
 * pass has already run — like every other injection in this build it has to be
 * safe to run twice. The stylesheet is not linked here: it rides in the chrome
 * stylesheet, which `injectChrome` has already put on this page.
 */
export function injectReflow(html) {
  if (typeof html !== 'string') return html;
  if (html.includes(TABLE_SCROLL_CLASS)) return html;
  if (!/<body[^>]*>/i.test(html)) return html;
  return wrapTables(html);
}
