---
title: "192 pages had drop-downs that cut their own words in half"
seo_title: "Clipped select text: measuring and fixing native drop-downs"
date: 2026-11-14
tags: [polish, css, accessibility, measurement, wall-framing-takeoff]
description: "A native select can't wrap, so long options get cut mid-word. A browser check found it on 192 of 606 tool pages; one shared CSS rule fixed the worst kind."
---

Our top framing tool, [Wall Framing Takeoff](https://marisstella.app/wall-framing-takeoff/), has a
table of the doors and windows in a house. On a desktop screen its Kind column read "windo", and its
Wall column read "Fron" and "Righ". Nothing was broken: the full word was in the page, the arithmetic
was right, and every automated check we run passed.

A native drop-down (`<select>`) can't wrap its text. When the chosen option is wider than the box,
the browser cuts it off under the arrow. Our checks read files, run the accessibility checker axe
(which has no rule for this) and measure page width. None of them looks at whether the words in a
box fit the box.

## How many pages

So we wrote one. For each visible drop-down it measures the chosen option in the drop-down's own
font and compares that with the room left after padding and the arrow. Across the 606 tool pages
that have a drop-down:

- at phone width (390 px), **139 pages** cut at least one default choice, 268 drop-downs in all;
- at desktop width (1,280 px), **192 pages** did, 379 drop-downs.

Most are a long option in a narrow form column, and the fix differs from page to page. But one kind
looked worse than the rest and had a single cause: **a drop-down inside a table cell, squeezed down
to its arrow.** On the electrical [service load check](https://marisstella.app/service-load-check/)
on a phone, each row's Kind box was 31 px wide and showed no text at all.

## Why table cells crush drop-downs

Our tools style every control `width: 100%`. In a table, a percentage width tells the browser the
drop-down doesn't need any particular width, so the column gets whatever the header and other cells
need, and the drop-down gets the rest. On phones a shared rule that stops forms from scrolling
sideways also sets `min-width: 0`, which removes the last floor.

## The fix, and the first attempt that made one page worse

The shared stylesheet now gives a drop-down in a table cell a minimum width equal to its longest
option. The first version had no upper limit. On the service load check, one option reads "Appliance
on its own circuit (range, dryer, water heater, EV charger, pump...)", so that column grew to about
580 px. On a desktop the whole table, which used to fit, started scrolling and pushed the Remove
buttons off the edge. The screenshots caught it before it shipped.

The rule we kept caps that floor at 15em with CSS `calc-size()`:

```css
@media screen{:where(td>select,th>select){min-width:calc-size(max-content,min(size,15em))}}
```

It only ever widens a drop-down, never narrows one. It has zero specificity, so any page that set its
own minimum keeps it. Browsers without `calc-size()` ignore it and keep the old layout. Tables already
scroll inside their own box on phones, so the page itself still doesn't scroll sideways. We checked
the 227 affected pages at three widths.

| | crushed drop-downs (under 90 px), phone | desktop |
|---|---|---|
| before | 70 | 59 |
| after | 6 | 34 |

The remaining desktop cases belong to one family of bid calculators that lay out each row as a grid
rather than a table, so they're next on the list. On Wall Framing Takeoff the table also got its own
capped floor, and the three settings with long defaults ("8 ft wall (92-5/8" precut studs)", "Every
plate ends at the wall end", "Standard (3-stud corners, 2 backing studs at tees)") now span two
columns on wider screens.

The check, `platform/pages/select-clip.mjs`, is in the repository, so the next page that cuts its own
words gets caught by a script rather than by someone squinting at a screenshot. The numbers and
screenshots are in the
[run report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/reports/polish-2026-11-14-select-clip.md).
