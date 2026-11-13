# Polish 2026-11-13: nothing hugs the site band any more (120 pages to 0)

**Why.** Item 1 of "Still weakest" in `polish-2026-11-12-bars-under-heading.md`: the band's 26px
bottom margin never applies, so "the gap under the band on tool pages is whatever the venture's first
element brings". I measured the gap on every page first, as that report asked.

I also looked at item 2 (desktop layout shifts on bid tools) with a source-tracing observer: on this
build 71 of 174 bar pages shift at 1,280 px, sum 0.877, worst 0.087 (window-replacement), every page
under Google's 0.1 "good". The sources are the tools' own starting rows (`STARTING_OPENINGS.forEach(addOpeningRow)`
in a module script), which push the "Add an opening" button and the next section down after first
paint, plus result `dt` cells resizing. That is per-tool code across ~70 ventures, not a chrome fix,
so I left it for a run that can go tool by tool (see "next").

## What was measured

Full local build of main (`node platform/pages/build.mjs`), served with `python3 -m http.server`,
pre-installed Chromium, third-party requests blocked, 6 tabs, 1,280 x 900 and 390 x 900. On each of
the 1,354 pages that carry the band (`nav.pf-chrome-top[data-pfs-head]`): band bottom edge to the
first visible text line box or bordered/shadowed/background box or control below it. The script is
now `platform/pages/band-gap.mjs`.

| 1,354 band pages, 1,280 px | before | after |
|---|---|---|
| under 8 px (eyebrow or h1 against the band) | **120** (50 at 0 or less, h1 3 px *into* the band on 44) | **0** |
| median | 16 | 18 |
| pages whose gap changed | | 120 by +16, 842 by +2 (14 to 16, margin collapse), 7 by +3 or +4, 1 by +1 |
| pages whose gap grew past what they had and were not tight | | 0 (the 67 pages with padded `main`/`header` unchanged) |
| sideways scroll | 0 | 0 |

390 px is the same shape (120 to 0, same pages). `band-gap.mjs` against the old build: "1280px: 1354
pages, median 16px, 120 under 8px"; against the new one: "0 under 8px" at both widths.

Screenshots: [status-keeper 1280 before](img/polish-2026-11-13-band-gap-status-keeper-1280-before.png) ·
[after](img/polish-2026-11-13-band-gap-status-keeper-1280-after.png) ·
[kickstarter-fee-calculator 390 before](img/polish-2026-11-13-band-gap-kickstarter-390-before.png) ·
[after](img/polish-2026-11-13-band-gap-kickstarter-390-after.png).

## Cause

`renderChromeStyle` sets `body:has(> band first){padding-top:0}` so the band meets the top edge. Of the
1,354 pages, 1,281 give `body` a top padding (28px, 32px 18px, 1.5rem, ...), and on those it was the
only space above the first line. Where the first element has its own top margin (the eyebrow's 14px
on most tools) the page still read fine; where it has none, it touched the band. The other 67 pages
put their padding on `main` or `header`, unaffected by the zeroing, at 22 to 93 px.

A plain `margin-bottom` on the band would fix the 120 but add 16 px to those 67 (measured: 66 grew by
16, e.g. 93 to 109). Nothing in CSS can tell the two apart, so the build does:

## What changed

1. `bodyTopPadded(html)` (build.mjs): true when an inline `<style>` has a `body` (or `html body`) rule
   whose `padding` / `padding-top` top value is not zero, at any media width. On the built pages it
   agrees with the browser on all 120 tight pages, and flags none of the 67 padded-`main` pages. It
   misses 100 padded pages whose body rule comes another way (a combined selector, a linked file);
   they all already sit at 14 to 20 px from their own margins.
2. `injectChrome` adds `data-pfs-gap` to the band on those pages.
3. Chrome CSS: `nav.pf-chrome.pf-chrome-top[data-pfs-head][data-pfs-gap]{margin-bottom:16px}`, which
   outweighs `VENTURE_CHROME_CSS`'s `margin:0`; a margin, so it collapses with the first child's own.
   `...:has(+ .pf-rates, + .pf-jobs){margin-bottom:0}` keeps the three tools whose bar still sits right
   under the band (bid-price-engine, translator-project-quote, quote-margin-check) as they were (22 and
   8 px to the bar button, unchanged; without it bid-price-engine went to 38).
4. Tests: `band-gap.test.mjs` (detector cases, the attribute, the selector weights).
5. Check: `band-gap.mjs` (README, "Checking nothing hugs the site band").

The dead `.pf-chrome-top[data-pfs-head]{margin:0 0 26px;border-bottom:0}` is still in build.mjs. It
never applies on tool pages; I left it rather than find out where else it might.

## Still weakest, and what I would do next

1. **Desktop layout shifts from tools' starting rows** (71 of 174 bid tools, all under 0.1). The fix is
   per tool: render the starting rows in the HTML (or give the rows host a `min-height` matching
   them at desktop width). Start with window-replacement (0.087), tree-service (0.047),
   fence (0.045), attic-insulation (0.043), carpet-cleaning and snow-removal (0.038). Tracer pattern:
   PerformanceObserver `layout-shift`, buffered, sources' node, previousRect and currentRect.
2. **The dead 26px rule** above: delete once someone checks no non-venture page carries
   `.pf-chrome-top[data-pfs-head]`.
3. **The bar-page rule** `header:has(+ .pf-rates, + .pf-jobs){margin-top:16px}` now collapses with the
   band's 16px on padded pages; it could go for those, but it still serves bar pages without
   `data-pfs-gap`. Not worth touching alone.
4. Carried over: `.pager` defined twice in the writing STYLE; the ticker's third line at 320 px;
   browser checks in the nightly (control-plane PR); `input,select,textarea{min-width:0}` in reflow.
