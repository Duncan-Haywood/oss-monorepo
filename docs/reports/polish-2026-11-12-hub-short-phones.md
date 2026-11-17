---
kind: polish
topics: [design, accessibility]
date: 2026-11-12
---
# Polish 2026-11-12: the hub's search box on small and short phones

**Why.** Item 1 of "Still weakest" in `polish-2026-11-12-hub-lede.md`: after the lede was cut, the
search still ended below the first screen at 320 × 640 and on short windows. The one that matters
most is the iPhone SE class (375 px wide, 667 px screen). Safari, toolbars showing, gives a page
there about 553 px.

(This run first made the same lede fix as PR #14997, which merged while it was being verified.
That work was dropped and the run moved on to the next item. The duplicate came from #14997 being
opened after this run's open-PR search; see the run record.)

**What was in the way at 375 px** (main at 36d456dd, local build, Chromium, third-party requests
blocked): a 79 px site header, 36 px of hero padding, a **four-line** headline (155 px), because
`HOME_MOTION_CSS` floors the hub `h1` at 2.3rem (36.8 px) at every phone width, a two-line ticker
(42 px), the 6-line lede, then the search label and input.

**What changed.** One block in `HOME_MOTION_CSS` (`platform/pages/showcase.mjs`), at `max-width:
480px` only: headline 1.85rem (29.6 px) with a 12 px bottom margin, hero top padding 24 px, ticker
bottom margin 12 px, search top margin 20 px. No copy changed, nothing hidden. Tablet and desktop
are untouched (measured: identical numbers at 768 and 1280).

Four variants were measured before choosing (headline only; plus padding; plus gaps at 2rem; plus
gaps at 1.85rem). Only the last puts the input inside 553 px at 375 and inside 640 px at 320.

**Numbers** (bottom edge of the `#q` input, px from page top):

| viewport | before | after | in the first screen |
|---|---|---|---|
| 320 × 640 | 730 | 631 | no → **yes** |
| 360 × 640 | 629 | 538 | yes → yes |
| 375 × 553 (iPhone SE, Safari) | 629 | 538 | no → **yes** |
| 390 × 664 (iPhone 12 to 15, Safari) | 629 | 538 | yes → yes |
| 412 × 700 | 590 | 538 | yes → yes |
| 768 × 1024 | 554 | 554 | unchanged |
| 1280 × 800 | 642 | 642 | unchanged |

Headline lines at 375 px: 4 → 3. `scrollWidth` equals the viewport at every width.

Lighthouse 12.8.2, mobile, `--pages=/ --runs=3`, idle: before 99 / 100 / 100 / 100, CLS 0;
after 99 / 100 / 100 / 100, CLS 0.

![before, 375 × 553: the search label is the last line in view, the box is below](img/polish-2026-11-12-hub-375-before.png)
![after, 375 × 553: the search box and button are in view](img/polish-2026-11-12-hub-375-after.png)

**Keeping it fixed.** `hub-lede.test.mjs` gets a second test: `HOME_MOTION_CSS` keeps a phone block,
its headline is at most 1.85rem, and it sets the search's top margin. The pixel numbers come from
the browser run above, not the test.

**How it was measured.** The "after" page is the main build's `index.html` with the new CSS block
spliced in where the source puts it (a full rebuild is 10+ minutes). Viewport heights for real
phones are approximate; the px table is exact for the emulated viewports.

## Still weakest, and what I would do next

1. **The ticker reserves three lines at 320 px** (62 px, one of them empty) because the hidden copy
   with the longest audience word wraps there. A phone-only shorter tail ("Built for <b>…</b>.")
   or a ticker that wraps the word onto its own line would save 20 to 40 px.
2. **On the hub at 320 px the nav strip shows "St…" at the right edge**: the fade works, but five
   of eleven links are off-screen. Nothing to fix unless usage shows people miss them.
3. Carried over: the 8 finding-heading pages that need real input
   (`polish-2026-11-12-finding-headings.md`); `--min-a11y=100` and the rendered checks in the
   nightly browser checks (control plane, own PR); wall-framing-takeoff TBT; /guides/ lists 5 or 6
   "Free … checker / template" pages that are tools, not guides (this run counted: 173 of the
   1,164 listed pages have 3 or more inputs, but most are "Should I …?" decision pages that fit the
   index's promise; only the "Free …" entries are misfiled).
