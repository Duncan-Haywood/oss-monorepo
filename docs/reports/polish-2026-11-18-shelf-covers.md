---
kind: polish
topics: [design, performance]
date: 2026-11-18
---
# Polish 2026-11-18: each Stories shelf wears its cover beside its title

Track: polish/0. Picked item 1 of "Still weakest" in `polish-2026-11-17-stories-covers.md`
("The shelf sections don't show their cover ... Measure the header height on a phone first").
Open polish PRs (`polish in:title`: #11730, #14012, #12397) don't touch `stories.mjs`. Today's
other polish runs all worked on audience pages, so I left those alone and opened the draft PR
(#17181) before measuring, as `polish-2026-11-18-fold-check.md` item 3 asked.

## What was wrong

Past the hero, the four shelves were identical white panels: title, grey tagline, paragraph.
A reader who scrolled down, or arrived at `/stories/#little-lamps` from a link, had no picture
telling them which show they were in, though each shelf has a designed podcast cover and the
hero already shows it at 1,280 px.

## What changed

- `platform/pages/stories.mjs` `renderShelf`: a `.shelf-title` row puts the shelf's cover
  thumbnail (the hero's 320 px WebP, so a wide screen fetches nothing new) before the `h2` and
  tagline. 56 px on a phone, 72 px from 900 px. `alt=""` (the heading beside it names the shelf),
  `loading="lazy"`, `width`/`height` set. No thumbnail, no `<img>`: a bare heading as before.
- `platform/pages/stories.test.mjs`: one test (cover per shelf, same file as the hero, lazy,
  sized, decorative, before the heading; none when the thumbnail is missing).

## Measured (Playwright, Chromium, deviceScaleFactor 1, the page regenerated over a local dist)

| | before | after |
|---|---|---|
| 1,280: shelf header heights (H&H, FOM, LL, Saints) | 278, 252, 278, 303 px | unchanged |
| 390: shelf header heights | 504, 500, 449, 683 px | 530, 526, 475, 683 px |
| 390: page length to "How these are made" | 8,222 px | 8,299 px |
| 390: covers fetched on load | 0 | 2 (first two shelves, ~12 KB); the rest as they near the screen |
| scrollWidth at 390 / 1,280 | 390 / 1,280 | 390 / 1,280 |

On a phone the 56 px cover narrows the tagline column, so a one-line tagline becomes two
(+26 px per shelf, +77 px over the page). The Saints shelf's tagline already wrapped, so it is
unchanged. On a wide screen the 72 px cover sits within the height of the title and tagline.

Screenshots: `img/polish-2026-11-18-shelf-covers-{before,after}-{1280-dark,390-light}.webp`.

## Still weakest, and what I would do next

1. **Thumbnails are made by hand** (carried over, item 2 of the 2026-11-17 report). Now two
   places show them, so a stale thumbnail is twice as visible. A test comparing each thumbnail's
   recorded source hash to its cover would catch a redraw.
2. **The phone page is 8,300 px long**: four shelves of six cards each. Showing three cards per
   shelf on phones (with "All N" below) would roughly halve it; measure whether the Listen panel
   then reads as the shelf's lead.
3. **The venture index pages** (`hearth-and-horizon/#little-lamps`) don't show the shelf cover
   either. The same `.shelf-title` pattern would fit there.
