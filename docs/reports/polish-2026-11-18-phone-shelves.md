---
kind: polish
topics: [design, performance]
date: 2026-11-18
---
# Polish 2026-11-18: three cards a shelf on a phone, Stories page 30% shorter

Track: polish/0. Picked item 2 of "Still weakest" in `polish-2026-11-18-shelf-covers.md` ("The
phone page is 8,300 px long ... Showing three cards per shelf on phones"). Open polish PRs at the
start (#17273 and #17276, both on the narrow-phone page hero; #14012) don't touch `stories.mjs`.
Item 3 of that report ("the venture index pages don't show the shelf cover") is stale:
`ventures/hearth-and-horizon/index.html` already puts an `img.cover` at the top of each shelf.

## What changed

- `platform/pages/stories.mjs`: `PHONE_NEWEST = 3` and one CSS rule,
  `@media (max-width: 599px) { .items li:nth-child(n+4) { display:none; } }`. The HTML is
  unchanged, so wide screens still show six and nothing is removed from the page for crawlers.
- The "more" link reads "All N on Shelf →" whenever a phone hides a card (`count > min(shown, 3)`),
  so a shelf of four or more never ends on "Open Shelf →" with cards out of sight.
- `platform/pages/stories.test.mjs`: the "All N" test covers a four-piece shelf; a new test pins
  the phone rule and the 260 px card minimum it relies on.

## Measured (Playwright, Chromium, deviceScaleFactor 1, page rendered with `renderStoriesPage` into `dist/stories/`)

| | before | after |
|---|---|---|
| 390: top of "How these are made" | 8,320 px | 5,784 px (−2,536, −30%) |
| 390: page height | 9,772 px | 7,236 px |
| 390: cards shown per shelf | 6, 6, 6, 6 | 3, 3, 3, 3 |
| 1,280: page height, cards shown | 4,691 px, 6 each | unchanged |
| scrollWidth at 320 / 360 / 390 / 1,280 | no overflow | no overflow |

Column boundary: the grid goes two-column at 604 px. From 600 to 603 px it is still one column
and shows all six, which is harmless (no phone has that width) and not worth a fragile breakpoint.

Screenshots (Little Lamps shelf at 390): `img/polish-2026-11-18-phone-shelves-{before,after}-390.webp`.

## Still weakest, and what I would do next

1. **The Listen panel reads as the shelf's lead on a phone** now that it is a quarter of the shelf.
   That is arguably right (the page promises audio), but if it isn't, move it below the cards on
   phones only.
2. **Thumbnails are made by hand** (carried over): a test comparing each thumbnail's recorded
   source hash to its cover would catch a redraw.
3. **Saints by Candlelight's shelf header is 683 px on a phone** (from the shelf-covers report),
   the tallest of the four: its description runs longer than the others. Trimming it to the length
   of the Little Lamps one would lift its first card by ~100 px.
