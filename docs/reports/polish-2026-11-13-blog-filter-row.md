---
kind: polish
topics: [design, accessibility]
date: 2026-11-13
---
# Polish 2026-11-13: the blog finder's Tag / Sort / Clear row

**Why.** Item 2 of "Still weakest" in `polish-2026-11-13-blog-topics.md`: "The blog filter row at
390 px: 'Tag' label stacked above a full-width select, 'Sort' inline beside a short one, both native
selects about 28 px tall under a 44 px search box."

**First choice abandoned.** I started on item 3 of `polish-2026-11-13-last-intro-walls.md`
(an answer-first lead for economic-nexus-threshold-tracker). Every state revenue host I tried
(cdtfa.ca.gov, comptroller.texas.gov, tax.ny.gov, dor.sd.gov, revenue.alabama.gov, dor.ms.gov)
is blocked by this session's proxy (CONNECT 403; WebFetch ENOTFOUND). The tool's own figures are
secondary-sourced (Numeral and TaxCloud aggregates, `calc.mjs` header), so a lead that cites a
primary source needs a session that can reach those hosts. It is still open.

Open PRs checked first: #15476 (shared jump row) and #15450 (uk-sole-trader lead) are other
"still weakest" items. Nothing touched the finder.

## What changed (`platform/pages/writing.mjs`, `renderFinder` and STYLE)

- `.finder .row` is a two-column grid (`minmax(0,1fr)` x2; `16rem` / `12rem` from 640 px), labels
  stacked above each menu at .75rem/600.
- `.finder select` and the search box are both `height:42px`, radius 10px, same border.
- `#clear` moved out of `.row` into `<div class="foot">` next to `#count`, relabelled "Clear filters".
  The ids are unchanged, so the finder script and its fake-DOM tests didn't need to change.
- A shared `:focus-visible` ring for the search box, menus and buttons.
- Test: `finder: menus share the search box height and Clear sits beside the count` in
  `writing.test.mjs`.

## Numbers

These come from `buildWriting()` alone (before = `HEAD`, after = this branch), then confirmed on the
full local build with the new markup spliced into `dist/writing/index.html`. Chromium, with
third-party requests blocked and reduced motion on.

| 390 px | before | after |
|---|---|---|
| search box height | 46 | 42 |
| Tag / Sort menu height | 28 / 28 | 42 / 42 |
| Tag / Sort width | 302 / 121 | 157 / 157 |
| finder panel height | 386 | 371 |
| Tag menu wider than its row at 320 px | yes (302 in 254) | no (120 in 254) |
| sideways scroll, full build, 320 / 390 / 1,280 | none | none |

At 320 px the Sort menu is 120 px and its longest option is 89 px of text, so nothing clips.
Images: `img/polish-2026-11-13-blog-finder-{before-390-light,after-390-light,after-1280-light,after-390-dark}.png`.

## Still weakest, and what I would do next

1. **The economic-nexus answer lead** (above). It needs reachable DOR hosts. Otherwise write the lead
   with the honest secondary-source citation and an as-of 2026-09-24, then add a test that the
   $100,000 / $250,000 / $500,000 groups match `STATE_THRESHOLDS`.
2. **The chips take five lines at 390 px** (seven topics). A horizontally scrolling single line
   with a fade would save about 140 px, but it hides topics. The other option is shorter labels
   ("Infrastructure", "AI agents"). Measure both.
3. **~580 "Tools and projects" posts name no project** (carried from the blog-topics report).
4. Carried over: topic-page titles four lines on phones; `.pager` defined twice in the writing
   STYLE; the ticker's third line at 320 px.
