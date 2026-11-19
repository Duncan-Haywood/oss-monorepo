---
kind: polish
topics: [design, website-requests]
date: 2026-11-19
---
# Polish, 2026-11-19: request pages open with the tool they became

Track: polish/0. Picked item 3 of "Still weakest" in `polish-2026-11-19-custom-dev-built.md`
(the request pages had no picture). `polish_queue.py` showed it unclaimed, and no open PR touched
`/custom-development/`. Post: `docs/posts/2026-11-19-each-free-software-request-now-shows-what-it-built.md`.

## Changed

- `build.mjs`: `renderRequestFigure({ request, surfaces, shots, toRoot })` adds a `<figure class="cd-req-shot">`
  as the first child of `main` on `/custom-development/R-000N/`. It uses the request's tool's showcase
  hero (600w plus 1200w `srcset`, `sizes="(max-width: 760px) 92vw, 720px"`, width and height set,
  `fetchpriority="high"`, not lazy). The image link has `aria-hidden` and `tabindex=-1`; the
  figcaption carries the named link and "Try it with the worked example". Nothing is shown for a
  declined request, a request with no published tool (R-0004), or a tool with no still.
- `renderCustomRequestPage` takes `showcase`; the build passes it.
- `customDevHead`: `og:image:width/height/alt` for the 1200×630 social card. The other page
  heads already had them; this one didn't.
- Test: `custom-development-page.test.mjs`, "a request's own page opens with the tool it became".

## Measured

I measured on a full local build of main (old code), then spliced the new figure and CSS into
the five built request pages. This was Chromium at 390×900 and 1280×900, with a static server
over dist.

| page | fig top 390 / 1280 | fig height 390 / 1280 | height 390 before → after | scrollWidth |
|---|---|---|---|---|
| R-0001 | 344 / 392 | 295 / 502 | 4,185 → 4,511 | = viewport |
| R-0002 | 509 / 444 | 295 / 502 | 4,351 → 4,676 | = viewport |
| R-0003 | 370 / 392 | 295 / 502 | 4,470 → 4,796 | = viewport |
| R-0004 | none (no tool) | | unchanged | = viewport |
| R-0005 | 565 / 521 | 318 / 502 | 4,622 → 4,970 | = viewport |

All the images decoded (naturalWidth > 0). Screenshots:
`img/polish-2026-11-19-request-page-{before,after}-{R-0001-390,R-0002-1280}.jpg`.

## Still weakest, and what I would do next

1. **Share cards.** The request pages still use the site-wide `social-card.png`. A per-request
   1200×630 PNG made from the tool's still would make a shared link show the tool. The stills are
   WebP, which some link unfurlers reject, so the card would need a PNG or JPEG copy.
2. **The wall framing crop** (carried over, item 1 of the custom-dev report): on the request page
   the 16:10 box shows the top of a long wall and the start of the cut list. That's fine, but a
   shorter example wall would read better in both places.
3. **The bookkeeper hero's empty date fields** (carried over, item 2) now appear in two places.
4. **R-0004 (pricing and plans)** has no tool to picture. A still of `/pricing/` or of the
   monetization dashboard, if one is published, would fill the gap.
