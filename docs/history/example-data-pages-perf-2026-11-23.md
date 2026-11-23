# Seventeen statistics pages stop making every visitor download the example (2026-11-23)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf backlog
items (P063, P064) touch workflow files in `.github/CODEOWNERS` and wait for
the owner, so this run took a visitor-facing item that spans many pages.

## Sweep

`node platform/perf/module-weight.mjs .` on `608fc6668` ranks pages by the gzip
of their static import graph. Past the big product pages (shed-designer,
ai-bookkeeper, xer-schedule-check, all with their own passes), the list fills
with small statistics tools whose largest file is `example-data.mjs`:
fuzzy-dedupe 47 kB of which the example is 34 kB, extreme-value-analysis 47 kB
(32 kB), instrumental-variables 44 kB (28 kB), and so on.

42 ventures ship an `example-data.mjs`. 39 import it statically from
`index.html` (ai-bookkeeper, changepoint-detector and matrix-profile-explorer
already do not). On every one of them the data is read only inside the "Load
example" button handlers, so every visitor downloads, parses and evaluates the
example before any button works, including the visitor who came to paste
their own data.

## Change

On the 17 pages where the example is 8 kB gzip or more (the scratch inventory
script printed each page's imported names and every line that uses them):

- the static `import { ... } from "./example-data.mjs"` became a memoised
  `exampleData()` loader around `import("./example-data.mjs")` (a failed load
  clears the memo, so the next press retries);
- each example handler became `async` and takes its names with
  `const { ... } = await exampleData();` on its first line, so the rest of
  the handler is unchanged;
- the page starts `exampleData()` on its `load` event, after everything the
  page needs has arrived, so in the usual case the data is already in memory
  when someone presses (see "After").

synthetic-control also read `EXAMPLE_SPEC` from `inputs()`, outside any
handler, when its `exampleSpec` flag was set. The flag now holds the spec
object itself (`exampleSpec = EXAMPLE_SPEC` in the handler, falsy as before
everywhere it is reset), so `inputs()` needs no module-level name.

Not changed, on purpose: **method-comparison** (24 kB) calls
`loadExample("lab", true)` at page load to draw a first result, so its data is
needed at load. The 22 pages under 8 kB save too little to be worth the
edit and the test churn now.

## Tests

Each of the 17 `page.test.mjs` pinned the static import list and banned
`import(` outright in the page (its `NETWORK` pattern, a no-remote-code
guard). The guard stays exact rather than loosened: the page is checked with
the single literal `import("./example-data.mjs")` removed, and a new test in
each file asserts there is exactly one `import(` in the page, that it is that
local literal, that `example-data.mjs` is no longer imported statically, and
that every name a handler destructures from `await exampleData()` is exported
by the module (a typo there would otherwise only show as a dead button).

`python3 platform/ci/run_venture_tests.py <the 17 slugs>`: 17 suites run,
0 failed (plus the site page checks).

## Same answers

A Playwright script served `HEAD`'s copy of each venture and the new copy side
by side, opened each page, pressed every example button (21 buttons across the
17 pages), waited until the page stopped changing, and compared
`document.body.innerText`, the value of every input, select and textarea, and
the size of every SVG. 18 of 21 were identical; the other three
(lomb-scargle, ordinal-regression, roc-analysis) differed only in their
"Done in 0.3 s." elapsed-time line. No page errors on either side.

## Before and after

Static graph gzip (`module-weight.mjs` on the old and new trees):

| page | before kB | after kB | saved |
|---|---:|---:|---:|
| fuzzy-dedupe | 47 | 13 | 34 |
| extreme-value-analysis | 47 | 15 | 32 |
| instrumental-variables | 44 | 17 | 27 |
| probability-calibration | 39 | 12 | 27 |
| heckman-selection | 38 | 15 | 23 |
| robust-pca | 32 | 10 | 22 |
| propensity-score | 35 | 14 | 21 |
| stl-decomposition | 30 | 15 | 15 |
| synthetic-control | 26 | 11 | 15 |
| ordinal-regression | 31 | 18 | 13 |
| regression-discontinuity | 25 | 13 | 12 |
| spatial-autocorrelation | 25 | 14 | 11 |
| roc-analysis | 26 | 16 | 10 |
| wasserstein-distance | 24 | 14 | 10 |
| capture-recapture | 20 | 11 | 9 |
| conformal-prediction-intervals | 24 | 16 | 8 |
| lomb-scargle-periodogram | 21 | 13 | 8 |
| **17 pages** | **534** | **237** | **297 (−56%)** |

Throttled load: a local static server with gzip, Chromium, 150 ms latency,
1.6 Mbit/s down, CPU 4x slower, a fresh context each run (`no-store`), time to
`domContentLoadedEventEnd` (module scripts have run, so the buttons work),
median of 5:

| page | before ms | after ms | change |
|---|---:|---:|---:|
| fuzzy-dedupe | 694 | 505 | −27% |
| extreme-value-analysis | 715 | 535 | −25% |
| instrumental-variables | 674 | 532 | −21% |
| probability-calibration | 651 | 509 | −22% |
| heckman-selection | 645 | 524 | −19% |
| robust-pca | 623 | 496 | −20% |
| propensity-score | 634 | 529 | −17% |
| lomb-scargle-periodogram | 562 | 505 | −10% |

The cost, measured the same way, as time from the press to the example text
being in the textarea (median of 5):

| | before | after |
|---|---:|---:|
| fuzzy-dedupe, press the moment `load` fires | 13 ms | 363 ms |
| extreme-value-analysis, same | 10 ms | 330 ms |
| fuzzy-dedupe, press 1 s after `load` | 12 ms | 37 ms |
| extreme-value-analysis, same | 10 ms | 25 ms |

So a visitor who presses the example in the same instant the page finishes
loading waits about a third of a second longer on a slow link; anyone who
takes a second to read the page first sees no real difference, and everyone
gets working buttons 57 to 189 ms sooner. A first version without the
`load`-event fetch made every first press pay the 350 ms; the post-load fetch
is what removes it. The bytes downloaded per visit are the same as before;
they just come after the page works. The local pages have no
`modulepreload` links (the Pages build adds them for the static graph), so
the absolute numbers are the worst case; the example data now also drops out
of the built page's preload list, which is the point.

## Not changed, ranked for the next run

1. **The 22 pages with an example under 8 kB** (isolation-forest 7 kB,
   difference-in-differences 7 kB, mann-kendall 6 kB, scale-reliability 6 kB,
   dynamic-time-warping 5 kB, inter-rater 5 kB, and smaller). The same
   transform applies; each saves one request's worth of parse at most.
2. **method-comparison (24 kB).** Its first render at load uses the "lab"
   example. Splitting that one example into its own small module, or drawing
   the first render from a precomputed result, would let the other two load
   on demand.
3. A shared `onDemand` helper: league-schedule-generator, xer-schedule-check
   and now these 17 pages each inline the same three-line memo. A
   `platform/` module would need every venture's tree-copy rules to include it;
   not worth it for three lines.
4. P063 and P064 remain owner-gated (workflow files).
