# Polish 2026-11-12: research index theme heads on phones

**Why this item.** Item 1 of "Still weakest" in `polish-2026-11-12-research-index-length.md`
(carried in `polish-2026-11-12-topic-pages.md` and `-topic-filter-handoff.md`): "32 theme sections
are still 19,761 px on a phone (~620 each). The theme head ... is about a third of that."

**How it was measured.** `python3 research/_homepage/build.py` (the research index builds on its
own; no full site build needed for a template change), served from `_site/`, Chromium, third-party
requests blocked, 400 ms after `load`. Sum and mean of `section.theme` heights and of
`.theme-head` heights, plus `scrollWidth`, at 320, 390 and 1280 px. Script: about 25 lines of
Playwright, in the run's scratchpad; rewrite it from this description.

## What was wrong at 390 px (screenshot `img/polish-2026-11-12-theme-heads-before-390.png`)

- The theme number ("03") had its own grid column, so the blurb was indented ~40 px on every
  theme and wrapped one line longer.
- 56 px of top padding per theme, desktop's value.
- Three links to the same topic page per theme: the `h2`, "Topic page →" at the end of the
  blurb, and "or open the topic page →" beside "Show all". On a phone the third one wrapped onto
  its own row ("or open the topic / page →").

## What changed (`research/_homepage/template.html`, CSS only, `max-width:600px`)

- Theme head as a block: number inline before the heading, blurb full width, 15 px.
- Theme padding 36 px top, `h2` 1.5 rem.
- The "or open the topic page →" link beside "Show all" is hidden on phones (the heading and the
  blurb still link there). On every width the Show-all row is now a wrapping flex row and the link
  never breaks mid-phrase.

Nothing on desktop changed (1280 px: identical numbers).

| width | themes total before | after | mean theme head before | after | page before | after | sideways scroll |
|---|---|---|---|---|---|---|---|
| 320 | 22,961 px | 20,447 px | 186 px | 159 px | 28,450 | 25,935 | none |
| 390 | 19,761 px | 17,464 px | 146 px | 126 px | 24,569 | 22,273 | none |
| 1280 | 17,927 px | 17,927 px | 101 px | 101 px | 20,297 | 20,297 | none |

At 390 px: −2,297 px (−11.6%) of theme sections, −74 px per theme. Tests:
`platform/ci/test_research_homepage_publish.py`, 10 OK.

## Still weakest, and what I would do next

1. **The card is now most of a phone theme** (~360 of 563 px): the lede is the README bullet,
   often four to six lines. A shorter `lede` per project is editorial; a `line-clamp` would hide
   the answer, so measure before choosing. A topic-tile grid (31 tiles, cards behind search)
   would still cut the index under 10,000 px; it is a design decision about whether the index
   should preview projects at all.
2. **The hero intro is 13 lines at 390 px** (it names CU Boulder, Frongillo, Waggoner, Gensyn).
   One sentence on phones would bring the theme map and stats up a screen; editorial.
3. Carried over: topic-page titles four lines on phones (twins 38,413 px); `.pager` defined twice
   in the writing STYLE; the ticker's third line at 320 px; 190 posts with no related link.
