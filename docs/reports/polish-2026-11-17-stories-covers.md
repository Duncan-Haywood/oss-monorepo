---
kind: polish
topics: [design, performance]
date: 2026-11-17
---
# Polish 2026-11-17: the Stories hero shows the four shelves as their covers

Track: polish/0. Picked item 2 of "Still weakest" in `polish-2026-11-16-stories-listen.md`
("The Stories hero's right half at 1,280 px is empty ... A shelf cover would use it"). Open PRs
checked (`polish in:title`: #11730, #14012, #12397): none touch `stories.mjs`. Built the full site,
screenshotted `stories/` at 390, 960 and 1,280 px in both colour schemes.

## What was wrong

At 1,280 px the hero's text column stopped at about 790 px and the rest of the band was empty
starfield (`img/polish-2026-11-17-stories-covers-before-1280-light.webp`). The four shelves were
text chips under the dek. Each shelf already has a designed 1,400 px podcast cover, but the page
showed none of them.

## What changed

- `platform/pages/stories.mjs`: each shelf from `loadFiction` carries `cover`, a 320 px WebP
  thumbnail path, or `null` when the file is missing. The jump links are one list with two looks:
  text chips below 900 px (the `<img>` is `display:none` and `loading="lazy"`, so a phone never
  fetches it), a 2 x 2 grid of covers in a 288 px right column from 900 px. The hero gets
  `has-covers` only when every shelf has a thumbnail, so a missing file falls back to the chips
  instead of a half-empty grid. Hover lifts the cover 2 px, off under `prefers-reduced-motion`;
  focus draws an outline. `alt=""`, because the link text already names the shelf and its count.
- Thumbnails: `ventures/hearth-and-horizon/covers/thumbs/*.webp` and
  `ventures/saints-by-candlelight/cover-320.webp`, made with ImageMagick
  (`convert <cover>.png -resize 320x320 -quality 82`). They come to 24 KB for all four. The
  originals are 19, 21, 22 and 139 KB, and podcast apps need them at full size, so they stay.
  If a cover changes, rerun that command (PIL is broken in the cloud container; ImageMagick works).
- Test: `the hero shows each shelf as its cover ...` in `stories.test.mjs` checks that every thumbnail
  is a shipped file, that the images are lazy, sized and `alt=""`, and that the fallback works.

## Measured (Playwright, local static server, deviceScaleFactor 1)

| width | hero height before → after | first shelf top before → after | covers fetched |
|---|---|---|---|
| 390 | 484 → 484 px | 617 → 617 px | 0 of 4 |
| 960 | 352 → 452 px | 488 → 588 px | 4 of 4 |
| 1,280 | 358 → 457 px | 469 → 567 px | 4 of 4 |

No sideways scroll at any width. The hero is about 100 px taller on wide screens. The first shelf
still starts above the fold at 1,280 x 800. A first try with a 336 px column added 129 px, so I
narrowed it. `check.mjs` on the patched dist: the one problem was the missing og:image, which
came from regenerating the page without the share card (`buildStories` without `socialCard`). The full
build passes it.

Screenshots: `img/polish-2026-11-17-stories-covers-{before-1280-light,after-1280-light,after-960-dark}.webp`.

## Still weakest, and what I would do next

1. **The shelf sections don't show their cover.** Each `.shelf` header could carry the same
   thumbnail at about 72 px beside its title, so a reader who scrolls past the hero still sees
   which show they are in. Measure the header height on a phone first.
2. **Thumbnails are made by hand.** A build step (or a test that compares each thumbnail's mtime
   or hash to its cover) would catch a redrawn cover whose thumbnail went stale. The test only
   checks that the file exists.
3. Carried over from `polish-2026-11-16-stories-listen.md`: item 1 (recording lags writing,
   a creative-track job) and item 3 (other site-owned pages with their own `.wrap`).
