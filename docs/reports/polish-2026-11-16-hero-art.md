---
kind: polish
topics: [design]
date: 2026-11-16
---
# Polish: the hub hero's empty right half gets three real tool stills (2026-11-16)

Track: polish/0. Picked the item carried over five polish reports today
(`polish-2026-11-16-story-cards.md` item 3, then `index-column`, `project-pages`,
`programme-pages`, `programme-dek`): "the hub's right half at 1,280 px is empty starfield beside the
hero. A real flagship screenshot there would show the product." The hub is the page most visitors
see first. Open PRs searched (`polish in:title`): three old ones, none touching `showcase.mjs` or the
hero.

## Measured (Playwright on the full local build, `.hero` and its children)

| width | before: hero content right edge | after: art column | hero height |
|---|---|---|---|
| 1,440 | 996 px (h1 is 893 wide; stats/band end at 996), 444 px of starfield to the right | 924 to 1,264 px | 932 → 956 px |
| 1,280 | 916 px for stats/band; 364 px empty | 844 to 1,184 px | 932 → 956 px |
| 1,180 | 866 px | 794 to 1,134 px | 932 → 956 px |
| 1,100 | unchanged: art hidden, layout as before (stats 820 wide) | none | 915 px |
| 390 | unchanged: art hidden, `scrollWidth` 390 | none | 953 px |

- The lede, search, stats and build band now share a 692 px column at 1,180 px and up (was 720 to
  820). The hero grew 24 px, from the build band's text wrapping onto one more line.
- The three stills are `loading="lazy"` inside an element that is `display: none` below 1,180 px,
  so a phone does not fetch them. At desktop width they add about 106 KB of WebP
  (21.9 + 36.6 + 47.0 KB), and the same three files are reused by the showcase strip further down
  the page.
- Screenshots: `img/polish-2026-11-16-hero-art-before-1280.png`,
  `img/polish-2026-11-16-hero-art-after-1280.png`, `img/polish-2026-11-16-hero-art-after-1440.png`.

## What changed

- `platform/pages/showcase.mjs`: `HERO_TOOLS` (Wall Framing Takeoff, the top flagship and a trades
  bid for "price the job"; eBay Fee Calculator for "check the fees"; Container Load Planner, the most
  visual drawing) and `renderHeroArt()`, which shows three framed stills in a cascade. Each card
  covers the bottom of the one above it, so every title bar shows and the last card is seen whole.
  Every card links to its tool, and a "See them working ↓" link goes to the showcase band. A tool
  that is no longer published drops out and the next still in the manifest fills its place. Fewer
  than two stills renders nothing. Hover and focus lift a card to the front. Under
  `prefers-reduced-motion` the cards don't animate.
- `platform/pages/build.mjs`: the lede through the build band sit in `.hero-main` inside a
  `.hero-grid` with the art. The grid only applies at 1,180 px and up.
- `platform/pages/showcase/capture.mjs`:
  - `--stills-only` retakes stills without re-recording the reel, and `--only=slug,...` limits the
    run to the named tools.
  - Scrolling to the focus is now instant. The smooth scroll had not arrived on the 9,600 px Wall
    Framing Takeoff page when the screenshot was taken.
  - Fixed-position overlays (the site assistant's "Speak or type" button) are hidden. Before, the
    button sat in the corner of every still.
  - The script loads Playwright's default export too, so `PLAYWRIGHT_MODULE=/opt/node-tools/...`
    works in cloud sessions.
- All nine stills were retaken on 2026-11-16 (the previous set dated from 2026-10-20). I added a new
  still for `wall-framing-takeoff` (its wall drawing with layout marks) and kept the reel as it was.
- `showcase.test.mjs`: two tests. One covers the art's order, fallback, lazy loading, escaping, the
  hidden-by-default CSS and reduced motion. The other checks that every `HERO_TOOLS` entry has a
  still in the manifest.

## Verification

On the full local build (2026-11-16, after the change):

- `node platform/pages/build.mjs`: exit 0.
- `node platform/pages/check.mjs`: "looks publishable: 1370 products, 45 category pages, 10548
  pages, no dead links."
- `node --test 'platform/pages/*.test.mjs'`: 1,736 tests, 1,736 pass, 0 fail.
- The built `dist/index.html` has three `.hero-card` links. The Playwright boxes on the real build
  match the table above (art 844 to 1,184 px at 1,280; hidden at 390 with `scrollWidth` 390).

## Still weakest, and what I would do next

1. **The stills' text is unreadable at 300 px.** They read as "a real tool with a drawing", which
   is the point, but a crop on the drawing alone (a `clip` option in `capture.mjs` SHOTS) would make
   the wall frame and container plan legible at hero size.
2. **The reel still dates from 2026-10-20** and doesn't include Wall Framing Takeoff. Rerun
   `capture.mjs` without `--stills-only` once someone checks that ffmpeg output stays small (it was
   about 1 MB).
3. **Between 980 and 1,180 px** the hero still has about 200 px of empty right margin. A two-card
   version at that width is possible, but the stats row would need to wrap to two by two.
4. Carried over: the 409 tool posts that name no venture; tool project pages' generic dek;
   `relatedTools` on Vendor Watch.
