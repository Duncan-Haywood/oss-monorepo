---
kind: polish
date: 2026-11-16
---
# Polish 2026-11-16: a "Listen" panel on each Stories shelf

Track: polish/0. Built the site, screenshotted the hub, wall-framing-takeoff, research, stories and
the blog at 390 and 1,280 px. I checked the "Still weakest" lists first. The top carried item ("the
hub's right half at 1,280 px is empty starfield") is stale: `renderHeroArt` already fills it with
three framed tool stills, so later lists should drop it. I picked two items that point at the same
surface instead: `polish-2026-11-16-story-cards.md` item 1 ("none of the six newest cards on any
shelf has audio") and `polish-2026-11-16-index-column.md` item 3 ("the shelf's description stops at
68ch, leaving the right ~40% of each shelf header empty"). Open PRs checked (`polish in:title`:
#11730, #14012, #12397): none touch `stories.mjs`.

## What was wrong (measured from `loadFiction()`)

The page lede says "578 stories so far, 59 with audio". None of the 24 cards on the page had
audio. On each shelf, the newest recorded piece was at:

| shelf | stories | with audio | newest recording's position |
|---|---|---|---|
| Hearth & Horizon | 329 | 18 | 25th |
| For Other Minds | 50 | 4 | 44th |
| Little Lamps | 68 | 8 | 61st |
| Saints by Candlelight | 131 | 29 | 103rd |

So a visitor who came for audio found none without opening a shelf and paging through it.

## What changed (`platform/pages/stories.mjs`)

- `loadFiction` items carry `audio`, the venture-relative MP3 path (`<venture>/audio/<slug>.mp3`),
  or `null`.
- `renderListen(shelf, toRoot)`: an `<aside class="listen">` with the shelf's `LISTEN` (2) newest
  recorded pieces, each with its title link, "About N min · date", and
  `<audio controls preload="none">`, so nothing downloads until play is pressed. The deploy's
  audio-CDN pass (`audio-cdn.mjs`) resolves relative `.mp3` refs, so these players stream from the
  same pinned jsDelivr file as the story pages. A shelf with no recordings gets no panel.
- The shelf header is `.shelf-head` (intro + panel). At ≥ 900 px it's a two-column grid with a
  300 px panel. Below that the panel sits under the shelf's meta line and shows one piece only.
  DOM order matches visual order at every width. The audio control has `color-scheme: light dark`
  so it isn't a white pill in dark mode.
- Tests (`stories.test.mjs`): picks the newest recorded pieces in order, skips unrecorded ones, and
  renders no panel without recordings. Every real shelf with audio gets a panel, and every `src`
  is a file committed in its venture's `audio/`.

## Measured (Playwright on the built page, `stories/index.html` regenerated from the final module)

- All 8 players' sources return 200 from the built site. The first one plays (muted autoplay
  test, `currentTime > 0` after 0.8 s).
- 1,280 px: intro vs panel height per shelf: 237/274, 237/248, 211/274, 288/299 px. The panel adds
  at most 63 px to a shelf's header and fills the formerly empty right column.
- 390 px: the panel is 143 px tall (one piece), and no page scrolls sideways (scrollWidth 390).
- Colours reuse the page's tokens (`--muted` on `--bg`, `--accent` links). No new contrast pair.

Screenshots: `img/polish-stories-listen-before-1280.png`, `img/polish-stories-listen-after-1280.png`,
`img/polish-stories-listen-after-390.png`, `img/polish-stories-listen-dark-1280.png`.

## Still weakest, and what I would do next

1. **Recording lags writing.** 59 of 578 pieces have audio, and the newest recording on Little
   Lamps is from 22 October. That's a creative-track job (render audio for the newest pieces), not
   a polish one. The panel will show new recordings with nothing to edit.
2. **The Stories hero's right half at 1,280 px** is empty, like the hub's was. A shelf cover
   (`ventures/hearth-and-horizon/covers/*.png` exist) or the newest recording there would use it.
3. **Other site-owned pages with their own `.wrap`** (category pages, Compare, Guides, About):
   run the h1-vs-bar measurement (`polish-2026-11-16-index-column.md`, item 2).
4. Carried over: `relatedTools` on Vendor Watch; "Need this tool to do more?" on ShootFlow docs;
   the tools topic index lists projects by name and count only.
