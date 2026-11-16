---
kind: polish
topics: [design, performance]
date: 2026-11-16
---
# Polish 2026-11-16: the hub hero shows close crops, not 3 px page text

Track: polish/0. Picked item 1 of "Still weakest" in `polish-2026-11-16-hero-art.md`
("The stills' text is unreadable at 300 px"). I built the site and screenshotted the hub, a
flagship, the research index, Stories, a blog post and the tools topic page at 390 and 1,280 px.
The hero is the first thing a wide-screen visitor sees, and it was the weakest of those surfaces.
Open PRs checked: none touched `showcase.mjs` or `showcase/`.

## What changed

- `platform/pages/showcase/capture.mjs`: a `SHOTS` entry can now name a `hero` CSS selector. For
  each one the script opens the tool at 720 px wide (deviceScaleFactor 2), loads its example and
  cuts a 720 × 450 box starting at that element. The box takes up to 12 px of padding above the
  element, but never reaches into the element before it. The crop is saved as
  `<slug>-hero.webp` at 600 × 375 (quality 78) and listed in the manifest as `hero`. The selectors:
  - `#drawing` for Wall Framing Takeoff (the wall elevation);
  - `#promotedStandardTable` for the eBay Fee & Profit Calculator (skip vs Promoted Listings,
    +$13.97);
  - `h3:has(+ #view-top)` for the Container Load Planner (the top and side views to scale).
- `platform/pages/showcase.mjs`: `loadShowcase` keeps a `hero` only when its file exists.
  `copyShowcase` publishes it, and `renderHeroArt` uses it (600 × 375) in place of the full still
  (960 × 600). The "See it working" gallery further down still uses the full stills.
- `showcase.test.mjs`: 2 new tests. One covers using, publishing and falling back. The other checks
  that every `HERO_TOOLS` entry has a crop on disk.
- I reran the full stills with the crops (`--stills-only --only=…`). They came out byte-identical,
  so the capture is deterministic.

## Measured (full build, Playwright, 1,280 and 1,440 px)

| | before | after |
|---|---|---|
| Page width each card's image covers | 1,280 px | 720 px |
| Scale at the ~300 px card | 0.23 | 0.42 (1.8×) |
| 16 px body text on the card | ~3.7 px | ~6.7 px |
| Hero image bytes (3 files) | 102,912 | 65,824 (−36%) |
| Image natural size | 960 × 600 | 600 × 375 (2× the card) |

`check.mjs` passes (10,632 pages, no dead links), and 15 showcase files are published (12 before).
The art is still hidden below 1,180 px and still lazy-loaded, so phones fetch none of it.
Screenshots of the hero art at 1,280 px, 2×: `img/polish-2026-11-16-hero-crops-{before,after}.webp`.

False alarm, again: a screenshot taken less than 1.5 s after load shows the stat tiles counting
up ("466 browser tools" next to a search label saying 1,372). The HTML is consistent, and
browser tools and research projects really are both 1,080 (search-index.json: 1,080 `tool`,
1,080 `research`).

## Still weakest, and what I would do next

1. **The reel still dates from 2026-10-20** and leaves out Wall Framing Takeoff. A rerun of
   `capture.mjs` without `--stills-only` needs ffmpeg output checked to stay about 1 MB.
2. **The "See it working" gallery** shows the other six stills at about 360 px, which has the same
   problem in milder form. Adding `hero` selectors to those `SHOTS` entries and letting
   `renderShowcaseSection` prefer crops would fix it. Pick each selector by looking at the tool.
3. **Wall Framing Takeoff's own page at 1,280 px**: "Saved bids" and "Copy link to this bid" render
   as small grey browser-style buttons with a 40 px gap above the form. That's the shared
   saved-bids band, so fixing it there would reach every page that has the band.
4. Carried over: the blog post header's lone right-aligned "Source" link (its own row on a phone)
   could join the date line; the tools topic "By project" chips carry no lede.
