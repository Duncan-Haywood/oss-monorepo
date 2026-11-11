---
kind: polish
topics: [performance, css, assistant, tooling]
date: 2026-11-11
---
# Polish 2026-11-11: the floating voice button's CSS moved into pf-chrome.css

**Why this item.** It was item 2 of "Still weakest" in
`polish-2026-11-11-scroll-sweep.md`: the launcher in pf-site.js
(`ASSISTANT_LAUNCHER_JS`, `platform/pages/assistant.mjs`) appended a `<style>` element after
DOMContentLoaded to style the "Speak or type" button. A new stylesheet invalidates style for
the whole document, and Lighthouse put 35 ms of forced reflow on that line on
wall-framing-takeoff.

**What changed.**
- The rules are now `ASSISTANT_VOICE_CSS` in `assistant.mjs`, appended to `pf-chrome.css` by
  `renderChromeStyle()` in `build.mjs`. The selectors and declarations are unchanged except one.
- The phone rule `body{padding-bottom:72px}` became `body.pf-ask-pad{padding-bottom:72px}`.
  The launcher sets that class when it adds the button. Without the class, every venture page
  without a button would have picked up the padding once the rule sat in a file they all load.
- The launcher adds the button only where `link[href$="pf-chrome.css"]` exists, so the button
  never appears without its styles. On this build every page that gets the button links that
  file: 1,119 pages load pf-site.js with two or more number inputs, and all 1,119 link
  pf-chrome.css. None links only pf-site.css, and none links neither.
- Two build tests that keep pf-chrome.css free of its own colours and of opacity now exempt
  the voice block, as they already exempted `VENTURE_CHROME_CSS`. The button sets both its
  fill and its ink (white on #1f4e8c, 8.3:1). Its opacity is the fade to 0 when it steps aside
  on scroll, not a tint on host text.
- A new test in `assistant.test.mjs` pins all three: no `createElement('style')`, the link
  guard, and the rules present in `renderChromeStyle()`.

**Measured.**
- **Nothing visible changed.** I swept all 1,119 pages at 1280×900 and 390×844 (2,238 loads)
  on the old and the new build. On each load the sweep read 22 computed properties of the
  button (position, inset, z-index, padding, border, radius, colours, font, shadow,
  transition, size, opacity, transform), plus the icon's size, background and border, the
  path's fill, the label's display and the body's `padding-bottom`. All 2,238 records were
  identical. The 4 loads without a button were the same 4 on both builds.
- **The saving is small, much smaller than Lighthouse's attribution.** With 4x CPU throttling,
  on a settled page, I timed "append the old `<style>` and the button, then lay out" against
  "append only the button, then lay out" with the rules already parsed. 7 runs each, medians:
  - wall-framing-takeoff (4,280 elements): 4.5 ms against 2.8 ms
  - hood-cleaning-bid-calculator (486 elements): 1.7 ms against 1.6 ms
  - changepoint-detector (360 elements): 1.3 ms against 1.6 ms (noise)

  Whole-load counters (Chrome's `RecalcStyleDuration`, ABAB-interleaved, 9 runs, 4x
  throttle) on wall-framing-takeoff: median 201 ms before, 191 ms after. The style
  recalculation count was 24 against 25 (medians). Both are within run-to-run noise: an
  earlier interleaved pass gave 222 against 197. So the 35 ms Lighthouse attributed was mostly
  the first full style pass, which happens anyway and was charged to whichever line forced it.
- **Bytes.** pf-site.js went from 10,760 to 9,873 bytes (4,448 to 4,045 gzipped). pf-chrome.css
  went from 23,927 to 24,846 (7,829 to 8,096 gzipped). Both files are cached site-wide, so a
  first visit saves about 136 gzipped bytes. The launcher itself went from 3,525 to 2,471
  characters. The 2026-11-10 mic-icon run left it 2 bytes under its 3,600-byte test budget, so
  the next launcher change no longer needs a budget decision.
- `check.mjs` passes on the new build: 8,360 pages, no dead links. On the first full run of
  `node --test 'platform/pages/*.test.mjs'`, 1,512 of 1,515 passed. The 2 failures were the
  colour and opacity tests above, which are now fixed; 5 targeted tests were re-run and pass.

**How to reproduce.** Build twice, once on main and once on this branch. Serve the two dist
folders on ports 8793 and 8794. Run a Playwright script that reads `getComputedStyle` of
`.pf-ask-voice`, its `svg`, `path` and `span`, and `document.body` on every page whose HTML
loads pf-site.js and has two or more number inputs. Diff the JSON. The scripts were scratch
files and are not in the tree. `ask-voice-icon.mjs` is the committed, narrower check: it looks
only at the icon.

## Still weakest, and what I would do next

1. **wall-framing-takeoff's own module script**: a 300 ms task, and 4,200 elements in the DOM
   (scroll-sweep note, item 3). `content-visibility:auto` on below-the-fold cards is still
   untried, and it is where the remaining style and layout time on that page goes.
2. **Modulepreload links in `<head>` and Lantern's FCP** (scroll-sweep note, item 1), not yet
   A/B tested.
3. **Bid-calculator sticky result panel taller than a 900 px viewport**
   (`polish-2026-11-11-index-contrast-dark-mode.md`). On a short desktop window the bottom of
   the panel can't be seen while it is stuck. This is the visible defect on this list.
4. Still open: a `lighthouse.mjs --form=desktop` run, and `--min-a11y=100` in the nightly
   browser checks (control plane, its own PR).
