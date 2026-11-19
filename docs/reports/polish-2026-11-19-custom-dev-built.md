---
kind: polish
topics: [design, website-requests, browser]
date: 2026-11-19
---
# Polish, 2026-11-19: /custom-development/ shows what requests built (stills of four tools)

Track: polish/0. Post: `docs/posts/2026-11-19-the-custom-development-page-now-shows-what-it-built.md`.

## Why this page

Most visits in `portfolio/usage/site-visits.json` (2026-10-24 to 11-03, the only days counted)
go to `/c/` 31, `/ask/` 20, `/shed-designer/` 20, `/about/` 19, then `/custom-development/` 6. The
last polish runs covered /ask/, the footer and table layouts. `/custom-development/` is the owner's
priority intake (2026-11-02, "custom free dev shop for businesses") and had no visual proof: the
"What has been built this way" paragraph linked three GitHub folders, below the form, the steps,
"Other ways to ask" and "How a request moves".

## What changed

- `showcase/capture.mjs`: `click` can be a list, clicked in order. New SHOTS: `ai-bookkeeper`
  (example → accept suggestions → file, hero `#h-reports`: the P&L by month), `sales-agent`
  (load example → run, hero `#out`), `clothing-design-studio` (hero `#stage`). Stills, hero crops
  and 1,200 px twins captured with `--stills-only --only=…`; the existing nine and the reel are
  unchanged. They also join the hub gallery (12 instead of 9 cards).
- `build.mjs`: `renderRequestShowcase({ requests, surfaces, shots, toRoot })` puts one card per
  non-declined request whose project is a published tool with a still, ordered by ID: the image
  (decorative link, `alt=""`, out of the tab order, since the name link follows), ID and status
  pill, short name (the title before ": "), the still's caption, "Try it · Code and README". It
  sits after "Problems that fit", before the form. The old paragraph shows only when there are no
  cards. Under 600 px the grid becomes a scroll-snap strip with 84 % cards, so the next card peeks.
  `prefers-reduced-motion` drops the hover zoom.
- Queue table: `td:first-child { white-space: nowrap }` (IDs broke as "R-" / "0005" at 1,280).
  FAQ `dd` line-height 1.6 (it was tighter than the page's prose).
- Test: `custom-development-page.test.mjs`, "shows what requests have built".

## Measured (Chromium, built dist, the page re-rendered into it)

| | before | after |
|---|---|---|
| images of built work in `main` | 0 | 4 |
| top of form, 390 / 320 / 1,280 | 1,424 / 1,597 / 931 px | 2,059 / 2,243 / 1,894 px |
| (stacked cards at 390, rejected) | | 3,269 px |
| page height 390 / 1,280 | 10,036 / 6,588 | 10,547 / 7,477 |
| scrollWidth = viewport at 320, 390, 1,280 | yes | yes |
| ID cell height at 390 (stacked rows) | 24 px | 24 px |

Screenshots: `img/polish-2026-11-19-custom-dev-{before-1280,after-1280,after-390,after-dark-1280}.jpg`.

## Still weakest, and what I would do next

1. **The wall framing still on these cards crops into the middle of the drawing** (its hero is
   `#drawing` at 720 px, which on a long wall cuts the left part). A hero selector on the wall
   picker with a short example wall would show a whole wall.
2. **The bookkeeper hero shows two empty date fields** above the P&L. A hero starting at the
   "Profit and loss" `h3` would need an id on it in the venture, or an `:has()` selector.
3. **Request pages (`/custom-development/R-000N/`) have no picture either.** The same still could
   head each one's "Try it" list; the function already resolves the slug and shot.
4. **Phone height is still 10.5k px.** "What you can ask for" repeats "Problems that fit" and "Other
   ways to ask"; merging them would save ~600 px. That is copy, so check it with the owner's
   request wording first.
5. Carried over: `polish-2026-11-19-pinned-row-names.md` items 1–3, `polish-2026-11-19-footer-trim.md`
   items 1–4.
