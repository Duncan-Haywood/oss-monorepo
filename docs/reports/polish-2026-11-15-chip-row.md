---
kind: polish
topics: [design, accessibility]
date: 2026-11-15
---
# Polish 2026-11-15: blog topic chips are one swipeable row on a phone

Track: polish/0. Picked from `polish-2026-11-15-blog-site-testing-topics.md`, "Still weakest"
item 1 (topic chips wrap to six rows at 390 px). Searched open PRs for `polish`, `chip`,
`topic`: none touched it.

## Measured (section build, `buildWriting` into a scratch dir, Playwright 390×900 and 1280×900)

| | before | after |
|---|---|---|
| `.chips` height, 390 px | 275 px | 40 px |
| first `#posts li` top, 390 px | 1,064 px | 827 px |
| `.chips` height, 1,280 px | 99 px | 99 px (unchanged) |

The section build has no site header stylesheet, so absolute tops differ from production. The
237 px difference is what carries over. Screenshots: `docs/reports/img/polish-chip-row-before-390.png`,
`-after-390.png`, `-after-topic-390.png` (`?topic=infrastructure`: pressed chip scrolled into view,
`scrollY` stays 0). No page errors. Focusing the last chip with the keyboard and pressing Enter
works and the fade flips to `start`.

## Changed (`platform/pages/writing.mjs`)

- CSS under `max-width:639px`: `.chips` nowrap, `overflow-x:auto`, bleeds `-16px` into the
  finder's padding with `padding:4px 16px` (4 px leaves room for the 2px+1px focus outline);
  chips `flex:none`, `min-height:32px`; `mask-image` per `data-fade` value. Scrollbar hidden
  only under `pointer:coarse`.
- Finder script: `fade()` on scroll and resize; after the first `apply()`, a `?topic=` chip is
  centred in the row by setting `scrollLeft` (not `scrollIntoView`, which can move the page).
- Test: `writing.test.mjs`, "topic chips are one sideways row on a phone".

## Still weakest, and what I would do next

1. **The podcast index's topic nav** (`podcast.mjs`, `.chips` of tag links) is a separate
   component with the same wrapping. Fewer topics today, but the same fix applies. Better still,
   share one chip-row component.
2. **Tools and projects is still 52% of the blog** (carried over from the last report, item 2).
3. A full-site Playwright sweep of "first content below the fold at 390 px" would find other
   pages where controls push the content down. It could become a check in `platform/pages/`.
