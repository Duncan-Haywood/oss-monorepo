---
title: "A sticky card in a CSS grid travels the whole grid, not its cell"
seo_title: "position: sticky in a CSS grid slides over the next row: a fix"
date: 2026-11-11
tags: [css, polish, layout, calculators]
description: "On 83 calculator pages the sticky result card slid down over the FAQ or the proposal form below it. One desktop-only grid rule per page fixed all 83."
---

Most calculators on this site share a layout: a form on the left and a dark
result card on the right, set to `position: sticky; top: 15px`, inside a
two-column grid (`main.layout`). On many pages the same grid also holds the
"hand the customer a proposal" section and the FAQ. Grid auto-placement puts
them in the next row, and one of them lands in the right-hand column, under
the card.

It is easy to think a grid item's sticky range is its own cell. In Chrome it
isn't. The card sticks within the whole grid container. So once you scroll past
the form, the card keeps following you down the page and paints over whatever
is below it in the same column. On the window-tinting calculator the stuck
quote card covered the proposal form's inputs, so a click meant for "Customer
name" went to the card instead. On the stucco-repair calculator it covered the
FAQ.

## How many

A browser check (`platform/pages/sticky-fit-check.mjs`) now scrolls through
each sticky card's grid in ten steps and reports any neighbour the card
overlaps. On a 1280 x 800 window over the built site it found **74 pages** where
the card slid over a neighbour, plus 9 more where the card was also taller than
its row and was cut off at the window's edge. That is 83 of the 192 sticky
cards.

Five of those pages had a second problem. An older fix had told every section
in the grid except the card to span both columns, so that nothing would sit
under the card. That rule caught the form too. On those pages the form ran
full width and the "sticky" price card sat underneath it, half width, below
the fold.

## The fix

On a wide window, give the card the right-hand column for every row, and
stack everything else on the left:

```css
@media (min-width: 781px) {
  main.layout > :not(.result),
  main.layout > section:not(.result),
  main.layout > #proposalSection { grid-column: 1; }
  main.layout > .result { grid-column: 2; grid-row: 1 / span 3; }
}
```

The span is the number of other children in the grid, and the breakpoint is
each page's own single-column breakpoint plus one pixel, so phones keep the
layout they had. The card now has a column to itself, so it can travel without
covering anything, and the site script that caps an over-tall card at the
window's height (with a scroll inside it) can do its job. It does nothing when
capping would move other content.

## Numbers

Same 1280 x 800 window, same build, before and after:

- cards that slide over a neighbour: 83 → 0
- cards cut off at the window's bottom edge while stuck: 9 → 0
- cards capped to the window and scrollable: 105 → 120

Phones (390 px) and tablets (768 px, 1,024 px) were checked on all 83 pages:
the card's position and the page width are the same as before. One page,
change-order-margin, scrolls sideways between 761 and 1,000 px. It did that
before this change too, and it's next on the list.
