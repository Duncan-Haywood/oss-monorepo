---
title: "Six of eight seeded faults on the Stories page got past its tests"
seo_title: "Testing CSS that browsers silently drop"
date: 2026-11-17
tags: [redteam, css, testing, stories]
description: "A red-team run seeded 8 faults into the Stories page. Its tests caught 2. Five were CSS a browser drops without an error; a new selector lint now catches them."
---

The [Stories page](https://marisstella.app/stories/) lists the site's four fiction shelves: Hearth & Horizon,
For Other Minds, Little Lamps and Saints by Candlelight. Today's red-team run made eight small edits to the
module that builds it, one at a time, and ran the page's tests after each. The tests caught two.

## Five of the six that got through were CSS

A browser that meets CSS it can't parse doesn't show an error. It skips the bad part and carries on, so the
page still loads and still passes every test that reads its HTML. The faults that got through:

- `margin:.8em 0 0` became `margin:.8em 0 1`, three times in different rules. `1` with no unit is not a
  length, so the browser drops the whole declaration and the list gets its default margin.
  The repository already had a lint for exactly this (`platform/pages/css-lint.mjs`, added on 2026-11-11),
  and CI runs it, so these three would have failed a pull request. They got past the page's own tests
  because the campaign measures only `stories.test.mjs`. That file now lints the page's rendered CSS itself.
- `border:0` became `border:1`. The lint checked `margin`, `padding`, `width` and other length properties,
  but not the `border` shorthand. On a wide screen, the cover links in the page header would have kept the
  pill border meant for phones. The lint now covers `border`, its sides and widths, `outline` and
  `column-rule`.
- `.shelf-intro > p` became `.shelf-intro >= p`. A selector the browser can't parse costs the whole rule:
  both selectors in the list and every declaration in it. Here the shelf descriptions would have lost their
  68-character line length. Nothing in the repository checked selectors.

The sixth was logic. `shelf.count > items.length` became `>=`, so a shelf holding exactly the six pieces
the page shows would offer "All 6 on Demo →" when there is nothing more to see. A test now pins the label
at 3, 6 and 7 pieces.

## A selector lint for the whole tree

The new `badSelectors()` in `css-lint.mjs` reads each style rule's selector and flags the mistakes a slip
or a seeded fault makes: a comparison (`>=`, `<`, or `=` outside an attribute selector), a lone `-` or `/`
where a `+` or `*` combinator stood, and an empty entry in a selector list. It skips at-rule preludes,
because `@media (width >= 600px)` is valid range syntax. It also skips strings, attribute selectors and
function arguments, because `:nth-child(2n - 1)` is valid too.

It runs over every page and stylesheet in the repository (about 3,750 files) and over every stylesheet
constant in `platform/pages`. On its first run it found no broken selectors. It did find a bug in the
lint's own helper. `styleBlocks()` had been reading a `"<style>"` string inside a `<script>` on the
csshound page as if it were CSS. It now drops scripts first.

## One real defect

Reading the page as a visitor turned up one more problem, a real one this time. All three Hearth & Horizon
shelves linked to the same address, `hearth-and-horizon/`. That index opens on its first shelf, 336 science
fiction stories long. So "All 70 on Little Lamps →" took a parent looking for bedtime stories to the top
of a page where Little Lamps starts 336 entries further down. Each shelf now links to its own section
(`hearth-and-horizon/#little-lamps`). A test checks the section exists and that no two shelves share a link.

After the new tests, all eight seeded faults are caught.
