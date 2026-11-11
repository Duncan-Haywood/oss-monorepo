---
kind: polish
topics: [performance]
date: 2026-11-11
---
# Polish 2026-11-11: three perf ideas for wall-framing-takeoff measured (none helped); the hub hero stops jumping

## What I set out to do

The last four polish reports carried three "next" items for wall-framing-takeoff (flagship 1,
Lighthouse mobile perf 85, FCP 3.3 s, 4,204 elements):

1. Move the 38 `<link rel="modulepreload">` out of `<head>`. The guess was that Lantern
   counts them as render-blocking.
2. Put `content-visibility:auto` on the below-the-fold cards.
3. (my own) Split the first-load work: fill the form, then run the takeoff in a later task.

I A/B tested each one on copies of the built page (`index-b.html` and so on, beside the
original in dist).

## Results: none of them is worth shipping

Lighthouse 12.8.2, mobile, local build, 2 runs per variant:

| variant | simulate: perf / FCP ms | devtools: perf / FCP / TBT ms |
|---|---|---|
| a. as built | 85, 85 / 3369, 3332 | 81, 78 / 1591, 1619 / 751, 934 |
| b. preloads after `</main>` | 85, 85 / 3368, 3336 | 80, 78 / 1542, 1540 / 828, 1013 |
| c. content-visibility on cards 4+ | 84, 84 / 3351, 3377 | 84, 83 / 1564, 1547 / 605, 666 |
| d. b + c | 85, 85 / 3335, 3332 | 82, 83 / 1464, 1500 / 702, 654 |

TBT moved by 200 ms or more between two runs of the same page, so I wrote `longtask.mjs`
(real Chromium, CPU 4x, long-task observer, variants interleaved run by run, median of 6):

| variant | blocking ms | longest task | style | layout | script |
|---|---|---|---|---|---|
| a. as built | 420 | 412 | 186 | 234 | 486 |
| b. preloads moved | 407 | 379 | 198 | 241 | 473 |
| c. content-visibility | 484 | 370 | 186 | 194 | 441 |
| e. split first load | 445 | 299 | 211 | 241 | 448 |

- **Preload placement makes no difference.** Lantern's simulated FCP was 3.3 s both ways. The
  modules are requested before the observed first paint wherever their links sit, so the
  pessimistic graph includes them either way. Keep the preloads in `<head>`: they are what
  flattened the four-level import chain (`preload.mjs`).
- **content-visibility cuts layout by about 40 ms but does not cut blocking time.** It was
  noisy, and worse at the median. Not shipped. That matches the 2026-11-03 blog-index try.
- **Splitting the first load makes the longest task shorter (412 to 299 ms) but blocking time
  stays the same.** The takeoff itself is the long task.
- **Where the time goes** (CPU profile, unthrottled): `run()` takes 95 ms. `takeoff` is 69 ms
  of that, and `optimizeStock` (column generation plus bounded knapsack, called 4 times, once
  per lumber size) is 53 ms. Each function is called once (precise coverage), so nothing is
  computed twice. The rest is style and layout of the result DOM, plus pf-site.js's scroll
  sweep and fit, which take the forced reflow (Lighthouse's forced-reflow insight: lines 141,
  148, 164 and 289 of pf-site.js).

**The number to watch is TBT under devtools throttling, not simulated FCP.** Simulated: FCP 3.3 s,
TBT 20 ms. Devtools: FCP 1.5 s, TBT 894 ms (median of 3; range 764 to 910). The old table had no
TBT column, so earlier runs chased the FCP figure.

## What shipped

1. **The hub hero no longer jumps on phones.** The devtools Lighthouse runs above gave the hub
   CLS 0.087 every time, which the simulated runs report as 0.000. The source is the rotating
   "Built for ___" line. At 412 px "Roofers" fits on one line and "Amazon sellers & KDP authors"
   takes two (three at 320 px). So as the words turned, the hero grew and shrank by 20 px, and
   the lede, search box and stats moved with it, for as long as the page stayed open. The
   aurora backdrop is `inset: -20%` of the hero, so it moved too, and it carried most of the
   score. Fix (`showcase.mjs`):
   - CSS: `.ticker[data-longest]` is a one-cell grid. A hidden `::after` copy of the sentence,
     using the longest audience name (the build sets `data-longest`), shares the cell, all in
     bold, with 2 px added for the underline. The height is reserved before first paint.
   - JS: `fit()` in the motion script measures every word and pins `min-height`, and again
     when the width changes.
   - Neither runs under reduced motion, where the word never changes.
   - **Tried and dropped:** an inline script straight after the line. An inline classic script
     waits for the stylesheets above it, so Chrome painted half a hero first: CLS 0.89.
   - Measured (real Chromium, 150 ms server delay, CPU 4x): the load-time aurora shift went
     from 0.087 to none at 320, 360, 412 and 1280 px. Over a full 35 s cycle the hero height
     never changes: before, it toggled 1088↔1108 at 412 px and 1355↔1375 at 320 px. The summed
     shift went from 0.156 to 0.050 at 412 px and from 0.187 to 0.046 at 320 px. What remains
     is the words after the turning one reflowing inside the line, which is part of the design.
   - `ticker-fit.test.mjs`: at 320, 412 and 1280 px the CSS alone reserves at least the
     tallest word's height (and no more than a line over), and the paragraph below never moves
     as each word is shown. Plus the reduced-motion case. The width tests fail with the fix
     removed (checked: 3 of 5 fail).
2. **`lighthouse.mjs`** adds FCP and TBT columns. `--runs=N` gives the median of every number
   plus the TBT range. It prints where the JSON reports are, and its header warns that pointing
   TMPDIR at the scratchpad stops Chrome from starting. Unit-tested in `lighthouse.test.mjs`.
3. **`longtask.mjs`**: the interleaved A/B blocking-time measure described above.

Medians of 3 on the build before this change (the hub row is before the fix):

| page | simulate perf / FCP / TBT | devtools perf / FCP / TBT / CLS | desktop perf / TBT |
|---|---|---|---|
| /wall-framing-takeoff/ | 85 / 3332 / 20 | 79 / 1541 / 894 / 0.003 | 99 / 0 |
| /ai-bookkeeper/ | 81 / 3621 / 10 | 94 / 1675 / 250 / 0.003 | 99 / 0 |
| / (hub) | 96 / 1052 / 213 | 92 / 1571 / 272 / 0.087 | 100 / 0 |

**Hub after the fix** (devtools, median of 3, from the rebuilt dist; another build test suite was running at the same time, so treat perf and TBT loosely): perf 95, FCP 1627 ms, TBT 240 ms (188 to 713), **CLS 0.005, down from 0.087**. Accessibility, best practices and SEO all stay at 100.

## Still weakest, and what I would do next

1. **wall-framing-takeoff's TBT (about 900 ms under devtools throttling)** comes from the
   example takeoff running on load. The real levers are: move `optimizeStock` into a Web
   Worker (the engine is pure, and the page would render the order when the worker answers);
   cache the optimizer result by its inputs, so that typing in unrelated fields (prices, bids)
   doesn't solve the cutting problem again; or speed up the column generation itself. All
   three are flagship venture work, not polish. Measure with `longtask.mjs`.
2. **The aurora still sizes itself from the hero.** Anything else that changes the hero's
   height after paint will show up as a big shift again. Pinning its top to a fixed offset
   (`top: -12vw` and so on) would end that for good, but it changes the look. I left it.
3. Still open from earlier notes: `lighthouse.mjs --min-a11y=100` in the nightly browser checks
   (control-plane CI, so its own PR).
