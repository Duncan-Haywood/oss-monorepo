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
// Neither is conditional on measuring the page. A wrapper around a table that
// fits never scrolls, never takes a tab stop and is visually identical; a grid
// that already reflows is not changed by being allowed to. That matters more
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
