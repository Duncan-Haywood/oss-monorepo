---
kind: polish
topics: [design, accessibility, tooling]
date: 2026-11-10
---
# Polish 2026-11-10: `sideways.mjs SAMPLE=N` now always probes the section index pages

**Why.** The earlier note today ("site-owned pages had no reflow guard") found /research/ at 428 px in a 360 px window, and asked for a sample that always includes the index pages. An even spread over the built site misses them. Measured on today's full build (8,223 HTML pages, 404 excluded), counting which of the 8 main indexes (hub, /research/, /writing/, /compare/, /guides/, /about/, /engineering/, /stories/) an even spread lands on:

| even spread, N | main indexes in sample |
|---|---|
| 300 | 0 of 8 |
| 400 | 0 of 8 |
| 1,000 | 1 of 8 (/engineering/) |

**Changed.**
1. New `platform/pages/sideways-sample.mjs` (`samplePages`, `isSectionIndex`), with `sideways-sample.test.mjs` (3 tests). A sample first takes every `index.html` / `<section>/index.html` page that links `pf-site.css`, then spreads the rest of the budget evenly. Today that pins 16 pages: hub, about, ask, c, changelog, compare, custom-development, engineering, feedback, guides, lab, queue, research, stories, updates, writing. Venture tool pages link `pf-chrome.css`, so they are not pinned and stay in the spread.
2. `sideways.mjs` uses it. A first draft read only the first 20 KB of each candidate page. That left /research/, /compare/ and /guides/ unpinned, because their `pf-site.css` link sits 22 KB, 172 KB and 328 KB in, after inline styles. The check now reads the whole file. It reads only top-level index pages, so the cost is about 1,360 reads.
3. The two grids the earlier note left at fixed minimums now use `minmax(min(Npx,100%),1fr)`, like the other 17: engineering.mjs `.tiles` (190 px) and the site-nav.mjs footer (200 px). The layout does not change at any width where they fit.

**Proof it catches the regression.** I planted an unbreakable `white-space:nowrap` file path in the built /research/index.html and ran `SAMPLE=300`: "1 scroll sideways: + 345px research/index.html, widest: code". An even 300-page spread would not have loaded that page at all. Then I restored the file. On the clean build: `SAMPLE=300` at 360 px gave 0 of 300 pages scrolling sideways, and at 320 px also 0 of 300.

**Not done / next.**
- `DEFAULT_BASE_URL` in build.mjs still names the retired github.io address, so local builds write wrong absolute URLs. That is still open. It feeds `custom-domain.test.mjs` and the URL rewriting at build.mjs:5540, so changing it needs its own careful PR.
- The sample still goes to the browser-checks runner only by hand. `platform/ci/browser_checks.py` could run `SAMPLE=300` nightly. That is control-plane CI, so it needs a separate PR.
- No Lighthouse or dark-mode numbers in this run.
